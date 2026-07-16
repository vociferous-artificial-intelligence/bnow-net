import { describe, expect, it } from "vitest";
import {
  DEFAULT_HEALTH_STATE,
  X_HEALTH_PROVIDER,
  alertDeliveryCode,
  alertKindCode,
  buildXHealthEmail,
  evaluateXHealth,
  runXHealthCheck,
  type XHealthConfig,
  type XHealthContext,
  type XHealthCounters,
  type XHealthDeps,
  type XHealthState,
} from "./x-health";
import type { OutboundEmail } from "../email/send";

// Health evaluation + operator alerting for X ingestion (#38 + #66): episode
// dedup, cooldown, recovery notice, catch-up progress/stuck tracking, and delivery
// bookkeeping. Pure evaluator + injected mailer — no network, no DB.

const CFG: XHealthConfig = { cooldownMs: 10_000, emptyAlertRuns: 3, stuckAlertRuns: 2 };

const CNT = (over: Partial<XHealthCounters> = {}): XHealthCounters => ({
  requests: 1,
  docs: 1,
  budgetStops: 0,
  pageTruncations: 0,
  requestFailures: 0,
  lockSkips: 0,
  incomplete: 0,
  ...over,
});

const CTX = (over: Partial<XHealthContext> = {}): XHealthContext => ({
  watermarkAgeSec: 60,
  parkThresholdSec: 21600,
  catchup: null,
  ...over,
});

const catchup = (over: Partial<NonNullable<XHealthContext["catchup"]>> = {}) => ({
  state: "started" as const,
  leaseHeld: false,
  progressSig: "0/2:1:5",
  inserted: 5,
  watermarkAdvanced: false,
  ...over,
});

describe("evaluateXHealth — steady poll", () => {
  it("a healthy poll with docs neither fires nor opens an episode", () => {
    const e = evaluateXHealth(CNT({ docs: 5 }), CTX(), DEFAULT_HEALTH_STATE, CFG, 1000);
    expect(e.fire).toBe(false);
    expect(e.nextState.episodeKey).toBeNull();
  });

  it("a page truncation fires an unhealthy alert with the reasons listed", () => {
    const e = evaluateXHealth(
      CNT({ pageTruncations: 1, incomplete: 1, docs: 0 }),
      CTX(),
      DEFAULT_HEALTH_STATE,
      CFG,
      1000,
    );
    expect(e.fire).toBe(true);
    expect(e.kind).toBe("unhealthy");
    expect(e.reasons).toEqual(["incomplete", "page_truncation"]);
    expect(e.nextState.episodeKey).toBe("incomplete,page_truncation");
  });

  it("dedupes within the cooldown, then re-fires after it lapses", () => {
    const prior: XHealthState = {
      ...DEFAULT_HEALTH_STATE,
      episodeKey: "incomplete,page_truncation",
      lastAlertAtMs: 500,
    };
    const counters = CNT({ pageTruncations: 1, incomplete: 1, docs: 0 });
    // within cooldown (1000 - 500 < 10000): suppressed
    const deduped = evaluateXHealth(counters, CTX(), prior, CFG, 1000);
    expect(deduped.fire).toBe(false);
    expect(deduped.nextState.episodeKey).toBe("incomplete,page_truncation");
    // past cooldown: re-fires (escalation)
    const reFire = evaluateXHealth(counters, CTX(), prior, CFG, 11_000);
    expect(reFire.fire).toBe(true);
    expect(reFire.nextState.lastAlertAtMs).toBe(11_000);
  });

  it("emits one recovery notice when an episode clears", () => {
    const prior: XHealthState = { ...DEFAULT_HEALTH_STATE, episodeKey: "incomplete", lastAlertAtMs: 500 };
    const e = evaluateXHealth(CNT({ docs: 3 }), CTX(), prior, CFG, 2000);
    expect(e.fire).toBe(true);
    expect(e.kind).toBe("recovery");
    expect(e.nextState.episodeKey).toBeNull();
  });

  it("a lease-skip (another valid owner working) is neutral — no fire, episode untouched", () => {
    const e = evaluateXHealth(
      CNT({ requests: 0, docs: 0, lockSkips: 1, incomplete: 1 }),
      CTX(),
      DEFAULT_HEALTH_STATE,
      CFG,
      1000,
    );
    expect(e.fire).toBe(false);
    expect(e.kind).toBeNull();
    expect(e.nextState.episodeKey).toBeNull();
  });

  it("alerts after a conservative run of consecutive empty polls, then recovers when docs return", () => {
    let s = DEFAULT_HEALTH_STATE;
    const empty = CNT({ docs: 0, requests: 5 });
    for (let i = 1; i <= 2; i++) {
      const e = evaluateXHealth(empty, CTX(), s, CFG, i * 1000);
      expect(e.fire).toBe(false);
      s = e.nextState;
    }
    const third = evaluateXHealth(empty, CTX(), s, CFG, 3000);
    expect(third.fire).toBe(true);
    expect(third.reasons).toEqual(["persistent_empty"]);
    s = third.nextState;
    const recovered = evaluateXHealth(CNT({ docs: 4 }), CTX(), s, CFG, 4000);
    expect(recovered.kind).toBe("recovery");
    expect(recovered.nextState.consecutiveEmpty).toBe(0);
  });
});

describe("evaluateXHealth — catch-up episodes", () => {
  it("started fires once, resumed dedupes, complete fires a single recovery notice", () => {
    let s = DEFAULT_HEALTH_STATE;
    const started = evaluateXHealth(CNT({ requests: 5, docs: 5 }), CTX({ catchup: catchup() }), s, CFG, 1000);
    expect(started.fire).toBe(true);
    expect(started.kind).toBe("unhealthy");
    expect(started.reasons).toEqual(["watermark_parked"]);
    s = started.nextState;

    const resumed = evaluateXHealth(
      CNT({ requests: 5, docs: 8 }),
      CTX({ catchup: catchup({ state: "resumed", progressSig: "1/2:0:13", inserted: 8 }) }),
      s,
      CFG,
      2000,
    );
    expect(resumed.fire).toBe(false); // same episode, within cooldown
    s = resumed.nextState;

    const complete = evaluateXHealth(
      CNT({ requests: 5, docs: 5 }),
      CTX({ catchup: catchup({ state: "complete", progressSig: "2/2:0:18", watermarkAdvanced: true }) }),
      s,
      CFG,
      3000,
    );
    expect(complete.fire).toBe(true);
    expect(complete.kind).toBe("recovery");
    expect(complete.nextState.episodeKey).toBeNull();
  });

  it("escalates to stuck_checkpoint when the catch-up makes no progress across runs", () => {
    const cfg: XHealthConfig = { cooldownMs: 10_000, emptyAlertRuns: 99, stuckAlertRuns: 2 };
    const stalled = catchup({ state: "resumed", progressSig: "1/3:1:10", inserted: 10 });
    let s = DEFAULT_HEALTH_STATE;
    // run A: started
    let e = evaluateXHealth(CNT(), CTX({ catchup: catchup({ state: "started", progressSig: "1/3:1:10", inserted: 10 }) }), s, cfg, 1000);
    expect(e.reasons).toEqual(["watermark_parked"]);
    s = e.nextState;
    // run B: same progress -> stuckRuns 1 (< 2) -> still watermark_parked (dedup)
    e = evaluateXHealth(CNT(), CTX({ catchup: stalled }), s, cfg, 2000);
    expect(e.fire).toBe(false);
    s = e.nextState;
    // run C: same progress -> stuckRuns 2 (>= 2) -> stuck_checkpoint (new episode, fires)
    e = evaluateXHealth(CNT(), CTX({ catchup: stalled }), s, cfg, 3000);
    expect(e.reasons).toEqual(["stuck_checkpoint"]);
    expect(e.fire).toBe(true);
    expect(e.kind).toBe("unhealthy");
  });

  it("a catch-up refused because the lease is held is neutral (another job working)", () => {
    const e = evaluateXHealth(
      CNT({ requests: 0, docs: 0, lockSkips: 1 }),
      CTX({ catchup: catchup({ state: "refused", leaseHeld: true, progressSig: null, inserted: 0 }) }),
      DEFAULT_HEALTH_STATE,
      CFG,
      1000,
    );
    expect(e.fire).toBe(false);
    expect(e.kind).toBeNull();
  });

  it("a stranded (non-lease refused) catch-up fires catchup_stranded", () => {
    const e = evaluateXHealth(
      CNT({ requests: 0, docs: 0 }),
      CTX({ catchup: catchup({ state: "refused", leaseHeld: false, progressSig: null, inserted: 0 }) }),
      DEFAULT_HEALTH_STATE,
      CFG,
      1000,
    );
    expect(e.fire).toBe(true);
    expect(e.reasons).toEqual(["catchup_stranded"]);
  });
});

// -- runner + email ------------------------------------------------------------

function runnerHarness(over: Partial<XHealthDeps> = {}) {
  const map = new Map<string, Record<string, unknown>>();
  const sent: OutboundEmail[] = [];
  const deps: XHealthDeps = {
    loadState: async (p) => (map.get(p) as never) ?? null,
    saveState: async (p, s) => {
      map.set(p, JSON.parse(JSON.stringify(s)));
    },
    sendEmail: async (mail) => {
      sent.push(mail);
      return { delivered: true, via: "test" };
    },
    recipient: () => "ops@example.com",
    now: () => 5000,
    ...over,
  };
  return { deps, map, sent };
}

describe("runXHealthCheck — delivery + persistence", () => {
  it("emails the operator on an unhealthy fire and persists health state", async () => {
    const { deps, map, sent } = runnerHarness();
    const out = await runXHealthCheck(CNT({ pageTruncations: 1, incomplete: 1, docs: 0 }), CTX(), deps, CFG);
    expect(out.alert).toBe("unhealthy");
    expect(out.delivery).toBe("sent");
    expect(sent).toHaveLength(1);
    expect(map.get(X_HEALTH_PROVIDER)).toBeTruthy();
  });

  it("records no_recipient (FEEDBACK_EMAIL unset) but still persists state, without throwing", async () => {
    const { deps, map, sent } = runnerHarness({ recipient: () => null });
    const out = await runXHealthCheck(CNT({ pageTruncations: 1, incomplete: 1, docs: 0 }), CTX(), deps, CFG);
    expect(out.delivery).toBe("no_recipient");
    expect(sent).toHaveLength(0);
    expect(map.get(X_HEALTH_PROVIDER)).toBeTruthy();
  });

  it("records failed and still persists state when the mailer throws", async () => {
    const { deps, map } = runnerHarness({
      sendEmail: async () => {
        throw new Error("postmark down");
      },
    });
    const out = await runXHealthCheck(CNT({ pageTruncations: 1, incomplete: 1, docs: 0 }), CTX(), deps, CFG);
    expect(out.delivery).toBe("failed");
    expect(map.get(X_HEALTH_PROVIDER)).toBeTruthy();
  });

  it("sends exactly one alert per episode within the cooldown, then one recovery notice", async () => {
    const nowRef = { v: 1000 };
    const { deps, sent } = runnerHarness({ now: () => nowRef.v });
    const cfg: XHealthConfig = { cooldownMs: 10_000, emptyAlertRuns: 99, stuckAlertRuns: 99 };
    const bad = CNT({ requestFailures: 1, incomplete: 1, docs: 0 });

    let out = await runXHealthCheck(bad, CTX(), deps, cfg);
    expect(out.alert).toBe("unhealthy");
    expect(sent).toHaveLength(1);

    nowRef.v = 2000; // within cooldown — no new email
    out = await runXHealthCheck(bad, CTX(), deps, cfg);
    expect(out.alert).toBeNull();
    expect(sent).toHaveLength(1);

    nowRef.v = 3000; // healthy — one recovery email
    out = await runXHealthCheck(CNT({ docs: 5 }), CTX(), deps, cfg);
    expect(out.alert).toBe("recovery");
    expect(sent).toHaveLength(2);
  });
});

describe("buildXHealthEmail — safe fields only", () => {
  it("carries reasons, counters and catch-up progress but never a secret or message content", () => {
    const mail = buildXHealthEmail(
      "ops@example.com",
      "unhealthy",
      ["page_truncation"],
      CNT({ pageTruncations: 1, incomplete: 1, requests: 5, docs: 0 }),
      CTX({
        watermarkAgeSec: 30000,
        catchup: {
          state: "resumed",
          leaseHeld: false,
          progressSig: "1/3:1:10",
          inserted: 10,
          watermarkAdvanced: false,
        },
      }),
      5000,
    );
    // safe operational fields present
    expect(mail.text).toContain("page_truncation");
    expect(mail.text).toContain("provider x_api");
    expect(mail.text).toContain("api.twitterapi.io");
    expect(mail.text).toContain("Watermark age: 30000s");
    // auth-adjacent mail: no tracking rewrite
    expect(mail.trackLinks).toBe("None");
    expect(mail.trackOpens).toBe(false);
    // never a secret / credential / message content
    expect(mail.text).not.toMatch(/X-API-Key/i);
    expect(mail.text).not.toMatch(/bearer/i);
    expect(mail.text).not.toMatch(/CRON_SECRET/i);
    expect(mail.text).not.toMatch(/tweet \d/i); // the scripted tweet-text sentinel used elsewhere
  });
});

describe("cron-count numeric codes", () => {
  it("encode the alert kind and delivery for cron_runs.counts.x_api", () => {
    expect(alertKindCode(null)).toBe(0);
    expect(alertKindCode("unhealthy")).toBe(1);
    expect(alertKindCode("recovery")).toBe(2);
    expect(alertDeliveryCode("none")).toBe(0);
    expect(alertDeliveryCode("sent")).toBe(1);
    expect(alertDeliveryCode("no_recipient")).toBe(2);
    expect(alertDeliveryCode("failed")).toBe(3);
  });
});

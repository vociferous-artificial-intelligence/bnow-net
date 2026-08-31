import { describe, expect, it, vi } from "vitest";
import type { OutboundEmail } from "../email/send";
import type { MapWatchSignals, MapWatchState } from "./map-watch";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const {
  DEFAULT_MAP_WATCH_STATE,
  buildMapWatchEmail,
  evaluateMapWatch,
  loadMapWatchSignals,
  runMapWatchCheck,
} = await import("./map-watch");

const { MAP_EPOCH, mapTheaters } = await import("./map-worker");
const { STUB_CONTENT_PREFIX } = await import("../adapters/stubs");

const CFG = {
  checkIntervalMs: 600_000,
  lookbackMs: 4 * 3600_000,
  startStaleMs: 75 * 60_000,
  progressStaleMs: 3 * 3600_000,
  cooldownMs: 6 * 3600_000,
  emailTimeoutMs: 5_000,
};

const NOW = 1_788_200_000_000;

/** healthy baseline: recent start, fresh dispositions, no swept rows */
const healthy = (over: Partial<MapWatchSignals> = {}): MapWatchSignals => ({
  sweptRecent: 0,
  lastStartAgeSec: 600,
  dispositionAgeSec: 900,
  eligibleExists: true,
  lastBudgetStopCategory: null,
  ...over,
});

describe("evaluateMapWatch — problem detection", () => {
  it("healthy signals: no fire, no episode", () => {
    const e = evaluateMapWatch(healthy(), DEFAULT_MAP_WATCH_STATE, CFG, NOW);
    expect(e.fire).toBe(false);
    expect(e.nextState.episodeKey).toBeNull();
  });

  it("≥2 swept map runs in the lookback fire map_timeouts (the incident shape)", () => {
    const e = evaluateMapWatch(healthy({ sweptRecent: 2 }), DEFAULT_MAP_WATCH_STATE, CFG, NOW);
    expect(e.fire).toBe(true);
    expect(e.kind).toBe("unhealthy");
    expect(e.reasons).toContain("map_timeouts");
  });

  it("ONE swept run does not fire (a single kill can be transient)", () => {
    const e = evaluateMapWatch(healthy({ sweptRecent: 1 }), DEFAULT_MAP_WATCH_STATE, CFG, NOW);
    expect(e.fire).toBe(false);
  });

  it("a stale newest START fires map_no_start (missing scheduled run)", () => {
    const e = evaluateMapWatch(
      healthy({ lastStartAgeSec: 80 * 60 }),
      DEFAULT_MAP_WATCH_STATE,
      CFG,
      NOW,
    );
    expect(e.reasons).toContain("map_no_start");
  });

  it("stale dispositions WITH eligible work fire map_no_progress", () => {
    const e = evaluateMapWatch(
      healthy({ dispositionAgeSec: 4 * 3600 }),
      DEFAULT_MAP_WATCH_STATE,
      CFG,
      NOW,
    );
    expect(e.reasons).toEqual(["map_no_progress"]);
  });

  it("no false alarm when the eligible set is EMPTY (quiet corpus)", () => {
    const e = evaluateMapWatch(
      healthy({ dispositionAgeSec: 9 * 3600, eligibleExists: false }),
      DEFAULT_MAP_WATCH_STATE,
      CFG,
      NOW,
    );
    expect(e.fire).toBe(false);
  });

  it("no false alarm when the latest run is a BUDGET stop (in-run alerting owns it)", () => {
    for (const cat of ["daily_cap", "total_cap", "monthly_cap", "cap_unset", "not_initialized"]) {
      const e = evaluateMapWatch(
        healthy({ dispositionAgeSec: 9 * 3600, lastBudgetStopCategory: cat }),
        DEFAULT_MAP_WATCH_STATE,
        CFG,
        NOW,
      );
      expect(e.fire, cat).toBe(false);
    }
  });

  it("run_cap (benign pagination) does NOT suppress a genuine no-progress problem", () => {
    const e = evaluateMapWatch(
      healthy({ dispositionAgeSec: 9 * 3600, lastBudgetStopCategory: "run_cap" }),
      DEFAULT_MAP_WATCH_STATE,
      CFG,
      NOW,
    );
    expect(e.reasons).toContain("map_no_progress");
  });

  it("never-started / never-mapped (nulls) read as stale, not as healthy", () => {
    const e = evaluateMapWatch(
      healthy({ lastStartAgeSec: null, dispositionAgeSec: null }),
      DEFAULT_MAP_WATCH_STATE,
      CFG,
      NOW,
    );
    expect(e.reasons).toEqual(["map_no_progress", "map_no_start"]);
  });
});

describe("evaluateMapWatch — episode dedup + recovery", () => {
  it("the same episode inside the cooldown fires exactly once", () => {
    const first = evaluateMapWatch(healthy({ sweptRecent: 3 }), DEFAULT_MAP_WATCH_STATE, CFG, NOW);
    expect(first.fire).toBe(true);
    const second = evaluateMapWatch(
      healthy({ sweptRecent: 4 }),
      first.nextState as MapWatchState,
      CFG,
      NOW + 60_000,
    );
    expect(second.fire).toBe(false);
    expect(second.nextState.episodeKey).toBe("map_timeouts");
  });

  it("a CHANGED episode re-fires despite the cooldown", () => {
    const first = evaluateMapWatch(healthy({ sweptRecent: 3 }), DEFAULT_MAP_WATCH_STATE, CFG, NOW);
    const second = evaluateMapWatch(
      healthy({ sweptRecent: 3, lastStartAgeSec: 90 * 60 }),
      first.nextState as MapWatchState,
      CFG,
      NOW + 60_000,
    );
    expect(second.fire).toBe(true);
  });

  it("recovery fires ONCE when the episode clears, then stays quiet", () => {
    const bad = evaluateMapWatch(healthy({ sweptRecent: 3 }), DEFAULT_MAP_WATCH_STATE, CFG, NOW);
    const rec = evaluateMapWatch(healthy(), bad.nextState as MapWatchState, CFG, NOW + 60_000);
    expect(rec.fire).toBe(true);
    expect(rec.kind).toBe("recovery");
    const quiet = evaluateMapWatch(healthy(), rec.nextState as MapWatchState, CFG, NOW + 120_000);
    expect(quiet.fire).toBe(false);
  });
});

describe("runMapWatchCheck — the KEY incident scenario end-to-end", () => {
  const deps = (over: Partial<Parameters<typeof runMapWatchCheck>[0]> = {}) => {
    const sent: OutboundEmail[] = [];
    const saved: Record<string, unknown>[] = [];
    const queries: string[] = [];
    return {
      sent,
      saved,
      queries,
      deps: {
        claimSlot: async () => true,
        loadState: async () => null,
        saveState: async (_p: string, s: Record<string, unknown>) => {
          saved.push(s);
        },
        sendEmail: async (m: OutboundEmail) => {
          sent.push(m);
          return { delivered: true, via: "test" };
        },
        recipient: () => "ops@example.test",
        now: () => NOW,
        query: async (sql: string) => {
          queries.push(sql);
          // the incident DB shape: swept map rows, old start, frozen
          // dispositions, eligible work, no budget stop
          if (/count\(\*\)::int AS n/.test(sql)) return [{ n: 11 }];
          if (/max\(started_at\)/.test(sql)) return [{ age: 1200 }]; // runs ARE starting
          if (/max\(mapped_at\)/.test(sql)) return [{ age: 12 * 3600 }]; // nothing progresses
          if (/EXISTS/.test(sql)) return [{ e: true }];
          if (/budgetStopCategory/.test(sql)) return [{ c: null }];
          return [];
        },
        ...over,
      },
    };
  };

  it("map dies before its own health evaluator ever runs — the watch detects and emails", async () => {
    const h = deps();
    const out = await runMapWatchCheck(h.deps, CFG);
    expect(out.evaluated).toBe(true);
    expect(out.alert).toBe("unhealthy");
    expect(out.reasons).toEqual(["map_no_progress", "map_timeouts"]);
    expect(out.delivery).toBe("sent");
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].subject).toContain("map watchdog unhealthy");
    // numeric-only body: signals + reasons, no SQL, no content, no secrets
    expect(h.sent[0].text).toContain("sweptTimeouts=11");
    expect(h.saved[0].episodeKey).toBe("map_no_progress,map_timeouts");
  });

  it("throttles: a lost atomic claim does ZERO signal queries, sends nothing, saves nothing", async () => {
    const h = deps({ claimSlot: async () => false });
    const out = await runMapWatchCheck(h.deps, CFG);
    expect(out.throttled).toBe(true);
    expect(out.evaluated).toBe(false);
    expect(h.queries).toHaveLength(0);
    expect(h.sent).toHaveLength(0);
    expect(h.saved).toHaveLength(0);
  });

  it("claims the slot BEFORE any signal query (concurrent starts cannot double-evaluate)", async () => {
    const order: string[] = [];
    const h = deps({
      claimSlot: async () => {
        order.push("claim");
        return true;
      },
    });
    const wrapped = h.deps.query;
    h.deps.query = async (sql: string, params: unknown[]) => {
      order.push("query");
      return wrapped(sql, params);
    };
    await runMapWatchCheck(h.deps, CFG);
    expect(order[0]).toBe("claim");
  });

  it("a hung email send is bounded by the timeout and recorded as failed", async () => {
    const h = deps({
      sendEmail: () => new Promise(() => {}), // never settles
    });
    const out = await runMapWatchCheck(h.deps, { ...CFG, emailTimeoutMs: 20 });
    expect(out.alert).toBe("unhealthy");
    expect(out.delivery).toBe("failed");
    expect(h.saved).toHaveLength(1); // state still advances past the stall
  });

  it("state/query failures are swallowed — the host job is never broken", async () => {
    const h = deps({
      query: async () => {
        throw new Error("db down");
      },
    });
    const out = await runMapWatchCheck(h.deps, CFG);
    expect(out.evaluated).toBe(false);
    expect(h.sent).toHaveLength(0);
  });

  it("no recipient: evaluation and state still advance, delivery=no_recipient", async () => {
    const h = deps({ recipient: () => null });
    const out = await runMapWatchCheck(h.deps, CFG);
    expect(out.delivery).toBe("no_recipient");
    expect(h.saved).toHaveLength(1);
  });
});

describe("loadMapWatchSignals — query shapes", () => {
  it("issues five bounded queries and maps rows to signals", async () => {
    const seen: Array<{ sql: string; params: unknown[] }> = [];
    const signals = await loadMapWatchSignals(async (sql, params) => {
      seen.push({ sql, params });
      if (/count\(\*\)::int AS n/.test(sql)) return [{ n: 3 }];
      if (/max\(started_at\)/.test(sql)) return [{ age: "500" }];
      if (/max\(mapped_at\)/.test(sql)) return [{ age: null }];
      if (/EXISTS/.test(sql)) return [{ e: false }];
      if (/budgetStopCategory/.test(sql)) return [{ c: "daily_cap" }];
      return [];
    }, CFG);
    expect(signals).toEqual({
      sweptRecent: 3,
      lastStartAgeSec: 500,
      dispositionAgeSec: null,
      eligibleExists: false,
      lastBudgetStopCategory: "daily_cap",
    });
    expect(seen).toHaveLength(5);
    // the swept query keys on the #98 sweep signature, never fabricating
    // finish instants: ok=false AND finished_at IS NULL
    const swept = seen.find((q) => /count\(\*\)::int AS n/.test(q.sql))!;
    expect(swept.sql).toContain("ok = false");
    expect(swept.sql).toContain("finished_at IS NULL");
    expect(swept.sql).toContain("job LIKE 'map%'");
  });
});

describe("duplicated eligibility constants stay in lockstep with map-worker", () => {
  it("MAP_EPOCH, stub prefix, and theater parsing match the originals", async () => {
    const src = (await import("node:fs")).readFileSync(
      new URL("./map-watch.ts", import.meta.url),
      "utf8",
    );
    expect(src).toContain(`const MAP_EPOCH = "${MAP_EPOCH}"`);
    expect(src).toContain(`const STUB_CONTENT_PREFIX = "${STUB_CONTENT_PREFIX}"`);
    // theater parsing: same env, same default as mapTheaters()
    delete process.env.MAP_THEATERS;
    expect(mapTheaters()).toEqual(["ru", "ua", "ir"]);
    expect(src).toContain('process.env.MAP_THEATERS ?? "ru,ua,ir"');
  });
});

describe("buildMapWatchEmail — content safety", () => {
  it("bounds the one DB-derived string to the known category enum", () => {
    const mail = buildMapWatchEmail(
      "ops@example.test",
      "unhealthy",
      ["map_no_progress"],
      healthy({ lastBudgetStopCategory: "SELECT pg_sleep(1); --" }),
      NOW,
    );
    expect(mail.text).toContain("lastBudgetStop=other");
    expect(mail.text).not.toContain("pg_sleep");
  });

  it("carries only numeric signals and reason slugs", () => {
    const mail = buildMapWatchEmail(
      "ops@example.test",
      "unhealthy",
      ["map_timeouts"],
      healthy({ sweptRecent: 5 }),
      NOW,
    );
    expect(mail.text).not.toMatch(/SELECT|password|token|Bearer/i);
    expect(mail.text).toContain("sweptTimeouts=5");
    expect(mail.trackOpens).toBe(false);
  });
});

describe("cron-run hook — the watch rides NON-map job starts only", () => {
  it("withCronRun triggers the watch for ingest jobs and never for map-family jobs", async () => {
    vi.resetModules();
    const watchCalls: string[] = [];
    vi.doMock("./map-watch", () => ({
      runScheduledMapWatch: async () => {
        watchCalls.push("called");
        return { evaluated: 1, alertKind: 0, alertDelivery: 0 };
      },
    }));
    vi.doMock("@/db", () => ({ rawSql: { query: async () => [] } }));
    const { withCronRun } = await import("../usage/cron-run");
    await withCronRun("ingest:fast", async () => 1);
    expect(watchCalls).toHaveLength(1);
    await withCronRun("map", async () => 1);
    await withCronRun("map:backfill", async () => 1);
    expect(watchCalls).toHaveLength(1); // unchanged — map never triggers itself
    vi.doUnmock("./map-watch");
    vi.doUnmock("@/db");
    vi.resetModules();
  });
});

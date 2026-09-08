import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";

// The SDK is mocked so this file can exercise the live dispatch path with a
// constructor spy — NO real client is ever built and NO network exists here.
const ctorSpy = vi.hoisted(() => vi.fn());
vi.mock("openai", () => ({
  default: class MockOpenAI {
    constructor(opts?: unknown) {
      ctorSpy(opts);
    }
  },
}));

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { analysisApproval } from "../llm/analysis-registry";
import { analysisReasoningCapable, isAnalysisProviderId } from "../llm/providers";
import { liveConfigKey, offlineIdentity } from "./runner";
import { LlmBudgetError } from "../usage/llm-guard";
import { SpendGuard, type UsageStore } from "../usage/spend-guard";
import type { DigestEvalCase, MapEvalCase, ValidationEvalCase } from "./contracts";
import { evalGuardFromEnv } from "./eval-guard";
import {
  EVAL_DISPATCHABLE_PROVIDERS,
  EVAL_DISPATCHABLE_WORKLOADS,
  EvalDispatchError,
  evalSchemaModeFor,
  RETRY_429_DELAY_MS,
  assertLivePreflight,
  dispatchOnce,
  evalDispatchConfig,
  liveIdentity,
  runLiveCase,
  type LiveDeps,
} from "./live-runner";

// ---- helpers -------------------------------------------------------------------

function memGuard(): { guard: SpendGuard; recorded: ReturnType<typeof vi.fn> } {
  const recorded = vi.fn(async () => {});
  const store: UsageStore = {
    load: async () => ({ totalUsd: 0, totalRequests: 0, dayUsd: 0, dayRequests: 0 }),
    record: recorded,
  };
  return {
    guard: new SpendGuard(
      { provider: "openai_eval", totalCapUsd: 10, dailyUsdCap: 5, dailyRequestCap: 100, runRequestCap: 50 },
      store,
    ),
    recorded,
  };
}

function completion(content: string | null, finish = "stop", promptTokens = 100, completionTokens = 50) {
  return {
    choices: [{ message: { content }, finish_reason: finish }],
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
  };
}

async function deps(create: ReturnType<typeof vi.fn>): Promise<LiveDeps & { sleepSpy: ReturnType<typeof vi.fn> }> {
  const { guard } = memGuard();
  await guard.init();
  const sleepSpy = vi.fn(async () => {});
  return {
    client: { chat: { completions: { create } } } as unknown as OpenAI,
    guard,
    meter: { attempts: 0, reservations: 0, meterings: 0, erroredAttempts: 0 },
    usage: { promptTokens: 0, completionTokens: 0, estUsd: 0 },
    sleep: sleepSpy,
    capture: null,
    sleepSpy,
  };
}

const CFG = evalDispatchConfig("validation", "openai", "gpt-4o-mini", null);
const PROMPT = { system: "sys", user: "usr" };
const SCHEMA = { name: "matches", schema: { type: "object" } };

const MAP_CASE: MapEvalCase = {
  id: "map-live-t",
  workload: "map",
  partition: "typical",
  split: "development",
  provenance: "test",
  input: {
    theater: "ua",
    track: "military",
    docs: [{ docId: 1, title: null, content: "Emergency services said a drone strike damaged a warehouse.", lang: "en", day: "2026-08-01" }],
  },
  reference: { expected: [{ docId: 1, claims: [{ textGist: "Drone strike damaged a warehouse, emergency services said", hedging: "claimed" }] }] },
  offline: { fixtureId: "t", rawOutput: "{}", expectation: "pass" },
};

// ---- evalDispatchConfig --------------------------------------------------------

describe("evalDispatchConfig (baseline via registry; candidates via the ONE registry bypass)", () => {
  it("refuses an unpriced model even for evaluation", () => {
    expect(() => evalDispatchConfig("map", "openai", "gpt-99-hypothetical", null)).toThrow(/no entry in the metering price table/);
  });

  it("refuses invalid efforts and effort-on-non-reasoning models", () => {
    expect(() => evalDispatchConfig("map", "openai", "gpt-5-mini", "extreme")).toThrow(/invalid reasoning effort/);
    expect(() => evalDispatchConfig("map", "openai", "gpt-4o-mini", "low")).toThrow(/non-reasoning model/);
  });

  it("refuses the reduce workload (deterministic — nothing to dispatch)", () => {
    expect(() => evalDispatchConfig("reduce", "openai", "gpt-4o-mini", null)).toThrow(/deterministic/);
  });

  it("resolves the registered production baseline through the registry, stamping baseline", () => {
    // gpt-4o-mini with ABSENT effort is the analysis-reg-v1 status-"baseline"
    // approval for every live workload — its eval identity must record the
    // registry-backed production configuration, never evaluation_candidate.
    for (const workload of ["map", "digest", "validation"] as const) {
      const verdict = analysisApproval(workload, "openai", "gpt-4o-mini", null);
      expect(verdict).toMatchObject({ approved: true, status: "baseline" });
      expect(evalDispatchConfig(workload, "openai", "gpt-4o-mini", null)).toEqual({
        workload,
        provider: "openai",
        model: "gpt-4o-mini",
        reasoningCapable: false,
        reasoningEffort: null,
        approval: "baseline",
        schemaMode: "json_schema_strict",
      });
    }
  });

  it("keeps gpt-5-nano an evaluation_candidate (no registry approval)", () => {
    expect(evalDispatchConfig("map", "openai", "gpt-5-nano", null).approval).toBe("evaluation_candidate");
    expect(evalDispatchConfig("digest", "openai", "gpt-5-nano", null).approval).toBe("evaluation_candidate");
    expect(evalDispatchConfig("validation", "openai", "gpt-5-nano", null).approval).toBe("evaluation_candidate");
  });

  it("bypasses registry approval and the map activation lock for candidates, stamping evaluation_candidate", () => {
    // gpt-5-mini is priced but has NO analysis-registry approval for map, and
    // the map activation lock blocks any non-baseline model in production —
    // the eval path may still measure it, marked as a candidate only.
    const cfg = evalDispatchConfig("map", "openai", "gpt-5-mini", "low");
    expect(cfg).toEqual({
      workload: "map",
      provider: "openai",
      model: "gpt-5-mini",
      reasoningCapable: true,
      reasoningEffort: "low",
      approval: "evaluation_candidate",
      schemaMode: "json_schema_strict",
    });
  });

  it("liveIdentity propagates the registry-backed baseline identity", () => {
    const dataset = {
      datasetVersion: "map-test",
      workload: "map",
      cases: [MAP_CASE],
    } as unknown as Parameters<typeof liveIdentity>[0];
    const id = liveIdentity(dataset, evalDispatchConfig("map", "openai", "gpt-4o-mini", null));
    expect(id.approval).toBe("baseline");
    expect(id.model).toBe("gpt-4o-mini");
    expect(id.reasoningEffort).toBeNull();
    expect(id.registryVersion).toBe("analysis-reg-v1");
    expect(liveIdentity(dataset, evalDispatchConfig("map", "openai", "gpt-5-nano", null)).approval).toBe(
      "evaluation_candidate",
    );
  });
});

// ---- preflight -----------------------------------------------------------------

describe("assertLivePreflight (all guards BEFORE any client construction)", () => {
  const GOOD_ENV = {
    EVAL_DATABASE_URL: "postgres://user:pw@eval-branch.example.neon.tech/db",
    OPENAI_API_KEY: "sk-test",
    LLM_SPRINT_USD_CAP: "10",
    EVAL_USD_CAP_DAILY: "2",
  } as unknown as NodeJS.ProcessEnv;
  const GOOD_ARGS = {
    executeLive: true,
    workload: "validation",
    provider: null, // the CLI default: absent --provider = openai
    model: "gpt-4o-mini",
    effort: null,
    dbAck: "eval-branch.example.neon.tech",
  };

  it("passes with every guard satisfied and returns the acknowledged host", () => {
    const ok = assertLivePreflight(GOOD_ARGS, GOOD_ENV);
    expect(ok.dbHost).toBe("eval-branch.example.neon.tech");
    // gpt-4o-mini/absent IS the registered production baseline — its
    // preflight identity is registry-backed, never evaluation_candidate
    expect(ok.cfg.approval).toBe("baseline");
    expect(ctorSpy).not.toHaveBeenCalled(); // preflight builds nothing
  });

  it("stamps an unapproved candidate evaluation_candidate through the same preflight", () => {
    const ok = assertLivePreflight({ ...GOOD_ARGS, model: "gpt-5-nano" }, GOOD_ENV);
    expect(ok.cfg.approval).toBe("evaluation_candidate");
  });

  it("refuses without the explicit --execute-live flag", () => {
    expect(() => assertLivePreflight({ ...GOOD_ARGS, executeLive: false }, GOOD_ENV)).toThrow(/--execute-live/);
  });

  it("refuses under the kill-switch and under the stub provider", () => {
    expect(() => assertLivePreflight(GOOD_ARGS, { ...GOOD_ENV, LLM_DISABLE: "1" })).toThrow(/kill-switch/);
    expect(() => assertLivePreflight(GOOD_ARGS, { ...GOOD_ENV, ANALYSIS_PROVIDER: "stub" })).toThrow(/stub/);
  });

  it("refuses without EVAL_DATABASE_URL — DATABASE_URL is never read", () => {
    const env = { ...GOOD_ENV, DATABASE_URL: "postgres://prod" } as NodeJS.ProcessEnv;
    delete env.EVAL_DATABASE_URL;
    expect(() => assertLivePreflight(GOOD_ARGS, env)).toThrow(/EVAL_DATABASE_URL/);
  });

  it("refuses when --db-ack does not exactly match the URL host", () => {
    expect(() => assertLivePreflight({ ...GOOD_ARGS, dbAck: null }, GOOD_ENV)).toThrow(/--db-ack eval-branch/);
    expect(() => assertLivePreflight({ ...GOOD_ARGS, dbAck: "other.host" }, GOOD_ENV)).toThrow(/not acknowledged/);
  });

  it("SAF-m3: fails CLOSED when the production DATABASE_URL is unparseable", () => {
    const env = { ...GOOD_ENV, DATABASE_URL: "not a url at all" };
    expect(() => assertLivePreflight(GOOD_ARGS, env)).toThrow(/not URL-parseable/);
  });

  it("SAF-m3: refuses when EVAL_DATABASE_URL host EQUALS the production DATABASE_URL host", () => {
    const env = { ...GOOD_ENV, DATABASE_URL: "postgres://user:pw@eval-branch.example.neon.tech/prod" };
    expect(() => assertLivePreflight(GOOD_ARGS, env)).toThrow(/EQUALS the production DATABASE_URL host/);
    // a distinct production host stays accepted
    const okEnv = { ...GOOD_ENV, DATABASE_URL: "postgres://user:pw@prod-main.example.neon.tech/db" };
    expect(assertLivePreflight(GOOD_ARGS, okEnv)).toBeTruthy();
  });

  it("SAF-m3: pooled/unpooled host aliasing cannot defeat the equality guard", () => {
    // Neon endpoints expose the SAME branch as ep-x.region.neon.tech (direct)
    // and ep-x-pooler.region.neon.tech (pgbouncer). Pasting the production
    // UNPOOLED URL into EVAL_DATABASE_URL must still refuse when DATABASE_URL
    // holds the pooled form — and vice versa.
    const pooled = "postgres://user:pw@ep-prod-pooler.region.neon.tech/db";
    const direct = "postgres://user:pw@ep-prod.region.neon.tech/db";
    for (const [evalUrl, prodUrl] of [
      [direct, pooled],
      [pooled, direct],
    ] as const) {
      const env = { ...GOOD_ENV, EVAL_DATABASE_URL: evalUrl, DATABASE_URL: prodUrl };
      const ack = new URL(evalUrl).host;
      expect(() => assertLivePreflight({ ...GOOD_ARGS, dbAck: ack }, env)).toThrow(
        /EQUALS the production DATABASE_URL host/,
      );
    }
    // a genuinely different branch host still passes with the pooled prod URL
    const env = {
      ...GOOD_ENV,
      EVAL_DATABASE_URL: "postgres://user:pw@ep-eval.region.neon.tech/db",
      DATABASE_URL: pooled,
    };
    expect(
      assertLivePreflight({ ...GOOD_ARGS, dbAck: "ep-eval.region.neon.tech" }, env),
    ).toBeTruthy();
  });

  it("refuses without the API key or either cap (fail-closed)", () => {
    for (const missing of ["OPENAI_API_KEY", "LLM_SPRINT_USD_CAP", "EVAL_USD_CAP_DAILY"] as const) {
      const env = { ...GOOD_ENV };
      delete env[missing];
      expect(() => assertLivePreflight(GOOD_ARGS, env), missing).toThrow(EvalDispatchError);
    }
  });

  it("refuses a live DIGEST eval when REDUCE_VOTES lowers K below the shipped 5 (ruling 18)", () => {
    const digestArgs = { ...GOOD_ARGS, workload: "digest" };
    vi.stubEnv("REDUCE_VOTES", "3");
    try {
      expect(() => assertLivePreflight(digestArgs, GOOD_ENV)).toThrow(/shipped K=5 \(ruling 18\)/);
    } finally {
      vi.unstubAllEnvs();
    }
    // with the env untouched (K resolves to the shipped 5) the same args pass
    const ok = assertLivePreflight(digestArgs, GOOD_ENV);
    expect(ok.cfg.workload).toBe("digest");
    // and the K guard is digest-specific: map/validation are unaffected by it
    vi.stubEnv("REDUCE_VOTES", "3");
    try {
      expect(assertLivePreflight(GOOD_ARGS, GOOD_ENV).cfg.workload).toBe("validation");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

// ---- eval guard ----------------------------------------------------------------

describe("evalGuardFromEnv", () => {
  it("fails closed when EVAL_USD_CAP_DAILY is unset — even outside production", async () => {
    vi.stubEnv("LLM_SPRINT_USD_CAP", "10");
    vi.stubEnv("EVAL_USD_CAP_DAILY", "");
    try {
      const guard = evalGuardFromEnv();
      const res = guard.tryReserve();
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe("daily_usd_unset");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

// ---- dispatchOnce metering invariants ------------------------------------------

describe("dispatchOnce", () => {
  it("one physical attempt = one reservation = one metering, recorded BEFORE parse", async () => {
    const create = vi.fn(async () => completion('{"matches":[]}'));
    const d = await deps(create);
    const out = await dispatchOnce(d, CFG, PROMPT, SCHEMA, { temperature: 0 });
    expect(d.meter).toEqual({ attempts: 1, reservations: 1, meterings: 1, erroredAttempts: 0 });
    expect(out.raw).toBe('{"matches":[]}');
    expect(out.estUsd).toBeGreaterThan(0);
  });

  it("a 429 manual retry takes a FRESH reservation (2 attempts, 2 reservations, 1 metering)", async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("rate limited"), { status: 429 }))
      .mockResolvedValueOnce(completion('{"matches":[]}'));
    const d = await deps(create);
    const out = await dispatchOnce(d, CFG, PROMPT, SCHEMA, { temperature: 0 });
    expect(d.meter).toEqual({ attempts: 2, reservations: 2, meterings: 1, erroredAttempts: 1 });
    expect(d.sleepSpy).toHaveBeenCalledWith(RETRY_429_DELAY_MS);
    expect(out.raw).toBe('{"matches":[]}');
  });

  it("a truncated response is still metered in full before being discarded (ruling 8)", async () => {
    const { guard, recorded } = memGuard();
    await guard.init();
    const create = vi.fn(async () => completion("partial cut off", "length", 500, 4096));
    const d: LiveDeps = {
      client: { chat: { completions: { create } } } as unknown as OpenAI,
      guard,
      meter: { attempts: 0, reservations: 0, meterings: 0, erroredAttempts: 0 },
      usage: { promptTokens: 0, completionTokens: 0, estUsd: 0 },
      sleep: async () => {},
      capture: null,
    };
    const out = await dispatchOnce(d, CFG, PROMPT, SCHEMA, { temperature: 0 });
    expect(out.truncated).toBe(true);
    expect(d.meter.meterings).toBe(1);
    expect(recorded).toHaveBeenCalledTimes(1);
    // billed tokens flow into the guard record regardless of usability
    expect(recorded.mock.calls[0][3]).toBe(500 + 4096);
  });

  it("a budget refusal throws typed BEFORE any attempt", async () => {
    const create = vi.fn();
    const { guard } = memGuard();
    // guard NOT initialized -> not_initialized refusal (fail closed)
    const d: LiveDeps = {
      client: { chat: { completions: { create } } } as unknown as OpenAI,
      guard,
      meter: { attempts: 0, reservations: 0, meterings: 0, erroredAttempts: 0 },
      usage: { promptTokens: 0, completionTokens: 0, estUsd: 0 },
      sleep: async () => {},
      capture: null,
    };
    await expect(dispatchOnce(d, CFG, PROMPT, SCHEMA, { temperature: 0 })).rejects.toThrow(LlmBudgetError);
    expect(create).not.toHaveBeenCalled();
    expect(d.meter.attempts).toBe(0);
  });

  it("a non-429 provider error counts as an errored attempt and is NOT metered (unbilled)", async () => {
    const create = vi.fn().mockRejectedValue(Object.assign(new Error("boom"), { status: 500 }));
    const d = await deps(create);
    await expect(dispatchOnce(d, CFG, PROMPT, SCHEMA, { temperature: 0 })).rejects.toThrow("boom");
    expect(d.meter).toEqual({ attempts: 1, reservations: 1, meterings: 0, erroredAttempts: 1 });
  });
});

// ---- runLiveCase ---------------------------------------------------------------

describe("runLiveCase", () => {
  it("map: dispatches once, scores through the real evaluator, and never stores raw output text", async () => {
    const raw = JSON.stringify({
      results: [{ docId: 1, claims: [{ text_en: "A drone strike damaged a warehouse, emergency services said.", quote_orig: "a drone strike damaged a warehouse", claim_type: "factual", hedging: "claimed", event_hint: "warehouse strike", entities: [] }] }],
    });
    const create = vi.fn(async () => completion(raw));
    const d = await deps(create);
    const cfg = evalDispatchConfig("map", "openai", "gpt-5-mini", null);
    const result = await runLiveCase(d, cfg, MAP_CASE, "map-v1", "run-t", 0);
    expect(result.status).toBe("scored");
    expect(result.checks.pass).toBe(true);
    expect(result.configKey).toBe("gpt-5-mini");
    expect(result.attempt).toBe(1);
    expect(JSON.stringify(result)).not.toContain("drone strike damaged"); // digest only, never the text
    expect(result.rawOutputDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("digest: makes exactly K=5 vote dispatches, each with its own reservation", async () => {
    const digestCase: DigestEvalCase = {
      id: "dig-live-t",
      workload: "digest",
      partition: "typical",
      split: "development",
      provenance: "test",
      input: {
        theater: "ua",
        track: "military",
        date: "2026-08-05",
        claims: [{ id: 1, docId: 10, textEn: "Sources claim the depot was damaged in a strike.", quoteOrig: null, quoteVerified: false, claimType: "factual", hedging: "claimed", entities: [], eventHint: "depot strike", claimDate: "2026-08-05", sourceDomain: "a.example", sourceKey: null, reliability: 0.5, adapter: "rss", platform: null, publishedAt: null }],
      },
      reference: {},
      offline: { fixtureId: "t", votes: ["{}"], expectation: "pass" },
    };
    const voteRaw = JSON.stringify({ events: [{ title: "Sources report depot strike", type: "strike", summary: "Reportedly damaged.", claims: [{ text: "Sources claim the depot was damaged in a strike.", gids: [1] }] }] });
    const create = vi.fn(async () => completion(voteRaw));
    const d = await deps(create);
    const cfg = evalDispatchConfig("digest", "openai", "gpt-4o-mini", null);
    const result = await runLiveCase(d, cfg, digestCase, "digest-v1", "run-t", 0);
    expect(create).toHaveBeenCalledTimes(5);
    expect(d.meter).toEqual({ attempts: 5, reservations: 5, meterings: 5, erroredAttempts: 0 });
    expect(result.status).toBe("scored");
    expect((result.checks as { candidateInvariantOnly?: boolean }).candidateInvariantOnly).toBe(true);
  });

  it("validation: an unparseable response is metered, then recorded as schema_invalid", async () => {
    const valCase: ValidationEvalCase = {
      id: "val-live-t",
      workload: "validation",
      partition: "typical",
      split: "development",
      provenance: "test",
      input: {
        takeaways: [{ index: 0, text: "Assault units advanced near Pokrovsk." }],
        claims: [{ claimId: 1, text: "Assault units advanced near Pokrovsk, the report said.", hedging: "claimed", docCount: 2, earliestDocAt: null, earliestFetchedAt: null }],
        iswPublishedAt: null,
      },
      reference: { labels: [{ takeawayIndex: 0, claimId: 1 }] },
      offline: { expectation: "pass" },
    };
    const create = vi.fn(async () => completion("garbage not json"));
    const d = await deps(create);
    const cfg = evalDispatchConfig("validation", "openai", "gpt-4o-mini", null);
    const result = await runLiveCase(d, cfg, valCase, "validation-v1", "run-t", 0);
    expect(result.status).toBe("schema_invalid");
    expect(result.checks.pass).toBe(false);
    // 2026-09-04 parity: the production FIVE vote rounds are dispatched; every
    // one is billed and recorded despite being unusable
    expect(create).toHaveBeenCalledTimes(5);
    expect(d.meter.meterings).toBe(5);
    expect(result.votes).toEqual({ requested: 5, usable: 0, mode: "production-equivalent", matcher: "llm", perTakeaway: null });
  });
});

// ---- the provider dimension (PLAN-WS-2 §7.1) -----------------------------------

describe("eval provider dimension", () => {
  const DATASET = {
    datasetVersion: "map-test",
    workload: "map",
    cases: [MAP_CASE],
  } as unknown as Parameters<typeof liveIdentity>[0];

  const ENV = {
    EVAL_DATABASE_URL: "postgres://user:pw@eval-branch.example.neon.tech/db",
    OPENAI_API_KEY: "sk-test",
    LLM_SPRINT_USD_CAP: "10",
    EVAL_USD_CAP_DAILY: "2",
  } as unknown as NodeJS.ProcessEnv;
  const ARGS = {
    executeLive: true,
    workload: "validation",
    provider: null,
    model: "gpt-4o-mini",
    effort: null,
    dbAck: "eval-branch.example.neon.tech",
  };

  it("the dispatchable set is derived from the per-workload table, and every id in it is nameable", () => {
    expect([...EVAL_DISPATCHABLE_PROVIDERS]).toEqual(["openai", "anthropic"]);
    for (const id of EVAL_DISPATCHABLE_PROVIDERS) expect(isAnalysisProviderId(id)).toBe(true);
    // openai_compatible is nameable and has no request path — an empty
    // workload list is what makes it non-dispatchable, not a second constant
    expect(EVAL_DISPATCHABLE_WORKLOADS.openai_compatible).toEqual([]);
    expect(EVAL_DISPATCHABLE_PROVIDERS).not.toContain("openai_compatible");
    // anthropic evaluates the digest workload ONLY: map is hard-locked to the
    // OpenAI baseline and validation is allowlisted to openai in production,
    // so a cross-vendor cell there would measure something nothing can run
    expect(EVAL_DISPATCHABLE_WORKLOADS.anthropic).toEqual(["digest"]);
  });

  it("the preflight refuses a non-dispatchable provider — and refuses it BEFORE the DB, the key and the caps", () => {
    // a fully-satisfied environment still refuses: the objection is to the
    // BUILD's capability, not to a missing setting the operator could add
    expect(() => assertLivePreflight({ ...ARGS, provider: "openai_compatible" }, ENV)).toThrow(
      /provider "openai_compatible" is not eval-dispatchable in this build \(allowed: openai\|anthropic\) — refusing before any client construction/,
    );
    // and an EMPTY environment surfaces the provider refusal, not the DB one:
    // that ordering is what "before any client or DB" means operationally
    expect(() =>
      assertLivePreflight({ ...ARGS, provider: "openai_compatible" }, {} as NodeJS.ProcessEnv),
    ).toThrow(/not eval-dispatchable/);
  });

  it("a dispatchable provider is still refused for a workload it has no path for", () => {
    // anthropic can evaluate digest and nothing else; the refusal names what
    // it CAN do rather than implying the vendor is unusable
    for (const workload of ["map", "validation"]) {
      expect(() =>
        assertLivePreflight(
          { ...ARGS, workload, provider: "anthropic", model: "claude-sonnet-5" },
          { ...ENV, ANTHROPIC_API_KEY: "sk-ant-test" },
        ),
      ).toThrow(/provider "anthropic" has no eval dispatch path for workload "\w+" in this build \(it can evaluate: digest\)/);
    }
  });

  it("the key the preflight demands is the DISPATCHING vendor's, not always OpenAI's", () => {
    const anthropicArgs = { ...ARGS, workload: "digest", provider: "anthropic", model: "claude-sonnet-5" };
    // OPENAI_API_KEY present, ANTHROPIC_API_KEY absent: refusing on the OpenAI
    // key here would send the operator to fix the wrong thing
    expect(() => assertLivePreflight(anthropicArgs, ENV)).toThrow(/ANTHROPIC_API_KEY is not set/);
    const both = { ...ENV, ANTHROPIC_API_KEY: "sk-ant-test" } as NodeJS.ProcessEnv;
    expect(assertLivePreflight(anthropicArgs, both).cfg.provider).toBe("anthropic");
    // and the OpenAI cell still demands OPENAI_API_KEY
    const noOpenAi = { ...both, OPENAI_API_KEY: "" } as NodeJS.ProcessEnv;
    expect(() => assertLivePreflight(ARGS, noOpenAi)).toThrow(/OPENAI_API_KEY is not set/);
  });

  it("R13: the schema mode is stamped, because a prompt-carried schema is a different experiment", () => {
    // OpenAI dispatches json_schema + strict:true, so a non-conforming body is
    // undecodable. Messages has no equivalent, so the schema goes in the
    // prompt and conformance becomes a model behaviour. Two runs that differ
    // here are not the same experiment with a different model.
    expect(evalDispatchConfig("digest", "openai", "gpt-4o-mini", null).schemaMode).toBe(
      "json_schema_strict",
    );
    expect(evalDispatchConfig("digest", "anthropic", "claude-sonnet-5", null).schemaMode).toBe(
      "prompt_embedded_json",
    );
    expect(evalSchemaModeFor("openai_compatible")).toBe("prompt_embedded_json");
    // and it reaches the durable identity
    expect(
      liveIdentity(DATASET, evalDispatchConfig("digest", "anthropic", "claude-sonnet-5", null))
        .schemaMode,
    ).toBe("prompt_embedded_json");
  });

  it("an anthropic candidate is an evaluation_candidate and keys its own results file", () => {
    const cfg = evalDispatchConfig("digest", "anthropic", "claude-sonnet-5", null);
    expect(cfg.approval).toBe("evaluation_candidate"); // no anthropic registry approval exists
    expect(liveConfigKey(cfg.model, cfg.reasoningEffort, cfg.provider)).toBe(
      "claude-sonnet-5+provider=anthropic",
    );
  });

  it("an unknown provider id refuses identically (the operator's question is the same)", () => {
    expect(() => assertLivePreflight({ ...ARGS, provider: "not-a-vendor" }, ENV)).toThrow(
      /provider "not-a-vendor" is not eval-dispatchable in this build/,
    );
    expect(() => assertLivePreflight({ ...ARGS, provider: "stub" }, ENV)).toThrow(
      /not eval-dispatchable/,
    );
  });

  it("the pin is not vacuous: provider null and provider openai both pass and resolve to openai", () => {
    expect(assertLivePreflight(ARGS, ENV).cfg.provider).toBe("openai");
    expect(assertLivePreflight({ ...ARGS, provider: "openai" }, ENV).cfg.provider).toBe("openai");
  });

  it("evalDispatchConfig carries the provider and prices FOR it, never across vendors", () => {
    expect(evalDispatchConfig("digest", "openai", "gpt-4o-mini", null).provider).toBe("openai");
    // gpt-4o-mini is an OpenAI price row; asking for it as another vendor's
    // model must refuse rather than meter Claude tokens at OpenAI rates
    expect(() => evalDispatchConfig("digest", "anthropic", "gpt-4o-mini", null)).toThrow(
      /is not priced for provider "anthropic"/,
    );
    // openai_compatible has no request path at all, so it never reaches pricing
    expect(() => evalDispatchConfig("digest", "openai_compatible", "gpt-4o-mini", null)).toThrow(
      /has no eval dispatch path for workload "digest"/,
    );
    // the OpenAI wording is unchanged from before the provider dimension
    expect(() => evalDispatchConfig("digest", "openai", "gpt-99-hypothetical", null)).toThrow(
      /has no entry in the metering price table/,
    );
  });

  it("evalDispatchConfig refuses an unnameable provider before it prices anything", () => {
    expect(() => evalDispatchConfig("digest", "not-a-vendor", "gpt-4o-mini", null)).toThrow(
      /provider "not-a-vendor" is not a known provider \(known: openai\|anthropic\|openai_compatible\)/,
    );
  });

  it("reasoning capability is provider-relative (providers.ts), not a local regex mirror", () => {
    expect(evalDispatchConfig("map", "openai", "gpt-5-mini", null).reasoningCapable).toBe(
      analysisReasoningCapable("openai", "gpt-5-mini"),
    );
    expect(evalDispatchConfig("map", "openai", "gpt-4o-mini", null).reasoningCapable).toBe(
      analysisReasoningCapable("openai", "gpt-4o-mini"),
    );
    // the mirror this file used to keep is gone — a second capability
    // authority is how the two silently diverge (the same argument that made
    // pricing.ts the single price authority)
    const src = readFileSync(join(__dirname, "live-runner.ts"), "utf8");
    expect(src).not.toMatch(/const REASONING_MODEL/);
  });

  it("liveIdentity records the dispatching provider, and an offline identity still says stub", () => {
    const id = liveIdentity(DATASET, evalDispatchConfig("map", "openai", "gpt-4o-mini", null));
    expect(id.provider).toBe("openai");
    // headerIsLive is `provider !== "stub"`, so the offline convention must
    // survive the union widening untouched (PR #61's skip is keyed on it)
    expect(offlineIdentity(DATASET).provider).toBe("stub");
  });

  it("the results configKey carries the provider through runLiveCase", () => {
    const cfg = evalDispatchConfig("validation", "openai", "gpt-4o-mini", null);
    expect(liveConfigKey(cfg.model, cfg.reasoningEffort, cfg.provider)).toBe("gpt-4o-mini");
  });
});

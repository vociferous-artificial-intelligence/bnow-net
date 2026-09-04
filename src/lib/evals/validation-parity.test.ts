// 2026-09-04 validation parity: a live validation eval dispatches the
// production matcher's FIVE vote rounds and resolves them through the
// production resolveVoteRounds. Everything mocked; no client, no network,
// no DB, no real fs.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";

const ctorSpy = vi.hoisted(() => vi.fn());
vi.mock("openai", () => ({
  default: class MockOpenAI {
    constructor(opts?: unknown) {
      ctorSpy(opts);
    }
  },
}));

import { SpendGuard, type UsageStore } from "../usage/spend-guard";
import { MATCH_VOTES_DEFAULT, majorityFromVotes, resolveVoteRounds, type LlmMatch } from "../validation/llm-match";
import { openCaptureSink, parseCaptureFile, type CaptureBudgetStopLine, type CaptureFs, type CaptureRunHeader } from "./capture";
import type { AnalysisEvalDataset, EvalResultsFile, ValidationEvalCase } from "./contracts";
import { assertLivePreflight, evalDispatchConfig, liveIdentity, liveVoteCount, runLiveCase, runLiveSweep, type LiveDeps } from "./live-runner";
import {
  VALIDATION_VOTES_DIAGNOSTIC,
  VALIDATION_VOTES_PRODUCTION,
  buildAnalysisEstimatePlan,
  comparableKnobs,
  currentEnvKnobs,
  evalValidationVotes,
  pendingWork,
  resumeIdentityMismatch,
  sha256,
  validationVoteModeLine,
  validationVotesKeySuffix,
  type ResultsFileHeader,
} from "./runner";
import { scoreValidationCase } from "./score-validation";

afterEach(() => vi.unstubAllEnvs());

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;

// ---- fakes --------------------------------------------------------------------

function memGuard(caps: { runRequestCap?: number } = {}) {
  const store: UsageStore = {
    load: async () => ({ totalUsd: 0, totalRequests: 0, dayUsd: 0, dayRequests: 0 }),
    record: async () => {},
  };
  return new SpendGuard({ provider: "openai_eval", totalCapUsd: 10, dailyUsdCap: 5, dailyRequestCap: 100, runRequestCap: caps.runRequestCap ?? 50 }, store);
}

function completion(content: string | null, finish = "stop") {
  return { id: "chatcmpl-x", model: "gpt-4o-mini-2024-07-18", choices: [{ message: { content, refusal: null }, finish_reason: finish }], usage: { prompt_tokens: 100, completion_tokens: 20 } };
}

async function mkDeps(create: ReturnType<typeof vi.fn>, opts: { capture?: LiveDeps["capture"]; runRequestCap?: number } = {}): Promise<LiveDeps> {
  const guard = memGuard({ runRequestCap: opts.runRequestCap });
  await guard.init();
  return {
    client: { chat: { completions: { create } } } as unknown as OpenAI,
    guard,
    meter: { attempts: 0, reservations: 0, meterings: 0, erroredAttempts: 0 },
    usage: { promptTokens: 0, completionTokens: 0, estUsd: 0 },
    sleep: async () => {},
    capture: opts.capture ?? null,
  };
}

const CFG = evalDispatchConfig("validation", "gpt-4o-mini", null);

/** two takeaways, two claims — the val-typ-005 shape (labels: 0→1071, 1→null) */
const CASE: ValidationEvalCase = {
  id: "val-parity",
  workload: "validation",
  partition: "typical",
  split: "development",
  provenance: "test",
  input: {
    takeaways: [
      { index: 0, text: "Strikes damaged rail infrastructure near Kupyansk." },
      { index: 1, text: "Air defense activity increased over Belgorod region." },
    ],
    claims: [
      { claimId: 1071, text: "A missile strike damaged rail infrastructure near Kupyansk, officials said.", hedging: "claimed", docCount: 2, earliestDocAt: null, earliestFetchedAt: null },
      { claimId: 1072, text: "Air defense units were active over Belgorod region, channels claimed.", hedging: "claimed", docCount: 1, earliestDocAt: null, earliestFetchedAt: null },
    ],
    iswPublishedAt: null,
  },
  reference: { labels: [{ takeawayIndex: 0, claimId: 1071 }, { takeawayIndex: 1, claimId: null }] },
  offline: { expectation: "pass" },
};

const round = (t0: number | null, t1: number | null, conf = 0.9) =>
  JSON.stringify({ matches: [{ takeawayIndex: 0, claimId: t0, confidence: t0 === null ? 0 : conf }, { takeawayIndex: 1, claimId: t1, confidence: t1 === null ? 0 : conf }] });

function dataset(cases: ValidationEvalCase[]): AnalysisEvalDataset {
  return { datasetVersion: "validation-test", workload: "validation", cases } as AnalysisEvalDataset;
}

function headerFor(ds: AnalysisEvalDataset): ResultsFileHeader {
  return { workload: "validation", configKey: "gpt-4o-mini+votes5", datasetVersion: ds.datasetVersion, datasetContentHash: "dc".repeat(32), identity: liveIdentity(ds, CFG), requestedRepetitions: 1, scope: "full", envKnobs: currentEnvKnobs() };
}

// ---- knob + identity ------------------------------------------------------------

describe("validation vote knob", () => {
  it("defaults to the production 5 (= MATCH_VOTES_DEFAULT); accepts exactly 5 or 1; refuses anything else", () => {
    expect(VALIDATION_VOTES_PRODUCTION).toBe(MATCH_VOTES_DEFAULT);
    expect(evalValidationVotes(env({}))).toBe(5);
    expect(evalValidationVotes(env({ EVAL_VALIDATION_VOTES: "5" }))).toBe(5);
    expect(evalValidationVotes(env({ EVAL_VALIDATION_VOTES: "1" }))).toBe(VALIDATION_VOTES_DIAGNOSTIC);
    for (const bad of ["3", "0", "7", "five", "05"]) {
      expect(() => evalValidationVotes(env({ EVAL_VALIDATION_VOTES: bad })), bad).toThrow(/must be 5 .* or 1/);
    }
    expect(currentEnvKnobs().validationVotes).toBe(5);
    expect(validationVotesKeySuffix(5)).toBe("+votes5");
    expect(liveVoteCount(CASE)).toBe(5);
  });

  it("identity: a legacy single-round validation file (no validationVotes) REFUSES a 5-vote resume, accepts a 1-vote one, and the knob is ignored off-workload", () => {
    const ds = dataset([CASE]);
    const legacy: EvalResultsFile = { ...headerFor(ds), configKey: "gpt-4o-mini", envKnobs: { reduceVotes: 5, reduceMaxOutputTokens: 6000, mapOutTokensPerDoc: 200, mapContentChars: 1500, reduceGroupsFed: 200 }, updatedAt: "t", meter: { attempts: 51, reservations: 51, meterings: 51, erroredAttempts: 0 }, results: {} };
    const fiveVote = { ...headerFor(ds), configKey: "gpt-4o-mini" };
    const mismatch = resumeIdentityMismatch(legacy, fiveVote);
    expect(mismatch).toMatch(/envKnobs/);
    expect(mismatch).toMatch(/"validationVotes":1.*"validationVotes":5/);
    const oneVote = { ...fiveVote, envKnobs: { ...fiveVote.envKnobs, validationVotes: 1 } };
    expect(resumeIdentityMismatch(legacy, oneVote)).toBeNull();
    // same knobs both sides resume fine
    expect(resumeIdentityMismatch({ ...legacy, envKnobs: fiveVote.envKnobs }, fiveVote)).toBeNull();
    // a MAP file never compares validationVotes: legacy map header vs current knobs (validationVotes 5) is compatible
    const mapLegacy = { ...legacy, workload: "map" as const, identity: { ...legacy.identity } };
    const mapCurrent = { ...fiveVote, workload: "map" as const };
    expect(resumeIdentityMismatch(mapLegacy, mapCurrent)).toBeNull();
    expect(comparableKnobs(legacy.envKnobs, "validation")).toMatchObject({ validationVotes: 1, reduceGroupsFed: 200 });
    expect(comparableKnobs(fiveVote.envKnobs, "map")).not.toHaveProperty("validationVotes");
  });

  it("scorecard vote-mode line distinguishes production-equivalent, diagnostic, legacy and offline", () => {
    const base = { reduceVotes: 5, reduceMaxOutputTokens: 6000, mapOutTokensPerDoc: 200, mapContentChars: 1500, reduceGroupsFed: 200 };
    expect(validationVoteModeLine({ ...base, validationVotes: 5 }, true)).toMatch(/production-equivalent \(5 vote rounds/);
    expect(validationVoteModeLine({ ...base, validationVotes: 1 }, true)).toMatch(/SINGLE-ROUND DIAGNOSTIC.*NOT production-equivalent/);
    expect(validationVoteModeLine(base, true)).toMatch(/LEGACY SINGLE-ROUND.*NOT production-equivalent/);
    expect(validationVoteModeLine(base, false)).toMatch(/offline fixtures/);
  });

  it("request accounting: the estimate counts K calls (and K× tokens) per validation case; the diagnostic mode counts 1", () => {
    const ds = dataset([CASE]);
    const five = buildAnalysisEstimatePlan(ds, "gpt-4o-mini", 3);
    expect(five.totalCalls).toBe(15);
    vi.stubEnv("EVAL_VALIDATION_VOTES", "1");
    const one = buildAnalysisEstimatePlan(ds, "gpt-4o-mini", 3);
    expect(one.totalCalls).toBe(3);
    expect(five.totalPromptTokens).toBe(one.totalPromptTokens * 5);
    expect(five.totalCompletionTokens).toBe(one.totalCompletionTokens * 5);
    expect(five.totalUsd).toBeCloseTo(one.totalUsd * 5, 10);
  });
});

// ---- preflight --------------------------------------------------------------------

describe("preflight vote guards (validation only)", () => {
  const ENV = { EVAL_DATABASE_URL: "postgres://u:p@eval.example.neon.tech/db", OPENAI_API_KEY: "sk-test", LLM_SPRINT_USD_CAP: "10", EVAL_USD_CAP_DAILY: "2" } as unknown as NodeJS.ProcessEnv;
  const ARGS = { executeLive: true, workload: "validation", model: "gpt-4o-mini", effort: null, dbAck: "eval.example.neon.tech" };

  it("refuses a production MATCH_VOTES/MATCHER_MODE override, a non-existent vote count, an unacknowledged single round, and an ack that authorizes nothing", () => {
    expect(() => assertLivePreflight(ARGS, { ...ENV, MATCH_VOTES: "3" })).toThrow(/MATCHER_MODE\/MATCH_VOTES alter/);
    expect(() => assertLivePreflight(ARGS, { ...ENV, MATCHER_MODE: "single" })).toThrow(/MATCHER_MODE\/MATCH_VOTES alter/);
    expect(assertLivePreflight(ARGS, { ...ENV, MATCH_VOTES: "5" }).cfg.workload).toBe("validation"); // equal to the default is not an override
    expect(() => assertLivePreflight(ARGS, { ...ENV, EVAL_VALIDATION_VOTES: "3" })).toThrow(/must be 5 .* or 1/);
    expect(() => assertLivePreflight(ARGS, { ...ENV, EVAL_VALIDATION_VOTES: "1" })).toThrow(/pass --single-round-diagnostic/);
    expect(assertLivePreflight({ ...ARGS, singleRoundDiagnostic: true }, { ...ENV, EVAL_VALIDATION_VOTES: "1" }).cfg.workload).toBe("validation");
    expect(() => assertLivePreflight({ ...ARGS, singleRoundDiagnostic: true }, ENV)).toThrow(/authorizes nothing/);
    // the guards are validation-specific
    expect(assertLivePreflight({ ...ARGS, workload: "map" }, { ...ENV, MATCH_VOTES: "3", EVAL_VALIDATION_VOTES: "1" }).cfg.workload).toBe("map");
  });
});

// ---- live parity ------------------------------------------------------------------

describe("runLiveCase validation parity", () => {
  it("dispatches exactly 5 rounds and resolves them through the PRODUCTION rule: 3-of-5 confirms, 2-2-1 rejects", async () => {
    // takeaway 0: 1071 ×4 + null; takeaway 1: 1071, 1071, 1072, 1072, null (2-2-1 → null) — val-typ-005's arithmetic
    const rounds = [round(1071, 1071), round(1071, 1071), round(1071, 1072), round(null, 1072), round(1071, null)];
    const create = vi.fn();
    for (const r of rounds) create.mockResolvedValueOnce(completion(r));
    const d = await mkDeps(create);
    const result = await runLiveCase(d, CFG, CASE, "validation-test", "run-p", 0);
    expect(create).toHaveBeenCalledTimes(5);
    expect(result.attempt).toBe(5);
    expect(d.meter).toEqual({ attempts: 5, reservations: 5, meterings: 5, erroredAttempts: 0 });
    expect(result.status).toBe("scored");
    expect(result.checks.pass).toBe(true); // {0→1071, 1→null} == labels
    expect(result.votes).toEqual({
      requested: 5,
      usable: 5,
      mode: "production-equivalent",
      matcher: "llm-majority",
      perTakeaway: [
        { i: 0, v: [1071, 1071, 1071, null, 1071], final: 1071 },
        { i: 1, v: [1071, 1071, 1072, 1072, null], final: null },
      ],
    });
    // byte-for-byte the same finals production's majorityFromVotes/resolveVoteRounds produce
    const parsedRounds = rounds.map((r) => (JSON.parse(r) as { matches: LlmMatch[] }).matches);
    const prod = resolveVoteRounds(parsedRounds, 2)!;
    expect(prod.matcher).toBe("llm-majority");
    expect(prod.votes!.map((v) => v.final)).toEqual([1071, null]);
    expect(majorityFromVotes(parsedRounds, 2).votes.map((v) => v.final)).toEqual([1071, null]);
    expect(result.promptTokens).toBe(500);
    expect(result.rawOutputDigest).toBe(sha256(rounds.join("\n---\n")));
  });

  it("a majority that contradicts the labels FAILS the row (live verdict is against reference.labels, not the vote mechanism)", async () => {
    const create = vi.fn(async () => completion(round(1071, 1072))); // 5/5 say takeaway 1 → 1072
    const d = await mkDeps(create);
    const result = await runLiveCase(d, CFG, CASE, "validation-test", "run-p", 0);
    expect(result.checks.pass).toBe(false);
    expect(result.checks.failures[0]).toMatch(/match-set path disagrees with labels: 1 false positive/);
    expect(result.votes?.perTakeaway?.[1]).toEqual({ i: 1, v: [1072, 1072, 1072, 1072, 1072], final: 1072 });
  });

  it("unusable votes are dropped as production drops failed votes: 4 usable still majority; 2 usable degrades to the first round (matcher llm); 0 usable is schema_invalid", async () => {
    const four = vi
      .fn()
      .mockResolvedValueOnce(completion("cut off", "length"))
      .mockResolvedValueOnce(completion(round(1071, null)))
      .mockResolvedValueOnce(completion(round(1071, null)))
      .mockResolvedValueOnce(completion(round(1071, null)))
      .mockResolvedValueOnce(completion(round(null, null)));
    let r = await runLiveCase(await mkDeps(four), CFG, CASE, "validation-test", "run-p", 0);
    expect(r.status).toBe("scored");
    expect(r.votes).toMatchObject({ requested: 5, usable: 4, matcher: "llm-majority" });
    expect(r.votes?.perTakeaway?.[0]).toEqual({ i: 0, v: [1071, 1071, 1071, null], final: 1071 });

    const two = vi
      .fn()
      .mockResolvedValueOnce(completion("garbage"))
      .mockResolvedValueOnce(completion(round(1071, 1072)))
      .mockResolvedValueOnce(completion(null))
      .mockResolvedValueOnce(completion("{"))
      .mockResolvedValueOnce(completion(round(null, null)));
    r = await runLiveCase(await mkDeps(two), CFG, CASE, "validation-test", "run-p", 0);
    expect(r.status).toBe("scored");
    expect(r.votes).toEqual({ requested: 5, usable: 2, mode: "production-equivalent", matcher: "llm", perTakeaway: null });
    expect(r.checks.pass).toBe(false); // first usable round said 1→1072: a false positive against the labels
    expect(r.attempt).toBe(5); // all five were still dispatched and metered

    const none = vi.fn(async () => completion("nope"));
    const d = await mkDeps(none);
    r = await runLiveCase(d, CFG, CASE, "validation-test", "run-p", 0);
    expect(r.status).toBe("schema_invalid");
    expect(r.checks.failures).toEqual(["match response unparseable or truncated (0 of 5 vote round(s) usable)"]);
    expect(d.meter.meterings).toBe(5);
  });

  it("single-round diagnostic (EVAL_VALIDATION_VOTES=1): one dispatch, labelled non-production-equivalent, historical single-response digest preserved", async () => {
    vi.stubEnv("EVAL_VALIDATION_VOTES", "1");
    const raw = round(1071, null);
    const create = vi.fn(async () => completion(raw));
    const d = await mkDeps(create);
    const r = await runLiveCase(d, CFG, CASE, "validation-test", "run-d", 0);
    expect(create).toHaveBeenCalledTimes(1);
    expect(r.votes).toEqual({ requested: 1, usable: 1, mode: "single-round-diagnostic", matcher: "llm", perTakeaway: null });
    expect(r.rawOutputDigest).toBe(sha256(raw));
    expect(liveVoteCount(CASE)).toBe(1);
  });

  it("semantic labels stay separate from the deterministic majority-mechanism fixture: the offline expectMajority pin and the live vote record never influence each other, and val-typ-005 is NOT relabelled by this change", async () => {
    const withFixture: ValidationEvalCase = {
      ...CASE,
      input: {
        ...CASE.input,
        // a fixture whose mechanism says takeaway 1 → 1072 (3-of-5)
        voteRounds: [
          [{ takeawayIndex: 0, claimId: 1071, confidence: 0.9 }, { takeawayIndex: 1, claimId: 1072, confidence: 0.8 }],
          [{ takeawayIndex: 0, claimId: 1071, confidence: 0.9 }, { takeawayIndex: 1, claimId: 1072, confidence: 0.8 }],
          [{ takeawayIndex: 0, claimId: 1071, confidence: 0.9 }, { takeawayIndex: 1, claimId: 1072, confidence: 0.8 }],
          [{ takeawayIndex: 0, claimId: 1071, confidence: 0.9 }, { takeawayIndex: 1, claimId: null, confidence: 0 }],
          [{ takeawayIndex: 0, claimId: 1071, confidence: 0.9 }, { takeawayIndex: 1, claimId: null, confidence: 0 }],
        ],
      },
      reference: { ...CASE.reference, expectMajority: [{ takeawayIndex: 0, final: 1071 }, { takeawayIndex: 1, final: 1072 }] },
    };
    // offline: the mechanism pin passes on the fixture rounds regardless of labels
    const offline = scoreValidationCase(withFixture);
    expect(offline.checks.majorityFailures).toBe(0);
    // live: 5 rounds all saying 1 → null — the live verdict is judged against labels (pass) while the fixture pin still evaluates the FIXTURE rounds (0 failures) — neither reads the other
    const create = vi.fn(async () => completion(round(1071, null)));
    const r = await runLiveCase(await mkDeps(create), CFG, withFixture, "validation-test", "run-p", 0);
    expect(r.checks.pass).toBe(true);
    expect((r.checks as unknown as { majorityFailures: number }).majorityFailures).toBe(0);
    expect(r.votes?.perTakeaway?.[1].final).toBeNull();
    // the committed dataset's val-typ-005 labels are untouched by this PR (OPEN-TASKS #105 owns any relabel)
    const ds = JSON.parse(readFileSync(join(process.cwd(), "docs/evals/analysis/validation-v2.json"), "utf8")) as { cases: ValidationEvalCase[] };
    const typ005 = ds.cases.find((c) => c.id === "val-typ-005-majority")!;
    expect(typ005.reference.labels).toEqual([{ takeawayIndex: 0, claimId: 1071 }, { takeawayIndex: 1, claimId: null }]);
    expect(typ005.reference.expectMajority).toEqual([{ takeawayIndex: 0, final: 1071 }, { takeawayIndex: 1, final: null }]);
  });
});

// ---- interruption -------------------------------------------------------------

describe("interruption mid-vote", () => {
  it("a cap stop on vote 4 of 5 abandons the case (3 metered responses, voteCount 5), writes budget_stop for vote 3/5, invents no key, and a resume completes it with 5 fresh dispatches", async () => {
    const ds = dataset([CASE]);
    const header = headerFor(ds);
    const files = new Map<string, string>();
    const fs: CaptureFs = {
      existsSync: (p) => files.has(p) || p === "/cap",
      mkdirSync: () => {},
      statSync: () => ({ isDirectory: () => true, mode: 0o040700 }),
      appendFileSync: (p, d) => void files.set(p, (files.get(p) ?? "") + d),
      readFileSync: (p) => Buffer.from(files.get(p) ?? ""),
    };
    const runHeader: CaptureRunHeader = { runId: "live-1", workload: "validation", configKey: header.configKey, datasetVersion: header.datasetVersion, datasetContentHash: header.datasetContentHash, identity: header.identity, envKnobs: header.envKnobs, scorer: { module: "src/lib/evals/score-validation.ts", sourceSha256: null }, gitHead: null };
    const sink = openCaptureSink({ dir: "/cap", rawDevelopment: false, rawHeldout: false }, runHeader, fs);
    const create = vi.fn(async () => completion(round(1071, null)));
    const d = await mkDeps(create, { capture: sink, runRequestCap: 3 });
    const io = { persist: () => {}, log: () => {}, logError: () => {} };
    const out = await runLiveSweep({ deps: d, cfg: CFG, dataset: ds, header, existing: null, work: [{ evalCase: CASE, repetition: 0 }], runId: "live-1", knobs: currentEnvKnobs(), ...io });
    expect(create).toHaveBeenCalledTimes(3);
    expect(out.status).toBe("aborted");
    expect(out.rf.results).toEqual({});
    expect(out.rf.abandonedAttempts![0]).toMatchObject({ caseId: "val-parity", reason: "budget_stop", code: "run_requests", responsesReceived: 3, voteCount: 5, meter: { attempts: 3, reservations: 3, meterings: 3, erroredAttempts: 0 }, promptTokens: 300 });
    expect(out.rf.meter).toEqual({ attempts: 3, reservations: 3, meterings: 3, erroredAttempts: 0 });
    const stop = parseCaptureFile("d", files.get(sink.files.development)!).lines.find((l): l is CaptureBudgetStopLine => l.kind === "budget_stop")!;
    expect(stop).toMatchObject({ voteIndex: 3, voteCount: 5, caseId: "val-parity" });
    // resume: the case is pending again; a fresh guard completes it with 5 dispatches and the history stays
    expect(pendingWork(ds, out.rf, { repetitions: 1, fresh: false, onlyIds: null, devOnly: false }).work).toHaveLength(1);
    expect(resumeIdentityMismatch(out.rf, header)).toBeNull();
    const create2 = vi.fn(async () => completion(round(1071, null)));
    const d2 = await mkDeps(create2);
    const out2 = await runLiveSweep({ deps: d2, cfg: CFG, dataset: ds, header, existing: out.rf, work: [{ evalCase: CASE, repetition: 0 }], runId: "live-2", knobs: currentEnvKnobs(), ...io });
    expect(create2).toHaveBeenCalledTimes(5);
    expect(out2.rf.results["val-parity#r0"]).toMatchObject({ status: "scored", attempt: 5, runId: "live-2", votes: { requested: 5, usable: 5 } });
    expect(out2.rf.abandonedAttempts).toHaveLength(1);
    expect(out2.rf.meter).toEqual({ attempts: 8, reservations: 8, meterings: 8, erroredAttempts: 0 });
  });

  it("no OpenAI client was constructed by anything in this file", () => {
    expect(ctorSpy).not.toHaveBeenCalled();
  });
});

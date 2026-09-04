// The live dispatch path WITH capture, and the sweep's abort accounting.
// Everything is mocked: the SDK, the guard store, the filesystem (in-memory
// CaptureFs). No client is built, no network, no DB, no real fs write.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
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
import { openCaptureSink, parseCaptureFile, type CaptureAttemptEndLine, type CaptureAttemptStartLine, type CaptureBudgetStopLine, type CaptureFs, type CaptureRunHeader } from "./capture";
import type { AnalysisEvalDataset, DigestEvalCase, EvalResultsFile, ValidationEvalCase } from "./contracts";
import { dispatchOnce, evalDispatchConfig, liveIdentity, runLiveSweep, type LiveDeps } from "./live-runner";
import { ZERO_METER, currentEnvKnobs, mergeEvalResults, pendingWork, resumeIdentityMismatch, type ResultsFileHeader } from "./runner";

// ---- fakes --------------------------------------------------------------------

function memFs(opts: { failOnAppendMatching?: (data: string, n: number) => boolean } = {}) {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  let appends = 0;
  const log: string[] = [];
  const fs: CaptureFs = {
    existsSync: (p) => files.has(p) || dirs.has(p),
    mkdirSync: (p) => void dirs.add(p),
    statSync: () => ({ isDirectory: () => true, mode: 0o040700 }),
    appendFileSync: (p, d) => {
      appends++;
      if (opts.failOnAppendMatching?.(d, appends)) throw new Error("ENOSPC");
      log.push(`capture:${JSON.parse(d).kind}`);
      files.set(p, (files.get(p) ?? "") + d);
    },
    readFileSync: (p) => Buffer.from(files.get(p) ?? ""),
  };
  return { fs, files, log };
}

function memGuard(log: string[] = [], caps: { runRequestCap?: number } = {}) {
  const store: UsageStore = {
    load: async () => ({ totalUsd: 0, totalRequests: 0, dayUsd: 0, dayRequests: 0 }),
    record: async () => {
      log.push("guard.record");
    },
  };
  return new SpendGuard(
    { provider: "openai_eval", totalCapUsd: 10, dailyUsdCap: 5, dailyRequestCap: 100, runRequestCap: caps.runRequestCap ?? 50 },
    store,
  );
}

function completion(content: string | null, over: { finish?: string; refusal?: string | null; promptTokens?: number; completionTokens?: number } = {}) {
  return {
    id: "chatcmpl-abc",
    model: "gpt-4o-mini-2024-07-18",
    system_fingerprint: "fp_123",
    choices: [{ message: { content, refusal: over.refusal ?? null }, finish_reason: over.finish ?? "stop" }],
    usage: { prompt_tokens: over.promptTokens ?? 100, completion_tokens: over.completionTokens ?? 50 },
  };
}

const VAL_CFG = evalDispatchConfig("validation", "gpt-4o-mini", null);
const DIG_CFG = evalDispatchConfig("digest", "gpt-4o-mini", null);
const PROMPT = { system: "sys", user: "usr" };
const SCHEMA = { name: "matches", schema: { type: "object" } };

function valCase(id: string, split: "development" | "heldout" = "development"): ValidationEvalCase {
  return {
    id,
    workload: "validation",
    partition: "typical",
    split,
    provenance: "test",
    input: {
      takeaways: [{ index: 0, text: "Assault units advanced near Pokrovsk." }],
      claims: [{ claimId: 1, text: "Assault units advanced near Pokrovsk, the report said.", hedging: "claimed", docCount: 2, earliestDocAt: null, earliestFetchedAt: null }],
      iswPublishedAt: null,
    },
    reference: { labels: [{ takeawayIndex: 0, claimId: 1 }] },
    offline: { expectation: "pass" },
  };
}
const VAL_RAW = JSON.stringify({ matches: [{ takeawayIndex: 0, claimId: 1, confidence: 0.9 }] });

const DIGEST_CASE: DigestEvalCase = {
  id: "dig-live-cap",
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
const VOTE_RAW = JSON.stringify({ events: [{ title: "Sources report depot strike", type: "strike", summary: "Reportedly damaged.", claims: [{ text: "Sources claim the depot was damaged in a strike.", gids: [1] }] }] });

function dataset(cases: AnalysisEvalDataset["cases"], workload: AnalysisEvalDataset["workload"]): AnalysisEvalDataset {
  return { datasetVersion: `${workload}-test`, workload, cases } as AnalysisEvalDataset;
}

function headerFor(ds: AnalysisEvalDataset, cfg: typeof VAL_CFG): ResultsFileHeader {
  return {
    workload: ds.workload,
    configKey: cfg.model,
    datasetVersion: ds.datasetVersion,
    datasetContentHash: "dc".repeat(32),
    identity: liveIdentity(ds, cfg),
    requestedRepetitions: 1,
    scope: "full",
    envKnobs: currentEnvKnobs(),
  };
}

function runHeader(header: ResultsFileHeader, runId: string): CaptureRunHeader {
  return {
    runId,
    workload: header.workload,
    configKey: header.configKey,
    datasetVersion: header.datasetVersion,
    datasetContentHash: header.datasetContentHash,
    identity: header.identity,
    envKnobs: header.envKnobs,
    scorer: { module: "src/lib/evals/score-validation.ts", sourceSha256: "ss".repeat(32) },
    gitHead: "deadbeef",
  };
}

async function mkDeps(create: ReturnType<typeof vi.fn>, opts: { capture?: LiveDeps["capture"]; log?: string[]; runRequestCap?: number } = {}): Promise<LiveDeps> {
  const guard = memGuard(opts.log, { runRequestCap: opts.runRequestCap });
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

const CTX = { runId: "live-1", caseId: "val-a", split: "development" as const, repetition: 0, voteIndex: null, voteCount: 1 };
const CAP_CFG = { dir: "/cap", rawDevelopment: false, rawHeldout: false };

// ---- dispatchOnce with capture -----------------------------------------------

describe("dispatchOnce capture lines", () => {
  it("capture disabled: no filesystem call of any kind and the meter is unchanged from the pre-capture contract", async () => {
    const m = memFs();
    const d = await mkDeps(vi.fn(async () => completion(VAL_RAW)));
    await dispatchOnce(d, VAL_CFG, PROMPT, SCHEMA, { temperature: 0 }, CTX);
    await dispatchOnce(d, VAL_CFG, PROMPT, SCHEMA, { temperature: 0 }); // ctx optional when capture is off
    expect(m.log).toEqual([]);
    expect(m.files.size).toBe(0);
    expect(d.meter).toEqual({ attempts: 2, reservations: 2, meterings: 2, erroredAttempts: 0 });
    expect(d.usage.promptTokens).toBe(200);
  });

  it("capture enabled without a case context refuses BEFORE any reservation", async () => {
    const m = memFs();
    const create = vi.fn();
    const sink = openCaptureSink(CAP_CFG, runHeader(headerFor(dataset([], "validation"), VAL_CFG), "live-1"), m.fs);
    const d = await mkDeps(create, { capture: sink });
    await expect(dispatchOnce(d, VAL_CFG, PROMPT, SCHEMA, { temperature: 0 })).rejects.toThrow(/no case context/);
    expect(create).not.toHaveBeenCalled();
    expect(d.meter.reservations).toBe(0);
  });

  it("a successful response writes start+end with model/response identity, usage, metered:true, sha256 and NO raw by default — and the end line is written AFTER guard.record (ruling 8)", async () => {
    const log: string[] = [];
    const m = memFs();
    const sink = openCaptureSink(CAP_CFG, runHeader(headerFor(dataset([], "validation"), VAL_CFG), "live-1"), m.fs);
    const d = await mkDeps(vi.fn(async () => completion(VAL_RAW)), { capture: sink, log });
    // share the ordering log between the guard store and the fs fake
    (m.fs as { appendFileSync: CaptureFs["appendFileSync"] }).appendFileSync = ((p, data, o) => {
      log.push(`capture:${JSON.parse(data).kind}`);
      m.files.set(p, (m.files.get(p) ?? "") + data);
      void o;
    }) as CaptureFs["appendFileSync"];
    await dispatchOnce(d, VAL_CFG, PROMPT, SCHEMA, { temperature: 0 }, CTX);
    expect(log).toEqual(["capture:run", "capture:attempt_start", "guard.record", "capture:attempt_end"]);
    const parsed = parseCaptureFile("d", m.files.get(sink.files.development)!);
    const start = parsed.lines[1] as CaptureAttemptStartLine;
    const end = parsed.lines[2] as CaptureAttemptEndLine;
    expect(start).toMatchObject({ kind: "attempt_start", attemptSeq: 1, attemptIndex: 0, caseId: "val-a", repetition: 0, voteIndex: null, voteCount: 1, requestedModel: "gpt-4o-mini", runId: "live-1" });
    expect(end).toMatchObject({
      kind: "attempt_end",
      attemptSeq: 1,
      outcome: "response",
      requestedModel: "gpt-4o-mini",
      returnedModel: "gpt-4o-mini-2024-07-18",
      responseId: "chatcmpl-abc",
      systemFingerprint: "fp_123",
      finishReason: "stop",
      refusal: null,
      truncated: false,
      usage: { promptTokens: 100, completionTokens: 50 },
      metered: true,
      rawBytes: Buffer.byteLength(VAL_RAW),
      raw: null,
      error: null,
    });
    expect(end.rawSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(end.estUsd).toBeGreaterThan(0);
    expect(m.files.get(sink.files.development)).not.toContain("takeawayIndex"); // no raw leaked
  });

  it("raw content is captured only with rawDevelopment; refusal and truncation are recorded as returned", async () => {
    const m = memFs();
    const sink = openCaptureSink({ ...CAP_CFG, rawDevelopment: true }, runHeader(headerFor(dataset([], "validation"), VAL_CFG), "live-1"), m.fs);
    const create = vi
      .fn()
      .mockResolvedValueOnce(completion(VAL_RAW))
      .mockResolvedValueOnce(completion("partial cut", { finish: "length", completionTokens: 4096 }))
      .mockResolvedValueOnce(completion(null, { refusal: "I can't help with that." }));
    const d = await mkDeps(create, { capture: sink });
    const ok = await dispatchOnce(d, VAL_CFG, PROMPT, SCHEMA, { temperature: 0 }, CTX);
    const cut = await dispatchOnce(d, VAL_CFG, PROMPT, SCHEMA, { temperature: 0 }, CTX);
    const refused = await dispatchOnce(d, VAL_CFG, PROMPT, SCHEMA, { temperature: 0 }, CTX);
    expect(ok.truncated).toBe(false);
    expect(cut.truncated).toBe(true);
    expect(refused.raw).toBeNull();
    const ends = parseCaptureFile("d", m.files.get(sink.files.development)!).lines.filter((l): l is CaptureAttemptEndLine => l.kind === "attempt_end");
    expect(ends.map((e) => e.attemptSeq)).toEqual([1, 2, 3]);
    expect(ends[0].raw).toBe(VAL_RAW);
    expect(ends[1]).toMatchObject({ truncated: true, finishReason: "length", raw: "partial cut", metered: true, usage: { completionTokens: 4096 } });
    expect(ends[2]).toMatchObject({ refusal: "I can't help with that.", raw: null, rawSha256: null, rawBytes: null, metered: true });
    expect(d.meter).toEqual({ attempts: 3, reservations: 3, meterings: 3, erroredAttempts: 0 });
  });

  it("a 429 retry is two physical attempts: an error end line (status 429, attemptIndex 0, unmetered) then a response pair with attemptIndex 1", async () => {
    const m = memFs();
    const sink = openCaptureSink(CAP_CFG, runHeader(headerFor(dataset([], "validation"), VAL_CFG), "live-1"), m.fs);
    const create = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("rate limited"), { status: 429 }))
      .mockResolvedValueOnce(completion(VAL_RAW));
    const d = await mkDeps(create, { capture: sink });
    await dispatchOnce(d, VAL_CFG, PROMPT, SCHEMA, { temperature: 0 }, CTX);
    const kinds = parseCaptureFile("d", m.files.get(sink.files.development)!).lines.map((l) => `${l.kind}${"attemptSeq" in l ? `#${l.attemptSeq}` : ""}`);
    expect(kinds).toEqual(["run", "attempt_start#1", "attempt_end#1", "attempt_start#2", "attempt_end#2"]);
    const ends = parseCaptureFile("d", m.files.get(sink.files.development)!).lines.filter((l): l is CaptureAttemptEndLine => l.kind === "attempt_end");
    expect(ends[0]).toMatchObject({ outcome: "error", attemptIndex: 0, metered: false, usage: null, error: { status: 429, message: "rate limited" } });
    expect(ends[1]).toMatchObject({ outcome: "response", attemptIndex: 1, metered: true });
    expect(d.meter).toEqual({ attempts: 2, reservations: 2, meterings: 1, erroredAttempts: 1 });
  });

  it("a non-429 provider error writes an error end line and rethrows; the message is secret-safe", async () => {
    const m = memFs();
    const sink = openCaptureSink(CAP_CFG, runHeader(headerFor(dataset([], "validation"), VAL_CFG), "live-1"), m.fs, { secrets: ["sk-live-SECRETKEY9999"] });
    const create = vi.fn().mockRejectedValue(Object.assign(new Error("401 invalid key sk-live-SECRETKEY9999 for postgres://u:pw@h/db"), { status: 401 }));
    const d = await mkDeps(create, { capture: sink });
    await expect(dispatchOnce(d, VAL_CFG, PROMPT, SCHEMA, { temperature: 0 }, CTX)).rejects.toThrow(/401/);
    const text = m.files.get(sink.files.development)!;
    expect(text).not.toContain("SECRETKEY9999");
    expect(text).not.toContain("u:pw@");
    const end = parseCaptureFile("d", text).lines[2] as CaptureAttemptEndLine;
    expect(end).toMatchObject({ outcome: "error", metered: false, error: { status: 401 } });
    expect(end.error?.message).toContain("[REDACTED]");
    expect(d.meter).toEqual({ attempts: 1, reservations: 1, meterings: 0, erroredAttempts: 1 });
  });

  it("a budget refusal writes a budget_stop line (no attempt, no reservation counted) and throws typed", async () => {
    const m = memFs();
    const sink = openCaptureSink(CAP_CFG, runHeader(headerFor(dataset([], "validation"), VAL_CFG), "live-1"), m.fs);
    const create = vi.fn(async () => completion(VAL_RAW));
    const d = await mkDeps(create, { capture: sink, runRequestCap: 1 });
    await dispatchOnce(d, VAL_CFG, PROMPT, SCHEMA, { temperature: 0 }, CTX);
    await expect(dispatchOnce(d, VAL_CFG, PROMPT, SCHEMA, { temperature: 0 }, { ...CTX, repetition: 1 })).rejects.toThrow(/budget stop/);
    expect(create).toHaveBeenCalledTimes(1);
    const stop = parseCaptureFile("d", m.files.get(sink.files.development)!).lines.at(-1) as CaptureBudgetStopLine;
    expect(stop).toMatchObject({ kind: "budget_stop", code: "run_requests", repetition: 1 });
    expect(d.meter).toEqual({ attempts: 1, reservations: 1, meterings: 1, erroredAttempts: 0 });
  });

  it("a capture write failure on attempt_start aborts BEFORE dispatch (nothing reserved-counted, nothing billed)", async () => {
    const m = memFs({ failOnAppendMatching: (d) => JSON.parse(d).kind === "attempt_start" });
    const sink = openCaptureSink(CAP_CFG, runHeader(headerFor(dataset([], "validation"), VAL_CFG), "live-1"), m.fs);
    const create = vi.fn(async () => completion(VAL_RAW));
    const d = await mkDeps(create, { capture: sink });
    await expect(dispatchOnce(d, VAL_CFG, PROMPT, SCHEMA, { temperature: 0 }, CTX)).rejects.toThrow(/write failed for attempt_start/);
    expect(create).not.toHaveBeenCalled();
    expect(d.meter).toEqual({ attempts: 0, reservations: 0, meterings: 0, erroredAttempts: 0 });
  });

  it("a capture write failure AFTER a response surfaces with responseMetered:true — the response was metered first", async () => {
    const log: string[] = [];
    const m = memFs({ failOnAppendMatching: (d) => JSON.parse(d).kind === "attempt_end" });
    const sink = openCaptureSink(CAP_CFG, runHeader(headerFor(dataset([], "validation"), VAL_CFG), "live-1"), m.fs);
    const d = await mkDeps(vi.fn(async () => completion(VAL_RAW)), { capture: sink, log });
    await expect(dispatchOnce(d, VAL_CFG, PROMPT, SCHEMA, { temperature: 0 }, CTX)).rejects.toMatchObject({
      name: "CaptureWriteError",
      evidence: { line: "attempt_end", attemptSeq: 1, responseMetered: true },
    });
    expect(log).toEqual(["guard.record"]); // metered before the failing write
    expect(d.meter).toEqual({ attempts: 1, reservations: 1, meterings: 1, erroredAttempts: 0 });
    expect(d.usage.estUsd).toBeGreaterThan(0);
  });
});

// ---- runLiveSweep --------------------------------------------------------------

describe("runLiveSweep accounting", () => {
  const persisted: EvalResultsFile[] = [];
  const io = { persist: (rf: EvalResultsFile) => void persisted.push(structuredClone(rf)), log: () => {}, logError: () => {} };

  it("without capture, a completed sweep writes no captureRuns/abandonedAttempts field at all (historical file shape preserved)", async () => {
    const ds = dataset([valCase("val-a")], "validation");
    const header = headerFor(ds, VAL_CFG);
    const d = await mkDeps(vi.fn(async () => completion(VAL_RAW)));
    const out = await runLiveSweep({ deps: d, cfg: VAL_CFG, dataset: ds, header, existing: null, work: [{ evalCase: ds.cases[0], repetition: 0 }], runId: "live-1", knobs: currentEnvKnobs(), ...io });
    expect(out.status).toBe("complete");
    expect(out.captureRun).toBeNull();
    expect(Object.keys(out.rf)).not.toContain("captureRuns");
    expect(Object.keys(out.rf)).not.toContain("abandonedAttempts");
    expect(out.rf.results["val-a#r0"].status).toBe("scored");
    expect(out.rf.meter).toEqual({ attempts: 1, reservations: 1, meterings: 1, erroredAttempts: 0 });
  });

  it("cap stop during a multi-vote digest case: the two completed votes are accounted as abandoned (meter, tokens, USD), NO result key is invented, the budget_stop line names vote 2/5, and the capture run ends 'incomplete'", async () => {
    const ds = dataset([DIGEST_CASE], "digest");
    const header = headerFor(ds, DIG_CFG);
    const m = memFs();
    const sink = openCaptureSink(CAP_CFG, runHeader(header, "live-1"), m.fs);
    const create = vi.fn(async () => completion(VOTE_RAW, { promptTokens: 1000, completionTokens: 500 }));
    const d = await mkDeps(create, { capture: sink, runRequestCap: 2 }); // the campaign shape: cap hit on the 3rd vote
    const before = persisted.length;
    const out = await runLiveSweep({ deps: d, cfg: DIG_CFG, dataset: ds, header, existing: null, work: [{ evalCase: DIGEST_CASE, repetition: 2 }], runId: "live-1", knobs: currentEnvKnobs(), ...io });
    expect(create).toHaveBeenCalledTimes(2);
    expect(out.status).toBe("aborted");
    expect(out.abort).toMatchObject({ kind: "budget_stop", caseId: "dig-live-cap", repetition: 2, responsesReceived: 2 });
    expect(out.rf.results).toEqual({}); // nothing fabricated
    expect(out.rf.meter).toEqual({ attempts: 2, reservations: 2, meterings: 2, erroredAttempts: 0 }); // folded in → reconciles to the ledger
    expect(out.rf.abandonedAttempts).toHaveLength(1);
    const ab = out.rf.abandonedAttempts![0];
    expect(ab).toMatchObject({ runId: "live-1", caseId: "dig-live-cap", repetition: 2, split: "development", reason: "budget_stop", code: "run_requests", responsesReceived: 2, voteCount: 5, meter: { attempts: 2, reservations: 2, meterings: 2, erroredAttempts: 0 }, promptTokens: 2000, completionTokens: 1000 });
    expect(ab.estUsd).toBeCloseTo(out.abort!.estUsd, 12);
    expect(ab.estUsd).toBeGreaterThan(0);
    // first persist stamped the incomplete capture record BEFORE any dispatch
    expect(persisted[before].captureRuns).toEqual([expect.objectContaining({ runId: "live-1", state: "incomplete", sha256: null })]);
    expect(out.captureRun).toMatchObject({ runId: "live-1", state: "incomplete" });
    expect(out.captureRun!.note).toMatch(/aborted: budget_stop/);
    expect(out.rf.captureRuns).toHaveLength(1);
    const lines = parseCaptureFile("d", m.files.get(sink.files.development)!).lines;
    expect(lines.map((l) => l.kind)).toEqual(["run", "attempt_start", "attempt_end", "attempt_start", "attempt_end", "budget_stop", "run_end"]);
    expect(lines[5]).toMatchObject({ kind: "budget_stop", voteIndex: 2, voteCount: 5, repetition: 2 });
    expect(lines[6]).toMatchObject({ kind: "run_end", outcome: "aborted" });
    // interrupted-run recovery: the abandoned case is pending again; completed keys would not be
    const pending = pendingWork(ds, out.rf, { repetitions: 3, fresh: false, onlyIds: null, devOnly: false });
    expect(pending.work.map((w) => w.repetition)).toEqual([0, 1, 2]);
  });

  it("interrupted-run recovery: a resumed sweep completes the abandoned case under a new runId, keeps the abandoned history, and never reruns completed keys", async () => {
    const ds = dataset([valCase("val-a"), valCase("val-b")], "validation");
    const header = headerFor(ds, VAL_CFG);
    // run 1: val-a completes, val-b hits the cap before any attempt
    const m1 = memFs();
    const d1 = await mkDeps(vi.fn(async () => completion(VAL_RAW)), { capture: openCaptureSink(CAP_CFG, runHeader(header, "live-1"), m1.fs), runRequestCap: 1 });
    const run1 = await runLiveSweep({ deps: d1, cfg: VAL_CFG, dataset: ds, header, existing: null, work: [{ evalCase: ds.cases[0], repetition: 0 }, { evalCase: ds.cases[1], repetition: 0 }], runId: "live-1", knobs: currentEnvKnobs(), ...io });
    expect(run1.status).toBe("aborted");
    expect(Object.keys(run1.rf.results)).toEqual(["val-a#r0"]);
    expect(run1.rf.abandonedAttempts![0]).toMatchObject({ caseId: "val-b", responsesReceived: 0, meter: ZERO_METER, estUsd: 0 });
    // resume: only val-b is pending
    const pending = pendingWork(ds, run1.rf, { repetitions: 1, fresh: false, onlyIds: null, devOnly: false });
    expect(pending.work.map((w) => w.evalCase.id)).toEqual(["val-b"]);
    expect(resumeIdentityMismatch(run1.rf, header)).toBeNull();
    const m2 = memFs();
    const create2 = vi.fn(async () => completion(VAL_RAW));
    const d2 = await mkDeps(create2, { capture: openCaptureSink(CAP_CFG, runHeader(header, "live-2"), m2.fs) });
    const run2 = await runLiveSweep({ deps: d2, cfg: VAL_CFG, dataset: ds, header, existing: run1.rf, work: pending.work, runId: "live-2", knobs: currentEnvKnobs(), ...io });
    expect(run2.status).toBe("complete");
    expect(create2).toHaveBeenCalledTimes(1); // val-a NOT rerun
    expect(Object.keys(run2.rf.results).sort()).toEqual(["val-a#r0", "val-b#r0"]);
    expect(run2.rf.results["val-b#r0"].runId).toBe("live-2");
    expect(run2.rf.abandonedAttempts).toHaveLength(1); // history retained
    expect(run2.rf.meter).toEqual({ attempts: 2, reservations: 2, meterings: 2, erroredAttempts: 0 });
    expect(run2.rf.captureRuns!.map((c) => [c.runId, c.state])).toEqual([["live-1", "incomplete"], ["live-2", "complete"]]);
    expect(run2.rf.captureRuns![1].sha256?.development).toMatch(/^[0-9a-f]{64}$/);
    expect(run2.captureRun?.files).toEqual({ development: "live-2.dev.jsonl", heldout: null });
  });

  it("capture write failure mid-run stops further dispatch and records the metered call as abandoned evidence", async () => {
    const ds = dataset([valCase("val-a"), valCase("val-b")], "validation");
    const header = headerFor(ds, VAL_CFG);
    const m = memFs({ failOnAppendMatching: (d, n) => JSON.parse(d).kind === "attempt_end" && n === 3 });
    const create = vi.fn(async () => completion(VAL_RAW));
    const d = await mkDeps(create, { capture: openCaptureSink(CAP_CFG, runHeader(header, "live-1"), m.fs) });
    const out = await runLiveSweep({ deps: d, cfg: VAL_CFG, dataset: ds, header, existing: null, work: [{ evalCase: ds.cases[0], repetition: 0 }, { evalCase: ds.cases[1], repetition: 0 }], runId: "live-1", knobs: currentEnvKnobs(), ...io });
    expect(create).toHaveBeenCalledTimes(1); // val-b never dispatched
    expect(out.status).toBe("aborted");
    expect(out.abort).toMatchObject({ kind: "capture_write_failure", caseId: "val-a", responsesReceived: 1 });
    expect(out.rf.results).toEqual({});
    expect(out.rf.meter).toEqual({ attempts: 1, reservations: 1, meterings: 1, erroredAttempts: 0 });
    expect(out.rf.abandonedAttempts![0]).toMatchObject({ reason: "capture_write_failure", code: null, responsesReceived: 1, meter: { attempts: 1, meterings: 1 } });
    expect(out.rf.abandonedAttempts![0].message).toMatch(/WAS received and metered/);
    expect(out.rf.abandonedAttempts![0].estUsd).toBeGreaterThan(0);
    // the start line for the metered attempt IS on disk (evidence retained); the run_end may or may not be, depending on the fault
    const lines = parseCaptureFile("d", m.files.get(d.capture!.files.development)!).lines;
    expect(lines.slice(0, 2).map((l) => l.kind)).toEqual(["run", "attempt_start"]);
  });

  it("a provider error records a provider_error row carrying the case's partial metered usage, with a secret-safe message, and the sweep continues", async () => {
    const ds = dataset([DIGEST_CASE], "digest");
    const header = headerFor(ds, DIG_CFG);
    const create = vi
      .fn()
      .mockResolvedValueOnce(completion(VOTE_RAW, { promptTokens: 1000, completionTokens: 500 }))
      .mockRejectedValueOnce(Object.assign(new Error("500 upstream; key sk-live-LEAKME12345"), { status: 500 }));
    const d = await mkDeps(create);
    const out = await runLiveSweep({ deps: d, cfg: DIG_CFG, dataset: ds, header, existing: null, work: [{ evalCase: DIGEST_CASE, repetition: 0 }], runId: "live-1", knobs: currentEnvKnobs(), ...io });
    expect(out.status).toBe("complete");
    const row = out.rf.results["dig-live-cap#r0"];
    expect(row).toMatchObject({ status: "provider_error", attempt: 2, promptTokens: null, completionTokens: null, estUsd: null, partialUsage: { responsesReceived: 1, promptTokens: 1000, completionTokens: 500 } });
    expect(row.partialUsage!.estUsd).toBeGreaterThan(0);
    expect(row.checks.failures[0]).toContain("sk-[REDACTED]");
    expect(row.checks.failures[0]).not.toContain("LEAKME12345");
    expect(out.rf.meter).toEqual({ attempts: 2, reservations: 2, meterings: 1, erroredAttempts: 1 });
  });

  it("heldout isolation in the sweep: heldout lines go to the heldout file, raw stays off there even with development raw on, and the dev file never names the heldout case", async () => {
    const ds = dataset([valCase("val-dev"), valCase("val-held", "heldout")], "validation");
    const header = headerFor(ds, VAL_CFG);
    const m = memFs();
    const sink = openCaptureSink({ ...CAP_CFG, rawDevelopment: true }, runHeader(header, "live-1"), m.fs);
    const d = await mkDeps(vi.fn(async () => completion(VAL_RAW)), { capture: sink });
    const out = await runLiveSweep({ deps: d, cfg: VAL_CFG, dataset: ds, header, existing: null, work: ds.cases.map((c) => ({ evalCase: c, repetition: 0 })), runId: "live-1", knobs: currentEnvKnobs(), ...io });
    expect(out.status).toBe("complete");
    expect(out.captureRun).toMatchObject({ rawDevelopment: true, rawHeldout: false, files: { development: "live-1.dev.jsonl", heldout: "live-1.heldout.jsonl" }, state: "complete" });
    const dev = m.files.get(sink.files.development)!;
    const held = m.files.get(sink.files.heldout)!;
    expect(dev).not.toContain("val-held");
    expect(held).not.toContain("val-dev");
    const devEnd = parseCaptureFile("d", dev).lines.find((l): l is CaptureAttemptEndLine => l.kind === "attempt_end")!;
    expect(devEnd.raw).toBe(VAL_RAW); // development raw on
    expect(held).not.toContain("takeawayIndex"); // heldout raw off by default
    const heldEnd = parseCaptureFile("h", held).lines.find((l): l is CaptureAttemptEndLine => l.kind === "attempt_end")!;
    expect(heldEnd).toMatchObject({ split: "heldout", raw: null, metered: true }); // accounting metadata still complete
    expect(heldEnd.rawSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("no OpenAI client was constructed by anything in this file", () => {
    expect(ctorSpy).not.toHaveBeenCalled();
  });
});

// ---- historical artifact compatibility -----------------------------------------

describe("historical results-file compatibility", () => {
  it("a committed pre-accounting results file round-trips through mergeEvalResults with its exact key set and unchanged rows; identity does not drift", () => {
    const p = join(process.cwd(), "docs/evals/analysis/results/validation-v2-offline-fixtures.json");
    const original = JSON.parse(readFileSync(p, "utf8")) as EvalResultsFile;
    expect(original.abandonedAttempts).toBeUndefined();
    expect(original.captureRuns).toBeUndefined();
    const header: ResultsFileHeader = {
      workload: original.workload,
      configKey: original.configKey,
      datasetVersion: original.datasetVersion,
      datasetContentHash: original.datasetContentHash,
      identity: original.identity,
      requestedRepetitions: original.requestedRepetitions,
      scope: original.scope,
      envKnobs: original.envKnobs,
    };
    expect(resumeIdentityMismatch(original, header)).toBeNull();
    const merged = mergeEvalResults(original, header, [], ZERO_METER, new Date(original.updatedAt));
    expect(Object.keys(merged).sort()).toEqual(Object.keys(original).sort());
    expect(merged.results).toEqual(original.results);
    expect(merged.meter).toEqual(original.meter);
    expect(JSON.stringify(merged)).toBe(JSON.stringify(original));
  });

  it("the 2026-09-03 campaign header shape (no new fields, meter 240/240/240/0) is accepted verbatim and never gains fields unless an entry is actually added", () => {
    const campaignShaped: EvalResultsFile = {
      workload: "digest",
      configKey: "gpt-4o-mini",
      datasetVersion: "digest-v2",
      datasetContentHash: "d09e15fc5671119de0572717528e9033406f1fdd446998672e2cddc1c154d769",
      identity: { provider: "openai", model: "gpt-4o-mini", reasoningEffort: null, registryVersion: "analysis-reg-v1", approval: "baseline", promptHash: "b8".repeat(32), schemaVersion: "36".repeat(32) },
      requestedRepetitions: 3,
      scope: "full",
      envKnobs: { reduceVotes: 5, reduceMaxOutputTokens: 6000, mapOutTokensPerDoc: 200, mapContentChars: 1500, reduceGroupsFed: 200 },
      updatedAt: "2026-09-04T13:23:16.479Z",
      meter: { attempts: 240, reservations: 240, meterings: 240, erroredAttempts: 0 },
      results: {},
    };
    const header = { ...campaignShaped } as ResultsFileHeader;
    const same = mergeEvalResults(campaignShaped, header, [], ZERO_METER, new Date(campaignShaped.updatedAt));
    expect(Object.keys(same).sort()).toEqual(Object.keys(campaignShaped).sort());
    // the two abandoned votes of that campaign were NEVER in the file; a later
    // runner does not backfill them — it can only append its own entries
    const withEntry = mergeEvalResults(campaignShaped, header, [], { attempts: 2, reservations: 2, meterings: 2, erroredAttempts: 0 }, new Date(), {
      abandoned: [{ runId: "live-new", caseId: "x", repetition: 0, split: "development", reason: "budget_stop", code: "daily_requests", message: "m", at: "t", responsesReceived: 2, voteCount: 5, meter: { attempts: 2, reservations: 2, meterings: 2, erroredAttempts: 0 }, promptTokens: 1, completionTokens: 1, estUsd: 0.001 }],
    });
    expect(withEntry.meter.attempts).toBe(242);
    expect(withEntry.abandonedAttempts).toHaveLength(1);
    expect(campaignShaped.abandonedAttempts).toBeUndefined(); // input untouched
  });
});

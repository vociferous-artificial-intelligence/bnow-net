// capture.ts — configuration refusals, sink line discipline, secret safety,
// heldout isolation, reconciliation classification. Pure: the filesystem is
// an in-memory fake injected through CaptureFs.
import { describe, expect, it } from "vitest";
import type { EvalResultsFile } from "./contracts";
import {
  CaptureConfigError,
  CaptureHeldoutRefusal,
  CaptureWriteError,
  captureFileName,
  openCaptureForCalibration,
  openCaptureSink,
  parseCaptureFile,
  reconcileCapture,
  renderCaptureReconciliation,
  resolveCaptureConfig,
  sanitizeMessage,
  type CaptureAttemptEndLine,
  type CaptureFs,
  type CaptureRunHeader,
} from "./capture";

// ---- in-memory fs -------------------------------------------------------------

function memFs(opts: { dirMode?: number; preexisting?: string[]; failOnAppend?: (p: string, n: number) => boolean } = {}) {
  const files = new Map<string, string>();
  const dirs = new Map<string, number>();
  for (const p of opts.preexisting ?? []) files.set(p, "");
  if (opts.dirMode !== undefined) dirs.set("/cap", opts.dirMode); // a pre-existing dir with that mode
  const calls: string[] = [];
  let appends = 0;
  const fs: CaptureFs = {
    existsSync: (p) => {
      calls.push(`exists:${p}`);
      return files.has(p) || dirs.has(p);
    },
    mkdirSync: (p, o) => {
      calls.push(`mkdir:${p}`);
      dirs.set(p, o.mode);
    },
    statSync: (p) => {
      calls.push(`stat:${p}`);
      const mode = dirs.get(p) ?? opts.dirMode ?? 0o700;
      return { isDirectory: () => true, mode: 0o040000 | mode };
    },
    appendFileSync: (p, d) => {
      appends++;
      if (opts.failOnAppend?.(p, appends)) throw new Error("EIO disk full sk-live-ABCDEF123456 leaked?");
      calls.push(`append:${p}`);
      files.set(p, (files.get(p) ?? "") + d);
    },
    readFileSync: (p) => Buffer.from(files.get(p) ?? ""),
  };
  return { fs, files, dirs, calls };
}

const HEADER: CaptureRunHeader = {
  runId: "live-1",
  workload: "validation",
  configKey: "gpt-4o-mini",
  datasetVersion: "validation-v2",
  datasetContentHash: "dc".repeat(32),
  identity: {
    provider: "openai",
    model: "gpt-4o-mini",
    reasoningEffort: null,
    registryVersion: "analysis-reg-v1",
    approval: "baseline",
    promptHash: "ph".repeat(32),
    schemaVersion: "sv".repeat(32),
  },
  envKnobs: { reduceVotes: 5, reduceMaxOutputTokens: 6000, mapOutTokensPerDoc: 200, mapContentChars: 1500, reduceGroupsFed: 200 },
  scorer: { module: "src/lib/evals/score-validation.ts", sourceSha256: "ss".repeat(32) },
  gitHead: "abc123",
};

const CFG = { dir: "/cap", rawDevelopment: false, rawHeldout: false };

function endLine(over: Partial<CaptureAttemptEndLine> & { attemptSeq: number }): CaptureAttemptEndLine {
  return {
    v: 1,
    kind: "attempt_end",
    ts: "2026-09-04T00:00:00.000Z",
    runId: "live-1",
    caseId: "val-typ-001",
    split: "development",
    repetition: 0,
    voteIndex: null,
    voteCount: 1,
    attemptIndex: 0,
    outcome: "response",
    requestedModel: "gpt-4o-mini",
    returnedModel: "gpt-4o-mini-2024-07-18",
    responseId: "chatcmpl-1",
    systemFingerprint: "fp_1",
    finishReason: "stop",
    refusal: null,
    truncated: false,
    usage: { promptTokens: 100, completionTokens: 20 },
    estUsd: 0.001,
    metered: true,
    rawSha256: "ab".repeat(32),
    rawBytes: 12,
    raw: null,
    error: null,
    ...over,
  };
}

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;

const DEPS = {
  mode: "live" as const,
  repoRoot: "/repo",
  resolvePath: (p: string) => (p.startsWith("/") ? p : `/cwd/${p}`),
  isGitIgnored: (p: string) => p.startsWith("/repo/docs/evals/analysis/capture"),
  heldoutRawAck: false,
};

// ---- configuration ------------------------------------------------------------

describe("resolveCaptureConfig", () => {
  it("absent EVAL_CAPTURE_DIR => disabled, no notice (byte-identical runner)", () => {
    expect(resolveCaptureConfig(env({}), DEPS)).toEqual({ enabled: false, notice: null });
  });

  it("raw flags without a dir refuse — a raw intent that cannot be honoured is never silent", () => {
    expect(() => resolveCaptureConfig(env({ EVAL_CAPTURE_RAW: "1" }), DEPS)).toThrow(CaptureConfigError);
    expect(() => resolveCaptureConfig(env({ EVAL_CAPTURE_RAW_HELDOUT: "1" }), DEPS)).toThrow(/require EVAL_CAPTURE_DIR/);
  });

  it("non-live modes ignore a set dir with a notice and never resolve it", () => {
    let resolved = 0;
    const r = resolveCaptureConfig(env({ EVAL_CAPTURE_DIR: "/x" }), { ...DEPS, mode: "other", resolvePath: (p) => (resolved++, p) });
    expect(r).toMatchObject({ enabled: false });
    expect((r as { notice: string }).notice).toMatch(/only --execute-live dispatches/);
    expect(resolved).toBe(0);
  });

  it("flag values must be exactly \"1\" (no truthy strings)", () => {
    expect(() => resolveCaptureConfig(env({ EVAL_CAPTURE_DIR: "/x", EVAL_CAPTURE_RAW: "true" }), DEPS)).toThrow(/must be exactly "1"/);
    expect(resolveCaptureConfig(env({ EVAL_CAPTURE_DIR: "/x", EVAL_CAPTURE_RAW: "0" }), DEPS)).toMatchObject({ enabled: true, cfg: { rawDevelopment: false } });
  });

  it("heldout raw needs development raw AND the explicit CLI acknowledgement; an ack without the env refuses too", () => {
    const base = { EVAL_CAPTURE_DIR: "/x" };
    expect(() => resolveCaptureConfig(env({ ...base, EVAL_CAPTURE_RAW_HELDOUT: "1" }), DEPS)).toThrow(/requires EVAL_CAPTURE_RAW=1/);
    expect(() => resolveCaptureConfig(env({ ...base, EVAL_CAPTURE_RAW: "1", EVAL_CAPTURE_RAW_HELDOUT: "1" }), DEPS)).toThrow(/--allow-heldout-raw-capture/);
    expect(() => resolveCaptureConfig(env({ ...base, EVAL_CAPTURE_RAW: "1" }), { ...DEPS, heldoutRawAck: true })).toThrow(/authorizes nothing/);
    const ok = resolveCaptureConfig(env({ ...base, EVAL_CAPTURE_RAW: "1", EVAL_CAPTURE_RAW_HELDOUT: "1" }), { ...DEPS, heldoutRawAck: true });
    expect(ok).toEqual({ enabled: true, cfg: { dir: "/x", rawDevelopment: true, rawHeldout: true } });
  });

  it("default raw is OFF for both splits when only the dir is set", () => {
    expect(resolveCaptureConfig(env({ EVAL_CAPTURE_DIR: "/x" }), DEPS)).toEqual({ enabled: true, cfg: { dir: "/x", rawDevelopment: false, rawHeldout: false } });
  });

  it("an in-repo directory must be gitignored; outside the repo is fine; relative paths resolve first", () => {
    expect(() => resolveCaptureConfig(env({ EVAL_CAPTURE_DIR: "/repo/docs/evals/analysis/results" }), DEPS)).toThrow(/NOT gitignored/);
    expect(resolveCaptureConfig(env({ EVAL_CAPTURE_DIR: "/repo/docs/evals/analysis/capture/run1" }), DEPS)).toMatchObject({ enabled: true });
    expect(resolveCaptureConfig(env({ EVAL_CAPTURE_DIR: "/elsewhere/cap" }), DEPS)).toMatchObject({ enabled: true });
    // "/repository-sibling" is NOT inside "/repo" — prefix matching is path-aware
    expect(resolveCaptureConfig(env({ EVAL_CAPTURE_DIR: "/repository-sibling" }), DEPS)).toMatchObject({ enabled: true });
    expect(() => resolveCaptureConfig(env({ EVAL_CAPTURE_DIR: "rel" }), { ...DEPS, repoRoot: "/cwd" })).toThrow(/NOT gitignored/);
  });
});

// ---- sink ---------------------------------------------------------------------

describe("openCaptureSink", () => {
  it("creates the directory 0700, refuses loose permissions and pre-existing runId files, writes nothing until the first line", () => {
    const m = memFs();
    const sink = openCaptureSink(CFG, HEADER, m.fs);
    expect(m.dirs.get("/cap")).toBe(0o700);
    expect(m.files.size).toBe(0);
    expect(sink.files.development).toBe(`/cap/${captureFileName("live-1", "development")}`);
    expect(() => openCaptureSink(CFG, HEADER, memFs({ dirMode: 0o755 }).fs)).toThrow(/group\/other-accessible/);
    expect(() => openCaptureSink(CFG, HEADER, memFs({ preexisting: ["/cap/live-1.dev.jsonl"] }).fs)).toThrow(/already exists/);
  });

  it("writes a run line first, then attempt lines, to the split's own file; heldout goes to a separate file with raw forced off", () => {
    const m = memFs();
    const sink = openCaptureSink({ ...CFG, rawDevelopment: true }, HEADER, m.fs);
    sink.write(endLine({ attemptSeq: sink.nextAttemptSeq(), raw: '{"matches":[]}' }));
    sink.write(endLine({ attemptSeq: sink.nextAttemptSeq(), split: "heldout", caseId: "val-typ-004", raw: "SECRET HELDOUT OUTPUT" }));
    const dev = parseCaptureFile("d", m.files.get(sink.files.development)!);
    const held = parseCaptureFile("h", m.files.get(sink.files.heldout)!);
    expect(dev.run).toMatchObject({ kind: "run", split: "development", raw: true, runId: "live-1", scorer: HEADER.scorer, gitHead: "abc123" });
    expect(held.run).toMatchObject({ split: "heldout", raw: false });
    expect(dev.lines.map((l) => l.kind)).toEqual(["run", "attempt_end"]);
    expect((dev.lines[1] as CaptureAttemptEndLine).raw).toBe('{"matches":[]}');
    // heldout raw is dropped even though the caller passed it — default off is enforced in the sink, not just by config
    expect((held.lines[1] as CaptureAttemptEndLine).raw).toBeNull();
    expect(m.files.get(sink.files.heldout)).not.toContain("SECRET HELDOUT OUTPUT");
    expect(m.files.get(sink.files.development)).not.toContain("val-typ-004");
  });

  it("heldout raw appears only with the explicit config", () => {
    const m = memFs();
    const sink = openCaptureSink({ ...CFG, rawDevelopment: true, rawHeldout: true }, HEADER, m.fs);
    sink.write(endLine({ attemptSeq: 1, split: "heldout", raw: "held raw" }));
    expect(parseCaptureFile("h", m.files.get(sink.files.heldout)!).run).toMatchObject({ raw: true });
    expect(m.files.get(sink.files.heldout)).toContain("held raw");
  });

  it("a write failure surfaces as CaptureWriteError carrying the evidence (response metered) and a secret-safe message", () => {
    const m = memFs({ failOnAppend: (_p, n) => n === 2 }); // run line ok, first attempt line fails
    const sink = openCaptureSink(CFG, HEADER, m.fs, { secrets: ["sk-live-ABCDEF123456"] });
    let err: unknown;
    try {
      sink.write(endLine({ attemptSeq: 1 }));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(CaptureWriteError);
    const e = err as CaptureWriteError;
    expect(e.evidence).toEqual({ line: "attempt_end", attemptSeq: 1, responseMetered: true });
    expect(e.message).toMatch(/WAS received and metered/);
    expect(e.message).not.toContain("ABCDEF123456");
    expect(e.message).toContain("[REDACTED]");
    // once finished, no line can be written
    sink.finish("aborted", "test");
    expect(() => sink.write(endLine({ attemptSeq: 2 }))).toThrow(/already finished/);
  });

  it("finish writes run_end to every opened file, hashes them, and only a normal completion is 'complete'", () => {
    const m = memFs();
    const sink = openCaptureSink(CFG, HEADER, m.fs);
    expect(sink.initialRecord()).toMatchObject({ runId: "live-1", state: "incomplete", files: { development: null, heldout: null }, sha256: null });
    sink.write(endLine({ attemptSeq: 1 }));
    const rec = sink.finish("complete", null);
    expect(rec.state).toBe("complete");
    expect(rec.files).toEqual({ development: "live-1.dev.jsonl", heldout: null });
    expect(rec.sha256?.development).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.sha256?.heldout).toBeNull();
    expect(rec.lines).toEqual({ development: 3, heldout: 0 });
    const parsed = parseCaptureFile("d", m.files.get(sink.files.development)!);
    expect(parsed.lines.at(-1)).toMatchObject({ kind: "run_end", outcome: "complete", lines: 2 });

    const m2 = memFs();
    const s2 = openCaptureSink(CFG, HEADER, m2.fs);
    s2.write(endLine({ attemptSeq: 1 }));
    const aborted = s2.finish("aborted", "budget_stop: total spend $6.0001 >= cap $6");
    expect(aborted.state).toBe("incomplete");
    expect(aborted.note).toMatch(/aborted: budget_stop/);
  });

  it("a failing run_end write degrades to an incomplete record with a note — finish never throws", () => {
    const m = memFs({ failOnAppend: (_p, n) => n >= 3 });
    const sink = openCaptureSink(CFG, HEADER, m.fs);
    sink.write(endLine({ attemptSeq: 1 }));
    const rec = sink.finish("complete", null);
    expect(rec.state).toBe("incomplete");
    expect(rec.note).toMatch(/run_end write failed/);
  });
});

// ---- secret safety ------------------------------------------------------------

describe("sanitizeMessage", () => {
  it("redacts exact secrets, sk- keys, bearer tokens, URL userinfo and api_key= shapes; caps length", () => {
    const msg =
      "401 from https://api.openai.com with Authorization: Bearer abcdefghijklmnop and key sk-proj-XYZ123456789 " +
      "while writing to postgres://neondb_owner:npg_secret@ep-x.neon.tech/db (api_key=plainkey123) exact:SUPERSECRETVALUE";
    const out = sanitizeMessage(msg, ["SUPERSECRETVALUE"]);
    expect(out).not.toMatch(/abcdefghijklmnop|XYZ123456789|npg_secret|plainkey123|SUPERSECRETVALUE/);
    expect(out).toContain("Bearer [REDACTED]");
    expect(out).toContain("sk-[REDACTED]");
    expect(out).toContain("postgres://[REDACTED]@ep-x.neon.tech/db");
    expect(sanitizeMessage("x".repeat(5000)).length).toBeLessThan(2100);
    // short secrets (<4 chars) are ignored so a 1-char "secret" cannot shred every message
    expect(sanitizeMessage("abc", ["a"])).toBe("abc");
  });
});

// ---- readers ------------------------------------------------------------------

describe("openCaptureForCalibration (development only)", () => {
  const devText = `${JSON.stringify({ ...HEADER, v: 1, kind: "run", ts: "t", split: "development", raw: true })}\n`;
  it("accepts a development file and refuses heldout by file name, by declared split, and by any heldout line", () => {
    expect(openCaptureForCalibration("/cap/live-1.dev.jsonl", devText).run?.split).toBe("development");
    expect(() => openCaptureForCalibration("/cap/live-1.heldout.jsonl", devText)).toThrow(CaptureHeldoutRefusal);
    const relabelled = devText.replace('"split":"development"', '"split":"heldout"');
    expect(() => openCaptureForCalibration("/cap/renamed.dev.jsonl", relabelled)).toThrow(/declares split heldout/);
    const smuggled = devText + `${JSON.stringify(endLine({ attemptSeq: 1, split: "heldout" }))}\n`;
    expect(() => openCaptureForCalibration("/cap/live-1.dev.jsonl", smuggled)).toThrow(/contains a heldout-split line/);
    expect(() => openCaptureForCalibration("/cap/x.dev.jsonl", "")).toThrow(/no run line/);
  });
});

describe("parseCaptureFile + reconcileCapture", () => {
  const RESULTS: EvalResultsFile = {
    workload: "validation",
    configKey: "gpt-4o-mini",
    datasetVersion: "validation-v2",
    datasetContentHash: "dc".repeat(32),
    identity: HEADER.identity,
    requestedRepetitions: 1,
    scope: "full",
    envKnobs: HEADER.envKnobs,
    updatedAt: "t",
    meter: { attempts: 5, reservations: 5, meterings: 4, erroredAttempts: 1 },
    results: {
      "val-typ-001#r0": { caseId: "val-typ-001", datasetVersion: "validation-v2", runId: "live-1", configKey: "gpt-4o-mini", repetition: 0, attempt: 1, status: "scored", latencyMs: 1, promptTokens: 100, completionTokens: 20, estUsd: 0.001, checks: { pass: true, failures: [] }, humanLabels: null, graderJudgments: null, rawOutputDigest: "x" },
      "val-typ-002#r0": { caseId: "val-typ-002", datasetVersion: "validation-v2", runId: "live-1", configKey: "gpt-4o-mini", repetition: 0, attempt: 2, status: "provider_error", latencyMs: null, promptTokens: null, completionTokens: null, estUsd: null, checks: { pass: false, failures: ["provider error: boom"] }, humanLabels: null, graderJudgments: null, rawOutputDigest: "", partialUsage: { responsesReceived: 1, promptTokens: 100, completionTokens: 20, estUsd: 0.001 } },
    },
    abandonedAttempts: [
      { runId: "live-1", caseId: "val-typ-003", repetition: 0, split: "development", reason: "budget_stop", code: "run_requests", message: "m", at: "t", responsesReceived: 1, voteCount: 1, meter: { attempts: 1, reservations: 1, meterings: 1, erroredAttempts: 0 }, promptTokens: 100, completionTokens: 20, estUsd: 0.001 },
    ],
  };
  const start = (seq: number, caseId: string, over: Record<string, unknown> = {}) =>
    JSON.stringify({ v: 1, kind: "attempt_start", ts: "t", runId: "live-1", caseId, split: "development", repetition: 0, voteIndex: null, voteCount: 1, attemptIndex: 0, attemptSeq: seq, requestedModel: "gpt-4o-mini", ...over });
  const text = [
    JSON.stringify({ ...HEADER, v: 1, kind: "run", ts: "t", split: "development", raw: false }),
    start(1, "val-typ-001"),
    JSON.stringify(endLine({ attemptSeq: 1 })),
    start(2, "val-typ-002"),
    JSON.stringify(endLine({ attemptSeq: 2, caseId: "val-typ-002", outcome: "error", metered: false, usage: null, estUsd: null, error: { name: "Error", status: 500, message: "boom" } })),
    start(3, "val-typ-002", { attemptIndex: 1 }),
    JSON.stringify(endLine({ attemptSeq: 3, caseId: "val-typ-002", attemptIndex: 1 })),
    start(4, "val-typ-003"),
    JSON.stringify(endLine({ attemptSeq: 4, caseId: "val-typ-003" })),
    JSON.stringify({ v: 1, kind: "budget_stop", ts: "t", runId: "live-1", caseId: "val-typ-003", split: "development", repetition: 0, voteIndex: null, voteCount: 1, attemptIndex: 0, code: "run_requests", reason: "run cap" }),
    start(5, "val-typ-009"), // orphan: interrupted with no end and no record
    '{"torn": tru', // torn final line after a crash
  ].join("\n");

  it("classifies attempts, responses, errors, unresolved, budget stops and case dispositions; never auto-resolves discrepancies", () => {
    const parsed = parseCaptureFile("live-1.dev.jsonl", text);
    expect(parsed.malformed).toBe(1);
    const rec = reconcileCapture([parsed], RESULTS);
    expect(rec.totals).toEqual({ attempts: 5, responses: 3, errors: 1, unresolved: 1, metered: 3, budgetStops: 1, estUsd: 0.003 });
    const run = rec.runs[0];
    expect(run.runEnd).toBeNull();
    const disp = Object.fromEntries(run.byCase.map((c) => [c.caseId, c.disposition]));
    expect(disp).toEqual({ "val-typ-001": "completed", "val-typ-002": "provider_error", "val-typ-003": "abandoned", "val-typ-009": "orphan" });
    expect(run.byCase.find((c) => c.caseId === "val-typ-009")).toMatchObject({ attempts: 1, unresolved: 1, responses: 0 });
    expect(rec.results).toMatchObject({ present: true, rowAttempts: 3, abandonedAttempts: 1, abandonedEntries: 1, uncapturedRunIds: [] });
    // results meter (5 attempts) vs rows 3 + abandoned 1 = 4 — reported, not "fixed"
    expect(rec.notes.some((n) => n.includes("meter.attempts 5 != Σ rows.attempt 3 + Σ abandoned 1"))).toBe(true);
    expect(rec.notes.some((n) => n.includes("val-typ-009#r0") && n.includes("orphan") === false && n.includes("interrupted without a durable record"))).toBe(true);
    expect(rec.notes.some((n) => n.includes("UNRESOLVED"))).toBe(true);
    expect(rec.notes.some((n) => n.includes("no run_end line"))).toBe(true);
    expect(rec.notes.at(-1)).toMatch(/capture line count is NOT the ledger request count/);
    const md = renderCaptureReconciliation(rec, "t");
    expect(md).toContain("| live-1 | 5 | 3 | 1 | 1 | 3 | 1 | 0.0030 | MISSING |");
    expect(md).toContain("| live-1 | val-typ-009#r0 | development | 1 | 0 | 0 | 1 | 0 | 0.0000 | orphan |");
    expect(md).not.toContain('"raw"');
  });

  it("a historical results file (no abandonedAttempts) is reconciled with an explicit pre-accounting note, never rewritten", () => {
    const historical = { ...RESULTS, meter: { attempts: 3, reservations: 3, meterings: 3, erroredAttempts: 0 } } as EvalResultsFile;
    delete (historical as Partial<EvalResultsFile>).abandonedAttempts;
    const before = JSON.stringify(historical);
    const rec = reconcileCapture([], historical);
    expect(rec.results.uncapturedRunIds).toEqual(["live-1"]);
    expect(rec.notes.some((n) => n.includes("has no abandonedAttempts field"))).toBe(true);
    expect(rec.notes.some((n) => n.includes("no capture file"))).toBe(true);
    expect(JSON.stringify(historical)).toBe(before);
  });
});

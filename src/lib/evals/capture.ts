// Analysis-eval control plane: OPT-IN, EVAL-ONLY diagnostic capture and
// per-attempt accounting (2026-09-04, methodology adjudication §4).
//
// WHAT THIS IS. One JSONL line per PHYSICAL provider attempt made by the live
// eval runner, plus explicit lines for reservation refusals (budget stops)
// and run start/end — enough to reconcile reservations, attempts, responses,
// metered usage, provider errors, and abandoned attempts SEPARATELY against
// the results file and the openai_eval ledger. Raw model output is a
// separate opt-in on top of the accounting metadata, and heldout raw output
// is a third, separately acknowledged opt-in.
//
// WHAT THIS IS NOT. Not a production code path: only live-runner.ts (the eval
// library's single provider-touching module) calls a sink, and only the eval
// CLI's --execute-live mode constructs one. Every other mode ignores the
// capture env entirely (zero filesystem access). Production analysis
// dispatch modules never import src/lib/evals (isolation.test.ts).
//
// NO ATOMICITY CLAIM. A physical attempt has three sequential, non-atomic
// effects: the provider may bill it, the SpendGuard records it in
// provider_usage (ruling 8: metering happens BEFORE any parse and BEFORE the
// capture line), and this module appends its line. A crash between any two
// leaves the earlier effects without the later ones. The capture format makes
// that window VISIBLE rather than pretending it away: every attempt writes an
// `attempt_start` line before dispatch and an `attempt_end` line after the
// response has been metered (or after the error), so a start with no matching
// end is an attempt whose outcome this file does not know — the provider may
// have billed it, and the ledger may or may not hold it. Reconciliation
// classifies such attempts as `unresolved`, never as errors and never as
// responses. Consequently `count(capture lines) == provider_usage.requests` is
// NOT an invariant: errored attempts are unbilled and unmetered, unresolved
// attempts are unknown, and the ledger is per-UTC-day while capture is
// per-run.
//
// FILESYSTEM DISCIPLINE. This module performs no I/O itself: every filesystem
// primitive is injected (CaptureFs), so the eval library stays I/O-free and
// unit tests can prove "capture disabled => no fs call at all". The CLI passes
// node:fs. Directory must be 0700 and outside the repo tree or gitignored;
// files are created 0600; lines never carry env values (the sink redacts the
// exact secret strings it is given plus common credential shapes) — the
// capture dir is local operator evidence, retained with the campaign
// artifacts and never committed.

import { createHash } from "node:crypto";
import type {
  AnalysisEvalWorkload,
  CandidateDispatchIdentity,
  CaptureRunRecord,
  EvalEnvKnobs,
  EvalResultsFile,
  EvalSplit,
} from "./contracts";
import { resultKey } from "./contracts";

export type { CaptureRunRecord } from "./contracts";

export const CAPTURE_LINE_VERSION = 1 as const;

// ============================================================================
// Errors
// ============================================================================

export class CaptureConfigError extends Error {
  readonly code = "EVAL_CAPTURE_CONFIG";
  constructor(reason: string) {
    super(`analysis-eval capture: ${reason}`);
    this.name = "CaptureConfigError";
  }
}

/** A capture write failed. Thrown by the sink; the live runner turns it into a
 *  run abort AFTER the attempt's metering has already happened (a response
 *  that was received is always metered first — ruling 8). `evidence` says what
 *  had already happened for the attempt whose line could not be written, so
 *  the abort message and the abandoned-attempt record can state it. */
export class CaptureWriteError extends Error {
  readonly code = "EVAL_CAPTURE_WRITE";
  constructor(
    readonly evidence: {
      line: CaptureLine["kind"];
      attemptSeq: number | null;
      /** the attempt had received a provider response and was metered
       *  BEFORE this write failed — the ledger holds it, the file does not */
      responseMetered: boolean;
    },
    cause: unknown,
  ) {
    super(
      `analysis-eval capture: write failed for ${evidence.line} line` +
        (evidence.attemptSeq !== null ? ` (attempt ${evidence.attemptSeq})` : "") +
        (evidence.responseMetered ? " — the attempt's response WAS received and metered before the failure" : "") +
        `: ${sanitizeMessage(cause instanceof Error ? cause.message : String(cause))}`,
    );
    this.name = "CaptureWriteError";
  }
}

/** Calibration/inspection tools take DEVELOPMENT capture only. */
export class CaptureHeldoutRefusal extends Error {
  readonly code = "EVAL_CAPTURE_HELDOUT";
  constructor(reason: string) {
    super(`analysis-eval capture: heldout input refused — ${reason}`);
    this.name = "CaptureHeldoutRefusal";
  }
}

// ============================================================================
// Secret-safe messages
// ============================================================================

const SECRET_SHAPES: Array<[RegExp, string]> = [
  [/sk-[A-Za-z0-9_-]{6,}/g, "sk-[REDACTED]"],
  [/(bearer\s+)[A-Za-z0-9._~+/=-]{6,}/gi, "$1[REDACTED]"],
  // URL userinfo (postgres://user:password@host)
  [/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, "$1[REDACTED]@"],
  [/(api[_-]?key\s*[=:]\s*)[^\s,;"']+/gi, "$1[REDACTED]"],
];

/** Redact credential shapes and every exact string in `secrets`, then cap the
 *  length. Used for every message that lands in a capture line or an
 *  abandoned-attempt record. */
export function sanitizeMessage(message: string, secrets: readonly string[] = []): string {
  let out = message;
  for (const s of secrets) {
    if (s.length >= 4) out = out.split(s).join("[REDACTED]");
  }
  for (const [re, rep] of SECRET_SHAPES) out = out.replace(re, rep);
  return out.length > 2000 ? `${out.slice(0, 2000)}…[truncated]` : out;
}

// ============================================================================
// Configuration (env → refusals; pure given the injected checks)
// ============================================================================

export interface CaptureConfig {
  /** resolved absolute directory */
  dir: string;
  /** EVAL_CAPTURE_RAW=1 — raw response content for DEVELOPMENT-split cases */
  rawDevelopment: boolean;
  /** EVAL_CAPTURE_RAW_HELDOUT=1 AND the explicit CLI acknowledgement — raw
   *  response content for HELDOUT-split cases. Default off; separately
   *  authorized; stamped into the results header when on. */
  rawHeldout: boolean;
}

export type CaptureResolution =
  | { enabled: false; notice: string | null }
  | { enabled: true; cfg: CaptureConfig };

export interface CaptureResolveDeps {
  /** only "live" ever constructs a sink; every other mode ignores the env */
  mode: "live" | "other";
  repoRoot: string;
  /** path.resolve equivalent (absolute, normalized) */
  resolvePath: (p: string) => string;
  /** `git check-ignore -q <path>` equivalent — true when the path is ignored */
  isGitIgnored: (absPath: string) => boolean;
  /** the explicit --allow-heldout-raw-capture CLI flag */
  heldoutRawAck: boolean;
}

function flag(env: NodeJS.ProcessEnv, name: string): boolean {
  const v = env[name];
  if (v === undefined || v === "" || v === "0") return false;
  if (v === "1") return true;
  throw new CaptureConfigError(`${name} must be exactly "1" or unset (got ${JSON.stringify(v)})`);
}

/** Resolve the capture configuration from the environment. Absent
 *  EVAL_CAPTURE_DIR => disabled with byte-identical runner behaviour. Every
 *  misconfiguration REFUSES (throws) — a paid run must never start with a
 *  capture intent it cannot honour. */
export function resolveCaptureConfig(env: NodeJS.ProcessEnv, deps: CaptureResolveDeps): CaptureResolution {
  const dirRaw = env.EVAL_CAPTURE_DIR;
  const rawDev = flag(env, "EVAL_CAPTURE_RAW");
  const rawHeldoutEnv = flag(env, "EVAL_CAPTURE_RAW_HELDOUT");
  if (dirRaw === undefined || dirRaw === "") {
    if (rawDev || rawHeldoutEnv) {
      throw new CaptureConfigError("EVAL_CAPTURE_RAW / EVAL_CAPTURE_RAW_HELDOUT require EVAL_CAPTURE_DIR");
    }
    return { enabled: false, notice: null };
  }
  if (deps.mode !== "live") {
    return {
      enabled: false,
      notice: "EVAL_CAPTURE_DIR is set but only --execute-live dispatches — ignored (no capture file is touched by this mode)",
    };
  }
  if (rawHeldoutEnv && !rawDev) {
    throw new CaptureConfigError("EVAL_CAPTURE_RAW_HELDOUT=1 requires EVAL_CAPTURE_RAW=1 (heldout raw capture is an addition to development raw capture, never a substitute)");
  }
  if (rawHeldoutEnv && !deps.heldoutRawAck) {
    throw new CaptureConfigError(
      "EVAL_CAPTURE_RAW_HELDOUT=1 requires the explicit --allow-heldout-raw-capture flag (heldout raw output is separately authorized and stamped into the results header)",
    );
  }
  if (!rawHeldoutEnv && deps.heldoutRawAck) {
    throw new CaptureConfigError("--allow-heldout-raw-capture given without EVAL_CAPTURE_RAW_HELDOUT=1 — refusing an acknowledgement that authorizes nothing");
  }
  const dir = deps.resolvePath(dirRaw);
  const root = deps.resolvePath(deps.repoRoot);
  const inRepo = dir === root || dir.startsWith(root.endsWith("/") ? root : `${root}/`);
  if (inRepo && !deps.isGitIgnored(dir)) {
    throw new CaptureConfigError(
      `EVAL_CAPTURE_DIR ${dir} is inside the repository and NOT gitignored — capture is local evidence and must never be committable (use a path outside the repo or a gitignored one such as docs/evals/analysis/capture/)`,
    );
  }
  return { enabled: true, cfg: { dir, rawDevelopment: rawDev, rawHeldout: rawHeldoutEnv } };
}

// ============================================================================
// Line formats
// ============================================================================

export interface CaptureRunLine {
  v: typeof CAPTURE_LINE_VERSION;
  kind: "run";
  ts: string;
  runId: string;
  workload: AnalysisEvalWorkload;
  configKey: string;
  datasetVersion: string;
  datasetContentHash: string;
  identity: CandidateDispatchIdentity;
  envKnobs: EvalEnvKnobs;
  /** scorer identity: the scorer module the run scores through and the
   *  sha256 of its SOURCE bytes at run time (no scorerVersion constant exists
   *  yet — that is contract-v3 work; the source hash is the honest witness) */
  scorer: { module: string; sourceSha256: string | null };
  gitHead: string | null;
  /** which split THIS file holds — development and heldout never share a file */
  split: EvalSplit;
  /** whether lines in THIS file may carry raw response content */
  raw: boolean;
}

interface CaptureAttemptBase {
  v: typeof CAPTURE_LINE_VERSION;
  ts: string;
  runId: string;
  caseId: string;
  split: EvalSplit;
  repetition: number;
  /** digest: vote ordinal within the case; single-dispatch workloads: null */
  voteIndex: number | null;
  voteCount: number | null;
  /** 0 = first physical attempt of the logical dispatch, 1 = the explicit 429 retry */
  attemptIndex: number;
}

export interface CaptureAttemptStartLine extends CaptureAttemptBase {
  kind: "attempt_start";
  /** run-wide physical attempt ordinal (1-based); the matching end carries the same value */
  attemptSeq: number;
  requestedModel: string;
}

export interface CaptureAttemptEndLine extends CaptureAttemptBase {
  kind: "attempt_end";
  attemptSeq: number;
  outcome: "response" | "error";
  requestedModel: string;
  returnedModel: string | null;
  responseId: string | null;
  systemFingerprint: string | null;
  finishReason: string | null;
  refusal: string | null;
  truncated: boolean;
  usage: { promptTokens: number; completionTokens: number } | null;
  estUsd: number | null;
  /** true iff guard.record completed for this attempt BEFORE this line */
  metered: boolean;
  rawSha256: string | null;
  rawBytes: number | null;
  /** response content — ONLY when raw capture is on for this split */
  raw: string | null;
  error: { name: string; status: number | null; message: string } | null;
}

export interface CaptureBudgetStopLine extends CaptureAttemptBase {
  kind: "budget_stop";
  /** the attempt that was NOT made (no reservation, no dispatch) */
  code: string | null;
  reason: string;
}

export interface CaptureRunEndLine {
  v: typeof CAPTURE_LINE_VERSION;
  kind: "run_end";
  ts: string;
  runId: string;
  outcome: "complete" | "aborted";
  reason: string | null;
  /** lines in this file before this one (run line included) */
  lines: number;
}

export type CaptureLine = CaptureRunLine | CaptureAttemptStartLine | CaptureAttemptEndLine | CaptureBudgetStopLine | CaptureRunEndLine;

/** Case identity threaded from runLiveCase into dispatchOnce. */
export interface DispatchContext {
  runId: string;
  caseId: string;
  split: EvalSplit;
  repetition: number;
  voteIndex: number | null;
  voteCount: number | null;
}

// ============================================================================
// Sink (append-only JSONL, one file per split; fs injected)
// ============================================================================

export interface CaptureFs {
  existsSync(p: string): boolean;
  mkdirSync(p: string, opts: { recursive: true; mode: number }): unknown;
  statSync(p: string): { isDirectory(): boolean; mode: number };
  appendFileSync(p: string, data: string, opts: { mode: number }): void;
  readFileSync(p: string): Buffer;
}

export interface CaptureRunHeader {
  runId: string;
  workload: AnalysisEvalWorkload;
  configKey: string;
  datasetVersion: string;
  datasetContentHash: string;
  identity: CandidateDispatchIdentity;
  envKnobs: EvalEnvKnobs;
  scorer: { module: string; sourceSha256: string | null };
  gitHead: string | null;
}

export interface CaptureSink {
  readonly cfg: CaptureConfig;
  readonly runId: string;
  readonly files: { development: string; heldout: string };
  nextAttemptSeq(): number;
  rawAllowed(split: EvalSplit): boolean;
  /** Append one line to the split's file (run_end goes to every file that
   *  exists). Throws CaptureWriteError — the caller MUST stop dispatching. */
  write(line: Exclude<CaptureLine, CaptureRunLine | CaptureRunEndLine>): void;
  /** Write run_end to every open file and hash them. Never throws: a failure
   *  is reported in the returned record's `note` with state "incomplete". */
  finish(outcome: "complete" | "aborted", reason: string | null): CaptureRunRecord;
  /** the record to stamp BEFORE the first dispatch (state incomplete) */
  initialRecord(): CaptureRunRecord;
  redact(message: string): string;
}

export function captureFileName(runId: string, split: EvalSplit): string {
  return split === "heldout" ? `${runId}.heldout.jsonl` : `${runId}.dev.jsonl`;
}

/** Create the sink: verifies/creates the directory (0700, no group/other
 *  bits), refuses pre-existing files for this runId, writes nothing until the
 *  first line. `secrets` are the exact strings that must never appear in a
 *  line (API key, DB URL) — redacted defensively from every message. */
export function openCaptureSink(
  cfg: CaptureConfig,
  header: CaptureRunHeader,
  fs: CaptureFs,
  opts: { secrets?: readonly string[]; now?: () => Date } = {},
): CaptureSink {
  const now = opts.now ?? (() => new Date());
  const secrets = (opts.secrets ?? []).filter((s): s is string => typeof s === "string" && s.length >= 4);
  const redact = (m: string) => sanitizeMessage(m, secrets);

  if (!fs.existsSync(cfg.dir)) {
    fs.mkdirSync(cfg.dir, { recursive: true, mode: 0o700 });
  }
  const st = fs.statSync(cfg.dir);
  if (!st.isDirectory()) throw new CaptureConfigError(`EVAL_CAPTURE_DIR ${cfg.dir} is not a directory`);
  if ((st.mode & 0o077) !== 0) {
    throw new CaptureConfigError(
      `EVAL_CAPTURE_DIR ${cfg.dir} is group/other-accessible (mode ${(st.mode & 0o777).toString(8)}) — capture must be access-restricted (chmod 700)`,
    );
  }
  const files = {
    development: `${cfg.dir}/${captureFileName(header.runId, "development")}`,
    heldout: `${cfg.dir}/${captureFileName(header.runId, "heldout")}`,
  };
  for (const p of Object.values(files)) {
    if (fs.existsSync(p)) throw new CaptureConfigError(`capture file ${p} already exists — a runId is never reused`);
  }

  const opened = new Set<EvalSplit>();
  const lineCount: Record<EvalSplit, number> = { development: 0, heldout: 0 };
  let seq = 0;
  let finished = false;

  const appendTo = (split: EvalSplit, obj: CaptureLine, evidence: CaptureWriteError["evidence"]) => {
    const p = files[split];
    try {
      if (!opened.has(split)) {
        const runLine: CaptureRunLine = {
          v: CAPTURE_LINE_VERSION,
          kind: "run",
          ts: now().toISOString(),
          ...header,
          split,
          raw: split === "heldout" ? cfg.rawHeldout : cfg.rawDevelopment,
        };
        fs.appendFileSync(p, `${JSON.stringify(runLine)}\n`, { mode: 0o600 });
        opened.add(split);
        lineCount[split]++;
      }
      fs.appendFileSync(p, `${JSON.stringify(obj)}\n`, { mode: 0o600 });
      lineCount[split]++;
    } catch (e) {
      throw new CaptureWriteError(evidence, e);
    }
  };

  const recordOf = (state: CaptureRunRecord["state"], note: string | null, hashes: CaptureRunRecord["sha256"]): CaptureRunRecord => ({
    runId: header.runId,
    dir: cfg.dir,
    rawDevelopment: cfg.rawDevelopment,
    rawHeldout: cfg.rawHeldout,
    files: {
      development: opened.has("development") ? captureFileName(header.runId, "development") : null,
      heldout: opened.has("heldout") ? captureFileName(header.runId, "heldout") : null,
    },
    state,
    sha256: hashes,
    lines: state === "complete" ? { ...lineCount } : { ...lineCount },
    note,
  });

  return {
    cfg,
    runId: header.runId,
    files,
    nextAttemptSeq: () => ++seq,
    rawAllowed: (split) => (split === "heldout" ? cfg.rawHeldout : cfg.rawDevelopment),
    redact,
    write(line) {
      if (finished) throw new CaptureWriteError({ line: line.kind, attemptSeq: "attemptSeq" in line ? line.attemptSeq : null, responseMetered: false }, new Error("sink already finished"));
      // defensive: a line for a split whose raw capture is off can never carry raw
      const safe = line.kind === "attempt_end" && !this.rawAllowed(line.split) ? { ...line, raw: null } : line;
      const evidence: CaptureWriteError["evidence"] = {
        line: line.kind,
        attemptSeq: "attemptSeq" in line ? line.attemptSeq : null,
        responseMetered: line.kind === "attempt_end" && line.outcome === "response" && line.metered,
      };
      appendTo(line.split, safe, evidence);
    },
    initialRecord: () => recordOf("incomplete", "run in progress (stamped before the first dispatch)", null),
    finish(outcome, reason) {
      finished = true;
      let note: string | null = null;
      for (const split of opened) {
        const endLine: CaptureRunEndLine = {
          v: CAPTURE_LINE_VERSION,
          kind: "run_end",
          ts: now().toISOString(),
          runId: header.runId,
          outcome,
          reason: reason === null ? null : redact(reason),
          lines: lineCount[split],
        };
        try {
          fs.appendFileSync(files[split], `${JSON.stringify(endLine)}\n`, { mode: 0o600 });
          lineCount[split]++;
        } catch (e) {
          note = `run_end write failed for ${split}: ${redact(e instanceof Error ? e.message : String(e))}`;
        }
      }
      const hashes: CaptureRunRecord["sha256"] = { development: null, heldout: null };
      for (const split of opened) {
        try {
          hashes[split] = createHash("sha256").update(fs.readFileSync(files[split])).digest("hex");
        } catch (e) {
          note = `${note ? `${note}; ` : ""}hash failed for ${split}: ${redact(e instanceof Error ? e.message : String(e))}`;
        }
      }
      // ONLY a normally completed sweep with every write and hash succeeding
      // is "complete"; an abort is incomplete by definition (§4 identity rule)
      const state: CaptureRunRecord["state"] = outcome === "complete" && note === null ? "complete" : "incomplete";
      if (outcome === "aborted") note = `${note ? `${note}; ` : ""}aborted: ${reason === null ? "(no reason)" : redact(reason)}`;
      return recordOf(state, note, hashes);
    },
  };
}

// ============================================================================
// Readers: reconciliation (both splits, metadata only) and calibration (dev only)
// ============================================================================

export interface ParsedCaptureFile {
  fileName: string;
  run: CaptureRunLine | null;
  lines: CaptureLine[];
  /** lines that failed to parse (a torn final line after a crash is expected) */
  malformed: number;
}

export function parseCaptureFile(fileName: string, text: string): ParsedCaptureFile {
  const lines: CaptureLine[] = [];
  let malformed = 0;
  let run: CaptureRunLine | null = null;
  for (const rawLine of text.split("\n")) {
    if (rawLine.trim() === "") continue;
    try {
      const obj = JSON.parse(rawLine) as CaptureLine;
      if (typeof obj !== "object" || obj === null || typeof (obj as { kind?: unknown }).kind !== "string") {
        malformed++;
        continue;
      }
      if (obj.kind === "run" && run === null) run = obj;
      lines.push(obj);
    } catch {
      malformed++;
    }
  }
  return { fileName, run, lines, malformed };
}

/** Calibration / inspection entry point: DEVELOPMENT capture only. Refuses by
 *  file name AND by the run line's split, so neither a renamed file nor a
 *  mislabelled one can slip heldout output into a tuning loop. */
export function openCaptureForCalibration(fileName: string, text: string): ParsedCaptureFile {
  const base = fileName.split("/").pop() ?? fileName;
  if (/\.heldout\.jsonl$/.test(base)) throw new CaptureHeldoutRefusal(`${base} is a heldout capture file`);
  const parsed = parseCaptureFile(fileName, text);
  if (parsed.run === null) throw new CaptureHeldoutRefusal(`${base} has no run line — split unknown, refusing to treat it as development`);
  if (parsed.run.split !== "development") throw new CaptureHeldoutRefusal(`${base} declares split ${parsed.run.split}`);
  for (const l of parsed.lines) {
    if ("split" in l && l.split === "heldout") throw new CaptureHeldoutRefusal(`${base} contains a heldout-split line`);
  }
  return parsed;
}

export interface AttemptReconciliation {
  runId: string;
  /** attempt_start lines */
  attempts: number;
  /** reservation refusals (no attempt was made) */
  budgetStops: number;
  responses: number;
  errors: number;
  /** attempt_start without attempt_end — the crash window; outcome unknown */
  unresolved: number;
  /** attempt_end with metered:true (what provider_usage.requests should hold for this run) */
  metered: number;
  promptTokens: number;
  completionTokens: number;
  estUsd: number;
  runEnd: { outcome: string; reason: string | null } | null;
  byCase: Array<{
    caseId: string;
    repetition: number;
    split: EvalSplit;
    attempts: number;
    responses: number;
    errors: number;
    unresolved: number;
    budgetStops: number;
    estUsd: number;
    /** "completed" = result key present; "abandoned" = recorded in
     *  results.abandonedAttempts; "orphan" = neither (interrupted without a
     *  durable record); "no-results-file" when reconciling capture alone */
    disposition: "completed" | "provider_error" | "abandoned" | "orphan" | "no-results-file";
  }>;
}

export interface CaptureReconciliation {
  runs: AttemptReconciliation[];
  totals: { attempts: number; responses: number; errors: number; unresolved: number; metered: number; budgetStops: number; estUsd: number };
  results: {
    present: boolean;
    meter: EvalResultsFile["meter"] | null;
    rowAttempts: number;
    abandonedAttempts: number;
    abandonedEntries: number;
    rowEstUsd: number;
    abandonedEstUsd: number;
    /** runIds in the results file with NO capture file (pre-capture or capture-off runs) */
    uncapturedRunIds: string[];
  };
  malformedLines: number;
  /** human-readable discrepancies and caveats — NEVER auto-resolved */
  notes: string[];
}

export function reconcileCapture(files: ParsedCaptureFile[], results: EvalResultsFile | null): CaptureReconciliation {
  interface RunLines {
    starts: Map<number, CaptureAttemptStartLine>;
    ends: CaptureAttemptEndLine[];
    stops: CaptureBudgetStopLine[];
    runEnd: CaptureRunEndLine | null;
  }
  const byRun = new Map<string, RunLines>();
  let malformedLines = 0;
  for (const f of files) {
    malformedLines += f.malformed;
    for (const l of f.lines) {
      if (l.kind === "run") continue;
      const rec: RunLines = byRun.get(l.runId) ?? { starts: new Map(), ends: [], stops: [], runEnd: null };
      byRun.set(l.runId, rec);
      if (l.kind === "attempt_start") rec.starts.set(l.attemptSeq, l);
      else if (l.kind === "attempt_end") rec.ends.push(l);
      else if (l.kind === "budget_stop") rec.stops.push(l);
      else if (l.kind === "run_end") rec.runEnd = l;
    }
  }
  const resultKeys = new Set(results ? Object.keys(results.results) : []);
  const abandonedKeys = new Set((results?.abandonedAttempts ?? []).map((a) => `${a.runId}|${resultKey(a.caseId, a.repetition)}`));
  const notes: string[] = [];
  const runs: AttemptReconciliation[] = [];
  for (const [runId, rec] of [...byRun.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const endedSeqs = new Set(rec.ends.map((e) => e.attemptSeq));
    const unresolvedStarts = [...rec.starts.values()].filter((s) => !endedSeqs.has(s.attemptSeq));
    const caseMap = new Map<string, AttemptReconciliation["byCase"][number]>();
    const caseRec = (l: CaptureAttemptBase) => {
      const k = resultKey(l.caseId, l.repetition);
      let c = caseMap.get(k);
      if (!c) {
        let disposition: AttemptReconciliation["byCase"][number]["disposition"];
        if (results === null) disposition = "no-results-file";
        else if (resultKeys.has(k)) disposition = results.results[k].status === "provider_error" ? "provider_error" : "completed";
        else if (abandonedKeys.has(`${runId}|${k}`)) disposition = "abandoned";
        else disposition = "orphan";
        c = { caseId: l.caseId, repetition: l.repetition, split: l.split, attempts: 0, responses: 0, errors: 0, unresolved: 0, budgetStops: 0, estUsd: 0, disposition };
        caseMap.set(k, c);
      }
      return c;
    };
    for (const s of rec.starts.values()) caseRec(s).attempts++;
    for (const s of unresolvedStarts) caseRec(s).unresolved++;
    let responses = 0;
    let errors = 0;
    let metered = 0;
    let promptTokens = 0;
    let completionTokens = 0;
    let estUsd = 0;
    for (const e of rec.ends) {
      const c = caseRec(e);
      if (e.outcome === "response") {
        responses++;
        c.responses++;
      } else {
        errors++;
        c.errors++;
      }
      if (e.metered) metered++;
      if (e.usage) {
        promptTokens += e.usage.promptTokens;
        completionTokens += e.usage.completionTokens;
      }
      estUsd += e.estUsd ?? 0;
      c.estUsd += e.estUsd ?? 0;
      if (!rec.starts.has(e.attemptSeq)) notes.push(`${runId}: attempt_end ${e.attemptSeq} has no attempt_start (malformed file?)`);
    }
    for (const s of rec.stops) caseRec(s).budgetStops++;
    const byCase = [...caseMap.values()].sort((a, b) => a.caseId.localeCompare(b.caseId) || a.repetition - b.repetition);
    for (const c of byCase) {
      if (c.disposition === "orphan") notes.push(`${runId}: ${resultKey(c.caseId, c.repetition)} has ${c.attempts} captured attempt(s) but neither a result key nor an abandoned-attempt record — interrupted without a durable record (crash/kill); its metered responses are in the ledger`);
      if (c.unresolved > 0) notes.push(`${runId}: ${resultKey(c.caseId, c.repetition)} has ${c.unresolved} UNRESOLVED attempt(s) (start without end) — the provider may have billed them; the ledger may or may not hold them`);
    }
    if (rec.runEnd === null) notes.push(`${runId}: no run_end line — the run did not finish through the sink (interrupted)`);
    runs.push({
      runId,
      attempts: rec.starts.size,
      budgetStops: rec.stops.length,
      responses,
      errors,
      unresolved: unresolvedStarts.length,
      metered,
      promptTokens,
      completionTokens,
      estUsd,
      runEnd: rec.runEnd ? { outcome: rec.runEnd.outcome, reason: rec.runEnd.reason } : null,
      byCase,
    });
  }
  const totals = runs.reduce(
    (t, r) => ({
      attempts: t.attempts + r.attempts,
      responses: t.responses + r.responses,
      errors: t.errors + r.errors,
      unresolved: t.unresolved + r.unresolved,
      metered: t.metered + r.metered,
      budgetStops: t.budgetStops + r.budgetStops,
      estUsd: t.estUsd + r.estUsd,
    }),
    { attempts: 0, responses: 0, errors: 0, unresolved: 0, metered: 0, budgetStops: 0, estUsd: 0 },
  );

  const rows = results ? Object.values(results.results) : [];
  const abandoned = results?.abandonedAttempts ?? [];
  const rowAttempts = rows.reduce((s, r) => s + r.attempt, 0);
  const abandonedAttempts = abandoned.reduce((s, a) => s + a.meter.attempts, 0);
  const rowEstUsd = rows.reduce((s, r) => s + (r.estUsd ?? r.partialUsage?.estUsd ?? 0), 0);
  const abandonedEstUsd = abandoned.reduce((s, a) => s + a.estUsd, 0);
  const resultRunIds = new Set([...rows.map((r) => r.runId), ...abandoned.map((a) => a.runId)]);
  const uncapturedRunIds = [...resultRunIds].filter((id) => !byRun.has(id)).sort();
  if (results) {
    const m = results.meter;
    if (results.abandonedAttempts === undefined) {
      notes.push(
        "results file has no abandonedAttempts field (written before the 2026-09-04 accounting): any interrupted attempts of its runs were never recorded in it — the ledger is the only witness for those",
      );
    }
    if (m.attempts !== rowAttempts + abandonedAttempts) {
      notes.push(
        `results meter.attempts ${m.attempts} != Σ rows.attempt ${rowAttempts} + Σ abandoned ${abandonedAttempts}` +
          (results.abandonedAttempts === undefined ? " — this file predates abandoned-attempt accounting (interrupted attempts were never recorded in it)" : ""),
      );
    }
    if (uncapturedRunIds.length > 0) notes.push(`${uncapturedRunIds.length} run(s) in the results file have no capture file (capture off or pre-capture): ${uncapturedRunIds.join(", ")} — capture totals cannot equal the results meter`);
    if (uncapturedRunIds.length === 0 && totals.attempts !== m.attempts) notes.push(`capture attempts ${totals.attempts} != results meter.attempts ${m.attempts}`);
    if (uncapturedRunIds.length === 0 && totals.metered !== m.meterings) notes.push(`capture metered ${totals.metered} != results meter.meterings ${m.meterings}`);
  }
  notes.push(
    "ledger: provider_usage(openai_eval).requests for these runs' UTC days should equal Σ metered; errored attempts are unbilled and unmetered, unresolved attempts are unknown either way — capture line count is NOT the ledger request count",
  );
  return {
    runs,
    totals,
    results: { present: results !== null, meter: results?.meter ?? null, rowAttempts, abandonedAttempts, abandonedEntries: abandoned.length, rowEstUsd, abandonedEstUsd, uncapturedRunIds },
    malformedLines,
    notes,
  };
}

export function renderCaptureReconciliation(rec: CaptureReconciliation, title: string): string {
  const L: string[] = [];
  L.push(`# Capture reconciliation — ${title}`, "");
  L.push("Metadata only; raw content is never rendered here. Each row is a physical attempt account, NOT a ledger row.", "");
  L.push("| run | attempts | responses | errors | unresolved | metered | budget stops | est $ | run end |");
  L.push("|---|---|---|---|---|---|---|---|---|");
  for (const r of rec.runs) {
    L.push(`| ${r.runId} | ${r.attempts} | ${r.responses} | ${r.errors} | ${r.unresolved} | ${r.metered} | ${r.budgetStops} | ${r.estUsd.toFixed(4)} | ${r.runEnd ? `${r.runEnd.outcome}${r.runEnd.reason ? ` (${r.runEnd.reason})` : ""}` : "MISSING"} |`);
  }
  const t = rec.totals;
  L.push(`| **total** | ${t.attempts} | ${t.responses} | ${t.errors} | ${t.unresolved} | ${t.metered} | ${t.budgetStops} | ${t.estUsd.toFixed(4)} | |`, "");
  const R = rec.results;
  if (R.present && R.meter) {
    L.push("## Results file", "");
    L.push(`- meter: attempts ${R.meter.attempts} · reservations ${R.meter.reservations} · meterings ${R.meter.meterings} · erroredAttempts ${R.meter.erroredAttempts}`);
    L.push(`- Σ result rows attempt ${R.rowAttempts} (est $${R.rowEstUsd.toFixed(4)}) + Σ abandoned attempts ${R.abandonedAttempts} over ${R.abandonedEntries} entr${R.abandonedEntries === 1 ? "y" : "ies"} (est $${R.abandonedEstUsd.toFixed(4)})`);
    if (R.uncapturedRunIds.length > 0) L.push(`- runs without capture: ${R.uncapturedRunIds.join(", ")}`);
    L.push("");
  } else {
    L.push("## Results file", "", "- none — capture-only reconciliation", "");
  }
  L.push("## Per case", "");
  L.push("| run | key | split | attempts | responses | errors | unresolved | stops | est $ | disposition |");
  L.push("|---|---|---|---|---|---|---|---|---|---|");
  for (const r of rec.runs) {
    for (const c of r.byCase) {
      L.push(`| ${r.runId} | ${resultKey(c.caseId, c.repetition)} | ${c.split} | ${c.attempts} | ${c.responses} | ${c.errors} | ${c.unresolved} | ${c.budgetStops} | ${c.estUsd.toFixed(4)} | ${c.disposition} |`);
    }
  }
  L.push("");
  if (rec.malformedLines > 0) L.push(`Malformed lines skipped: ${rec.malformedLines} (a torn final line after a crash is expected).`, "");
  L.push("## Notes and discrepancies (never auto-resolved)", "");
  for (const n of rec.notes) L.push(`- ${n}`);
  L.push("");
  return L.join("\n");
}

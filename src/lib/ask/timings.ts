// AI Search Phase 0 (2026-07-19): request-scoped run identity + monotonic stage
// timings for the /ask pipeline. Pure in-process measurement — NO metering, NO
// spend-guard interaction, NO DB access lives here. The collector is threaded
// through askWithLimits → ask() → retrieveV2/rerank/answer via an options object
// (never module/global state — serverless instances share nothing), and logUsage
// serializes it into ask_usage.stage_timings_ms at row-insert time.
//
// Durations come from performance.now() (monotonic — never subtract wall-clock
// Dates: NTP steps would corrupt stage durations). Wall time appears only as
// startedAt, stored for ordering.
//
// Key semantics (documented here so entry points cannot conflate their scopes;
// Gate 0 requires action-hydration/total and API-wrapper timing to stay distinct):
//   currencyMs  ask(): corpus-currency read (cached ~5min, so usually ~0)
//   embedMs     retrieveV2: the embedTexts() network call (vector arm)
//   vectorMs    retrieveV2: the pgvector similarity SQL query
//   lexicalMs   retrieveV2: lexicalClaimSearch (count + rows round-trips)
//   entityMs    retrieveV2: per-claim entities SQL + top-15 entity list SQL (sum)
//   mergeMs     retrieveV2: synchronous union/dedupe/composite-score/sort section
//   rerankMs    ask(): the rerankCandidates() stage (includes its guard I/O)
//   answerMs    answerFromEvidence: the paid chat-completion await (+ its guard
//               init/reserve/record I/O — the boundary users actually wait on)
//   validateMs  answerFromEvidence: post-response synchronous validation/assembly
//               (citation filter, denial correction) — expected ~0–1ms, recorded
//               so "validation is cheap" is a measurement, not an assumption
//   pipelineMs  askWithLimits: entry → just before the ask_usage INSERT
//   hydrateMs   askAction ONLY: the post-answer source-hydration SQL
//   totalMs     askAction ONLY: action entry → after hydration (the user-felt
//               total for the web path)
//   apiTotalMs  POST /api/ask ONLY: route wrapper total (no hydration exists
//               there — hydrateMs/totalMs stay absent on API rows)

export interface StageTimings {
  currencyMs?: number;
  embedMs?: number;
  vectorMs?: number;
  lexicalMs?: number;
  entityMs?: number;
  mergeMs?: number;
  rerankMs?: number;
  answerMs?: number;
  validateMs?: number;
  pipelineMs?: number;
  hydrateMs?: number;
  totalMs?: number;
  apiTotalMs?: number;
}

export type StageTimingKey = keyof StageTimings;

/** One run's identity + timings, created at askWithLimits entry and shared (by
 *  reference) with every stage — a stage that throws still leaves its completed
 *  predecessors' timings on the object for the error row. */
export interface AskRunMeta {
  runId: string;
  /** wall clock, for the started_at column (ordering only — never for durations) */
  startedAt: Date;
  timings: StageTimings;
}

export function createAskRunMeta(): AskRunMeta {
  return { runId: crypto.randomUUID(), startedAt: new Date(), timings: {} };
}

/** Monotonic now — exported so tests can pin the rounding behavior. */
export function monotonicMs(): number {
  return performance.now();
}

/** Record a duration (rounded to whole ms, floored at 0) onto the collector.
 *  No-ops when the collector is absent so every stage can call it
 *  unconditionally with an optional timings object. */
export function recordStage(
  timings: StageTimings | undefined,
  key: StageTimingKey,
  durationMs: number,
): void {
  if (!timings) return;
  timings[key] = Math.max(0, Math.round(durationMs));
}

/** Time an async boundary onto the collector. The duration is recorded on BOTH
 *  resolution and rejection — a stage that threw still consumed real time, and
 *  the error row should carry it. Rethrows unchanged. */
export async function timeStage<T>(
  timings: StageTimings | undefined,
  key: StageTimingKey,
  fn: () => Promise<T>,
): Promise<T> {
  if (!timings) return fn();
  const t0 = monotonicMs();
  try {
    return await fn();
  } finally {
    recordStage(timings, key, monotonicMs() - t0);
  }
}

/** Time a synchronous section onto the collector (merge/validate). */
export function timeStageSync<T>(
  timings: StageTimings | undefined,
  key: StageTimingKey,
  fn: () => T,
): T {
  if (!timings) return fn();
  const t0 = monotonicMs();
  try {
    return fn();
  } finally {
    recordStage(timings, key, monotonicMs() - t0);
  }
}

import { Pool } from "@neondatabase/serverless";
import { openaiGeneration } from "../llm/openai";
import { askGuardFromEnv, LlmBudgetError } from "../usage/llm-guard";
import { estimateCostUsd } from "./limits";
import type { AskStageGuards } from "./run-guards";
import type { RunEventSink } from "./events";
import { fidelityFallbackEnabled, SectionReleaser, type FidelityEvidence } from "./validator";
import type { CandidateClaim, RankedEvidence, StageUsage } from "./types";

// AI Search Phase 3 Increment B: the STREAMING answer stage — buffered
// validated section release behind ASK_STREAM_ANSWER (default OFF). §6.3
// safeguards all enforced by the pure SectionReleaser (validator.ts); this
// module owns the provider stream, metering, cancellation, and the material
// for terminal reconciliation. It imports NOTHING from answer.ts (the caller
// supplies the prompt/messages/model), so the two modules cannot cycle.
//
// Money discipline (ruling 4/8, unchanged shape): reserve BEFORE the call;
// settle EXACTLY ONCE on every exit — the terminal usage frame when the stream
// completes, or the CONSERVATIVE CEILING when the stream dies/aborts before a
// usage frame arrived (never unrecorded). `settled` gates the single record();
// the atomic guard's conditional transition additionally makes a double
// settlement structurally impossible.
//
// Terminal reconciliation: the caller runs the full text through the SAME
// whole-answer path (assembleV2) — released sections were validated by the
// identical validator functions, and the client's terminal render replaces
// streamed text with the final payload regardless.

/** Minimal delta shape consumed from the provider stream — structural so tests
 *  feed plain async iterables (the Phase 5 gateway adopts this shape). */
export interface AnswerStreamChunk {
  choices?: Array<{
    delta?: { content?: string | null; refusal?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
}

export interface StreamOutcome {
  /** full accumulated content (terminal-reconciliation input) */
  content: string;
  /** provider refusal text accumulated from refusal deltas ("" = none) */
  refusal: string;
  finishReason: string | null;
  usage: StageUsage;
  denialLed: boolean;
  cancelled: boolean;
  releasedCount: number;
}

/** Bounded input estimate for the conservative death settlement — same class
 *  as run-guards' reservation ceiling input estimate. */
export const STREAM_DEATH_INPUT_EST_TOKENS = 30_000;

/** Thrown when the stream could not be constructed/dispatched AFTER the
 *  conservative ceiling was settled (the request may have reached the
 *  provider). Carries the settled usage so the caller's error payload can
 *  report what was billed instead of dropping the attribution (Gate 3
 *  finding: the streaming catch reported usage/model as absent although the
 *  ceiling had settled). */
export class StreamDispatchError extends Error {
  constructor(
    cause: unknown,
    public readonly settledUsage: StageUsage,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "StreamDispatchError";
  }
}

/** Watch the run's cancel marker (the Phase 2 stub route becomes LIVE here):
 *  polls ask_run_events for a cancel_requested row and fires onCancel once.
 *  Fail-soft: a watch error never cancels or fails a run. Returns the stop fn. */
export function watchCancelMarker(
  runId: string,
  onCancel: () => void,
  intervalMs = 2000,
): () => void {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const { rows } = await pool.query(
        `SELECT 1 FROM ask_run_events WHERE run_id = $1 AND type = 'cancel_requested' LIMIT 1`,
        [runId],
      );
      if (!stopped && rows.length > 0) {
        stopped = true;
        onCancel();
      }
    } catch {
      // fail-soft: cancellation polling must never break a paid run
    } finally {
      await pool.end();
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

/** Consume a provider answer stream with buffered validated release. Throws
 *  ONLY pre-call (budget refusal / construction before dispatch); once the
 *  stream may have started, every path settles exactly once and RESOLVES. */
export async function streamAnswer(opts: {
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  maxOutputTokens: number;
  ranked: RankedEvidence;
  sink: RunEventSink;
  guards?: AskStageGuards;
  signal?: AbortSignal;
  /** test seam: yields provider chunks; default = the real OpenAI stream */
  streamFactory?: (params: {
    model: string;
    messages: Array<{ role: "system" | "user"; content: string }>;
    maxOutputTokens: number;
    signal?: AbortSignal;
  }) => Promise<AsyncIterable<AnswerStreamChunk>>;
}): Promise<StreamOutcome> {
  const { model } = opts;
  const guard = opts.guards?.answer ?? askGuardFromEnv();
  await guard.init();
  const reserve = await guard.tryReserve();
  if (!reserve.ok) throw new LlmBudgetError(reserve.reason);

  const evidenceById = new Map<number, FidelityEvidence>(
    opts.ranked.claims.map((c: CandidateClaim) => [
      c.claimId,
      { claimId: c.claimId, text: c.text, hedging: c.hedging },
    ]),
  );
  const validIds = new Set(opts.ranked.claims.map((c) => c.claimId));
  // The rollback knob binds the streaming path too (Gate 3 finding: fidelity
  // was hard-coded ON here while assembleV2 honored the flag — released text
  // diverged from the terminal answer whenever the knob was off).
  const releaser = new SectionReleaser(evidenceById, validIds, fidelityFallbackEnabled());

  // Phase 5: the default factory delegates to the gateway adapter (dispatch
  // only — this module keeps the reserve/settle lifecycle and §6.3 release
  // discipline; contracts.ts documents the split).
  const makeStream =
    opts.streamFactory ??
    (async (p: {
      model: string;
      messages: Array<{ role: "system" | "user"; content: string }>;
      maxOutputTokens: number;
      signal?: AbortSignal;
    }) =>
      openaiGeneration.stream({
        model: p.model,
        messages: p.messages,
        maxOutputTokens: p.maxOutputTokens,
        reasoningEffort: "low",
        signal: p.signal,
      }) as Promise<AsyncIterable<AnswerStreamChunk>>);

  let settled = false;
  const settleOnce = async (usage: StageUsage) => {
    if (settled) return;
    settled = true;
    await guard.record(1, usage.promptTokens + usage.completionTokens, usage.costUsd);
  };
  const ceilingUsage = (): StageUsage => ({
    promptTokens: STREAM_DEATH_INPUT_EST_TOKENS,
    completionTokens: opts.maxOutputTokens,
    costUsd: estimateCostUsd(model, STREAM_DEATH_INPUT_EST_TOKENS, opts.maxOutputTokens),
  });

  let refusal = "";
  let finishReason: string | null = null;
  let usage: StageUsage | null = null;
  let cancelled = false;
  let releasedCount = 0;

  let stream: AsyncIterable<AnswerStreamChunk>;
  try {
    stream = await makeStream({
      model,
      messages: opts.messages,
      maxOutputTokens: opts.maxOutputTokens,
      signal: opts.signal,
    });
  } catch (e) {
    // The request may have reached the provider before failing — settle the
    // ceiling conservatively; never leave a possibly-billed call unrecorded.
    const settled = ceilingUsage();
    await settleOnce(settled);
    // Release hardening: a Stop landing in the DISPATCH window (request sent,
    // no first byte yet — the provider "thinking" delay, often seconds) is a
    // CANCELLATION, not a failure. Same conservative ceiling settlement as a
    // mid-stream abort, honest cancelled classification instead of an error
    // terminal (the Gate 3 rules covered aborts only from the first byte on).
    if (opts.signal?.aborted || (e instanceof Error && e.name === "AbortError")) {
      return {
        content: "",
        refusal: "",
        finishReason: "cancelled",
        usage: settled,
        denialLed: false,
        cancelled: true,
        releasedCount,
      };
    }
    throw new StreamDispatchError(e, settled);
  }

  const emitSection = async (section: { text: string; citedClaimIds: number[] }) => {
    releasedCount++;
    await opts.sink.emit("answer.section", {
      text: section.text,
      citedClaimIds: section.citedClaimIds,
    });
  };

  try {
    for await (const chunk of stream) {
      const choice = chunk.choices?.[0];
      if (choice?.delta?.refusal) refusal += choice.delta.refusal;
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      // Adopt a usage frame only when BOTH token counts are finite and
      // non-negative: a truthy-but-degenerate frame ({}/NaN/negative) would
      // otherwise settle $0 or NaN instead of the conservative ceiling —
      // eroding the cap in exactly the wrong direction (Gate 3 finding;
      // unreachable via today's OpenAI frames, but this chunk shape is the
      // Phase 5 gateway seam where degenerate frames become possible).
      if (
        chunk.usage &&
        Number.isFinite(chunk.usage.prompt_tokens) &&
        Number.isFinite(chunk.usage.completion_tokens) &&
        (chunk.usage.prompt_tokens as number) >= 0 &&
        (chunk.usage.completion_tokens as number) >= 0
      ) {
        const promptTokens = chunk.usage.prompt_tokens as number;
        const completionTokens = chunk.usage.completion_tokens as number;
        usage = {
          promptTokens,
          completionTokens,
          costUsd: estimateCostUsd(model, promptTokens, completionTokens),
        };
      }
      const delta = choice?.delta?.content;
      if (delta && refusal === "") {
        // §6.3: sections release ONLY through the validated buffered path.
        for (const section of releaser.push(delta)) await emitSection(section);
      }
    }
  } catch (e) {
    if (opts.signal?.aborted || (e instanceof Error && e.name === "AbortError")) cancelled = true;
    await settleOnce(usage ?? ceilingUsage());
    const fin = releaser.finish();
    return {
      content: fin.fullText,
      refusal,
      finishReason: cancelled ? "cancelled" : (finishReason ?? "error"),
      usage: usage ?? ceilingUsage(),
      denialLed: fin.denialLed,
      cancelled,
      releasedCount,
    };
  }

  // Clean stream end: meter BEFORE interpretation (ruling 8) with the terminal
  // usage frame (or the ceiling if the provider omitted one).
  await settleOnce(usage ?? ceilingUsage());
  // An abort can also surface as a GRACEFUL iterator end (the torn-down
  // transport closes the SSE body and the SDK's iterator returns instead of
  // throwing — observed end-to-end in the Gate 3 browser battery). A stream
  // that ended with the signal aborted and NO provider finish_reason was
  // cancelled, not completed; a genuine provider finish (finish_reason
  // present) that merely raced a late Stop stays a completion (red-team
  // verdict: the answer truly exists and was billed).
  const abortedMidStream = opts.signal?.aborted === true && finishReason === null;
  const fin = releaser.finish();
  if (refusal === "" && !fin.denialLed && !abortedMidStream) {
    for (const section of fin.released) await emitSection(section);
  }
  return {
    content: fin.fullText,
    refusal,
    finishReason: abortedMidStream ? "cancelled" : finishReason,
    usage: usage ?? ceilingUsage(),
    denialLed: fin.denialLed,
    cancelled: abortedMidStream,
    releasedCount,
  };
}

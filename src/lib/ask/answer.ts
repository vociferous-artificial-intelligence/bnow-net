import { openaiGeneration, openaiLegacyChatCompletion } from "../llm/openai";
import { askGuardFromEnv, isLlmDisabled, LlmBudgetError } from "../usage/llm-guard";
import { envNum } from "../usage/spend-guard";
import { retrieve, type RetrievalResult, type RetrievedEntity } from "./retrieve";
import { retrieveV2 } from "./retrieve-v2";
import { rerankCandidates, rerankOfflineReason } from "./rerank";
import { estimateCostUsd } from "./limits";
import {
  askAnswerModel,
  askCandidates,
  askEvidenceK,
  askNoCoverageShortcircuit,
  askPipeline,
  askRelevanceBoundaryEnabled,
  askRelevantEvidenceFloor,
  askRerankModel,
  askStreamAnswer,
} from "./config";
// Phase 3 Increment A: every deterministic answer check lives in the shared
// pure validator (citation filter, denial prefix, insufficient copy, terminal
// classification, the ruling-20 source-fidelity matrix) so the streaming and
// non-streaming paths cannot drift. beginsWithDenial is re-exported for the
// existing test/consumer surface.
import {
  applyFidelityFallback,
  beginsWithDenial,
  classifyCompletion,
  fidelityFallbackEnabled,
  filterCitations,
  insufficientEvidenceCopy,
  parseCitedIds,
  type FidelityEvidence,
} from "./validator";

export { beginsWithDenial };
import { dataCurrentThrough } from "./currency";
import { parseTimeWindow } from "./window";
import { selectRelatedClaimIds } from "./related";
import {
  monotonicMs,
  recordStage,
  timeStage,
  timeStageSync,
  type StageTimings,
} from "./timings";
import type { AskStageGuards } from "./run-guards";
import {
  fetchSourceDocIds,
  LEXICAL_PARTIAL_MAX,
  NULL_EVENT_SINK,
  persistEvidenceSnapshot,
  toSnapshotClaim,
  type EvidenceSnapshot,
  type RunEventSink,
} from "./events";
import { streamAnswer, StreamDispatchError, watchCancelMarker, type StreamOutcome } from "./answer-stream";
import type {
  AnswerState,
  AskAnswerV2,
  CandidateClaim,
  RankedEvidence,
  RetrievalV2Result,
  StageUsage,
  TimeWindow,
} from "./types";

// Answer a natural-language question STRICTLY from retrieved BNOW data. The LLM may
// only use the provided evidence and must cite claim ids; if evidence is thin it says
// so rather than inventing. Same traceability ethos as digests.
//
// Two pipelines behind ASK_PIPELINE (config.ts):
//  - legacy (default): today's single retrieve()+one-shot answer, wrapped into the
//    AskAnswerV2 shape with neutral v2 fills. A FAITHFUL ROLLBACK (WORKLOG DL-6):
//    identical retrieve(limit 40) / SYSTEM prompt / gpt-4o-mini / temperature 0.1 /
//    absent max_tokens / offline fallback / error strings — nothing "improved".
//  - v2: retrieveV2 (hybrid + window) -> rerankCandidates (workstream C) -> the answer
//    stage below (enriched evidence, gpt-5 default, guarded spend, refusal-aware).

/** Retained for src/lib/ask/limits.ts, which types its RawAskResult on this shape.
 *  AskAnswerV2 (types.ts) is a strict superset, so ask() returns the richer type and
 *  is still assignable here. */
export interface AskAnswer {
  answer: string;
  citedClaimIds: number[];
  evidenceCount: number;
  terms: string[];
  provider: string;
  /** set for LLM-backed answers; feeds the ask_usage spend log */
  usage?: { promptTokens: number; completionTokens: number; costUsd: number };
}

const SYSTEM = `You answer questions about geopolitical/OSINT intelligence STRICTLY from the provided evidence rows (claims + entities from the BNOW database). Rules:
1. Use ONLY the evidence provided. Never use outside knowledge or invent facts.
2. Cite the claim ids you rely on inline as [c<ID>] (e.g. [c1438]). Every factual sentence needs a citation.
3. If the evidence is insufficient to answer, say so plainly and suggest a narrower question. Do not speculate.
4. Be concise (<= 180 words). Note hedging where relevant ("reportedly", "unverified").
5. These are open-source-derived claims of varying reliability, not confirmed truth — reflect that.`;

/** V2-only system prompt (W1). SYSTEM above stays byte-identical for the
 *  ASK_PIPELINE=legacy rollback; this one is used ONLY by answerFromEvidence.
 *  Keeps SYSTEM's invariants (strictly-from-evidence, inline [c<ID>] citations —
 *  the downstream filter parses `[c(\d+)]` — <=180 words, hedging notes,
 *  open-source-reliability framing, insufficient-vs-refusal distinction) and adds
 *  the end-user persona: the reader consumes an intelligence product, never the
 *  pipeline, so the model must NEVER ask them for claim ids/datasets/"the provided
 *  claims", and an honest "we don't have this yet" must LEAD with denial phrasing
 *  (so eval-run.ts's isNegativeAnswerHonest / DENIAL_LANGUAGE_PATTERN recognizes it).
 *  Exported for the persona snapshot test. */
export const SYSTEM_V2 = `You answer questions about geopolitical/OSINT intelligence for an END USER reading the BNOW intelligence product, STRICTLY from the provided evidence rows (claims + entities from the BNOW database). Rules:
1. Use ONLY the evidence provided. Never use outside knowledge or invent facts.
2. Cite the claim ids you rely on inline as [c<ID>] (e.g. [c1438]). Every factual sentence needs a citation. Those bracketed ids are rendered by the interface — they are NOT a request to the reader.
3. You are writing for an end user, NOT an API caller. Never ask the reader to provide, supply, paste, or share claim ids, "the provided claims", datasets, or any pipeline internals — they cannot and should not, and such a request is a product failure.
4. If the evidence is insufficient to answer, say so plainly and LEAD with a denial — begin with wording like "No claims in the covered data address …" or "The evidence is insufficient to …". An insufficient answer cites NOTHING: never summarize, quote, or cite retrieved claims that do not address the question's subject — you may only name the covered theaters and topic categories in generic terms (Russia/Ukraine/Iran; strikes, prosecutions, sanctions, trade). If a data-currency date is provided and the question reaches beyond it, state that the data is current only through that date; suggest widening the time window or rephrasing toward covered topics. Do not speculate.
5. Insufficient evidence is NOT a refusal: give the honest "we don't have this yet" answer, never decline the phrasing.
6. Be concise (<= 180 words). Note hedging where relevant ("reportedly", "unverified").
7. These are open-source-derived claims of varying reliability, not confirmed truth — reflect that.
8. When a "Data current through" date is provided in the context, you may state it as a fact.`;

/** Shared no-evidence message — byte-identical string on the legacy and v2 paths. */
const NO_EVIDENCE_MESSAGE =
  "No matching evidence in the current dataset. Try a narrower question naming a country, person, organization, or event type we cover (Russia/Ukraine/Iran; prosecutions, strikes, sanctions, trade).";

/** Payload string when the model declines the phrasing (D7). The UI renders its own
 *  i18n callout; this stays as the payload fallback. */
const REFUSED_MESSAGE = "The model declined to answer this phrasing.";

/** Payload string when the model consumed the whole output budget without emitting an
 *  answer (finish_reason "length" + empty content). Truncation, NOT a refusal — a
 *  distinct third case so users are never told the model "declined" when it ran out
 *  of budget. */
const TRUNCATED_MESSAGE =
  "The answer exceeded its output budget — ask a narrower question, or try again.";

/** Payload string for a cancelled run (Phase 3). Usage already incurred was
 *  settled exactly once; the copy says so honestly. */
const CANCELLED_MESSAGE =
  "This run was stopped. Usage already incurred was settled; nothing further will be charged.";

/** Answer-stage output-token ceiling (env-overridable via ASK_ANSWER_MAX_OUTPUT_TOKENS).
 *  gpt-5 bills reasoning tokens INSIDE this budget. Measured (2026-07-11 live sweep):
 *  broad questions legitimately use ~1100 completion tokens incl. reasoning at effort
 *  "low", and at the previous 1200 ceiling ~half of broad questions stochastically
 *  truncated to empty content. 2500 gives burst headroom; worst-case cost
 *  2500 x $10/1M = $0.025/question, still inside the ask budget math. */
export const ANSWER_MAX_OUTPUT_TOKENS = 2500;
function answerMaxOutputTokens(): number {
  return envNum("ASK_ANSWER_MAX_OUTPUT_TOKENS", ANSWER_MAX_OUTPUT_TOKENS);
}

/** True on the offline/deterministic answer path — IDENTICAL condition to today's
 *  legacy code and to the rerank stage (rerankOfflineReason): no key / stub / kill. */
function answerOffline(): boolean {
  return !process.env.OPENAI_API_KEY || process.env.ANALYSIS_PROVIDER === "stub" || isLlmDisabled();
}

// ---- legacy path (byte-identical behaviour, wrapped into AskAnswerV2) ----------

function evidenceBlock(r: RetrievalResult): string {
  const claims = r.claims
    .map(
      (c) =>
        `[c${c.claimId}] (${c.countryIso2}/${c.track ?? "-"}, ${c.claimDate ?? "undated"}, ${c.hedging}${c.entities.length ? `, entities: ${c.entities.slice(0, 4).join(", ")}` : ""}) ${c.text}`,
    )
    .join("\n");
  const ents = r.entities
    .map((e) => `[e${e.entityId}] ${e.name} (${e.kind}${e.sanctioned ? ", SANCTIONED" : ""}, pressure ${e.pressure})`)
    .join("\n");
  return `CLAIMS:\n${claims || "(none)"}\n\nENTITIES:\n${ents || "(none)"}`;
}

/** Today's /ask logic, unchanged (DL-6). Returns the legacy AskAnswer shape; ask()
 *  wraps it into AskAnswerV2. */
async function legacyAnswer(question: string): Promise<AskAnswer> {
  const r = await retrieve(question, { limit: 40 });
  const evidenceCount = r.claims.length + r.entities.length;

  if (evidenceCount === 0) {
    return {
      answer: NO_EVIDENCE_MESSAGE,
      citedClaimIds: [], evidenceCount: 0, terms: r.terms, provider: "none",
    };
  }

  // isLlmDisabled(): the kill-switch refuses the call rather than throwing, because
  // /ask is a user surface and the deterministic path below still answers honestly
  // from real cited claims.
  if (answerOffline()) {
    // deterministic fallback: surface the top matching claims verbatim, cited
    const top = r.claims.slice(0, 6);
    const answer =
      top.length > 0
        ? "Top matching evidence:\n" + top.map((c) => `• ${c.text} [c${c.claimId}]`).join("\n")
        : "Matched entities: " + r.entities.map((e) => e.name).join(", ");
    return {
      answer, citedClaimIds: top.map((c) => c.claimId), evidenceCount, terms: r.terms, provider: "stub",
    };
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  try {
    // Phase 5: SDK construction moved to the adapter (raw passthrough — the
    // legacy request payload is byte-identical; charter: nothing improved).
    const completion = await openaiLegacyChatCompletion({
      model,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Question: ${question}\n\nEvidence:\n${evidenceBlock(r)}` },
      ],
      temperature: 0.1,
    });
    const answer = completion.choices[0]?.message?.content ?? "(no answer)";
    const cited = [...answer.matchAll(/\[c(\d+)\]/g)].map((m) => parseInt(m[1], 10));
    // keep only citations that were actually in the evidence set (anti-fabrication)
    const validIds = new Set(r.claims.map((c) => c.claimId));
    const promptTokens = completion.usage?.prompt_tokens ?? 0;
    const completionTokens = completion.usage?.completion_tokens ?? 0;
    return {
      answer,
      citedClaimIds: [...new Set(cited)].filter((id) => validIds.has(id)),
      evidenceCount, terms: r.terms, provider: `openai:${model}`,
      usage: {
        promptTokens,
        completionTokens,
        costUsd: estimateCostUsd(model, promptTokens, completionTokens),
      },
    };
  } catch (e) {
    return {
      answer: `Query failed: ${e instanceof Error ? e.message : e}. Evidence was retrieved; try again.`,
      citedClaimIds: [], evidenceCount, terms: r.terms, provider: "error",
    };
  }
}

/** Wrap a legacy AskAnswer into AskAnswerV2 with the neutral v2 fills (types.ts).
 *  State: none (evidenceCount 0) -> insufficient; the "Query failed" catch string
 *  (provider "error") -> error; everything else (stub, openai success, "(no answer)")
 *  -> answered. */
function toV2FromLegacy(res: AskAnswer): AskAnswerV2 {
  const state: AnswerState =
    res.provider === "none" ? "insufficient" : res.provider === "error" ? "error" : "answered";
  return {
    answer: res.answer,
    citedClaimIds: res.citedClaimIds,
    evidenceCount: res.evidenceCount,
    terms: res.terms,
    provider: res.provider,
    state,
    relatedClaimIds: [],
    window: null,
    totalMatching: res.evidenceCount,
    sampled: false,
    retrievalMode: "legacy",
    usage: res.usage,
  };
}

// ---- v2 path ------------------------------------------------------------------

/** Enriched per-claim evidence line (D7): the legacy tuple plus `reliability` (the
 *  claim's mean-source-reliability confidence, 2dp or "?") and a fixed `entities`
 *  field (up to 4). Claims come from ranked.claims ONLY; the entities block matches
 *  the legacy format from retrieval.entities. */
function evidenceBlockV2(ranked: RankedEvidence, retrieval: RetrievalV2Result): string {
  const claims = ranked.claims
    .map((c) => {
      const reliability = c.confidence != null ? c.confidence.toFixed(2) : "?";
      const entities = c.entities.slice(0, 4).join(", ");
      return `[c${c.claimId}] (${c.countryIso2}/${c.track ?? "-"}, ${c.claimDate ?? "undated"}, ${c.hedging}, reliability ${reliability}, entities: ${entities}) ${c.text}`;
    })
    .join("\n");
  const ents = retrieval.entities
    .map((e) => `[e${e.entityId}] ${e.name} (${e.kind}${e.sanctioned ? ", SANCTIONED" : ""}, pressure ${e.pressure})`)
    .join("\n");
  return `CLAIMS:\n${claims || "(none)"}\n\nENTITIES:\n${ents || "(none)"}`;
}

/** Deterministic answer from real evidence — used by the offline path (§9 integrity)
 *  and the budget-degrade path: top-6 ranked claims cited verbatim, else entity names.
 *  Mirrors the legacy deterministic format so the UI stays consistent. */
function deterministicAnswer(
  claims: CandidateClaim[],
  entities: RetrievedEntity[],
): { answer: string; citedClaimIds: number[] } {
  const top = claims.slice(0, 6);
  if (top.length > 0) {
    return {
      answer: "Top matching evidence:\n" + top.map((c) => `• ${c.text} [c${c.claimId}]`).join("\n"),
      citedClaimIds: top.map((c) => c.claimId),
    };
  }
  return { answer: "Matched entities: " + entities.map((e) => e.name).join(", "), citedClaimIds: [] };
}

/** Corpus currency for the answer stage, belt-and-suspenders fail-soft: the
 *  underlying dataCurrentThrough() already returns null on any DB error, and this
 *  wrapper guarantees a currency read can NEVER throw the answer path (ruling 9 —
 *  /ask is a user surface). Backed by the module's in-process cache, so ask() and
 *  answerFromEvidence sharing one question cost at most one DB round-trip. */
async function safeCurrency(): Promise<string | null> {
  try {
    return await dataCurrentThrough();
  } catch {
    return null;
  }
}

/** Extra USER-message line (never the system prompt) stating corpus currency and,
 *  when the question carried one, the parsed window. Empty string when currency is
 *  unknown so the evidence-block format is otherwise byte-unchanged. */
function currencyContextLine(currency: string | null, window: TimeWindow | null): string {
  if (currency == null) return "";
  const base = `\n\nData current through: ${currency} (UTC).`;
  if (window && (window.from || window.to)) {
    return `${base} Question window: ${window.from ?? ""}..${window.to ?? ""}`;
  }
  return base;
}

/** Deterministic no-coverage short-circuit payload ($0, W1): the question's window
 *  begins entirely AFTER the newest claim, so no evidence can exist yet — no embed,
 *  no rerank, no answer call. Answer text leads with "No claims yet cover …" so the
 *  honesty metric (DENIAL_LANGUAGE_PATTERN) recognizes it. retrievalMode is "v2"
 *  (NOT "v2-lexical-only": that string flags a degraded run to the eval detector). */
function noCoverageShortcircuit(window: TimeWindow, from: string, currency: string): AskAnswerV2 {
  const range = window.to && window.to !== from ? `${from}..${window.to}` : from;
  return {
    answer: `No claims yet cover ${range} — data is current through ${currency}. Try widening the window (e.g. "in the past week") or asking without a date.`,
    citedClaimIds: [],
    evidenceCount: 0,
    terms: [],
    provider: "none",
    state: "insufficient",
    relatedClaimIds: [],
    window,
    totalMatching: 0,
    sampled: false,
    retrievalMode: "v2",
    rerankUsed: false,
    candidatesCount: 0,
    dataCurrentThrough: currency,
  };
}

/** No-evidence short-circuit payload (step 1): zero candidates AND zero entities.
 *  No rerank, no LLM. embedUsage is carried through — the vector arm may have billed
 *  even with zero results. `currency` is the one per-question read (may be null). */
function noEvidenceV2(retrieval: RetrievalV2Result, currency: string | null): AskAnswerV2 {
  return {
    answer: NO_EVIDENCE_MESSAGE,
    citedClaimIds: [],
    evidenceCount: 0,
    terms: retrieval.terms,
    provider: "none",
    state: "insufficient",
    relatedClaimIds: [],
    window: retrieval.window,
    totalMatching: retrieval.totalMatching,
    sampled: retrieval.totalMatching > askCandidates(),
    retrievalMode: retrieval.mode,
    usageByStage: { embed: retrieval.embedUsage },
    rerankUsed: false,
    candidatesCount: retrieval.claims.length,
    ...(currency != null ? { dataCurrentThrough: currency } : {}),
  };
}

/** Relevance-boundary short-circuit payload (Workstream D, 2026-07-13): a paid
 *  rerank ran and judged NONE of the candidates relevant, so the expensive
 *  answer model is never called and no irrelevant evidence reaches the user —
 *  zero citations, zero related claims, an honest denial-led answer. The billed
 *  embed + rerank usage is preserved (usageByStage) and rerankModel recorded,
 *  mirroring assembleV2, so the ledger's stage columns stay truthful. */
function noRelevantEvidenceV2(
  retrieval: RetrievalV2Result,
  ranked: RankedEvidence,
  currency: string | null,
): AskAnswerV2 {
  return {
    answer: insufficientEvidenceCopy(currency),
    citedClaimIds: [],
    evidenceCount: 0,
    terms: retrieval.terms,
    provider: "none",
    state: "insufficient",
    relatedClaimIds: [],
    window: retrieval.window,
    totalMatching: retrieval.totalMatching,
    sampled: retrieval.totalMatching > askCandidates(),
    retrievalMode: retrieval.mode,
    usageByStage: { embed: retrieval.embedUsage, rerank: ranked.rerankUsage },
    rerankUsed: ranked.rerankUsed,
    candidatesCount: retrieval.claims.length,
    relevantCount: 0,
    ...(ranked.rerankUsage ? { rerankModel: askRerankModel() } : {}),
    ...(currency != null ? { dataCurrentThrough: currency } : {}),
  };
}

/** Requirement D5: when the reranker reports a positive relevance boundary, only
 *  the relevant prefix reaches the answer stage — floored at
 *  askRelevantEvidenceFloor() (a guard against reranker underestimation on
 *  genuinely answerable questions), never widened beyond the ranked pool. No-op
 *  when the boundary is off, the rerank fell back, or the count is unknown. */
export function trimToRelevantPrefix(ranked: RankedEvidence): RankedEvidence {
  if (!askRelevanceBoundaryEnabled()) return ranked;
  const rc = ranked.relevantCount;
  if (!ranked.rerankUsed || rc === undefined || rc <= 0) return ranked;
  const keep = Math.min(ranked.claims.length, Math.max(rc, askRelevantEvidenceFloor()));
  if (keep >= ranked.claims.length) return ranked;
  return { ...ranked, claims: ranked.claims.slice(0, keep) };
}

/** Assemble the final AskAnswerV2 from the answer-stage outcome. Centralizes the
 *  SACRED citation filter (ids parsed from the answer, kept only if present in
 *  ranked.claims — the evidence actually shown to the model — deduped) and the
 *  related-claims list (ranked order minus cited, first 10).
 *
 *  Stage-model fields (contract addendum): candidatesCount is the pre-rerank pool
 *  size (retrieval.claims.length); rerankModel is set ONLY when a rerank call was
 *  billed (ranked.rerankUsage present — even if its output was discarded);
 *  answerModel is set ONLY when a paid answer call was billed (passed by the caller;
 *  undefined on the offline/budget paths and when the call threw before billing). */
function assembleV2(
  retrieval: RetrievalV2Result,
  ranked: RankedEvidence,
  answer: string,
  rawCitedIds: number[],
  provider: string,
  state: AnswerState,
  answerUsage: StageUsage | undefined,
  answerModel: string | undefined,
  dataCurrentThrough: string | null,
): AskAnswerV2 {
  const validIds = new Set(ranked.claims.map((c) => c.claimId));
  let citedClaimIds = filterCitations(rawCitedIds, validIds);
  // Deterministic post-answer state correction (Workstream D): a paid reply that
  // BEGINS with the recognized insufficient-evidence language is an insufficient
  // outcome — persist and render it as such, with citations stripped and the
  // related-claims block omitted (an insufficient answer shows no adjacent
  // evidence). The ANSWER TEXT is replaced too (2026-07-13 remediation): the
  // model's own denial may go on to summarize and cite unrelated retrieved
  // claims (the Antarctic defect), and clearing citedClaimIds alone left that
  // prose — literal [cN] markers included — visible in the rendered answer.
  // Deterministic replacement is the guarantee; provider/usage/model fields
  // stay truthful (the call was billed). A provider safety refusal never
  // reaches this branch: the refusal field routes to state "refused" before
  // content is parsed.
  if (state === "answered" && beginsWithDenial(answer)) {
    state = "insufficient";
    citedClaimIds = [];
    answer = insufficientEvidenceCopy(dataCurrentThrough);
  }
  // Phase 3 Increment A — the ruling-20 named-person source-fidelity matrix
  // (identity, predicate, certainty/attribution, status/timing) over every
  // name-bearing cited sentence. A failing sentence is REPLACED by the
  // deterministic cited-claim wording (never name suppression); a faithful
  // answer passes through byte-identical. Whole-answer release: this runs
  // before anything renders. Rollback: ASK_FIDELITY_FALLBACK=0.
  if (state === "answered" && fidelityFallbackEnabled()) {
    const evidenceById = new Map<number, FidelityEvidence>(
      ranked.claims.map((c) => [c.claimId, { claimId: c.claimId, text: c.text, hedging: c.hedging }]),
    );
    const applied = applyFidelityFallback(answer, evidenceById);
    if (applied.replacedCount > 0) {
      answer = applied.text;
      // replacements may add/remove markers — re-derive through the same filter
      citedClaimIds = filterCitations(parseCitedIds(answer), validIds);
    }
  }
  const citedSet = new Set(citedClaimIds);
  // relevance-floored, capped RELATED_MAX (W4) — see related.ts for the calibration.
  const relatedClaimIds =
    state === "insufficient" ? [] : selectRelatedClaimIds(ranked.claims, citedSet);
  const rerankModel = ranked.rerankUsage ? askRerankModel() : undefined;
  return {
    answer,
    citedClaimIds,
    evidenceCount: ranked.claims.length + retrieval.entities.length,
    terms: retrieval.terms,
    provider,
    state,
    relatedClaimIds,
    window: retrieval.window,
    totalMatching: retrieval.totalMatching,
    sampled: retrieval.totalMatching > askCandidates(),
    retrievalMode: retrieval.mode,
    usage: answerUsage,
    usageByStage: { embed: retrieval.embedUsage, rerank: ranked.rerankUsage, answer: answerUsage },
    rerankUsed: ranked.rerankUsed,
    candidatesCount: retrieval.claims.length,
    ...(ranked.relevantCount !== undefined ? { relevantCount: ranked.relevantCount } : {}),
    // omit the model keys entirely (not undefined) when the stage ran no paid call
    ...(rerankModel !== undefined ? { rerankModel } : {}),
    ...(answerModel !== undefined ? { answerModel } : {}),
    ...(dataCurrentThrough != null ? { dataCurrentThrough } : {}),
  };
}

/** V2 answer stage over already-ranked evidence. Exported so the eval runner (F2) can
 *  compose retrieveV2 -> rerankCandidates -> this directly. Never throws for a user
 *  surface: budget stops degrade deterministically, provider errors become state
 *  "error" (ruling 9).
 *
 *  opts.timings (Phase 0, optional): answerMs = the paid-call boundary (guard
 *  init/reserve, the chat completion, guard record — what the user actually waits
 *  on); validateMs = the synchronous post-response citation-parse + assembly.
 *  Timing wraps AROUND the existing metering statements; it never reorders them
 *  (ruling 8's record-before-body-read discipline is untouched). Offline, budget,
 *  and short-circuit paths record no answerMs — no paid boundary ran. */
export async function answerFromEvidence(
  question: string,
  retrieval: RetrievalV2Result,
  ranked: RankedEvidence,
  opts?: {
    timings?: StageTimings;
    guards?: AskStageGuards;
    /** Phase 3 Increment B: with a real sink AND ASK_STREAM_ANSWER=1, the paid
     *  call streams with buffered validated section release; the terminal
     *  payload still goes through the identical whole-answer path. */
    sink?: RunEventSink;
    runId?: string;
  },
): Promise<AskAnswerV2> {
  const timings = opts?.timings;
  // One currency read per question (cached; fail-soft to null). Threaded onto every
  // outcome so the freshness-honest UI callout works, and stated to the model below.
  const currency = await safeCurrency();

  // Defensive no-evidence guard for direct callers (ask() short-circuits before rerank).
  if (ranked.claims.length === 0 && retrieval.entities.length === 0) {
    return noEvidenceV2(retrieval, currency);
  }

  // Relevance boundary (Workstream D): a successful paid rerank that judged NO
  // candidate relevant stops HERE — before the expensive answer model — instead
  // of paying gpt-5 to summarize unrelated evidence. Lives in this function (not
  // only ask()) so the eval runner's direct retrieveV2→rerank→answerFromEvidence
  // composition gets the identical behavior. Fail-open: an unknown relevantCount
  // (fallback/offline rerank) never triggers. Rollback: ASK_RELEVANCE_BOUNDARY=0.
  if (askRelevanceBoundaryEnabled() && ranked.rerankUsed && ranked.relevantCount === 0) {
    return noRelevantEvidenceV2(retrieval, ranked, currency);
  }

  // D5: with a positive boundary, only the relevant prefix (floored) reaches the
  // model, the citation filter, and the related-claims selection below.
  ranked = trimToRelevantPrefix(ranked);

  // Offline / deterministic: an honest answer from real claims, provider "stub" (§9).
  // No paid answer call, so answerModel stays absent.
  if (answerOffline()) {
    const det = deterministicAnswer(ranked.claims, retrieval.entities);
    return assembleV2(retrieval, ranked, det.answer, det.citedClaimIds, "stub", "answered", undefined, undefined, currency);
  }

  const model = askAnswerModel();

  // ---- Phase 3 Increment B: streaming variant (flagged, progressive-only) ----
  // Reserve/metering live INSIDE streamAnswer (one reservation, settled exactly
  // once on every exit); the outcome maps through classifyCompletion + the SAME
  // assembleV2 terminal path as the non-streaming branch below — the released
  // sections were validated by the identical validator functions, and the
  // terminal payload governs the client render (structural reconciliation).
  const sink = opts?.sink;
  if (sink && sink !== NULL_EVENT_SINK && askStreamAnswer()) {
    const tStream = monotonicMs();
    const controller = new AbortController();
    const stopWatch = opts?.runId
      ? watchCancelMarker(opts.runId, () => controller.abort())
      : () => {};
    let streamOutcome: StreamOutcome | null = null;
    try {
      const outcome = await streamAnswer({
        model,
        messages: [
          { role: "system", content: SYSTEM_V2 },
          {
            role: "user",
            content: `Question: ${question}\n\nEvidence:\n${evidenceBlockV2(ranked, retrieval)}${currencyContextLine(currency, retrieval.window)}`,
          },
        ],
        maxOutputTokens: answerMaxOutputTokens(),
        ranked,
        sink,
        guards: opts?.guards,
        signal: controller.signal,
      });
      streamOutcome = outcome;
      recordStage(timings, "answerMs", monotonicMs() - tStream);
      await sink.emit("answer.validating", {});
      if (outcome.cancelled) {
        // The route maps provider "cancelled" to the run.cancelled terminal.
        return assembleV2(retrieval, ranked, CANCELLED_MESSAGE, [], "cancelled", "error", outcome.usage, model, currency);
      }
      if (outcome.finishReason === "error" && outcome.refusal === "") {
        // The stream DIED (synthetic marker) — with or without partial
        // content this is an interrupted transport, never a model refusal
        // (Gate 3 finding: an instantly-dead stream previously fell through
        // to classifyCompletion, whose empty-content mapping told the user
        // "the model declined" and skewed refusal accounting). A stream that
        // accumulated a genuine refusal keeps the refusal mapping below.
        // No silent provider switch, no merged prose (§6.3.4); the terminal
        // payload replaces any streamed sections client-side.
        return assembleV2(
          retrieval,
          ranked,
          "Query failed: the answer stream was interrupted. Evidence was retrieved; try again.",
          [],
          "error",
          "error",
          outcome.usage,
          model,
          currency,
        );
      }
      const terminal = classifyCompletion({
        message: { content: outcome.content, refusal: outcome.refusal || null },
        finish_reason: outcome.finishReason ?? undefined,
      });
      if (terminal === "refused" || terminal === "empty_refused") {
        return assembleV2(retrieval, ranked, REFUSED_MESSAGE, [], `openai:${model}`, "refused", outcome.usage, model, currency);
      }
      if (terminal === "truncated") {
        return assembleV2(retrieval, ranked, TRUNCATED_MESSAGE, [], `openai:${model}`, "error", outcome.usage, model, currency);
      }
      return timeStageSync(timings, "validateMs", () => {
        const cited = parseCitedIds(outcome.content);
        return assembleV2(retrieval, ranked, outcome.content, cited, `openai:${model}`, "answered", outcome.usage, model, currency);
      });
    } catch (e) {
      recordStage(timings, "answerMs", monotonicMs() - tStream);
      if (e instanceof LlmBudgetError) {
        const det = deterministicAnswer(ranked.claims, retrieval.entities);
        return assembleV2(retrieval, ranked, det.answer, det.citedClaimIds, "budget", "answered", undefined, undefined, currency);
      }
      // Billed-usage attribution parity with the non-streaming catch (Gate 3
      // finding): a dispatch failure settled the ceiling inside streamAnswer
      // (StreamDispatchError carries it), and a post-settlement throw (e.g.
      // the answer.validating persist) follows a fully settled stream — both
      // report what was billed instead of dropping usage/model.
      const billedUsage =
        e instanceof StreamDispatchError ? e.settledUsage : (streamOutcome?.usage ?? undefined);
      return assembleV2(
        retrieval,
        ranked,
        `Query failed: ${e instanceof Error ? e.message : e}. Evidence was retrieved; try again.`,
        [],
        "error",
        "error",
        billedUsage,
        billedUsage !== undefined ? model : undefined,
        currency,
      );
    } finally {
      stopWatch();
    }
  }

  // Set to `model` only once a billed answer call has actually happened (after
  // record()). The catch below then reports answerModel for an error-after-call while
  // leaving it absent when the call threw before billing (contract addendum).
  let billedAnswerModel: string | undefined;
  const tAnswer = monotonicMs();
  try {
    // Phase 1 seam: enforce mode injects an atomic reservation-backed guard with
    // the SAME surface. The reserve/record lifecycle now runs INSIDE the
    // adapter (Phase 5); a budget refusal throws LlmBudgetError BEFORE any
    // dispatch and the catch below degrades to the deterministic path with
    // provider "budget" — never an unguarded call (standing ruling 4).
    const guard = opts?.guards?.answer ?? askGuardFromEnv();

    // Phase 5: the guarded dispatch (reserve → call → record) moved VERBATIM
    // into the OpenAI adapter — one gateway primitive, identical discipline
    // (ruling 8's record-before-body-read included).
    const r = await openaiGeneration.generate(
      {
        model,
        messages: [
          { role: "system", content: SYSTEM_V2 },
          {
            role: "user",
            content: `Question: ${question}\n\nEvidence:\n${evidenceBlockV2(ranked, retrieval)}${currencyContextLine(currency, retrieval.window)}`,
          },
        ],
        maxOutputTokens: answerMaxOutputTokens(),
        reasoningEffort: "low",
      },
      guard,
    );
    billedAnswerModel = model; // a paid answer call has now been billed
    // The paid boundary is complete (metered): record its duration before any
    // interpretation of the body begins.
    recordStage(timings, "answerMs", monotonicMs() - tAnswer);
    const answerUsage: StageUsage = r.usage;

    // The shared terminal classification (validator.ts) — the identical mapping
    // the streaming path (Increment B) applies, so the two cannot drift.
    const terminal = classifyCompletion({
      message: { content: r.content, refusal: r.refusal },
      finish_reason: r.finishReason ?? undefined,
    });
    if (terminal === "refused" || terminal === "empty_refused") {
      // Explicit decline / empty content without a length stop — billed, so
      // usage AND answerModel are still reported (D7).
      return assembleV2(retrieval, ranked, REFUSED_MESSAGE, [], `openai:${model}`, "refused", answerUsage, billedAnswerModel, currency);
    }
    if (terminal === "truncated") {
      // Truncation, NOT a refusal: reasoning tokens consumed the whole
      // max_completion_tokens budget before any content was emitted (observed live on
      // broad questions). Distinct state + message; billed, so usage/answerModel
      // still reported.
      return assembleV2(retrieval, ranked, TRUNCATED_MESSAGE, [], `openai:${model}`, "error", answerUsage, billedAnswerModel, currency);
    }
    const content = r.content!;

    return timeStageSync(timings, "validateMs", () => {
      const cited = parseCitedIds(content);
      return assembleV2(retrieval, ranked, content, cited, `openai:${model}`, "answered", answerUsage, billedAnswerModel, currency);
    });
  } catch (e) {
    // A budget stop degrades (never surfaces as an error); any other throw is state
    // "error" with today's message shape — never a 500 for a user surface (ruling 9).
    // billedAnswerModel is set only if the call already billed (error-after-call).
    // Record the failed boundary's duration ONLY if the success path hasn't already
    // recorded the metered value — a throw AFTER guard.record (e.g. inside the
    // validation block) must not overwrite the paid-boundary duration with one that
    // includes validation time (Gate 0 finding). On error rows answerMs therefore
    // means "time in the answer boundary until it failed" (documented in timings.ts).
    // Budget refusals (thrown by the adapter BEFORE dispatch since Phase 5)
    // record no answerMs — no paid boundary ran (the Gate 0 contract).
    if (!(e instanceof LlmBudgetError) && timings && timings.answerMs === undefined) {
      recordStage(timings, "answerMs", monotonicMs() - tAnswer);
    }
    if (e instanceof LlmBudgetError) {
      const det = deterministicAnswer(ranked.claims, retrieval.entities);
      return assembleV2(retrieval, ranked, det.answer, det.citedClaimIds, "budget", "answered", undefined, undefined, currency);
    }
    return assembleV2(
      retrieval,
      ranked,
      `Query failed: ${e instanceof Error ? e.message : e}. Evidence was retrieved; try again.`,
      [],
      "error",
      "error",
      undefined,
      billedAnswerModel,
      currency,
    );
  }
}

/** ASK entry point (consumed by src/lib/ask/limits.ts). Dispatches on ASK_PIPELINE:
 *  the legacy rollback vs the v2 pipeline.
 *
 *  opts.timings (Phase 0, optional): the request-scoped stage collector minted by
 *  askWithLimits. Stage keys land as each boundary completes; a stage that throws
 *  still leaves its predecessors recorded (the collector is shared by reference).
 *  Absent (eval runner / direct callers) every timing wrapper is a no-op.
 *
 *  opts.sink + opts.snapshotRunId (Phase 2, optional): the run-event sink for the
 *  progressive transport (contract: docs/designs/ASK-RUN-EVENTS-TRANSPORT-2026-07-19.md).
 *  With a real sink the v2 path emits the retrieval/rerank/answer lifecycle events
 *  (persist-then-emit — a sink failure THROWS and the run downgrades honestly),
 *  prefetches source-doc ids CONCURRENTLY with the rerank call, and freezes the
 *  F11-safe EvidenceSnapshot onto the run row. With the NULL sink (the server
 *  action / eval runner) none of that runs and behavior is byte-identical to
 *  Phase 1. The composition itself is shared — this function IS the orchestrator;
 *  no duplicate business rules exist (registered structural decision). */
export async function ask(
  question: string,
  opts?: {
    timings?: StageTimings;
    guards?: AskStageGuards;
    sink?: RunEventSink;
    snapshotRunId?: string;
  },
): Promise<AskAnswerV2> {
  const timings = opts?.timings;
  const sink = opts?.sink ?? NULL_EVENT_SINK;
  const progressive = sink !== NULL_EVENT_SINK;
  if (askPipeline() !== "v2") {
    // Legacy rollback path stays measurement-free by design (DL-6: nothing
    // "improved"); the row still carries run_id/started_at/pipelineMs from
    // askWithLimits. No lifecycle events either (ASK_PIPELINE=legacy is the
    // emergency rollback; combining it with the progressive client is the
    // registered degenerate combination — the terminal event still fires).
    return toV2FromLegacy(await legacyAnswer(question));
  }

  // Deterministic no-coverage short-circuit ($0) BEFORE retrieveV2 — no embed, no
  // rerank, no answer call. Fires ONLY when the parsed window begins entirely after
  // the corpus's newest claim (window.from > currency, strict yyyy-mm-dd compare); a
  // window that straddles or predates currency runs the real pipeline. Fail-open:
  // currency null (no DB) never short-circuits. Rollback: ASK_NO_COVERAGE_SHORTCIRCUIT=0.
  const currency = await timeStage(timings, "currencyMs", safeCurrency);
  if (askNoCoverageShortcircuit() && currency != null) {
    const window = parseTimeWindow(question);
    if (window?.from && window.from > currency) {
      return noCoverageShortcircuit(window, window.from, currency);
    }
  }

  const retrieval = await retrieveV2(question, {
    timings,
    embedGuard: opts?.guards?.embed,
    ...(progressive
      ? {
          onLexicalPartial: (partial: { claims: CandidateClaim[]; totalMatching: number }) =>
            sink.emit("retrieval.lexical_partial", {
              claims: partial.claims.slice(0, LEXICAL_PARTIAL_MAX).map((c) => toSnapshotClaim(c)),
              totalMatching: partial.totalMatching,
            }),
        }
      : {}),
  });
  // No-evidence short-circuit BEFORE rerank/LLM (step 1): no paid call at all.
  if (retrieval.claims.length === 0 && retrieval.entities.length === 0) {
    if (progressive) {
      await sink.emit("retrieval.completed", {
        candidatesCount: 0,
        totalMatching: retrieval.totalMatching,
        uniqueSources: 0,
        mode: retrieval.mode,
        window: retrieval.window,
        currentThrough: currency,
      });
    }
    return noEvidenceV2(retrieval, currency);
  }

  // Phase 2: the source-doc prefetch (snapshot + uniqueSources) runs CONCURRENT
  // with the rerank call — it must never delay the paid pipeline. Progressive-only.
  const sourceDocsPromise = progressive ? fetchSourceDocIds(retrieval.claims) : null;
  const rankedPromise = timeStage(timings, "rerankMs", () =>
    rerankCandidates(question, retrieval.claims, undefined, opts?.guards?.rerank),
  );

  let sourceDocs: Map<number, number[]> | null = null;
  if (progressive && sourceDocsPromise) {
    sourceDocs = await sourceDocsPromise;
    const uniqueSources = new Set([...sourceDocs.values()].flat()).size;
    await sink.emit("retrieval.completed", {
      candidatesCount: retrieval.claims.length,
      totalMatching: retrieval.totalMatching,
      uniqueSources,
      mode: retrieval.mode,
      window: retrieval.window,
      currentThrough: currency,
    });
  }

  const ranked = await rankedPromise;

  if (progressive) {
    if (ranked.rerankUsed) {
      await sink.emit("rerank.completed", {
        selectedClaimIds: ranked.claims.map((c) => c.claimId),
        ...(ranked.relevantCount !== undefined ? { relevantCount: ranked.relevantCount } : {}),
      });
    } else {
      const reasonClass =
        retrieval.claims.length <= askEvidenceK()
          ? "pool_fits"
          : rerankOfflineReason() !== null
            ? "offline"
            : "fallback";
      await sink.emit("rerank.skipped", { reasonClass });
    }
    // Freeze the F11-safe snapshot (claim CONTENT + stable doc ids) onto the run
    // row. Fail-soft (registered): a lost snapshot costs Phase 4/6 reuse for this
    // run, never the answer.
    if (opts?.snapshotRunId && sourceDocs) {
      const snapshot: EvidenceSnapshot = {
        version: 1,
        retrievalMode: retrieval.mode,
        window: retrieval.window,
        totalMatching: retrieval.totalMatching,
        candidatesCount: retrieval.claims.length,
        corpusCurrentThrough: currency,
        candidates: retrieval.claims.map((c) => toSnapshotClaim(c, sourceDocs!.get(c.claimId) ?? [])),
        selectedClaimIds: ranked.claims.map((c) => c.claimId),
        ...(ranked.relevantCount !== undefined ? { relevantCount: ranked.relevantCount } : {}),
      };
      await persistEvidenceSnapshot(opts.snapshotRunId, snapshot);
    }
    await sink.emit("answer.started", {});
  }

  return answerFromEvidence(question, retrieval, ranked, {
    timings,
    guards: opts?.guards,
    // Phase 3: the streaming variant activates only with a real sink AND the
    // ASK_STREAM_ANSWER flag; runId feeds the cancel-marker watch.
    ...(progressive ? { sink, runId: opts?.snapshotRunId } : {}),
  });
}

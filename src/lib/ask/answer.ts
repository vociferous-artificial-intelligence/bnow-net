import OpenAI from "openai";
import { askGuardFromEnv, isLlmDisabled, LlmBudgetError } from "../usage/llm-guard";
import { envNum } from "../usage/spend-guard";
import { retrieve, type RetrievalResult, type RetrievedEntity } from "./retrieve";
import { retrieveV2 } from "./retrieve-v2";
import { rerankCandidates } from "./rerank";
import { estimateCostUsd } from "./limits";
import { askAnswerModel, askCandidates, askPipeline, askRerankModel } from "./config";
import { chatParamsForModel } from "./llm-params";
import type {
  AnswerState,
  AskAnswerV2,
  CandidateClaim,
  RankedEvidence,
  RetrievalV2Result,
  StageUsage,
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

  const client = new OpenAI();
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  try {
    const completion = await client.chat.completions.create({
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

/** No-evidence short-circuit payload (step 1): zero candidates AND zero entities.
 *  No rerank, no LLM. embedUsage is carried through — the vector arm may have billed
 *  even with zero results. */
function noEvidenceV2(retrieval: RetrievalV2Result): AskAnswerV2 {
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
  };
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
): AskAnswerV2 {
  const validIds = new Set(ranked.claims.map((c) => c.claimId));
  const citedClaimIds = [...new Set(rawCitedIds)].filter((id) => validIds.has(id));
  const citedSet = new Set(citedClaimIds);
  const relatedClaimIds = ranked.claims
    .map((c) => c.claimId)
    .filter((id) => !citedSet.has(id))
    .slice(0, 10);
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
    // omit the model keys entirely (not undefined) when the stage ran no paid call
    ...(rerankModel !== undefined ? { rerankModel } : {}),
    ...(answerModel !== undefined ? { answerModel } : {}),
  };
}

/** V2 answer stage over already-ranked evidence. Exported so the eval runner (F2) can
 *  compose retrieveV2 -> rerankCandidates -> this directly. Never throws for a user
 *  surface: budget stops degrade deterministically, provider errors become state
 *  "error" (ruling 9). */
export async function answerFromEvidence(
  question: string,
  retrieval: RetrievalV2Result,
  ranked: RankedEvidence,
): Promise<AskAnswerV2> {
  // Defensive no-evidence guard for direct callers (ask() short-circuits before rerank).
  if (ranked.claims.length === 0 && retrieval.entities.length === 0) {
    return noEvidenceV2(retrieval);
  }

  // Offline / deterministic: an honest answer from real claims, provider "stub" (§9).
  // No paid answer call, so answerModel stays absent.
  if (answerOffline()) {
    const det = deterministicAnswer(ranked.claims, retrieval.entities);
    return assembleV2(retrieval, ranked, det.answer, det.citedClaimIds, "stub", "answered", undefined, undefined);
  }

  const model = askAnswerModel();
  // Set to `model` only once a billed answer call has actually happened (after
  // record()). The catch below then reports answerModel for an error-after-call while
  // leaving it absent when the call threw before billing (contract addendum).
  let billedAnswerModel: string | undefined;
  try {
    const guard = askGuardFromEnv();
    await guard.init();
    // Reserve BEFORE the billed call; a refusal degrades to the deterministic path with
    // provider "budget" — never an unguarded call (standing ruling 4). No call => no
    // answerModel.
    const reserve = guard.tryReserve();
    if (!reserve.ok) {
      const det = deterministicAnswer(ranked.claims, retrieval.entities);
      return assembleV2(retrieval, ranked, det.answer, det.citedClaimIds, "budget", "answered", undefined, undefined);
    }

    const client = new OpenAI();
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Question: ${question}\n\nEvidence:\n${evidenceBlockV2(ranked, retrieval)}` },
      ],
      ...chatParamsForModel(model, answerMaxOutputTokens(), { reasoningEffort: "low" }),
    });

    // Meter AFTER the request but BEFORE any read of the response body, so even a
    // shape-anomalous completion (no choices) is recorded — it was billed in full
    // (ruling 8; same discipline as rerank.ts post-review).
    const promptTokens = completion.usage?.prompt_tokens ?? 0;
    const completionTokens = completion.usage?.completion_tokens ?? 0;
    const costUsd = estimateCostUsd(model, promptTokens, completionTokens);
    await guard.record(1, promptTokens + completionTokens, costUsd);
    billedAnswerModel = model; // a paid answer call has now been billed
    const answerUsage: StageUsage = { promptTokens, completionTokens, costUsd };
    const choice = completion.choices?.[0];

    const refusal = choice?.message?.refusal;
    const content = choice?.message?.content;
    const emptyContent = content == null || content.trim() === "";
    if (refusal != null && refusal.trim() !== "") {
      // Explicit decline — billed, so usage AND answerModel are still reported (D7).
      return assembleV2(retrieval, ranked, REFUSED_MESSAGE, [], `openai:${model}`, "refused", answerUsage, billedAnswerModel);
    }
    if (emptyContent && choice?.finish_reason === "length") {
      // Truncation, NOT a refusal: reasoning tokens consumed the whole
      // max_completion_tokens budget before any content was emitted (observed live on
      // broad questions). Distinct state + message; billed, so usage/answerModel
      // still reported.
      return assembleV2(retrieval, ranked, TRUNCATED_MESSAGE, [], `openai:${model}`, "error", answerUsage, billedAnswerModel);
    }
    if (emptyContent) {
      // Empty content without a length stop — treated as a decline (D7).
      return assembleV2(retrieval, ranked, REFUSED_MESSAGE, [], `openai:${model}`, "refused", answerUsage, billedAnswerModel);
    }

    const cited = [...content.matchAll(/\[c(\d+)\]/g)].map((m) => parseInt(m[1], 10));
    return assembleV2(retrieval, ranked, content, cited, `openai:${model}`, "answered", answerUsage, billedAnswerModel);
  } catch (e) {
    // A budget stop degrades (never surfaces as an error); any other throw is state
    // "error" with today's message shape — never a 500 for a user surface (ruling 9).
    // billedAnswerModel is set only if the call already billed (error-after-call).
    if (e instanceof LlmBudgetError) {
      const det = deterministicAnswer(ranked.claims, retrieval.entities);
      return assembleV2(retrieval, ranked, det.answer, det.citedClaimIds, "budget", "answered", undefined, undefined);
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
    );
  }
}

/** ASK entry point (consumed by src/lib/ask/limits.ts). Dispatches on ASK_PIPELINE:
 *  the legacy rollback vs the v2 pipeline. */
export async function ask(question: string): Promise<AskAnswerV2> {
  if (askPipeline() !== "v2") {
    return toV2FromLegacy(await legacyAnswer(question));
  }

  const retrieval = await retrieveV2(question);
  // No-evidence short-circuit BEFORE rerank/LLM (step 1): no paid call at all.
  if (retrieval.claims.length === 0 && retrieval.entities.length === 0) {
    return noEvidenceV2(retrieval);
  }
  const ranked = await rerankCandidates(question, retrieval.claims);
  return answerFromEvidence(question, retrieval, ranked);
}

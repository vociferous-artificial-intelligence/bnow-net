import OpenAI from "openai";
import type { CandidateClaim, RankedEvidence, StageUsage } from "./types";
import { askEvidenceK, askRerankModel } from "./config";
import { estimateCostUsd } from "./limits";
import { isLlmDisabled, askGuardFromEnv } from "../usage/llm-guard";
import { chatParamsForModel } from "./llm-params";

// ASK Tier-2+ rerank stage (workstream C). A single listwise LLM pass that
// reorders the composite-ranked candidate pool by question relevance, keeping the
// top K for the answer stage. Money-path-adjacent, so it is built to fail SAFE:
// the rerank NEVER fails the question. On any failure — offline, guard refusal,
// provider error, malformed/empty/short response — it falls back to the
// deterministic composite-score top-K order (rerankUsed=false). The citation
// filter of the answer stage is extended here: the model may only reorder ids
// that were in the candidate set; unknown ids are dropped, duplicates deduped.
//
// The paid call is guarded like every other OpenAI call site (standing ruling 4):
// guard.init() + tryReserve() BEFORE the request, record() AFTER — INCLUDING a
// response whose output we then discard, which OpenAI still bills (ruling 8).

/** Per-candidate text budget in the compact serialization (spec D7). */
export const RERANK_SNIPPET_CHARS = 200;

/** Output-token ceiling handed to chatParamsForModel. 60 ids + JSON overhead is
 *  < 500 tokens; 2000 covers a gpt-5-mini reasoning-token allowance inside
 *  max_completion_tokens without letting a runaway generation bill in full. */
export const RERANK_MAX_OUTPUT_TOKENS = 2000;

/** Non-null reason string when the stage must skip the paid call and take the
 *  deterministic composite fallback; null when a real (guarded) call is allowed.
 *  Same fail-toward-offline contract as the embed client and /ask answer path. */
export function rerankOfflineReason(): string | null {
  if (isLlmDisabled()) return "LLM_DISABLE=1";
  if (process.env.ANALYSIS_PROVIDER === "stub") return "ANALYSIS_PROVIDER=stub";
  if (!process.env.OPENAI_API_KEY) return "no OPENAI_API_KEY";
  return null;
}

/** One candidate as a single tab-separated line: id, date, iso2, snippet. Text is
 *  whitespace-collapsed and clipped to RERANK_SNIPPET_CHARS. */
export function serializeCandidate(c: CandidateClaim): string {
  const text = c.text.replace(/\s+/g, " ").trim().slice(0, RERANK_SNIPPET_CHARS);
  return `${c.claimId}\t${c.claimDate ?? "undated"}\t${c.countryIso2}\t${text}`;
}

/** The candidate block: a one-line column header then one line per candidate, in
 *  the composite order they were passed in. */
export function serializeCandidates(candidates: CandidateClaim[]): string {
  return ["id\tdate\tiso2\ttext", ...candidates.map(serializeCandidate)].join("\n");
}

/** Strict JSON-schema for the listwise response: an ids array of EXACTLY k
 *  integers, pinned minItems = maxItems = k (standing ruling 7: constrained
 *  decoding is the under-fill fix, prompt wording is not — a min-1 schema let
 *  gpt-5-mini return 0–24 ids on most live k=60/k=100 calls, billing a ranking
 *  the < ceil(k/2) gate then discarded). A paid call only happens when
 *  candidates.length > k, so k ids always exist to return.
 *
 *  relevant_count (Workstream D, 2026-07-13): the exact-K constraint FORCES
 *  irrelevant padding into the tail on off-topic questions, so the schema also
 *  requires an explicit relevance boundary — how many LEADING ids actually
 *  address the question (0..k, bounded; required because strict structured
 *  outputs reject optional properties). This keeps the constrained-decoding
 *  under-fill fix while giving the model a genuine "none of these" channel. */
export function rerankResponseSchema(k: number) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      ids: {
        type: "array",
        minItems: k,
        maxItems: k,
        items: { type: "integer" },
      },
      relevant_count: {
        type: "integer",
        minimum: 0,
        maximum: k,
      },
    },
    required: ["ids", "relevant_count"],
  };
}

export function rerankSystemPrompt(k: number): string {
  return `You are a relevance ranker for an OSINT question-answering system.
You are given a question and a list of candidate claims, one per line, tab-separated
with columns: id, date, iso2, text.

Return STRICT JSON of the form {"ids": [<int>, ...], "relevant_count": <int>}: EXACTLY
the ${k} most relevant claim ids for answering the question, in order, most relevant
first, plus relevant_count — how many ids at the FRONT of the list genuinely address
the question's subject.

HARD RULES:
1. Use ONLY ids that appear in the candidate list. Never invent ids.
2. Return EXACTLY ${k} ids, most relevant first, no duplicates. Every genuinely
   relevant id must come before every irrelevant one.
3. relevant_count is the number of leading ids that actually bear on the question's
   subject. Set relevant_count to 0 when NONE of the candidates address it — the ids
   array is then pure filler ordering, and that is the correct, expected output for
   an off-topic question.
4. Output the JSON object only — no prose, no explanation, no code fences.`;
}

export function rerankUserMessage(question: string, candidates: CandidateClaim[]): string {
  return `Question: ${question}

Candidates (${candidates.length}):
${serializeCandidates(candidates)}`;
}

/** Parse a rerank response defensively. Tolerates the wrapper object
 *  {"ids":[...], "relevant_count": n} OR a bare array [...] (a model ignoring
 *  the wrapper). Coerces numeric strings and floats to integers; drops
 *  non-numeric id entries. Returns null when the payload is missing/empty/
 *  unparseable or carries no id array — every null routes to the composite
 *  fallback. relevantCount is null when absent/malformed/out-of-range — a null
 *  count means "unknown", and every consumer fails OPEN on unknown (the
 *  boundary never fires from a malformed count). */
export function parseRerankResponse(
  raw: string | null | undefined,
  k: number,
): { ids: number[]; relevantCount: number | null } | null {
  if (raw == null || raw.trim() === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const obj =
    parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as { ids?: unknown; relevant_count?: unknown })
      : null;
  const arr = Array.isArray(parsed) ? parsed : Array.isArray(obj?.ids) ? (obj!.ids as unknown[]) : null;
  if (arr === null) return null;
  const ids: number[] = [];
  for (const v of arr) {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (Number.isFinite(n)) ids.push(Math.trunc(n));
  }
  const rcRaw = obj?.relevant_count;
  const relevantCount =
    typeof rcRaw === "number" && Number.isInteger(rcRaw) && rcRaw >= 0 && rcRaw <= k
      ? rcRaw
      : null;
  return { ids, relevantCount };
}

/** Back-compat id-only view of parseRerankResponse (k irrelevant for ids). */
export function parseRerankIds(raw: string | null | undefined): number[] | null {
  return parseRerankResponse(raw, Number.MAX_SAFE_INTEGER)?.ids ?? null;
}

/** Deterministic composite-order top-K fallback. Candidates arrive in composite
 *  order (types.ts: retrieval returns them compositeScore DESC), so the top-K is
 *  a prefix slice. rerankUsage is threaded through when a paid call already
 *  happened — a discarded output was still billed (ruling 8). */
function compositeFallback(
  candidates: CandidateClaim[],
  k: number,
  rerankUsage?: StageUsage,
): RankedEvidence {
  return {
    claims: candidates.slice(0, Math.min(k, candidates.length)),
    rerankUsed: false,
    ...(rerankUsage ? { rerankUsage } : {}),
  };
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Reorder the candidate pool by question relevance, keeping the top `k`.
 *
 *  Short-circuits with NO paid call when: the pool already fits (length <= k) or
 *  the stage is offline (no key / stub / LLM_DISABLE). Otherwise one guarded LLM
 *  call ranks the candidates; its ids are validated against the candidate set
 *  (unknown dropped, duplicates deduped keeping first). If at least ceil(k/2)
 *  valid ids come back, the reranked prefix (topped up from composite order to
 *  reach min(k, pool)) is returned with rerankUsed=true; otherwise the composite
 *  fallback is returned (rerankUsed=false) — but the billed usage is still
 *  reported. */
export async function rerankCandidates(
  question: string,
  candidates: CandidateClaim[],
  k: number = askEvidenceK(),
): Promise<RankedEvidence> {
  // already fits — nothing to rank, no call
  if (candidates.length <= k) {
    return { claims: candidates.slice(), rerankUsed: false };
  }

  // offline — deterministic fallback, no guard, no call
  const offline = rerankOfflineReason();
  if (offline !== null) {
    return compositeFallback(candidates, k);
  }

  const model = askRerankModel();
  const cap = Math.min(k, candidates.length);
  const minValid = Math.ceil(k / 2);
  let rerankUsage: StageUsage | undefined;

  try {
    const guard = askGuardFromEnv();
    await guard.init();
    // Reserve BEFORE the billed request; a refusal takes the fallback WITHOUT a
    // call and WITHOUT usage — never an unguarded call (ruling 4).
    const reserve = guard.tryReserve();
    if (!reserve.ok) {
      console.warn(`ask rerank: budget refusal — ${reserve.reason}; composite fallback`);
      return compositeFallback(candidates, k);
    }

    const client = new OpenAI();
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: rerankSystemPrompt(k) },
        { role: "user", content: rerankUserMessage(question, candidates) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "rerank", schema: rerankResponseSchema(k) as never, strict: true },
      },
      ...chatParamsForModel(model, RERANK_MAX_OUTPUT_TOKENS, { reasoningEffort: "minimal" }),
    });

    // Meter before interpreting: even a malformed/empty response was billed for
    // every token it emitted (ruling 8). record() AFTER the request — and before
    // ANY read of the response body, so a shape-anomalous completion (no choices)
    // still lands in the ledger before the outer catch falls back.
    const promptTokens = completion.usage?.prompt_tokens ?? 0;
    const completionTokens = completion.usage?.completion_tokens ?? 0;
    const costUsd = estimateCostUsd(model, promptTokens, completionTokens);
    await guard.record(1, 1, costUsd);
    rerankUsage = { promptTokens, completionTokens, costUsd };

    const choice = completion.choices?.[0];
    const parsed = parseRerankResponse(choice?.message?.content, k);
    if (parsed === null) {
      console.warn("ask rerank: unparseable/empty response; composite fallback (usage recorded)");
      return compositeFallback(candidates, k, rerankUsage);
    }
    const { ids, relevantCount: rawRelevantCount } = parsed;

    // Validate ids against the candidate set: unknown dropped, dupes deduped
    // keeping first occurrence (the citation-filter invariant, extended to rerank).
    const byId = new Map(candidates.map((c) => [c.claimId, c]));
    const seen = new Set<number>();
    const ordered: CandidateClaim[] = [];
    for (const id of ids) {
      const c = byId.get(id);
      if (c === undefined || seen.has(id)) continue;
      seen.add(id);
      ordered.push(c);
    }

    // relevant_count refers to positions in the model's OWN list; ids dropped by
    // validation inside that prefix shrink the surviving count. null (malformed)
    // stays unknown — the relevance boundary then never fires (fail-open).
    let relevantCount: number | undefined;
    if (rawRelevantCount !== null) {
      const prefixSeen = new Set<number>();
      let valid = 0;
      for (const id of ids.slice(0, rawRelevantCount)) {
        if (byId.has(id) && !prefixSeen.has(id)) {
          prefixSeen.add(id);
          valid++;
        }
      }
      relevantCount = Math.min(valid, k);
    }

    if (ordered.length < minValid) {
      console.warn(
        `ask rerank: only ${ordered.length} valid ids (< ceil(k/2)=${minValid}); composite fallback (usage recorded)`,
      );
      return compositeFallback(candidates, k, rerankUsage);
    }

    // Top up from composite order for any shortfall, then trim to k.
    if (ordered.length < cap) {
      for (const c of candidates) {
        if (ordered.length >= cap) break;
        if (!seen.has(c.claimId)) {
          seen.add(c.claimId);
          ordered.push(c);
        }
      }
    }
    return {
      claims: ordered.slice(0, k),
      rerankUsed: true,
      rerankUsage,
      ...(relevantCount !== undefined ? { relevantCount } : {}),
    };
  } catch (e) {
    // Provider error or any unexpected throw. If a call already returned and was
    // metered, rerankUsage carries the billed usage; if it threw before that, no
    // usage is reported (nothing was billed that we can attribute).
    console.warn(`ask rerank: ${errMsg(e)}; composite fallback`);
    return compositeFallback(candidates, k, rerankUsage);
  }
}

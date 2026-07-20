// Pure, DB-free helpers for the ASK eval-set harvest tool (scripts/ask-eval-harvest.ts).
// No network, no DB, no LLM calls in this file — everything here is deterministic and
// fixture-testable. See docs/evals/README.md for the eval-set.json format this builds.

// ---- shapes --------------------------------------------------------------------

/** One claim row as read from the DB for harvesting (claims JOIN countries/digests/
 *  claim_entities). Field names mirror src/lib/ask/retrieve.ts's RetrievedClaim where
 *  they overlap. */
export interface HarvestClaimRow {
  id: number;
  text: string;
  countryIso2: string;
  track: string | null;
  claimDate: string | null;
  entities: string[];
}

/** Same shape as a question's `gold` entries — a claim reference frozen at harvest
 *  time. Claim ids are unstable (digest regeneration deletes/re-inserts claims), so
 *  the eval runner re-resolves gold by exact text match; the id is a hint only. */
export interface ClaimRef {
  claimIdAtHarvest: number;
  text: string;
  countryIso2: string;
  claimDate: string | null;
}

export type EvalQuestionType = "known-answer" | "temporal" | "negative" | "fidelity";

/** One inline evidence claim for a `fidelity` question (AI Search Phase 0,
 *  2026-07-19). Fidelity fixtures test the ANSWER stage's named-person
 *  source-fidelity behavior (standing ruling 20) with the evidence held fixed —
 *  the runner builds the ranked-evidence input from these rows directly, so
 *  retrieval and rerank never vary between models. Shape mirrors CandidateClaim
 *  minus the retrieval-computed scores. All fixture persons/organizations are
 *  FICTIONAL by policy — the fixtures test fidelity mechanics, not real-world
 *  facts, and a checked-in file must not assert claims about real people. */
export interface FidelityEvidenceClaim {
  /** synthetic id, unique within the question (never resolved against the DB) */
  claimId: number;
  text: string;
  /** confirmed | assessed | claimed | unverified | unknown */
  hedging: string;
  claimDate: string | null;
  countryIso2: string;
  track: string | null;
  entities: string[];
  confidence: number | null;
}

/** Deterministic gold contract for a fidelity question. The regex checks are a
 *  DELIBERATE heuristic proxy for the §4 source-fidelity matrix — good enough to
 *  reward accurate naming/exact official facts and to fail category, predicate,
 *  certainty, status, and identity strengthening on a scorecard; the structural
 *  per-sentence enforcement is Phase 3's AnswerValidator, not this. Patterns are
 *  applied case-insensitively to the rendered answer text. */
export interface FidelitySpec {
  evidence: FidelityEvidenceClaim[];
  /** every pattern must match the answer (the name, the exact supported fact) */
  mustMatch: string[];
  /** no pattern may match the answer (the strengthening failure modes) */
  mustNotMatch: string[];
  /** terminal states that count as correct; default ["answered"]. A case whose
   *  correct handling may honestly be a refusal-to-assert lists "insufficient"
   *  too. Over-suppression of a supported answer is a FAILURE by contract. */
  acceptStates?: string[];
  notes?: string;
}

export interface EvalQuestion {
  id: string;
  type: EvalQuestionType;
  question: string;
  gold: ClaimRef[];
  acceptableAlternates: ClaimRef[];
  windowExpected?: { from?: string; to?: string };
  /** present iff type === "fidelity" */
  fidelity?: FidelitySpec;
  notes?: string;
}

export interface CorpusStats {
  claimCount: number;
  minDate: string | null;
  maxDate: string | null;
}

export interface EvalSet {
  version: 1;
  createdAt: string;
  corpus: CorpusStats;
  questions: EvalQuestion[];
}

// ---- corpus stats ---------------------------------------------------------------

export function computeCorpusStats(rows: HarvestClaimRow[]): CorpusStats {
  const dates = [...rows.map((r) => r.claimDate).filter((d): d is string => !!d)].sort();
  return {
    claimCount: rows.length,
    minDate: dates[0] ?? null,
    maxDate: dates[dates.length - 1] ?? null,
  };
}

// ---- stratified sampling ---------------------------------------------------------

export interface StratifiedSampleOptions {
  /** how many claims to pick overall (default 25) */
  targetSize?: number;
  /** preference threshold, NOT a hard filter — longer claims score higher (default 60) */
  minTextLength?: number;
  /** near-duplicate detection window on the normalized text prefix (default 40) */
  dedupePrefixChars?: number;
}

/** Lowercase, strip punctuation, collapse whitespace, take a prefix. Used to drop
 *  near-duplicate claim texts (e.g. the same event reported by two mirrors) from the
 *  harvest sample — an exact-text eval question about either mirror is redundant. */
export function normalizedPrefix(text: string, chars = 40): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, chars);
}

function askabilityScore(row: HarvestClaimRow, minTextLength: number): number {
  let score = 0;
  if (row.entities.length > 0) score += 2; // entities give the LLM something concrete to paraphrase around
  if (row.text.length > minTextLength) score += 1; // longer claims are less likely to be a fragment
  return score;
}

interface Candidate {
  row: HarvestClaimRow;
  prefix: string;
  score: number;
}

interface TheaterCursor {
  /** this theater's (track, date) buckets, key-sorted; each bucket best-candidate-first */
  buckets: Candidate[][];
  /** inner round-robin rotation: which bucket this theater picks from next */
  nextBucket: number;
}

/** Stratified, deterministic sample — TWO-LEVEL round-robin: OUTER over theaters
 *  (sorted iso2), INNER over each theater's (track, date) buckets. Prefers askable
 *  claims (has entities, text length > minTextLength) and skips near-dupes by
 *  normalized text prefix.
 *
 *  Two-level on purpose (supervisor round-1 fix): the original single flat rotation
 *  over theater|track|date bucket keys starved whole theaters whenever the total
 *  bucket count reached targetSize — the alphabetically-first buckets (ae*, il*,
 *  ir*) filled every slot before ru/ua were ever reached. The outer theater loop
 *  guarantees every theater with candidates gets a pick each pass, so a theater can
 *  never be starved by another theater's bucket count or sort position.
 *
 *  Deterministic for a fixed input (no randomness): theaters and buckets sort by
 *  key; candidates by askability score, then text length, then lower id. */
export function stratifiedSample(
  rows: HarvestClaimRow[],
  opts: StratifiedSampleOptions = {},
): HarvestClaimRow[] {
  const targetSize = opts.targetSize ?? 25;
  const minTextLength = opts.minTextLength ?? 60;
  const prefixChars = opts.dedupePrefixChars ?? 40;

  const bucketsByTheater = new Map<string, Map<string, Candidate[]>>();
  for (const row of rows) {
    const buckets = bucketsByTheater.get(row.countryIso2) ?? new Map<string, Candidate[]>();
    const key = `${row.track ?? "_"}|${row.claimDate ?? "_"}`;
    const list = buckets.get(key) ?? [];
    list.push({ row, prefix: normalizedPrefix(row.text, prefixChars), score: askabilityScore(row, minTextLength) });
    buckets.set(key, list);
    bucketsByTheater.set(row.countryIso2, buckets);
  }

  const theaters: TheaterCursor[] = [...bucketsByTheater.keys()].sort().map((iso2) => ({
    buckets: [...bucketsByTheater.get(iso2)!.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, list]) =>
        // best candidate first within each bucket: higher askability score, then longer
        // text, then lower id (deterministic tiebreak — no reliance on insertion order)
        list.sort((a, b) => b.score - a.score || b.row.text.length - a.row.text.length || a.row.id - b.row.id),
      ),
    nextBucket: 0,
  }));

  const picked: HarvestClaimRow[] = [];
  const seenPrefixes = new Set<string>();

  // one pick from this theater, rotating through its buckets; null when exhausted
  const pickFromTheater = (t: TheaterCursor): HarvestClaimRow | null => {
    for (let tries = 0; tries < t.buckets.length; tries++) {
      const idx = (t.nextBucket + tries) % t.buckets.length;
      const bucket = t.buckets[idx];
      while (bucket.length > 0) {
        const next = bucket.shift()!;
        if (seenPrefixes.has(next.prefix)) continue; // near-duplicate — skip, try the bucket's next candidate
        seenPrefixes.add(next.prefix);
        t.nextBucket = (idx + 1) % t.buckets.length; // rotate past this bucket for the theater's next turn
        return next.row;
      }
    }
    return null;
  };

  let progressedLastPass = true;
  while (picked.length < targetSize && progressedLastPass) {
    progressedLastPass = false;
    for (const t of theaters) {
      if (picked.length >= targetSize) break;
      const row = pickFromTheater(t);
      if (row) {
        picked.push(row);
        progressedLastPass = true;
      }
    }
  }
  return picked;
}

// ---- eval-set assembly ------------------------------------------------------------

export function buildKnownAnswerQuestion(row: HarvestClaimRow, question: string): EvalQuestion {
  return {
    id: `known-${row.id}`,
    type: "known-answer",
    question,
    gold: [{ claimIdAtHarvest: row.id, text: row.text, countryIso2: row.countryIso2, claimDate: row.claimDate }],
    // Left empty at harvest time: judging which OTHER claims would also satisfy a
    // paraphrased question requires either cross-corpus LLM judgment (out of scope
    // for the batched, per-claim generation call) or human review of the retrieval
    // results — the supervisor fills these in after the eval runner surfaces
    // plausible alternates.
    acceptableAlternates: [],
  };
}

/** Merge freshly-generated questions into an existing eval set (or start a new one).
 *  Additions win on id collision, so re-running --generate over a regenerated sample
 *  replaces stale entries rather than duplicating them. createdAt is preserved across
 *  merges (only set on first creation). */
export function mergeEvalSet(
  existing: EvalSet | null,
  additions: EvalQuestion[],
  corpus: CorpusStats,
): EvalSet {
  const byId = new Map((existing?.questions ?? []).map((q) => [q.id, q]));
  for (const q of additions) byId.set(q.id, q);
  return {
    version: 1,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    corpus,
    questions: [...byId.values()],
  };
}

// ---- LLM call shaping (question generation) ---------------------------------------

/** Fixed by the sprint spec: gpt-5-mini is the question-generation model. */
export const GENERATION_MODEL = "gpt-5-mini";
export const GENERATION_BATCH_SIZE = 5;

// $/1M tokens, verified 2026-07-11 (docs/reviews/ASK-FEATURE-ASSESSMENT-2026-07-11.md §4
// pricing table). Scoped to this harvest tool only — not a general-purpose price table.
export const GENERATION_PRICE_PER_MTOK = { in: 0.125, out: 1.0 };

export function generationCostUsd(promptTokens: number, completionTokens: number): number {
  return (
    (promptTokens * GENERATION_PRICE_PER_MTOK.in + completionTokens * GENERATION_PRICE_PER_MTOK.out) / 1_000_000
  );
}

export interface GenerationCostEstimate {
  batches: number;
  estPromptTokens: number;
  estCompletionTokens: number;
  estCostUsd: number;
}

// Rough per-call token budgets for a batched paraphrase-question generation prompt
// (system prompt + N serialized claims in, N short questions out). These are
// deliberately conservative (over- rather than under-estimate) since the estimate
// gates a hard refusal — see modeGenerate's pre-flight check.
const SYSTEM_PROMPT_TOKENS_ESTIMATE = 300;
const PER_CLAIM_INPUT_TOKENS_ESTIMATE = 150; // claim text (<=500 chars) + metadata line
const PER_CLAIM_OUTPUT_TOKENS_ESTIMATE = 80; // one paraphrased question + JSON overhead

export function estimateGenerationCostUsd(
  claimCount: number,
  batchSize: number = GENERATION_BATCH_SIZE,
): GenerationCostEstimate {
  const batches = claimCount === 0 ? 0 : Math.ceil(claimCount / batchSize);
  const estPromptTokens = batches * SYSTEM_PROMPT_TOKENS_ESTIMATE + claimCount * PER_CLAIM_INPUT_TOKENS_ESTIMATE;
  const estCompletionTokens = claimCount * PER_CLAIM_OUTPUT_TOKENS_ESTIMATE;
  return {
    batches,
    estPromptTokens,
    estCompletionTokens,
    estCostUsd: generationCostUsd(estPromptTokens, estCompletionTokens),
  };
}

/** ~150 output tokens/question + a fixed reasoning-token buffer. gpt-5-family models
 *  bill reasoning tokens as completion tokens against max_completion_tokens (WORKLOG
 *  DL-1), so headroom matters more than for a plain chat-completion model. */
export function generationMaxCompletionTokens(batchSize: number): number {
  return Math.max(400, batchSize * 200 + 300);
}

export interface ChatCallParams {
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
}

/** Per-model param mapping (WORKLOG DL-1): gpt-5-family models reject a non-default
 *  temperature and use max_completion_tokens (reasoning tokens bill as output) instead
 *  of max_tokens. Other models keep the classic temperature + max_tokens pair. */
export function chatParamsForModel(
  model: string,
  maxOutputTokens: number,
  temperature = 0.2,
): ChatCallParams {
  if (model.startsWith("gpt-5")) {
    return { max_completion_tokens: maxOutputTokens };
  }
  return { temperature, max_tokens: maxOutputTokens };
}

export const GENERATION_SYSTEM_PROMPT = `You write ONE retrieval-test question per claim, for evaluating a semantic search system over an OSINT claims database (Russia/Ukraine/Iran conflict monitoring).

Rules:
1. The question must be answerable using ONLY the given claim's content, and specific enough that this claim is the intended answer.
2. Do NOT quote the claim's exact wording verbatim. Paraphrase: use different vocabulary, synonyms, or a more general framing where natural — this tests semantic retrieval against vocabulary mismatch, not exact string match.
3. Phrase it the way a working analyst would actually ask it: natural language, not multiple-choice, not a yes/no question.
4. One question per claim id, in the same order given. Never invent or omit a claim id.`;

/** One claim line as the model sees it in the batch prompt (mirrors the repo's
 *  existing per-doc/per-group serialization style, e.g. mapDocLine / serializeGroup). */
export function serializeHarvestClaim(row: HarvestClaimRow): string {
  return `[${row.id}] (${row.countryIso2}/${row.track ?? "-"}, ${row.claimDate ?? "undated"}) ${row.text}`;
}

export function generationUserMessage(batch: HarvestClaimRow[]): string {
  const lines = batch.map(serializeHarvestClaim).join("\n");
  return (
    `Return exactly ${batch.length} results, one per claim id, in this order: ${batch.map((c) => c.id).join(", ")}\n\n` +
    `Claims:\n${lines}`
  );
}

/** Strict JSON-schema response shape, pinned to EXACTLY the batch size (standing
 *  ruling 7: gpt-4o-mini/gpt-5-mini-class models silently under-fill an unbounded
 *  array; minItems=maxItems=batchSize is the fix that measurably works, mirroring
 *  src/lib/analysis/map-prompts.ts's mapResponseSchema(docCount)). */
export function generationResponseSchema(batchSize: number) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      results: {
        type: "array",
        minItems: batchSize,
        maxItems: batchSize,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            claimId: { type: "integer" },
            question: { type: "string" },
          },
          required: ["claimId", "question"],
        },
      },
    },
    required: ["results"],
  } as const;
}

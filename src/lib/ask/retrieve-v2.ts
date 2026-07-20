import { Pool } from "@neondatabase/serverless";
import type { CandidateClaim, RetrievalMode, RetrievalV2Result, StageUsage } from "./types";
import type { RetrievedEntity } from "./retrieve";
import { extractTerms } from "./retrieve";
import { parseTimeWindow } from "./window";
import { scoreCandidate } from "./composite";
import { askCandidates, askLexicalTop, askVectorTop } from "./config";
import { isLlmDisabled } from "../usage/llm-guard";
import { embedModel, embedTexts } from "../embeddings/client";
import { embedGuardFromEnv } from "../embeddings/guard";
import { lexicalClaimSearch, windowClause } from "./lexical";
import { monotonicMs, recordStage, timeStage, type StageTimings } from "./timings";

// Retrieval v2: deterministic time-window parse + hybrid (vector union lexical)
// candidate generation + composite pre-rank. Same anti-hallucination boundary as
// the legacy retrieve.ts — this only widens/orders the evidence set; the answer
// layer still cites strictly from it. Legacy retrieve.ts is left byte-identical
// (D3); the entity-arm SQL below is DUPLICATED from it rather than shared. The
// lexical/tsvector arm itself lives in lexical.ts (shared with /search) — this
// file calls it and keeps windowClause imported from there too, so both arms use
// literally the same window-bound SQL fragment.

/** Provider string embedTexts returns on the offline stub path (client.ts
 *  EMBED_STUB_PROVIDER). Stub vectors are throwaway, so a stub result is treated
 *  as "no vector arm" — never scored, never persisted here. */
const STUB_PROVIDER = "stub";

interface ClaimRow {
  id: number;
  text: string;
  hedging: string;
  d: string | null;
  iso2: string;
  track: string | null;
  confidence: number | null;
  vector_score?: number;
  rank?: number;
}

/** True when the vector arm must be SKIPPED ENTIRELY — no embed call, not even a
 *  stub one. Mirrors the embedding client's own stub-path conditions (kill-switch,
 *  forced stub provider, absent key) so retrieveV2 degrades to lexical-only
 *  deterministically instead of paying for throwaway stub vectors. */
function vectorArmDisabled(): boolean {
  return isLlmDisabled() || process.env.ANALYSIS_PROVIDER === "stub" || !process.env.OPENAI_API_KEY;
}

/** pgvector literal for a numeric array — bound as text, cast ::vector in SQL (a
 *  JS array would be read as a Postgres array). Duplicated from embeddings/persist.ts. */
function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toCandidate(r: ClaimRow, vectorHit: boolean): CandidateClaim {
  return {
    claimId: r.id,
    text: r.text,
    hedging: r.hedging,
    claimDate: r.d,
    countryIso2: r.iso2,
    track: r.track,
    entities: [],
    confidence: r.confidence ?? null,
    vectorScore: vectorHit && typeof r.vector_score === "number" ? r.vector_score : null,
    lexicalHit: !vectorHit,
    compositeScore: 0,
  };
}

export async function retrieveV2(
  question: string,
  opts?: { now?: Date; timings?: StageTimings },
): Promise<RetrievalV2Result> {
  const now = opts?.now ?? new Date();
  // Phase 0 stage timings (optional, no-op when absent): embedMs = the embedTexts
  // network call; vectorMs = the pgvector SQL; lexicalMs = lexicalClaimSearch (its
  // two round-trips); entityMs = the per-claim entities SQL + top-15 entity SQL,
  // summed; mergeMs = the synchronous union/scoring/sort sections, summed. Guard
  // init/reserve/record calls are NOT reordered or wrapped individually.
  const timings = opts?.timings;
  const window = parseTimeWindow(question, now);

  // Temporal words must not leak into search terms: strip the consumed phrase
  // (once, case-insensitive) before both term extraction and the tsquery input.
  const qStripped = window
    ? question.replace(new RegExp(escapeRegExp(window.matchedPhrase), "i"), " ").replace(/\s+/g, " ").trim()
    : question;
  const terms = extractTerms(qStripped);
  const pattern = terms.map((t) => `%${t}%`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // ---- vector arm ---------------------------------------------------------
    let vectorRows: ClaimRow[] = [];
    let vectorArmScored = false;
    let embedUsage: StageUsage | undefined;

    if (!vectorArmDisabled()) {
      try {
        const guard = embedGuardFromEnv();
        await guard.init();
        const { vectors, tokens, costUsd, provider } = await timeStage(timings, "embedMs", () =>
          embedTexts([question], { guard }),
        );
        if (provider !== STUB_PROVIDER && vectors[0]) {
          embedUsage = { promptTokens: tokens, completionTokens: 0, costUsd };
          const params: unknown[] = [toVectorLiteral(vectors[0]), embedModel()];
          const wc = windowClause(window, params);
          params.push(askVectorTop());
          const { rows } = await timeStage(timings, "vectorMs", () =>
            pool.query(
              `SELECT cl.id, cl.text, cl.hedging, cl.claim_date::text AS d, c.iso2, dg.track,
                      cl.confidence, 1 - (ce.embedding <=> $1::vector) AS vector_score
               FROM claim_embeddings ce
               JOIN claims cl ON cl.id = ce.claim_id
               JOIN countries c ON c.id = cl.country_id
               LEFT JOIN digests dg ON dg.id = cl.digest_id
               WHERE ce.model = $2${wc}
               ORDER BY ce.embedding <=> $1::vector
               LIMIT $${params.length}`,
              params,
            ),
          );
          vectorRows = rows as ClaimRow[];
          // Zero rows means "no embeddings for the current model" — a v2-lexical-only
          // cause per the RetrievalMode contract, even though we did embed the question.
          vectorArmScored = vectorRows.length > 0;
        }
      } catch (e) {
        // Any embed/vector failure (budget refusal, transient OpenAI error, missing
        // table) degrades to lexical-only — never fatal for a user surface.
        console.warn(
          `retrieveV2: vector arm degraded to lexical-only: ${e instanceof Error ? e.message : e}`,
        );
        vectorRows = [];
        vectorArmScored = false;
      }
    }

    const mode: RetrievalMode = vectorArmScored ? "v2" : "v2-lexical-only";

    // ---- lexical arm --------------------------------------------------------
    // Delegated to lexical.ts (shared with /search): same SQL, params, ordering,
    // caps, and the "no predicate -> no query at all" degraded path as before —
    // only the pool.query calls moved module.
    const { rows: lexicalRows, matchCount: lexicalMatchCount } = await timeStage(
      timings,
      "lexicalMs",
      () =>
        lexicalClaimSearch(pool, {
          qStripped,
          terms,
          window,
          limit: askLexicalTop(),
        }),
    );

    // entityMs/mergeMs accumulate across their split sections (the entity SQL sits
    // between the union build and the scoring pass), recorded once at the end.
    let entityAccumMs = 0;
    let mergeAccumMs = 0;

    // ---- union (dedupe by claimId) ------------------------------------------
    const tUnion = monotonicMs();
    const byId = new Map<number, CandidateClaim>();
    for (const r of vectorRows) byId.set(r.id, toCandidate(r, true));
    for (const r of lexicalRows) {
      const existing = byId.get(r.id);
      if (existing) existing.lexicalHit = true; // in both arms: keep vectorScore, mark lexical
      else byId.set(r.id, toCandidate(r, false));
    }
    const unionSize = byId.size;
    mergeAccumMs += monotonicMs() - tUnion;

    // entities per claim — one batched query, exactly like retrieve.ts
    const claimIds = [...byId.keys()];
    if (claimIds.length > 0) {
      const tEnt = monotonicMs();
      const { rows: er } = await pool.query(
        `SELECT ce.claim_id, e.name FROM claim_entities ce
         JOIN entities e ON e.id = ce.entity_id
         WHERE ce.claim_id = ANY($1::int[])`,
        [claimIds],
      );
      entityAccumMs += monotonicMs() - tEnt;
      const entByClaim = new Map<number, string[]>();
      for (const row of er as Array<{ claim_id: number; name: string }>) {
        entByClaim.set(row.claim_id, [...(entByClaim.get(row.claim_id) ?? []), row.name]);
      }
      for (const [id, cand] of byId) cand.entities = entByClaim.get(id) ?? [];
    }

    // composite pre-rank, then cap
    const tScore = monotonicMs();
    const claims = [...byId.values()];
    for (const cand of claims) {
      cand.compositeScore = scoreCandidate(
        {
          vectorScore: cand.vectorScore,
          lexicalHit: cand.lexicalHit,
          claimDate: cand.claimDate,
          confidence: cand.confidence,
        },
        now,
        mode,
      );
    }
    claims.sort((a, b) => b.compositeScore - a.compositeScore || b.claimId - a.claimId);
    const capped = claims.slice(0, askCandidates());
    mergeAccumMs += monotonicMs() - tScore;

    const totalMatching = Math.max(unionSize, lexicalMatchCount);

    // ---- entities list (top 15 by pressure) — legacy query, DUPLICATED (D3) --
    let entities: RetrievedEntity[] = [];
    if (terms.length > 0) {
      const tEntList = monotonicMs();
      const { rows: entRows } = await pool.query(
        `SELECT e.id, e.name, e.kind,
                CASE WHEN coalesce((e.meta->'opensanctions'->>'stub')::boolean, false)
                       OR e.meta->'opensanctions'->>'osId' LIKE 'NK-stub%'
                     THEN NULL
                     ELSE (e.meta->'opensanctions'->>'sanctioned')::boolean END AS sanctioned,
                count(DISTINCT ce.claim_id) FILTER (WHERE ce.role IN ('defendant','target','dismissed'))::int AS pressure
         FROM entities e
         LEFT JOIN claim_entities ce ON ce.entity_id = e.id
         WHERE e.name ILIKE ANY($1)
         GROUP BY e.id
         ORDER BY pressure DESC
         LIMIT 15`,
        [pattern],
      );
      entityAccumMs += monotonicMs() - tEntList;
      entities = (
        entRows as Array<{ id: number; name: string; kind: string; sanctioned: boolean | null; pressure: number }>
      ).map((r) => ({
        entityId: r.id,
        name: r.name,
        kind: r.kind,
        pressure: r.pressure,
        sanctioned: r.sanctioned,
      }));
    }

    recordStage(timings, "entityMs", entityAccumMs);
    recordStage(timings, "mergeMs", mergeAccumMs);

    return { claims: capped, entities, terms, window, totalMatching, mode, embedUsage };
  } finally {
    await pool.end();
  }
}

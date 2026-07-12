import { Pool } from "@neondatabase/serverless";
import type { CandidateClaim, RetrievalMode, RetrievalV2Result, StageUsage, TimeWindow } from "./types";
import type { RetrievedEntity } from "./retrieve";
import { extractTerms } from "./retrieve";
import { parseTimeWindow } from "./window";
import { scoreCandidate } from "./composite";
import { askCandidates, askLexicalTop, askVectorTop } from "./config";
import { isLlmDisabled } from "../usage/llm-guard";
import { embedModel, embedTexts } from "../embeddings/client";
import { embedGuardFromEnv } from "../embeddings/guard";

// Retrieval v2: deterministic time-window parse + hybrid (vector union lexical)
// candidate generation + composite pre-rank. Same anti-hallucination boundary as
// the legacy retrieve.ts — this only widens/orders the evidence set; the answer
// layer still cites strictly from it. Legacy retrieve.ts is left byte-identical
// (D3); the entity-arm SQL below is DUPLICATED from it rather than shared.

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

/** Append the window bound params and return the SQL fragment (" AND cl.claim_date
 *  >= $n AND cl.claim_date <= $n"). A set window naturally EXCLUDES null claim_date
 *  (a NULL comparison is never true); no window -> no clause -> nulls included. */
function windowClause(window: TimeWindow | null, params: unknown[]): string {
  if (!window) return "";
  const parts: string[] = [];
  if (window.from) {
    params.push(window.from);
    parts.push(`cl.claim_date >= $${params.length}`);
  }
  if (window.to) {
    params.push(window.to);
    parts.push(`cl.claim_date <= $${params.length}`);
  }
  return parts.length ? ` AND ${parts.join(" AND ")}` : "";
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
  opts?: { now?: Date },
): Promise<RetrievalV2Result> {
  const now = opts?.now ?? new Date();
  const window = parseTimeWindow(question, now);

  // Temporal words must not leak into search terms: strip the consumed phrase
  // (once, case-insensitive) before both term extraction and the tsquery input.
  const qStripped = window
    ? question.replace(new RegExp(escapeRegExp(window.matchedPhrase), "i"), " ").replace(/\s+/g, " ").trim()
    : question;
  const terms = extractTerms(qStripped);
  const pattern = terms.map((t) => `%${t}%`);
  const hasTsQuery = qStripped.length > 0;
  const hasLexicalPredicate = hasTsQuery || terms.length > 0;

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
        const { vectors, tokens, costUsd, provider } = await embedTexts([question], { guard });
        if (provider !== STUB_PROVIDER && vectors[0]) {
          embedUsage = { promptTokens: tokens, completionTokens: 0, costUsd };
          const params: unknown[] = [toVectorLiteral(vectors[0]), embedModel()];
          const wc = windowClause(window, params);
          params.push(askVectorTop());
          const { rows } = await pool.query(
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
    let lexicalRows: ClaimRow[] = [];
    let lexicalMatchCount = 0;
    if (hasLexicalPredicate) {
      const params: unknown[] = [];
      const ors: string[] = [];
      let rankExpr = "0::float AS rank";
      if (hasTsQuery) {
        params.push(qStripped);
        const qi = params.length;
        rankExpr = `ts_rank(to_tsvector('english', cl.text), websearch_to_tsquery('english', $${qi})) AS rank`;
        ors.push(`to_tsvector('english', cl.text) @@ websearch_to_tsquery('english', $${qi})`);
      }
      if (terms.length > 0) {
        params.push(pattern);
        const pi = params.length;
        ors.push(`cl.text ILIKE ANY($${pi})`);
        // Legacy entity-name subquery, DUPLICATED here (retrieve.ts stays byte-
        // identical, D3). Keep in sync if the legacy version ever changes.
        ors.push(
          `cl.id IN (SELECT ce2.claim_id FROM claim_entities ce2 JOIN entities e ON e.id = ce2.entity_id WHERE e.name ILIKE ANY($${pi}))`,
        );
      }
      const whereCore = `(${ors.join(" OR ")})`;
      const wc = windowClause(window, params); // pushes the window params once, shared by both queries

      // D9 sampled-evidence disclosure: full window-filtered match count, uncapped.
      const countRes = await pool.query(
        `SELECT count(*)::int AS n FROM claims cl WHERE ${whereCore}${wc}`,
        params,
      );
      lexicalMatchCount = (countRes.rows[0]?.n as number) ?? 0;

      params.push(askLexicalTop());
      const { rows } = await pool.query(
        `SELECT cl.id, cl.text, cl.hedging, cl.claim_date::text AS d, c.iso2, dg.track,
                cl.confidence, ${rankExpr}
         FROM claims cl
         JOIN countries c ON c.id = cl.country_id
         LEFT JOIN digests dg ON dg.id = cl.digest_id
         WHERE ${whereCore}${wc}
         ORDER BY rank DESC, cl.claim_date DESC NULLS LAST, cl.id DESC
         LIMIT $${params.length}`,
        params,
      );
      lexicalRows = rows as ClaimRow[];
    }

    // ---- union (dedupe by claimId) ------------------------------------------
    const byId = new Map<number, CandidateClaim>();
    for (const r of vectorRows) byId.set(r.id, toCandidate(r, true));
    for (const r of lexicalRows) {
      const existing = byId.get(r.id);
      if (existing) existing.lexicalHit = true; // in both arms: keep vectorScore, mark lexical
      else byId.set(r.id, toCandidate(r, false));
    }
    const unionSize = byId.size;

    // entities per claim — one batched query, exactly like retrieve.ts
    const claimIds = [...byId.keys()];
    if (claimIds.length > 0) {
      const { rows: er } = await pool.query(
        `SELECT ce.claim_id, e.name FROM claim_entities ce
         JOIN entities e ON e.id = ce.entity_id
         WHERE ce.claim_id = ANY($1::int[])`,
        [claimIds],
      );
      const entByClaim = new Map<number, string[]>();
      for (const row of er as Array<{ claim_id: number; name: string }>) {
        entByClaim.set(row.claim_id, [...(entByClaim.get(row.claim_id) ?? []), row.name]);
      }
      for (const [id, cand] of byId) cand.entities = entByClaim.get(id) ?? [];
    }

    // composite pre-rank, then cap
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

    const totalMatching = Math.max(unionSize, lexicalMatchCount);

    // ---- entities list (top 15 by pressure) — legacy query, DUPLICATED (D3) --
    let entities: RetrievedEntity[] = [];
    if (terms.length > 0) {
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

    return { claims: capped, entities, terms, window, totalMatching, mode, embedUsage };
  } finally {
    await pool.end();
  }
}

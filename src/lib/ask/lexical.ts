import type { Pool } from "@neondatabase/serverless";
import type { TimeWindow } from "./types";

// INVARIANT: this module is the $0 deterministic retrieval arm shared by
// retrieveV2 (src/lib/ask/retrieve-v2.ts) and /search (src/app/search/page.tsx).
// websearch_to_tsquery + ts_rank against the claims_text_fts_idx GIN index, OR'd
// with an ILIKE fallback + entity-name subquery. SELECT-only SQL, no LLM, no
// metering — it must NEVER construct a SpendGuard, call a provider, or write a
// row. Do not import from src/lib/embeddings/*, src/lib/usage/*, ask/limits.ts,
// ask/rerank.ts, ask/answer.ts, or any OpenAI/provider module here.

export interface LexicalClaimRow {
  id: number;
  text: string;
  hedging: string;
  d: string | null;
  iso2: string;
  track: string | null;
  confidence: number | null;
  rank: number;
}

export interface LexicalSearchArgs {
  /** question text with any parsed time-window phrase already stripped (so
   *  temporal words never leak into the tsquery input) */
  qStripped: string;
  /** salient search terms (retrieve.ts extractTerms), extracted from the same
   *  stripped question */
  terms: string[];
  window: TimeWindow | null;
  /** row cap for the ranked page (SQL LIMIT) */
  limit: number;
}

export interface LexicalSearchResult {
  /** ranked page, capped at `limit`, ORDER BY rank DESC, claim_date DESC NULLS
   *  LAST, id DESC */
  rows: LexicalClaimRow[];
  /** window-filtered match count BEFORE the cap — uncapped, for a "showing N of
   *  TOTAL" disclosure */
  matchCount: number;
}

/** Append the window bound params and return the SQL fragment (" AND cl.claim_date
 *  >= $n AND cl.claim_date <= $n"). A set window naturally EXCLUDES null claim_date
 *  (a NULL comparison is never true); no window -> no clause -> nulls included.
 *  Shared verbatim by the lexical arm below and retrieveV2's vector arm. */
export function windowClause(window: TimeWindow | null, params: unknown[]): string {
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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Strip a parsed time window's exact matched phrase from a question (once,
 *  case-insensitive) so temporal words never pollute search terms or the tsquery
 *  input — the same anti-leak rule retrieveV2 applies before calling extractTerms.
 *  /search calls this directly; retrieve-v2.ts keeps its own private copy of the
 *  same logic (its extraction into this module stays mechanical — only the SQL
 *  block below moved, not this pre-existing computation). */
export function stripWindowPhrase(question: string, window: TimeWindow | null): string {
  if (!window) return question;
  return question
    .replace(new RegExp(escapeRegExp(window.matchedPhrase), "i"), " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The $0 lexical/tsvector candidate arm: websearch_to_tsquery + ts_rank OR'd with
 * an ILIKE fallback + entity-name subquery, window-filtered, ranked page capped at
 * `limit`. Returns { rows: [], matchCount: 0 } WITHOUT issuing any SQL when there
 * is no predicate at all (empty stripped question AND no terms) — the same
 * "whole question consumed by the window" degraded path retrieveV2 relies on.
 */
export async function lexicalClaimSearch(pool: Pool, args: LexicalSearchArgs): Promise<LexicalSearchResult> {
  const { qStripped, terms, window, limit } = args;
  const hasTsQuery = qStripped.length > 0;
  const hasLexicalPredicate = hasTsQuery || terms.length > 0;
  if (!hasLexicalPredicate) return { rows: [], matchCount: 0 };

  const pattern = terms.map((t) => `%${t}%`);
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
    // Legacy entity-name subquery, DUPLICATED from retrieve.ts (that file stays
    // byte-identical, D3). Keep in sync if the legacy version ever changes.
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
  const matchCount = (countRes.rows[0]?.n as number) ?? 0;

  params.push(limit);
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
  return { rows: rows as LexicalClaimRow[], matchCount };
}

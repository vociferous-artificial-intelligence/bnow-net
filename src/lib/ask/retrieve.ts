import { Pool } from "@neondatabase/serverless";

// Deterministic, bounded retrieval for the ask-the-data feature. Pulls candidate
// rows from our structured data by keyword + recency. No LLM here — this is the
// evidence set the answer layer must cite from (anti-hallucination boundary).

export interface RetrievedClaim {
  claimId: number;
  text: string;
  hedging: string;
  claimDate: string | null;
  countryIso2: string;
  track: string | null;
  entities: string[];
}

export interface RetrievedEntity {
  entityId: number;
  name: string;
  kind: string;
  pressure: number;
  sanctioned: boolean | null;
}

export interface RetrievalResult {
  claims: RetrievedClaim[];
  entities: RetrievedEntity[];
  terms: string[];
}

// pull salient search terms from the question (drop stopwords, keep >2-char tokens)
const STOP = new Set([
  "the", "and", "for", "are", "was", "were", "what", "which", "who", "how", "why",
  "when", "where", "does", "did", "has", "have", "with", "this", "that", "from",
  "about", "into", "over", "past", "recent", "recently", "show", "list", "tell", "give", "any",
  "all", "our", "their", "there", "been", "being", "will", "would", "could",
]);

export function extractTerms(question: string): string[] {
  return [
    ...new Set(
      question
        .toLowerCase()
        .replace(/[^\p{L}\p{N} ]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP.has(w)),
    ),
  ].slice(0, 8);
}

export async function retrieve(question: string, opts?: { limit?: number }): Promise<RetrievalResult> {
  const terms = extractTerms(question);
  const limit = opts?.limit ?? 40;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    if (terms.length === 0) return { claims: [], entities: [], terms };
    const pattern = terms.map((t) => `%${t}%`);

    // claims matching any term OR whose entity matches; recent first, and within
    // a day higher-confidence first — confidence is the mean reliability_score of
    // the claim's source documents, so low-reliability (state-media) claims sink
    // toward the evidence-set cutoff instead of leading it
    const { rows: claimRows } = await pool.query(
      `SELECT cl.id, cl.text, cl.hedging, cl.claim_date::text AS d, c.iso2, dg.track
       FROM claims cl
       JOIN countries c ON c.id = cl.country_id
       LEFT JOIN digests dg ON dg.id = cl.digest_id
       WHERE cl.text ILIKE ANY($1)
          OR cl.id IN (
            SELECT ce.claim_id FROM claim_entities ce
            JOIN entities e ON e.id = ce.entity_id
            WHERE e.name ILIKE ANY($1)
          )
       ORDER BY cl.claim_date DESC NULLS LAST, cl.confidence DESC NULLS LAST, cl.id DESC
       LIMIT $2`,
      [pattern, limit],
    );
    const claimIds = claimRows.map((r) => r.id);
    const entByClaim = new Map<number, string[]>();
    if (claimIds.length > 0) {
      const { rows: er } = await pool.query(
        `SELECT ce.claim_id, e.name FROM claim_entities ce
         JOIN entities e ON e.id = ce.entity_id
         WHERE ce.claim_id = ANY($1::int[])`,
        [claimIds],
      );
      for (const r of er) entByClaim.set(r.claim_id, [...(entByClaim.get(r.claim_id) ?? []), r.name]);
    }
    const claims: RetrievedClaim[] = claimRows.map((r) => ({
      claimId: r.id, text: r.text, hedging: r.hedging, claimDate: r.d,
      countryIso2: r.iso2, track: r.track, entities: entByClaim.get(r.id) ?? [],
    }));

    // entities matching a term
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
    const entities: RetrievedEntity[] = entRows.map((r) => ({
      entityId: r.id, name: r.name, kind: r.kind, pressure: r.pressure, sanctioned: r.sanctioned,
    }));

    return { claims, entities, terms };
  } finally {
    await pool.end();
  }
}

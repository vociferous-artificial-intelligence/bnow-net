// Reduce loader (MR sprint 3): everything the pure core (reduce.ts) needs for
// one (theater, track, window), read the only sanctioned way — through the
// map-versions accessor (OPEN-TASKS #35), so superseded extractor versions can
// never double-count. Also lazily backfills quote_verified for rows that
// predate the map worker's insert-time stamp (same normalization, quote-verify.ts).

import type { Pool } from "@neondatabase/serverless";
import { currentVersion } from "./map-versions";
import { verifyQuote } from "./quote-verify";
import type { Hedging, ReduceClaim } from "./reduce";
import type { Track } from "./tracks";

export interface ReduceWindow {
  /** inclusive yyyy-mm-dd */
  from: string;
  /** exclusive yyyy-mm-dd */
  to: string;
}

export interface ReduceLoad {
  claims: ReduceClaim[];
  /** docId -> canonical docId (doc_dedup) for the window's theater — feeds the
   *  independence rule; mapped docs are canonical so this is usually sparse */
  mirrorOf: Map<number, number>;
  /** rows whose quote_verified was NULL and got stamped in this call */
  quotesBackfilled: number;
}

/** Load current-version doc_claims for one (theater, track) and window.
 *  claim_date is the doc's UTC day (map-worker sets it), so the window matches
 *  the legacy gather's COALESCE(published_at, fetched_at) day semantics. */
export async function loadReduceClaims(
  pool: Pool,
  theater: string,
  track: Track,
  window: ReduceWindow,
): Promise<ReduceLoad> {
  const version = currentVersion(track, theater);
  if (!version) return { claims: [], mirrorOf: new Map(), quotesBackfilled: 0 };

  const { rows } = await pool.query(
    `SELECT dc.id, dc.raw_document_id AS doc_id, dc.text_en, dc.quote_orig,
            dc.quote_verified, dc.claim_type, dc.hedging, dc.entities,
            dc.event_hint, dc.claim_date::text AS claim_date,
            rd.adapter, rd.published_at, s.domain AS source_domain,
            s.canonical_url AS source_key, s.platform, s.reliability_score AS reliability
     FROM doc_claims dc
     JOIN raw_documents rd ON rd.id = dc.raw_document_id
     LEFT JOIN sources s ON s.id = rd.source_id
     WHERE dc.track = $1 AND dc.extractor_version = $2
       AND rd.country_iso2 = $3
       AND dc.claim_date >= $4::date AND dc.claim_date < $5::date
     ORDER BY dc.id`,
    [track, version, theater, window.from, window.to],
  );

  // lazy quote_verified backfill for pre-stamp rows (NULL): fetch only the doc
  // texts we actually need, verify with the shared normalization, stamp.
  const needIds = rows.filter((r) => r.quote_verified === null).map((r) => r.id as number);
  let quotesBackfilled = 0;
  if (needIds.length > 0) {
    const needDocIds = [
      ...new Set(
        rows.filter((r) => r.quote_verified === null).map((r) => r.doc_id as number),
      ),
    ];
    const { rows: docRows } = await pool.query(
      `SELECT id, coalesce(title, '') || ' ' || content AS text
       FROM raw_documents WHERE id = ANY($1)`,
      [needDocIds],
    );
    const textByDoc = new Map<number, string>(docRows.map((r) => [r.id, r.text]));
    const trueIds: number[] = [];
    const falseIds: number[] = [];
    for (const r of rows) {
      if (r.quote_verified !== null) continue;
      const ok = verifyQuote(textByDoc.get(r.doc_id) ?? "", r.quote_orig);
      r.quote_verified = ok;
      (ok ? trueIds : falseIds).push(r.id);
    }
    if (trueIds.length > 0) {
      await pool.query(`UPDATE doc_claims SET quote_verified = true WHERE id = ANY($1)`, [
        trueIds,
      ]);
    }
    if (falseIds.length > 0) {
      await pool.query(`UPDATE doc_claims SET quote_verified = false WHERE id = ANY($1)`, [
        falseIds,
      ]);
    }
    quotesBackfilled = needIds.length;
  }

  const claims: ReduceClaim[] = rows.map((r) => ({
    id: r.id,
    docId: r.doc_id,
    textEn: r.text_en,
    quoteOrig: r.quote_orig,
    quoteVerified: r.quote_verified === true,
    claimType: r.claim_type === "assessment" ? "assessment" : "factual",
    hedging: r.hedging as Hedging,
    entities: Array.isArray(r.entities)
      ? (r.entities as Array<{ name: string; kind: string; role: string }>)
      : [],
    eventHint: r.event_hint,
    claimDate: r.claim_date,
    sourceDomain: r.source_domain,
    sourceKey: r.source_key,
    reliability: r.reliability !== null ? Number(r.reliability) : null,
    adapter: r.adapter,
    platform: r.platform,
    publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
  }));

  // mirror map (independence rule): verdicts for any doc in this theater whose
  // canonical is also known; scoped by the window's docs to stay small
  const docIds = [...new Set(claims.map((c) => c.docId))];
  const mirrorOf = new Map<number, number>();
  if (docIds.length > 0) {
    const { rows: mirrorRows } = await pool.query(
      `SELECT raw_document_id, canonical_doc_id FROM doc_dedup
       WHERE raw_document_id = ANY($1) OR canonical_doc_id = ANY($1)`,
      [docIds],
    );
    for (const m of mirrorRows) mirrorOf.set(m.raw_document_id, m.canonical_doc_id);
  }

  return { claims, mirrorOf, quotesBackfilled };
}

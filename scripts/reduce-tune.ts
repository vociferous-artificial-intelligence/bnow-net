// Tune REDUCE_THRESHOLD on labelled pairs built from existing prod claims
// (MR sprint 3, TASK 1). Read-only; no LLM.
//
//   POSITIVE pair: a prod claim citing docs d1+d2 (claim_sources) is the legacy
//   batch's judgment that both docs support the SAME atomic assertion. The map
//   claims on d1 and d2 that best token-match the prod claim text are therefore
//   a labelled same-event pair.
//   NEGATIVE pair: two prod claims in DIFFERENT events of the same digest are
//   the batch's judgment of different events; their best-matching map claims
//   (same theater+day) are a labelled different-event pair.
//
// Sweeps pairScore thresholds and prints precision/recall/F1 so the operating
// point in src/lib/analysis/reduce.ts is a measured choice, not a guess.
//
// Usage: npx tsx scripts/reduce-tune.ts [fromDate=2026-07-04]

import { neon } from "@neondatabase/serverless";
import "./env";
import { versionFilterSql } from "../src/lib/analysis/map-versions";
import { claimTokens, pairScore, type ReduceClaim } from "../src/lib/analysis/reduce";

const FROM = process.argv[2] ?? "2026-07-04";
const THEATERS = ["ru", "ua", "ir"];
const MATCH_FLOOR = 0.25; // min prod-text<->map-text jaccard for an anchor match

const sql = neon(process.env.DATABASE_URL!);

interface ProdClaim {
  id: number;
  text: string;
  eventId: number | null;
  digestId: number;
  theater: string;
  date: string;
  docIds: number[];
}

interface MapClaimRow {
  id: number;
  docId: number;
  textEn: string;
  entities: Array<{ name: string; kind: string; role: string }>;
  eventHint: string | null;
  claimDate: string;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function asReduceClaim(m: MapClaimRow): ReduceClaim {
  return {
    id: m.id,
    docId: m.docId,
    textEn: m.textEn,
    quoteOrig: null,
    quoteVerified: false,
    claimType: "factual",
    hedging: "claimed",
    entities: m.entities,
    eventHint: m.eventHint,
    claimDate: m.claimDate,
    sourceDomain: null,
    sourceKey: null,
    reliability: null,
    adapter: "rss",
    platform: null,
    publishedAt: null,
  };
}

async function main() {
  // 1. prod military claims in the map window with their cited docs
  const prodRows = await sql`
    SELECT cl.id, cl.text, cl.event_id, cl.digest_id, c.iso2 AS theater,
           d.digest_date::text AS date, array_agg(cs.raw_document_id) AS doc_ids
    FROM claims cl
    JOIN digests d ON d.id = cl.digest_id
    JOIN countries c ON c.id = d.country_id
    JOIN claim_sources cs ON cs.claim_id = cl.id
    WHERE c.iso2 = ANY(${THEATERS}) AND d.track = 'military'
      AND d.digest_date >= ${FROM}
    GROUP BY cl.id, cl.text, cl.event_id, cl.digest_id, c.iso2, d.digest_date`;
  const prod: ProdClaim[] = prodRows.map((r) => ({
    id: r.id,
    text: r.text,
    eventId: r.event_id,
    digestId: r.digest_id,
    theater: r.theater,
    date: r.date,
    docIds: r.doc_ids,
  }));
  console.log(`prod military claims in window: ${prod.length}`);

  // 2. map claims (current versions only — the #35 accessor) for all cited docs,
  //    mirrors resolved to canonical
  const allDocIds = [...new Set(prod.flatMap((p) => p.docIds))];
  const mirrorRows = await sql`
    SELECT raw_document_id, canonical_doc_id FROM doc_dedup
    WHERE raw_document_id = ANY(${allDocIds})`;
  const canonicalOf = new Map<number, number>(
    mirrorRows.map((r) => [r.raw_document_id, r.canonical_doc_id]),
  );
  const canonIds = [...new Set(allDocIds.map((d) => canonicalOf.get(d) ?? d))];

  const mapByDoc = new Map<number, MapClaimRow[]>();
  for (const theater of THEATERS) {
    const vf = versionFilterSql(theater, "dc", 2);
    const rows = await sql.query(
      `SELECT dc.id, dc.raw_document_id AS doc_id, dc.text_en, dc.entities,
              dc.event_hint, dc.claim_date::text AS claim_date
       FROM doc_claims dc
       JOIN raw_documents rd ON rd.id = dc.raw_document_id
       WHERE rd.country_iso2 = $1 AND dc.raw_document_id = ANY($${2 + vf.params.length})
         AND ${vf.sql}`,
      [theater, ...vf.params, canonIds],
    );
    for (const r of rows) {
      const m: MapClaimRow = {
        id: r.id,
        docId: r.doc_id,
        textEn: r.text_en,
        entities: Array.isArray(r.entities) ? r.entities : [],
        eventHint: r.event_hint,
        claimDate: r.claim_date,
      };
      const list = mapByDoc.get(m.docId);
      if (list) list.push(m);
      else mapByDoc.set(m.docId, [m]);
    }
  }
  console.log(`map claims found on ${mapByDoc.size}/${canonIds.length} cited canonical docs`);

  // best map anchor for (prod claim, doc)
  const anchor = (p: ProdClaim, docId: number): MapClaimRow | null => {
    const canonical = canonicalOf.get(docId) ?? docId;
    const candidates = mapByDoc.get(canonical) ?? [];
    const pTok = claimTokens(p.text);
    let best: MapClaimRow | null = null;
    let bestJ = MATCH_FLOOR;
    for (const m of candidates) {
      const j = jaccard(pTok, claimTokens(m.textEn));
      if (j >= bestJ) {
        bestJ = j;
        best = m;
      }
    }
    return best;
  };

  // 3. labelled pairs
  const positives: Array<[ReduceClaim, ReduceClaim]> = [];
  for (const p of prod) {
    if (p.docIds.length < 2) continue;
    const anchors = p.docIds
      .map((d) => anchor(p, d))
      .filter((m): m is MapClaimRow => m !== null);
    const uniq = [...new Map(anchors.map((m) => [m.id, m])).values()];
    for (let i = 0; i < uniq.length; i++)
      for (let j = i + 1; j < uniq.length; j++)
        positives.push([asReduceClaim(uniq[i]), asReduceClaim(uniq[j])]);
  }

  const negatives: Array<[ReduceClaim, ReduceClaim]> = [];
  const byDigest = new Map<number, ProdClaim[]>();
  for (const p of prod) {
    const list = byDigest.get(p.digestId);
    if (list) list.push(p);
    else byDigest.set(p.digestId, [p]);
  }
  for (const [, list] of byDigest) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.eventId === null || b.eventId === null || a.eventId === b.eventId) continue;
        const ma = anchor(a, a.docIds[0]);
        const mb = anchor(b, b.docIds[0]);
        if (!ma || !mb || ma.id === mb.id) continue;
        negatives.push([asReduceClaim(ma), asReduceClaim(mb)]);
      }
    }
  }
  console.log(`labelled pairs: ${positives.length} positive, ${negatives.length} negative\n`);
  if (positives.length < 10) {
    console.warn("too few positives to tune — inspect MATCH_FLOOR or the window");
  }

  // 4. threshold sweep
  console.log("thr   TP   FN   FP   TN   precision  recall  F1");
  for (let thr = 0.2; thr <= 0.75; thr += 0.05) {
    let tp = 0;
    let fn = 0;
    let fp = 0;
    let tn = 0;
    for (const [a, b] of positives) if (pairScore(a, b) >= thr) tp++; else fn++;
    for (const [a, b] of negatives) if (pairScore(a, b) >= thr) fp++; else tn++;
    const prec = tp + fp > 0 ? tp / (tp + fp) : 1;
    const rec = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = prec + rec > 0 ? (2 * prec * rec) / (prec + rec) : 0;
    console.log(
      `${thr.toFixed(2)}  ${String(tp).padStart(3)}  ${String(fn).padStart(3)}  ${String(
        fp,
      ).padStart(3)}  ${String(tn).padStart(3)}   ${prec.toFixed(3)}      ${rec.toFixed(
        3,
      )}   ${f1.toFixed(3)}`,
    );
  }
  console.log(
    "\nPick the highest threshold that keeps precision ~>=0.95 with acceptable recall;",
  );
  console.log("over-merge misdates claims (ruling 12), under-merge only loses corroboration.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

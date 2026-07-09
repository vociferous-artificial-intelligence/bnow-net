import { estimatedJaccard, minhashSignature } from "./minhash";

// Persistent dedup gate for the map stage (audit §9a, §11 constraint c): without
// it every backfill would pay to extract 2,562 exact duplicates plus the larger
// near-dupe mass. Pure function — the worker feeds it candidates (docs not yet
// through the gate) and references (already-accepted canonicals) and persists the
// verdicts to doc_dedup.
//
// Matching is SAME-THEATER and ±1 DAY for both methods. Same-theater because the
// map key is (doc, track) and tracks are theater-scoped: mirroring a ru doc to an
// ir canonical would silently drop the ru theater's claims. ±1 day because
// identical content on distant days is usually a recurring template (telegram
// air-raid alerts: 48/37/30 copies, audit §9a) describing a DIFFERENT day's
// event — collapsing those would misdate claims, so they stay canonical.

export interface DedupDoc {
  id: number;
  theater: string; // country_iso2
  day: string; // yyyy-mm-dd, the doc's UTC day (COALESCE(published_at, fetched_at))
  /** md5 of whitespace-normalized FULL content — computed in SQL on both sides
   *  (md5(trim(regexp_replace(content, '\s+', ' ', 'g')))) so exact matching is
   *  adapter-independent, unlike the ingest content_hash which salts in the
   *  adapter (audit §9a). */
  contentMd5: string;
  /** first 2000 chars of "title content" — the digest near-dupe's exact text
   *  grain (digest.ts:120), reused so both stages agree on what "near" means. */
  text2k: string;
}

export interface DedupVerdict {
  docId: number;
  canonicalDocId: number;
  method: "exact" | "minhash";
  /** estimated jaccard for minhash; 1 for exact */
  score: number;
}

export interface DedupResult {
  mirrors: DedupVerdict[];
  /** candidate ids that survived the gate, in input order */
  canonical: number[];
}

const NUM_HASHES = 64;
const BANDS = 16;
const ROWS_PER_BAND = NUM_HASHES / BANDS;

function dayNumber(day: string): number {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
}

function withinWindow(a: { theater: string; dayNum: number }, b: { theater: string; dayNum: number }): boolean {
  return a.theater === b.theater && Math.abs(a.dayNum - b.dayNum) <= 1;
}

interface Entry {
  id: number;
  theater: string;
  dayNum: number;
  sig: Uint32Array;
}

/** Exact md5 match first, then banded-LSH minhash at `threshold` against the
 *  accepted-so-far set (references seeded first, then candidates in input order —
 *  first-seen wins, matching the digest collapse). References are already-mapped
 *  canonicals: a candidate matching one becomes its mirror even if older, because
 *  the reference's claims already exist. */
export function dedupGate(
  candidates: DedupDoc[],
  references: DedupDoc[],
  threshold = 0.7,
): DedupResult {
  const mirrors: DedupVerdict[] = [];
  const canonical: number[] = [];

  // exact index: md5 -> accepted docs carrying it (window checked per pair)
  const byMd5 = new Map<string, Array<{ id: number; theater: string; dayNum: number }>>();
  // LSH buckets over accepted signatures
  const buckets = new Map<string, Entry[]>();

  const accept = (doc: DedupDoc, dayNum: number, sig: Uint32Array | null) => {
    const slot = { id: doc.id, theater: doc.theater, dayNum };
    const list = byMd5.get(doc.contentMd5);
    if (list) list.push(slot);
    else byMd5.set(doc.contentMd5, [slot]);
    const entry: Entry = { ...slot, sig: sig ?? minhashSignature(doc.text2k) };
    for (let b = 0; b < BANDS; b++) {
      const key = `${b}:` + entry.sig.slice(b * ROWS_PER_BAND, (b + 1) * ROWS_PER_BAND).join(",");
      const bucket = buckets.get(key);
      if (bucket) bucket.push(entry);
      else buckets.set(key, [entry]);
    }
  };

  for (const ref of references) accept(ref, dayNumber(ref.day), null);

  for (const cand of candidates) {
    const dayNum = dayNumber(cand.day);
    const self = { theater: cand.theater, dayNum };

    const exactHit = (byMd5.get(cand.contentMd5) ?? []).find((r) => withinWindow(self, r));
    if (exactHit) {
      mirrors.push({ docId: cand.id, canonicalDocId: exactHit.id, method: "exact", score: 1 });
      continue;
    }

    const sig = minhashSignature(cand.text2k);
    let hit: { id: number; score: number } | null = null;
    const seen = new Set<number>();
    for (let b = 0; b < BANDS && !hit; b++) {
      const key = `${b}:` + sig.slice(b * ROWS_PER_BAND, (b + 1) * ROWS_PER_BAND).join(",");
      for (const entry of buckets.get(key) ?? []) {
        if (seen.has(entry.id)) continue;
        seen.add(entry.id);
        if (!withinWindow(self, entry)) continue;
        const score = estimatedJaccard(sig, entry.sig);
        if (score >= threshold) {
          hit = { id: entry.id, score };
          break;
        }
      }
    }
    if (hit) {
      mirrors.push({ docId: cand.id, canonicalDocId: hit.id, method: "minhash", score: hit.score });
    } else {
      canonical.push(cand.id);
      accept(cand, dayNum, sig);
    }
  }

  return { mirrors, canonical };
}

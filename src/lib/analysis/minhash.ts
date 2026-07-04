// Minhash + banded LSH near-duplicate detection. Deterministic, dependency-free.
// Used to collapse re-posts/mirrors before analysis so digests don't double-count.

const NUM_HASHES = 64;
const BANDS = 16; // 16 bands x 4 rows — high recall at jaccard >= ~0.5, false
// positives are cheap because candidates are verified with estimatedJaccard

function hash32(s: string, seed: number): number {
  // FNV-1a variant with seed mixing — stable across runs
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function normalizeForShingles(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function shingles(text: string, k = 3): Set<string> {
  const words = normalizeForShingles(text).split(" ").filter(Boolean);
  const out = new Set<string>();
  if (words.length < k) {
    if (words.length > 0) out.add(words.join(" "));
    return out;
  }
  for (let i = 0; i <= words.length - k; i++) out.add(words.slice(i, i + k).join(" "));
  return out;
}

export function minhashSignature(text: string): Uint32Array {
  const sh = shingles(text);
  const sig = new Uint32Array(NUM_HASHES).fill(0xffffffff);
  for (const s of sh) {
    for (let i = 0; i < NUM_HASHES; i++) {
      const h = hash32(s, i * 0x9e3779b9);
      if (h < sig[i]) sig[i] = h;
    }
  }
  return sig;
}

export function estimatedJaccard(a: Uint32Array, b: Uint32Array): number {
  let same = 0;
  for (let i = 0; i < NUM_HASHES; i++) if (a[i] === b[i]) same++;
  return same / NUM_HASHES;
}

export interface DupGroups {
  /** canonical index -> member indexes (incl. canonical) */
  groups: Map<number, number[]>;
  /** index -> canonical index */
  canonicalOf: Map<number, number>;
}

/** Group near-duplicate texts (est. jaccard >= threshold). First-seen wins as canonical. */
export function findNearDuplicates(texts: string[], threshold = 0.7): DupGroups {
  const sigs = texts.map((t) => minhashSignature(t));
  const canonicalOf = new Map<number, number>();
  const buckets = new Map<string, number[]>();
  const rowsPerBand = NUM_HASHES / BANDS;

  for (let i = 0; i < sigs.length; i++) {
    const candidates = new Set<number>();
    for (let b = 0; b < BANDS; b++) {
      const key = `${b}:` + sigs[i].slice(b * rowsPerBand, (b + 1) * rowsPerBand).join(",");
      const bucket = buckets.get(key);
      if (bucket) for (const j of bucket) candidates.add(j);
      buckets.set(key, [...(bucket ?? []), i]);
    }
    for (const j of candidates) {
      const cj = canonicalOf.get(j) ?? j;
      if (canonicalOf.has(i)) break;
      if (estimatedJaccard(sigs[i], sigs[cj]) >= threshold) canonicalOf.set(i, cj);
    }
    if (!canonicalOf.has(i)) canonicalOf.set(i, i);
  }

  const groups = new Map<number, number[]>();
  for (const [i, c] of canonicalOf) groups.set(c, [...(groups.get(c) ?? []), i]);
  return { groups, canonicalOf };
}

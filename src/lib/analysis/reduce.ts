// Reduce core (MR sprint 3, TASK 1): deterministic clustering of per-doc map
// claims (doc_claims) into cross-doc claim groups for one (theater, track,
// window). Pure functions only — no DB, no LLM. The loader (reduce-io.ts) feeds
// it rows already filtered to current extractor versions (map-versions.ts, the
// OPEN-TASKS #35 accessor); the synthesis pass (TASK 2) consumes its groups.
//
// What a group reconstructs of the legacy batch call (audit §9c):
//   - unioned docIds            -> claim_sources multi-doc edges (§9b, ~27%)
//   - corroboration promotion   -> claimed from >=2 INDEPENDENT sources becomes
//     confirmed; independence = different source domains AND not doc_dedup
//     mirrors of each other (audit O3). Single-doc confirmed passes through
//     (HARD RULE 3 — the map already held the same evidence a batch call had).
//   - confidence                -> mean COALESCE(reliability, 0.3) over the
//     group's docs, byte-identical semantics to digest.ts stage L.
//   - entity discipline         -> map entities are NOT trusted raw (shadow
//     report §8.2): junk is dropped and aliases folded via the MR1 rules
//     (src/lib/entities/canonicalize.ts).
//   - in-doc near-dupes         -> the same clustering pass collapses them
//     (membership does not require distinct docs; shadow report §8.3).

import { canonicalKey, junkReason } from "../entities/canonicalize";

export type Hedging = "confirmed" | "claimed" | "unverified" | "assessed" | "unknown";

/** One doc_claims row plus the doc/source context the reduce needs. All rows
 *  passed to clusterClaims MUST be one (theater, track) at current extractor
 *  versions — the loader guarantees it; groups never span tracks. */
export interface ReduceClaim {
  id: number; // doc_claims.id
  docId: number; // raw_document_id (canonical: mirrors are never mapped)
  textEn: string;
  quoteOrig: string | null;
  quoteVerified: boolean;
  claimType: "factual" | "assessment";
  hedging: Hedging;
  entities: Array<{ name: string; kind: string; role: string }>;
  eventHint: string | null;
  claimDate: string; // yyyy-mm-dd (the doc's UTC day)
  sourceDomain: string | null; // sources.domain — independence signal
  sourceKey: string | null; // sources.canonical_url — display
  reliability: number | null; // sources.reliability_score
  adapter: string;
  platform: string | null;
  publishedAt: string | null; // ISO timestamp, recency signal for ranking
}

export interface ClaimGroup {
  /** deterministic id: lowest member doc_claims id */
  key: number;
  /** doc_claims ids, ascending */
  memberIds: number[];
  /** distinct raw_document ids, ascending — the claim_sources union */
  docIds: number[];
  /** distinct independence classes (domain- and mirror-aware) over the docs */
  independentSources: number;
  /** representative wording (highest-reliability member, verified-quote tiebreak) */
  text: string;
  /** best VERIFIED original-language quote, or null (render falls back to doc link) */
  quote: { text: string; docId: number } | null;
  claimType: "factual" | "assessment";
  /** after corroboration promotion */
  hedging: Hedging;
  /** true iff corroboration upgraded the hedging (audit §9b's ~33% confirmed uplift) */
  promoted: boolean;
  /** mean COALESCE(reliability, 0.3) over docIds — legacy confidence semantics */
  confidence: number;
  /** max COALESCE(reliability, 0.3) over docIds — ranking signal */
  maxReliability: number;
  /** canonicalized entity set (junk dropped, aliases folded), sorted by name */
  entities: Array<{ name: string; kind: string; role: string }>;
  /** most common non-null member hint */
  eventHint: string | null;
  /** earliest member claim_date */
  claimDate: string;
  /** latest member publishedAt (recency for ranking), null if none known */
  latestPublishedAt: string | null;
  size: number;
}

export interface ClusterOptions {
  /** pair-score cutoff; default REDUCE_THRESHOLD (tuned on labelled prod pairs
   *  by scripts/reduce-tune.ts — see the constant's comment) */
  threshold?: number;
  /** docId -> canonical docId from doc_dedup. Docs sharing a canonical are the
   *  SAME content reposted and never count as independent corroboration. Today
   *  mapped docs are all canonical, so this is defensive: any future path that
   *  lets mirror-carried claims in still cannot self-corroborate. */
  mirrorOf?: Map<number, number>;
}

// ---- pair scoring ------------------------------------------------------------

/** Signal weights. Text similarity dominates; entities and the model's own
 *  event_hint refine. Weights renormalize over the signals BOTH sides actually
 *  carry (no entities / no hint on either side ≠ evidence of difference). */
const W_TEXT = 0.6;
const W_ENTITY = 0.25;
const W_HINT = 0.15;

/** Same-group cutoff for the weighted pair score. Tuned 2026-07-09 on labelled
 *  pairs built from prod claims in the map window (scripts/reduce-tune.ts;
 *  positives = map-claim pairs bridged by a multi-doc prod claim, negatives =
 *  same-day different-event pairs; 30 pos / 187 neg): 0.35 = precision 1.000,
 *  recall 0.800 — the highest zero-false-positive point; 0.50 halves recall for
 *  nothing. Over-merge misdates claims (ruling 12); under-merge only loses
 *  corroboration edges. Numbers: docs/reviews/MR3-REDUCE-RESULTS.md. */
export const REDUCE_THRESHOLD = 0.35;

const STOPWORDS = new Set([
  "the", "a", "an", "of", "in", "on", "to", "and", "or", "for", "with", "at",
  "by", "from", "as", "that", "this", "these", "those", "its", "their", "his",
  "her", "is", "are", "was", "were", "be", "been", "being", "has", "have", "had",
  "will", "would", "into", "over", "after", "before", "during", "near", "about",
]);

/** Claim-text tokens: lowercase, punctuation stripped, stopwords dropped.
 *  Numbers are kept — "8 tankers" vs "12 vessels" is a real discriminator. */
export function claimTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/)) {
    if (raw.length < 2 && !/\d/.test(raw)) continue;
    if (STOPWORDS.has(raw)) continue;
    out.add(raw);
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const t of small) if (large.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

interface PreparedClaim {
  claim: ReduceClaim;
  tokens: Set<string>;
  entityKeys: Set<string>;
  hintTokens: Set<string>;
  dayMs: number;
}

function prepare(c: ReduceClaim): PreparedClaim {
  const entityKeys = new Set<string>();
  for (const e of c.entities) {
    const key = canonicalKey(e.name);
    if (key) entityKeys.add(key);
  }
  return {
    claim: c,
    tokens: claimTokens(c.textEn),
    entityKeys,
    hintTokens: c.eventHint ? claimTokens(c.eventHint) : new Set(),
    dayMs: Date.parse(`${c.claimDate}T00:00:00Z`),
  };
}

const DAY_MS = 86_400_000;

/** Weighted pair score in [0,1]; -1 when the day gate fails. Claims more than
 *  one day apart are different events even when worded identically — the same
 *  recurring-template rule the dedup gate applies (standing ruling 12). */
export function pairScore(a: PreparedClaim | ReduceClaim, b: PreparedClaim | ReduceClaim): number {
  const pa = "claim" in a ? (a as PreparedClaim) : prepare(a as ReduceClaim);
  const pb = "claim" in b ? (b as PreparedClaim) : prepare(b as ReduceClaim);
  if (Math.abs(pa.dayMs - pb.dayMs) > DAY_MS) return -1;

  let score = W_TEXT * jaccard(pa.tokens, pb.tokens);
  let weight = W_TEXT;
  if (pa.entityKeys.size > 0 && pb.entityKeys.size > 0) {
    score += W_ENTITY * jaccard(pa.entityKeys, pb.entityKeys);
    weight += W_ENTITY;
  }
  if (pa.hintTokens.size > 0 && pb.hintTokens.size > 0) {
    score += W_HINT * jaccard(pa.hintTokens, pb.hintTokens);
    weight += W_HINT;
  }
  return score / weight;
}

// ---- clustering ----------------------------------------------------------

/** Self-referential map artifacts ("No significant military claims found in
 *  this document.") that the map prompt lets through as claim rows. They are
 *  statements about the DOCUMENT, not the world — dropped before clustering.
 *  Deliberately tight: real negations ("Ukraine does not need Taurus missiles")
 *  must survive. Map-prompt fix deferred: changing the prompt bumps
 *  extractor_version and needs the #33 remap path. */
export function isMetaClaim(text: string): boolean {
  return /^no (significant|relevant|specific|notable)\b.*\b(claims?|developments?)\b/i.test(
    text.trim(),
  );
}

/** Cluster one (theater, track, window)'s claims into groups.
 *
 *  Greedy STAR clustering, not single-linkage union-find: each claim joins the
 *  best-scoring existing group whose ANCHOR (first member) it clears the
 *  threshold against, else founds a new group. Pairwise union-find percolates —
 *  on the real 2026-07-08 ru corpus it chained 519 claims (30% of the day) into
 *  one "group" through intermediate rewordings; anchor-scoring makes membership
 *  non-transitive, so distinct assertions about one story stay distinct claim
 *  groups (event-level aggregation is the synthesis LLM's job, not ours).
 *
 *  In-doc near-dupes collapse in the same pass (same-doc membership allowed).
 *  Deterministic: claims processed in doc_claims id order; score ties join the
 *  earliest anchor. Candidate anchors come from an inverted index over tokens +
 *  entity keys with a df cap, keeping heavy days near-linear. */
export function clusterClaims(claims: ReduceClaim[], opts: ClusterOptions = {}): ClaimGroup[] {
  const threshold = opts.threshold ?? REDUCE_THRESHOLD;
  const sorted = claims
    .filter((c) => !isMetaClaim(c.textEn))
    .sort((a, b) => a.id - b.id);
  const prepared = sorted.map(prepare);
  const dfCap = Math.max(20, Math.ceil(prepared.length * 0.25));

  const anchors: number[] = []; // prepared idx of each group's anchor
  const memberOf = new Map<number, number>(); // prepared idx -> group idx
  const groupMembers: PreparedClaim[][] = [];
  const postings = new Map<string, number[]>(); // token -> group idxs (by anchor)

  const anchorKeys = (p: PreparedClaim): string[] => [
    ...p.tokens,
    ...[...p.entityKeys].map((k) => `e:${k}`),
  ];

  for (let i = 0; i < prepared.length; i++) {
    const p = prepared[i];
    // candidate groups: any group whose anchor shares a sub-cap token/entity
    const seen = new Set<number>();
    let bestGroup = -1;
    let bestScore = -1;
    for (const key of anchorKeys(p)) {
      const list = postings.get(key);
      if (!list || list.length > dfCap) continue;
      for (const g of list) {
        if (seen.has(g)) continue;
        seen.add(g);
        const s = pairScore(p, prepared[anchors[g]]);
        if (s > bestScore || (s === bestScore && g < bestGroup)) {
          bestScore = s;
          bestGroup = g;
        }
      }
    }
    if (bestGroup >= 0 && bestScore >= threshold) {
      memberOf.set(i, bestGroup);
      groupMembers[bestGroup].push(p);
    } else {
      const g = anchors.length;
      anchors.push(i);
      memberOf.set(i, g);
      groupMembers.push([p]);
      for (const key of anchorKeys(p)) {
        const list = postings.get(key);
        if (list) list.push(g);
        else postings.set(key, [g]);
      }
    }
  }

  const out = groupMembers.map((members) => buildGroup(members, opts));
  out.sort((a, b) => a.key - b.key);
  return out;
}

// ---- group assembly --------------------------------------------------------

const rel = (r: number | null) => r ?? 0.3;

/** Distinct independence classes over the group's docs: docs unite when they
 *  share a source domain or a doc_dedup canonical (mirrors are the same content,
 *  audit O3). Docs with an unknown domain can never PROVE independence, so they
 *  contribute zero classes. */
export function independentSourceCount(
  docs: Array<{ docId: number; sourceDomain: string | null }>,
  mirrorOf?: Map<number, number>,
): number {
  const classOf = new Map<string, string>(); // class key -> root key
  const find = (k: string): string => {
    let cur = k;
    while (classOf.get(cur) !== cur) cur = classOf.get(cur)!;
    return cur;
  };
  const add = (k: string) => {
    if (!classOf.has(k)) classOf.set(k, k);
  };
  const union = (a: string, b: string) => {
    add(a);
    add(b);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) classOf.set(ra, rb);
  };
  let any = false;
  for (const d of docs) {
    if (!d.sourceDomain) continue; // unknown source — cannot prove independence
    any = true;
    const docKey = `d:${mirrorOf?.get(d.docId) ?? d.docId}`;
    union(docKey, `dom:${d.sourceDomain}`);
  }
  if (!any) return 0;
  const roots = new Set<string>();
  for (const k of classOf.keys()) roots.add(find(k));
  return roots.size;
}

const HEDGING_LADDER: Hedging[] = ["confirmed", "claimed", "unverified", "unknown"];

function buildGroup(members: PreparedClaim[], opts: ClusterOptions): ClaimGroup {
  const claims = members.map((m) => m.claim).sort((a, b) => a.id - b.id);
  const memberIds = claims.map((c) => c.id);
  const docIds = [...new Set(claims.map((c) => c.docId))].sort((a, b) => a - b);

  // confidence: mean COALESCE(reliability, 0.3) over DISTINCT docs (legacy
  // semantics — claim_sources is per doc, not per member claim)
  const relByDoc = new Map<number, number>();
  for (const c of claims) if (!relByDoc.has(c.docId)) relByDoc.set(c.docId, rel(c.reliability));
  const confidence =
    [...relByDoc.values()].reduce((s, r) => s + r, 0) / Math.max(1, relByDoc.size);
  const maxReliability = Math.max(0.3, ...relByDoc.values());

  // representative wording: highest reliability, verified quote breaks ties,
  // then lowest id (earliest extraction)
  const repr = [...claims].sort(
    (a, b) =>
      rel(b.reliability) - rel(a.reliability) ||
      Number(b.quoteVerified) - Number(a.quoteVerified) ||
      a.id - b.id,
  )[0];

  // claimType: one factual member makes the group factual — an assessment
  // echoing a reported fact must not drag the fact into assessment-land
  const claimType = claims.every((c) => c.claimType === "assessment")
    ? "assessment"
    : "factual";

  // hedging + corroboration promotion
  let hedging: Hedging;
  let promoted = false;
  if (claimType === "assessment") {
    hedging = "assessed";
  } else {
    const factual = claims.filter((c) => c.claimType === "factual");
    const strongest =
      HEDGING_LADDER.find((h) => factual.some((c) => c.hedging === h)) ?? "unknown";
    if (strongest === "confirmed") {
      hedging = "confirmed"; // single-doc confirmed passes through (HARD RULE 3)
    } else {
      const asserting = factual.filter((c) => c.hedging === "claimed");
      const indep = independentSourceCount(asserting, opts.mirrorOf);
      if (indep >= 2) {
        hedging = "confirmed";
        promoted = true;
      } else {
        hedging = strongest;
      }
    }
  }

  // entities: union -> junk dropped -> alias-folded; representative spelling =
  // most frequent raw name, clean-ASCII then lexicographic tiebreak
  const byKey = new Map<
    string,
    { names: Map<string, number>; kinds: Map<string, number>; roles: Map<string, number> }
  >();
  for (const c of claims) {
    for (const e of c.entities) {
      if (!e.name || junkReason(e.name, e.kind) !== null) continue;
      const key = canonicalKey(e.name);
      if (!key) continue;
      let slot = byKey.get(key);
      if (!slot) {
        slot = { names: new Map(), kinds: new Map(), roles: new Map() };
        byKey.set(key, slot);
      }
      slot.names.set(e.name, (slot.names.get(e.name) ?? 0) + 1);
      slot.kinds.set(e.kind, (slot.kinds.get(e.kind) ?? 0) + 1);
      slot.roles.set(e.role, (slot.roles.get(e.role) ?? 0) + 1);
    }
  }
  const asciiScore = (n: string) => (/^[\x20-\x7e]+$/.test(n) ? 1 : 0);
  const top = (m: Map<string, number>) =>
    [...m.entries()].sort(
      (a, b) => b[1] - a[1] || asciiScore(b[0]) - asciiScore(a[0]) || a[0].localeCompare(b[0]),
    )[0][0];
  const entities = [...byKey.values()]
    .map((slot) => ({ name: top(slot.names), kind: top(slot.kinds), role: top(slot.roles) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // best verified quote for evidence rendering; unverified quotes are DISPLAY-
  // barred (OPEN-TASKS #34) though still stored on their doc_claims rows
  const quoted = claims
    .filter((c) => c.quoteVerified && c.quoteOrig)
    .sort((a, b) => rel(b.reliability) - rel(a.reliability) || a.id - b.id)[0];

  // most common non-null hint, representative's own hint breaking ties
  const hintCounts = new Map<string, number>();
  for (const c of claims) {
    if (c.eventHint) hintCounts.set(c.eventHint, (hintCounts.get(c.eventHint) ?? 0) + 1);
  }
  const eventHint =
    [...hintCounts.entries()].sort(
      (a, b) =>
        b[1] - a[1] ||
        Number(b[0] === repr.eventHint) - Number(a[0] === repr.eventHint) ||
        a[0].localeCompare(b[0]),
    )[0]?.[0] ?? null;

  const publishedAts = claims.map((c) => c.publishedAt).filter((p): p is string => p !== null);

  return {
    key: memberIds[0],
    memberIds,
    docIds,
    independentSources: independentSourceCount(claims, opts.mirrorOf),
    text: repr.textEn,
    quote: quoted?.quoteOrig ? { text: quoted.quoteOrig, docId: quoted.docId } : null,
    claimType,
    hedging,
    promoted,
    confidence,
    maxReliability,
    entities,
    eventHint,
    claimDate: claims.map((c) => c.claimDate).sort()[0],
    latestPublishedAt: publishedAts.length > 0 ? publishedAts.sort().at(-1)! : null,
    size: claims.length,
  };
}

// ---- deterministic pre-ranking (TASK 2 feeds the top N to synthesis) --------

/** Recency shape borrowed from src/lib/profiles/rank.ts: exponential half-life
 *  decay floored at 0.4 so old-but-corroborated groups never vanish outright. */
const RANK_HALF_LIFE_HOURS = 48;

export function scoreGroup(g: ClaimGroup, nowMs: number): number {
  const corrob = 1 + Math.log1p(g.independentSources);
  const maxRel = g.maxReliability;
  const size = 1 + Math.log1p(g.size);
  let recency = 0.5;
  if (g.latestPublishedAt) {
    const ageH = Math.max(0, (nowMs - Date.parse(g.latestPublishedAt)) / 3_600_000);
    recency = Math.exp((-Math.LN2 * ageH) / RANK_HALF_LIFE_HOURS);
  }
  return corrob * (0.3 + maxRel) * size * (0.4 + 0.6 * recency);
}

/** Groups ranked for synthesis: score desc, then corroboration, then key. */
export function rankGroups(groups: ClaimGroup[], nowMs: number): ClaimGroup[] {
  return [...groups].sort(
    (a, b) =>
      scoreGroup(b, nowMs) - scoreGroup(a, nowMs) ||
      b.independentSources - a.independentSources ||
      a.key - b.key,
  );
}

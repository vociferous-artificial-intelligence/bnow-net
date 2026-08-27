// Conflict shadow-soak §5/§5.1 labelling instruments (roadmap Phase 9, safe
// default-off prerequisites — soak gate 5's ENGINEERING half). Pure module:
// imports nothing, touches no matcher/scorer/vocabulary/golden, and is not
// wired into any pipeline. The soak itself remains blocked on its eight §8
// operator gates; these instruments only make gate 5 executable the day a
// labeller is confirmed.
//
// Everything here is deterministic under an EXPLICIT seed string — the soak
// plan commits the seed, so the sample is reproducible and cannot be curated
// after the fact (soak §5). Ids only: no unit text, no claim text, no prose.

/** One unit's matcher outcome, reduced to what sampling needs. Adapters from
 *  the eval-profile/live-matcher shapes are the soak wiring's job. */
export interface SampleableUnitOutcome {
  unitId: string;
  verdict: "match" | "partial" | "miss" | "unmatchable";
  /** the matcher's top candidate claim for the unit, when one exists */
  topCandidateClaimId: number | null;
  /** soak §5's negative/quiet-day flag — these carry the ≤0.02 false-agreement rule */
  negativeOrQuietDay?: boolean;
}

export interface LabelPair {
  unitId: string;
  claimId: number | null;
  stratum: "matcher-match" | "matcher-miss" | "random-declared";
}

export interface StratifiedSample {
  seed: string;
  pairs: LabelPair[];
  /** strata whose population was smaller than the quota — recorded, never padded */
  shortfalls: Array<{ stratum: LabelPair["stratum"]; wanted: number; got: number }>;
}

// ---------------------------------------------------------------------------
// Seeded determinism: xmur3 string hash -> mulberry32 PRNG. Standard public-
// domain constructions; no Math.random anywhere.
function seedHash(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic Fisher–Yates over a copy, seeded by `seed`. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const rand = mulberry32(seedHash(seed));
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------------------
// W1 — soak §5: 120 stratified (unit, top-candidate-claim) pairs per conflict:
// 40 matcher-match, 40 matcher-miss, 40 random from the remaining declared
// units. Outcomes are sorted by unitId BEFORE shuffling so input order can
// never influence the sample.
export function stratifiedLabelSample(
  outcomes: readonly SampleableUnitOutcome[],
  seed: string,
  quota = 40,
): StratifiedSample {
  const sorted = [...outcomes].sort((a, b) => (a.unitId < b.unitId ? -1 : 1));
  const matches = sorted.filter((o) => o.verdict === "match" || o.verdict === "partial");
  const misses = sorted.filter((o) => o.verdict === "miss");
  const take = (
    pool: SampleableUnitOutcome[],
    stratum: LabelPair["stratum"],
    n: number,
    subSeed: string,
  ): { pairs: LabelPair[]; got: number } => {
    const picked = seededShuffle(pool, `${seed}:${subSeed}`).slice(0, n);
    return {
      pairs: picked.map((o) => ({ unitId: o.unitId, claimId: o.topCandidateClaimId, stratum })),
      got: picked.length,
    };
  };
  const m = take(matches, "matcher-match", quota, "match");
  const x = take(misses, "matcher-miss", quota, "miss");
  const usedIds = new Set([...m.pairs, ...x.pairs].map((p) => p.unitId));
  const remaining = sorted.filter((o) => !usedIds.has(o.unitId));
  const r = take(remaining, "random-declared", quota, "random");
  const shortfalls: StratifiedSample["shortfalls"] = [];
  for (const [stratum, got] of [
    ["matcher-match", m.got],
    ["matcher-miss", x.got],
    ["random-declared", r.got],
  ] as const) {
    if (got < quota) shortfalls.push({ stratum, wanted: quota, got });
  }
  return { seed, pairs: [...m.pairs, ...x.pairs, ...r.pairs], shortfalls };
}

/** W2 — soak §5.1: N ≥ 30 miss units for the unfiltered-corpus search, drawn
 *  by the same seeded mechanism. Per-hit stage attribution is a human field;
 *  the schema for it is fixed here so artifacts are comparable. */
export const MISS_DROP_STAGES = [
  "classifier_lane",
  "eligibility_predicate",
  "selection_cap",
  "genuinely_absent",
] as const;
export type MissDropStage = (typeof MISS_DROP_STAGES)[number];

export function missSearchSample(
  outcomes: readonly SampleableUnitOutcome[],
  seed: string,
  n = 30,
): { seed: string; unitIds: string[]; shortfall: number } {
  const misses = [...outcomes]
    .filter((o) => o.verdict === "miss")
    .sort((a, b) => (a.unitId < b.unitId ? -1 : 1));
  const picked = seededShuffle(misses, `${seed}:miss-search`).slice(0, n);
  return {
    seed,
    unitIds: picked.map((o) => o.unitId),
    shortfall: Math.max(0, n - picked.length),
  };
}

// ---------------------------------------------------------------------------
// W3 — label grading: Cohen's κ over the two-labeller overlap, confusion
// matrix vs the matcher, precision/recall vs the §5 thresholds, and the
// negative-unit false-agreement rate. Below κ 0.70 the ONLY verdict is
// label_quality_failed — the matcher is not graded at all (soak §5).

export interface HumanLabel {
  unitId: string;
  claimId: number | null;
  /** does the pair satisfy §6.3 material equivalence, per the human */
  isMatch: boolean;
}

export const KAPPA_FLOOR = 0.7;
export const PRECISION_THRESHOLD = 0.9;
export const RECALL_THRESHOLD = 0.75;
export const FALSE_AGREEMENT_MAX = 0.02;

export function cohensKappa(a: readonly boolean[], b: readonly boolean[]): number {
  if (a.length !== b.length || a.length === 0) {
    throw new Error("kappa needs two equal-length non-empty label vectors");
  }
  const n = a.length;
  let agree = 0;
  let aYes = 0;
  let bYes = 0;
  for (let i = 0; i < n; i++) {
    if (a[i] === b[i]) agree++;
    if (a[i]) aYes++;
    if (b[i]) bYes++;
  }
  const po = agree / n;
  const pe = (aYes / n) * (bYes / n) + ((n - aYes) / n) * ((n - bYes) / n);
  if (pe === 1) return po === 1 ? 1 : 0; // degenerate: all labels identical on both sides
  return (po - pe) / (1 - pe);
}

export interface MatcherGrade {
  verdict: "graded" | "label_quality_failed";
  kappa: number | null;
  /** of matcher-declared matches, share the human confirmed */
  precision: number | null;
  /** of human-labelled true matches in the sample, share the matcher found */
  recall: number | null;
  falseAgreementRate: number | null;
  confusion: { tp: number; fp: number; fn: number; tn: number };
  thresholds: { precisionOk: boolean | null; recallOk: boolean | null; falseAgreementOk: boolean | null };
}

export function gradeMatcher(
  sample: StratifiedSample,
  outcomes: readonly SampleableUnitOutcome[],
  primary: readonly HumanLabel[],
  overlapSecondary: readonly HumanLabel[] | null,
): MatcherGrade {
  const byUnit = new Map(outcomes.map((o) => [o.unitId, o]));
  const labelOf = new Map(primary.map((l) => [l.unitId, l]));
  // κ over the overlap FIRST — labels below the floor grade nothing
  let kappa: number | null = null;
  if (overlapSecondary !== null && overlapSecondary.length > 0) {
    const paired = overlapSecondary
      .map((s) => [labelOf.get(s.unitId), s] as const)
      .filter(([p]) => p !== undefined) as Array<[HumanLabel, HumanLabel]>;
    if (paired.length === 0) throw new Error("overlap labels share no unitId with the primary set");
    kappa = cohensKappa(
      paired.map(([p]) => p.isMatch),
      paired.map(([, s]) => s.isMatch),
    );
    if (kappa < KAPPA_FLOOR) {
      return {
        verdict: "label_quality_failed",
        kappa,
        precision: null,
        recall: null,
        falseAgreementRate: null,
        confusion: { tp: 0, fp: 0, fn: 0, tn: 0 },
        thresholds: { precisionOk: null, recallOk: null, falseAgreementOk: null },
      };
    }
  }
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  let negativeUnits = 0;
  let negativeFalseAgreements = 0;
  for (const pair of sample.pairs) {
    const label = labelOf.get(pair.unitId);
    const outcome = byUnit.get(pair.unitId);
    if (!label || !outcome) continue; // unlabelled pairs simply do not grade
    const matcherSaysMatch = outcome.verdict === "match" || outcome.verdict === "partial";
    if (matcherSaysMatch && label.isMatch) tp++;
    else if (matcherSaysMatch && !label.isMatch) fp++;
    else if (!matcherSaysMatch && label.isMatch) fn++;
    else tn++;
    if (outcome.negativeOrQuietDay === true) {
      negativeUnits++;
      if (matcherSaysMatch && !label.isMatch) negativeFalseAgreements++;
    }
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : null;
  const recall = tp + fn > 0 ? tp / (tp + fn) : null;
  const falseAgreementRate = negativeUnits > 0 ? negativeFalseAgreements / negativeUnits : null;
  return {
    verdict: "graded",
    kappa,
    precision,
    recall,
    falseAgreementRate,
    confusion: { tp, fp, fn, tn },
    thresholds: {
      precisionOk: precision === null ? null : precision >= PRECISION_THRESHOLD,
      recallOk: recall === null ? null : recall >= RECALL_THRESHOLD,
      falseAgreementOk: falseAgreementRate === null ? null : falseAgreementRate <= FALSE_AGREEMENT_MAX,
    },
  };
}

// ---------------------------------------------------------------------------
// W4 — R-M-6 sample-power sizing: normal-approximation CI half-width for an
// observed proportion, and the n required to resolve a threshold with a given
// margin. Records the audit's own observation: at n=40 per stratum, one
// miscall moves the estimate 1/40 = 2.5pp, and the 95% half-width at p=0.9 is
// ~9.3pp — far wider than the 10pp gap the 0.90 precision threshold implies.
export function ciHalfWidth(p: number, n: number, z = 1.96): number {
  if (n <= 0) throw new Error("n must be positive");
  return z * Math.sqrt((p * (1 - p)) / n);
}

export function requiredN(p: number, halfWidth: number, z = 1.96): number {
  if (halfWidth <= 0) throw new Error("halfWidth must be positive");
  return Math.ceil((z * z * p * (1 - p)) / (halfWidth * halfWidth));
}

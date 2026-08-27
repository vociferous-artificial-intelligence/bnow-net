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
//
// PARTIAL-VERDICT POLICY (deliberately NOT adjudicated here): soak §5's
// match/miss dichotomy predates register #12's compound/`partial` semantics,
// and register #12.3 is the pending adjudication. This module therefore
// treats "matcher-match" STRICTLY (verdict === "match"); `partial` units are
// excluded from both deliberate strata (they remain eligible for the random
// stratum), every sampled pair records its verdict, and grading reports
// partial pairs as a separate denominator-neutral diagnostic block — so the
// grade can be decomposed under EITHER future adjudication of #12.3, and no
// policy is decided invisibly.

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
  /** the matcher's verdict at sampling time — preserved so the #12.3
   *  adjudication can re-slice the grade without redrawing the sample */
  verdict: SampleableUnitOutcome["verdict"];
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
function assertUniqueUnitIds(outcomes: readonly SampleableUnitOutcome[], fn: string): void {
  const seen = new Set<string>();
  for (const o of outcomes) {
    if (seen.has(o.unitId)) {
      throw new Error(
        `${fn}: duplicate unitId "${o.unitId}" — resolve the two soak populations into one outcome per unit BEFORE sampling (the union is the caller's explicit responsibility)`,
      );
    }
    seen.add(o.unitId);
  }
}

export function stratifiedLabelSample(
  outcomes: readonly SampleableUnitOutcome[],
  seed: string,
  quota = 40,
): StratifiedSample {
  assertUniqueUnitIds(outcomes, "stratifiedLabelSample");
  const sorted = [...outcomes].sort((a, b) => (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0));
  // STRICT match stratum — see the partial-verdict policy in the header
  const matches = sorted.filter((o) => o.verdict === "match");
  const misses = sorted.filter((o) => o.verdict === "miss");
  const take = (
    pool: SampleableUnitOutcome[],
    stratum: LabelPair["stratum"],
    n: number,
    subSeed: string,
  ): { pairs: LabelPair[]; got: number } => {
    const picked = seededShuffle(pool, `${seed}:${subSeed}`).slice(0, n);
    return {
      pairs: picked.map((o) => ({
        unitId: o.unitId,
        claimId: o.topCandidateClaimId,
        stratum,
        verdict: o.verdict,
      })),
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

export const UPSTREAM_FALSE_EXCLUSION_MAX = 0.1;

export function missSearchSample(
  outcomes: readonly SampleableUnitOutcome[],
  seed: string,
  n = 30,
): { seed: string; unitIds: string[]; shortfall: number } {
  assertUniqueUnitIds(outcomes, "missSearchSample");
  const misses = [...outcomes]
    .filter((o) => o.verdict === "miss")
    .sort((a, b) => (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0));
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

/** Returns null on degenerate marginals (both labellers constant): such an
 *  overlap carries ZERO evidence of labeller reliability, and a fail-closed
 *  instrument must not let it pass the floor. */
export function cohensKappa(a: readonly boolean[], b: readonly boolean[]): number | null {
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
  if (pe === 1) return null; // degenerate: no discriminative evidence
  return (po - pe) / (1 - pe);
}

export interface MatcherGrade {
  /** grading REQUIRES a usable two-labeller overlap: absent/empty overlap is
   *  its own verdict, never a silent pass (fail-closed) */
  verdict: "graded" | "label_quality_failed" | "ungraded_no_overlap";
  kappa: number | null;
  /** overlap pairs κ was actually computed over (shrinkage is visible) */
  kappaPairs: number;
  /** of matcher-declared strict matches, share the human confirmed */
  precision: number | null;
  /** of human-labelled true matches in the sample, share the matcher found */
  recall: number | null;
  falseAgreementRate: number | null;
  confusion: { tp: number; fp: number; fn: number; tn: number };
  /** register #12.3 pending: partial-verdict pairs graded as a SEPARATE
   *  denominator-neutral diagnostic, never folded into the confusion matrix */
  partialDiagnostic: { pairs: number; humanConfirmed: number };
  /** labels excluded because their claimId disagreed with the sampled pair */
  labelClaimMismatches: number;
  labelledPairs: number;
  totalPairs: number;
  thresholds: { precisionOk: boolean | null; recallOk: boolean | null; falseAgreementOk: boolean | null };
}

export function gradeMatcher(
  sample: StratifiedSample,
  outcomes: readonly SampleableUnitOutcome[],
  primary: readonly HumanLabel[],
  overlapSecondary: readonly HumanLabel[] | null,
): MatcherGrade {
  assertUniqueUnitIds(outcomes, "gradeMatcher");
  const byUnit = new Map(outcomes.map((o) => [o.unitId, o]));
  const labelOf = new Map(primary.map((l) => [l.unitId, l]));
  const emptyGrade = (verdict: MatcherGrade["verdict"], kappa: number | null, kappaPairs: number): MatcherGrade => ({
    verdict,
    kappa,
    kappaPairs,
    precision: null,
    recall: null,
    falseAgreementRate: null,
    confusion: { tp: 0, fp: 0, fn: 0, tn: 0 },
    partialDiagnostic: { pairs: 0, humanConfirmed: 0 },
    labelClaimMismatches: 0,
    labelledPairs: 0,
    totalPairs: sample.pairs.length,
    thresholds: { precisionOk: null, recallOk: null, falseAgreementOk: null },
  });
  // κ over the overlap FIRST — no usable overlap grades NOTHING (fail-closed)
  if (overlapSecondary === null || overlapSecondary.length === 0) {
    return emptyGrade("ungraded_no_overlap", null, 0);
  }
  const paired = overlapSecondary
    .map((s) => [labelOf.get(s.unitId), s] as const)
    .filter(([p]) => p !== undefined) as Array<[HumanLabel, HumanLabel]>;
  if (paired.length === 0) throw new Error("overlap labels share no unitId with the primary set");
  const kappa = cohensKappa(
    paired.map(([p]) => p.isMatch),
    paired.map(([, s]) => s.isMatch),
  );
  // degenerate κ (both labellers constant) carries no reliability evidence —
  // treated as a label-quality failure, never a pass
  if (kappa === null || kappa < KAPPA_FLOOR) {
    return emptyGrade("label_quality_failed", kappa, paired.length);
  }
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  let negativeUnits = 0;
  let negativeFalseAgreements = 0;
  let partialPairs = 0;
  let partialConfirmed = 0;
  let labelClaimMismatches = 0;
  let labelledPairs = 0;
  for (const pair of sample.pairs) {
    const label = labelOf.get(pair.unitId);
    const outcome = byUnit.get(pair.unitId);
    if (!label || !outcome) continue; // unlabelled pairs do not grade (coverage reported)
    // the sample is (unit, claim) PAIRS — a label judged against a different
    // claim, or an outcomes drift from the sampled claim, must not grade
    if (label.claimId !== pair.claimId || outcome.topCandidateClaimId !== pair.claimId) {
      labelClaimMismatches++;
      continue;
    }
    labelledPairs++;
    if (pair.verdict === "partial") {
      // register #12.3 pending: diagnostic only, denominator-neutral
      partialPairs++;
      if (label.isMatch) partialConfirmed++;
      continue;
    }
    const matcherSaysMatch = outcome.verdict === "match";
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
    kappaPairs: paired.length,
    precision,
    recall,
    falseAgreementRate,
    confusion: { tp, fp, fn, tn },
    partialDiagnostic: { pairs: partialPairs, humanConfirmed: partialConfirmed },
    labelClaimMismatches,
    labelledPairs,
    totalPairs: sample.pairs.length,
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

import type { ClaimEvidenceSummary } from "@/components/claim-evidence-model";

// WS-7.4 — the ICD 203 likelihood band and the corroboration-derived confidence
// level, as data.
//
// WHAT THIS IS. A PRESENTATION mapping, signed by the operator as data (decision
// T3, 2026-09-07). It renders an estimative posture from two things the pipeline
// already produced: the source's own hedging class, and how independent the
// documents behind the claim are. It creates no new analytic judgment, reads no
// model, makes no call and persists nothing.
//
// WHAT IT DELIBERATELY DOES NOT READ (T3-a). Not `claims.confidence` — that
// column is the mean of `sources.reliability_score` (digest-persist.ts:244-252),
// the uncalibrated quantity OPEN-TASKS #14 gates and that the digest page already
// refuses to render. Not any source reliability score, for the same reason.
// Feeding either in would launder an uncalibrated number into an ICD 203
// percentage. The signature is therefore (hedging, evidence-counts) only, and the
// module has no runtime import at all — see estimative.test.ts's hygiene scan.
//
// WHAT IS NEVER MACHINE-ASSIGNED (T3-b). The three sub-even bands
// (`almost no chance`, `very unlikely`, `unlikely`), because the pipeline has no
// refutation or contradiction mechanism and must never assert that a claim is
// LESS likely than even odds. `almost certain`, reserved for a future
// analyst-verified tier. AJP-2.1 information-credibility levels 4 (doubtful) and
// 5 (improbable), which are the same negative judgment in the export vocabulary.
//
// VERSIONING. Any change to any cell is a NEW VERSION, never an edit to V1: a
// shipped estimative label must stay reconstructible. A prompt-level
// implementation supersedes this as V2 only after step 4 of the evaluation
// program.

/** Stamp this on anything that records an estimate. V1 cells are frozen. */
export const ESTIMATIVE_MAP_VERSION = "estimative-map-v1";

/** The five-value hedging enum (schema.ts:38-44). Anything else resolves to
 *  `unknown`, matching claim-copy-model.ts's own `status()` fallback. */
export type HedgingClass = "confirmed" | "assessed" | "claimed" | "unverified" | "unknown";

/**
 * Corroboration tiers, computed from evidence counts alone.
 *
 * `none` exists so the function is TOTAL. Under ruling 2 every claim keeps at
 * least one raw_document link, enforced by a database trigger, so it should be
 * unreachable in production — which is exactly why it must fail closed rather
 * than default to a band.
 */
export type CorroborationTier = "none" | "C0" | "C1" | "C2" | "C3";

/** The seven ICD 203 (2015) bands, all declared. Only three are assignable in
 *  V1; the other four are here so the table's silence about them is explicit
 *  and testable rather than an omission a later reader has to infer. */
export type LikelihoodBand =
  | "almost no chance"
  | "very unlikely"
  | "unlikely"
  | "roughly even chance"
  | "likely"
  | "very likely"
  | "almost certain";

/** The subset ESTIMATIVE_MAP_V1 may emit (T3-b). */
export type AssignableBand = "roughly even chance" | "likely" | "very likely";

export type ConfidenceLevel = "low" | "moderate" | "high";

/** NATO AJP-2.1 information credibility, 1-6. EXPORT ONLY — derived from the
 *  band below so the two tables can never disagree, and never the primary
 *  presentation (decision T1). 4 and 5 are never assigned (T3-b). */
export type InformationCredibility = 1 | 2 | 3 | 4 | 5 | 6;
export type AssignableCredibility = 1 | 2 | 3 | 6;

/** Inclusive-exclusive percentage range, as published by ICD 203. Kept in the
 *  output verbatim so a UK reader can map to the PHIA probability yardstick
 *  themselves — PHIA's bands differ, and relabelling server-side would be a
 *  silent conversion. */
export type PercentRange = readonly [number, number];

export const ICD203_RANGES: Readonly<Record<LikelihoodBand, PercentRange>> = {
  "almost no chance": [1, 5],
  "very unlikely": [5, 20],
  unlikely: [20, 45],
  "roughly even chance": [45, 55],
  likely: [55, 80],
  "very likely": [80, 95],
  "almost certain": [95, 99],
};

/** Bands V1 may emit, in ascending order — also the monotonicity order the
 *  invariant test compares against. */
export const ASSIGNABLE_BANDS: readonly AssignableBand[] = [
  "roughly even chance",
  "likely",
  "very likely",
] as const;

export const CONFIDENCE_ORDER: readonly ConfidenceLevel[] = ["low", "moderate", "high"] as const;

/**
 * What the mapping returns. `likelihood`, `range` and `confidence` are null
 * together, and only for tier `none`: with no usable evidence document the
 * function withholds both axes rather than defaulting to a band.
 */
export interface Estimate {
  tier: CorroborationTier;
  likelihood: AssignableBand | null;
  range: PercentRange | null;
  confidence: ConfidenceLevel | null;
  /** Export-only (T1); 6 when the tier is `none`. */
  credibility: AssignableCredibility;
  /** True when the tier is `none` — nothing is assessable. */
  withheld: boolean;
  version: typeof ESTIMATIVE_MAP_VERSION;
}

interface Cell {
  likelihood: AssignableBand;
  confidence: ConfidenceLevel;
}

/**
 * ESTIMATIVE_MAP_V1 — the signed table, verbatim from PLAN-WS-7 §6.2.
 *
 * Rationale is recorded one line per cell, because the table is the artifact a
 * methodology validator audits and a grid of bare strings is not auditable.
 *
 * Reading the two axes: HEDGING SETS THE CEILING, CORROBORATION LIFTS WITHIN IT.
 * The band may never exceed what the strongest source actually asserts, and
 * corroboration may never manufacture an assertion no source made.
 */
export const ESTIMATIVE_MAP_V1: Readonly<
  Record<HedgingClass, Readonly<Record<Exclude<CorroborationTier, "none">, Cell>>>
> = {
  confirmed: {
    // Confirmation language is the strongest per-document signal the enum
    // carries, but it is still one source's assertion — capped at `likely`,
    // which is also the T3 constraint ceiling for a single uncorroborated doc.
    C0: { likelihood: "likely", confidence: "moderate" },
    // The same publisher repeating itself adds volume, not independence.
    C1: { likelihood: "likely", confidence: "moderate" },
    // Independent channels corroborate the event; confidence stays `moderate`
    // because single-platform sourcing has correlated failure modes (one
    // Telegram ecosystem is not two witnesses).
    C2: { likelihood: "very likely", confidence: "moderate" },
    // Confirmation plus cross-platform independent corroboration is the
    // strongest evidence the pipeline can assemble: the ONLY `high` cell.
    C3: { likelihood: "very likely", confidence: "high" },
  },
  assessed: {
    // An assessment is a judgment about the world, not an observation of it;
    // BNOW inherits neither its evidence nor its calibration.
    C0: { likelihood: "roughly even chance", confidence: "low" },
    // One assessor restating a judgment is not corroboration of that judgment.
    C1: { likelihood: "roughly even chance", confidence: "low" },
    // Converging independent assessments are meaningful, but analyst
    // convergence is correlated by shared open sources (PRODUCT-BRIEF §4.3's
    // own validation caveat) — `likely`, not more.
    C2: { likelihood: "likely", confidence: "moderate" },
    // Capped at `likely`: cross-platform convergence of JUDGMENTS still
    // transmits no new observation, so it must not reach the band reserved for
    // confirmed events.
    C3: { likelihood: "likely", confidence: "moderate" },
  },
  claimed: {
    // A single attributed, unconfirmed claim. The honest signal is carried by
    // `low` confidence, not by pushing the band below even, which would assert
    // a disbelief BNOW has not earned.
    C0: { likelihood: "roughly even chance", confidence: "low" },
    // Same-channel repetition is the classic amplification pattern; it must
    // never raise the band.
    C1: { likelihood: "roughly even chance", confidence: "low" },
    // Independent channels making the same claim is genuine corroboration, and
    // ruling 12's same-theater +/-1-day dedup means these are not mirrors of
    // one post.
    C2: { likelihood: "likely", confidence: "moderate" },
    // Capped at `likely`: no source here asserts confirmation.
    C3: { likelihood: "likely", confidence: "moderate" },
  },
  unverified: {
    // Explicit non-verification is a statement about the evidence, not about
    // the world: neutral band, lowest confidence.
    C0: { likelihood: "roughly even chance", confidence: "low" },
    // Repetition cannot supply the verification the source itself disclaimed.
    C1: { likelihood: "roughly even chance", confidence: "low" },
    // Independent channels raise confidence in the REPORTING; the band stays
    // neutral because every one of them disclaims verification.
    C2: { likelihood: "roughly even chance", confidence: "moderate" },
    // Cross-platform independence is the point at which corroboration
    // substitutes for verification — one notch, to `likely`, never beyond.
    C3: { likelihood: "likely", confidence: "moderate" },
  },
  unknown: {
    // Ruling 16 fixes `unknown` at mid-trust BY DESIGN (an unhedged
    // declarative, weight 0.5): neutral band, `low`.
    C0: { likelihood: "roughly even chance", confidence: "low" },
    // Repetition by one channel cannot resolve a classification the extractor
    // could not make.
    C1: { likelihood: "roughly even chance", confidence: "low" },
    // Independent channels raise confidence in the reporting; the band stays
    // neutral because ruling 16 forbids reading an unhedged declarative as a
    // confirmation.
    C2: { likelihood: "roughly even chance", confidence: "moderate" },
    // Cross-platform independence is the only evidence that moves an
    // unclassified declarative off neutral, and only to `likely`; confidence
    // never reaches `high` while the hedging class itself is unresolved.
    C3: { likelihood: "likely", confidence: "moderate" },
  },
};

const HEDGING_CLASSES: readonly HedgingClass[] = [
  "confirmed",
  "assessed",
  "claimed",
  "unverified",
  "unknown",
] as const;

export const CORROBORATION_TIERS: readonly CorroborationTier[] = [
  "none",
  "C0",
  "C1",
  "C2",
  "C3",
] as const;

/** Out-of-enum, empty and mis-cased hedging values all resolve to `unknown`,
 *  which is the existing house fallback (claim-copy-model.ts `status()`). */
export function normalizeHedging(hedging: string | null | undefined): HedgingClass {
  const key = hedging?.trim().toLocaleLowerCase();
  return (HEDGING_CLASSES as readonly string[]).includes(key ?? "")
    ? (key as HedgingClass)
    : "unknown";
}

/** Defensive count read: a non-finite, negative or fractional count is not a
 *  count, and a bad one must lower the tier rather than raise it. */
function count(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

/**
 * The corroboration tier, from evidence counts alone. Total by construction.
 *
 * Caveat worth knowing when reading a C3: `summarizeClaimEvidence` namespaces
 * unmapped adapters per adapter (claim-evidence-model.ts:236-241), so two
 * different unmapped adapters count as two platforms. That is deliberate — they
 * ARE different transports — but it means "2 platforms" is not always "two
 * household-name platforms".
 *
 * The final `else` is a degenerate guard (>=2 documents reporting 0 channels,
 * which `summarizeClaimEvidence` cannot produce). It resolves to C1, the lowest
 * tier consistent with >=2 documents; C0 and C1 carry identical cells in every
 * row of V1, so the choice cannot change any estimate.
 */
export function corroborationTier(evidence: ClaimEvidenceSummary): CorroborationTier {
  const documents = count(evidence?.documents);
  if (documents === 0) return "none";
  if (documents === 1) return "C0";

  const channels = count(evidence?.channels);
  const platforms = count(evidence?.platforms);
  if (channels === 1) return "C1";
  if (channels >= 2) return platforms >= 2 ? "C3" : "C2";
  return "C1";
}

/**
 * AJP-2.1 information credibility, DERIVED from the band so the two signed
 * tables cannot disagree (PLAN-WS-7 §6.3).
 *
 * 1 = confirmed by other sources — the standard's literal definition, so only
 * confirmation language PLUS independent cross-platform corroboration earns it.
 * 2 = probably true; 3 = possibly true; 6 = truth cannot be judged (fail-closed).
 * 4 (doubtful) and 5 (improbable) are NEVER assigned: BNOW has no contradiction
 * or refutation mechanism, and stamping "doubtful" on a claim because we saw one
 * source would export a negative judgment we have not earned.
 */
function credibilityFor(
  hedging: HedgingClass,
  tier: CorroborationTier,
  band: AssignableBand | null,
): AssignableCredibility {
  if (tier === "none" || band === null) return 6;
  if (hedging === "confirmed" && tier === "C3") return 1;
  if (band === "very likely" || band === "likely") return 2;
  return 3;
}

/**
 * The one entry point. Total: every input, including garbage, yields an
 * Estimate, and the fail-closed direction is always `withheld`.
 */
export function estimateForClaim(
  hedging: string | null | undefined,
  evidence: ClaimEvidenceSummary,
): Estimate {
  const normalized = normalizeHedging(hedging);
  const tier = corroborationTier(evidence);

  if (tier === "none") {
    return {
      tier,
      likelihood: null,
      range: null,
      confidence: null,
      credibility: 6,
      withheld: true,
      version: ESTIMATIVE_MAP_VERSION,
    };
  }

  const cell = ESTIMATIVE_MAP_V1[normalized][tier];
  return {
    tier,
    likelihood: cell.likelihood,
    range: ICD203_RANGES[cell.likelihood],
    confidence: cell.confidence,
    credibility: credibilityFor(normalized, tier, cell.likelihood),
    withheld: false,
    version: ESTIMATIVE_MAP_VERSION,
  };
}

/** "55-80%" — an en dash, per ICD 203's own typography. */
export function formatPercentRange(range: PercentRange): string {
  return `${range[0]}–${range[1]}%`;
}

/** "likely (55-80%)", or the withheld marker. English throughout: the band is a
 *  defined term of the standard, and a translated band term would not be the
 *  band. Surrounding chrome IS translated — see the `tradecraft.*` catalog keys. */
export const ESTIMATIVE_WITHHELD_LABEL = "not assessable";

export function likelihoodLabel(estimate: Estimate): string {
  if (!estimate.likelihood || !estimate.range) return ESTIMATIVE_WITHHELD_LABEL;
  return `${estimate.likelihood} (${formatPercentRange(estimate.range)})`;
}

export function confidenceLabel(estimate: Estimate): string {
  return estimate.confidence ?? ESTIMATIVE_WITHHELD_LABEL;
}

/**
 * One sentence explaining where the estimate came from, for a tooltip, an
 * aria-label and the citation artifact. It names the two inputs and the version,
 * so a reader never meets a band without its derivation — which matters most on
 * /ask, where no hedging chip is rendered beside it.
 */
export function estimateDerivation(hedging: string | null | undefined, estimate: Estimate): string {
  const normalized = normalizeHedging(hedging);
  const basis = `source classification "${normalized}", corroboration tier ${estimate.tier}`;
  return estimate.withheld
    ? `Not assessable: no usable evidence document (${basis}; ${estimate.version}).`
    : `${basis}; ${estimate.version}.`;
}

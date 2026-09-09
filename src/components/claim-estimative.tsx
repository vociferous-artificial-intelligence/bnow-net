import {
  confidenceLabel,
  estimateDerivation,
  estimateForClaim,
  likelihoodLabel,
} from "@/lib/tradecraft/estimative";
import { summarizeClaimEvidence, type ClaimSourceDoc } from "./claim-evidence-model";

// WS-7.4 — the one place a claim's ICD 203 likelihood band and its
// corroboration-derived confidence are rendered. Presentational leaf: the whole
// mapping lives in src/lib/tradecraft/estimative.ts, and this file only decides
// how it looks.
//
// No "use client" — the four surfaces that render it are server components on
// the digest, search and signals pages and a server-rendered subtree of the ask
// form, which IS a client component. The estimative module has no runtime
// import, so entering the client bundle here costs nothing and pulls nothing.
//
// The two label rules, both binding:
//   - "Corroboration-derived confidence", NEVER "analyst confidence". The level
//     is machine-derived from how independent the documents are; a reader must
//     not take it for a human analyst's judgment (addendum §4.4 honesty
//     constraint, crosswalk row of the same name).
//   - The BAND TERM and its PERCENTAGE RANGE are ICD 203 defined terms and stay
//     verbatim English, and the range is always shown so a UK reader can map to
//     the PHIA yardstick themselves — PHIA's bands differ from ICD 203's, so
//     relabelling server-side would be a silent conversion. Only the two field
//     labels are translated.

export interface ClaimEstimativeLabels {
  likelihood: string;
  confidence: string;
  derivedFrom: string;
}

export function claimEstimativeLabels(t: (key: string) => string): ClaimEstimativeLabels {
  return {
    likelihood: t("tradecraft.likelihood"),
    confidence: t("tradecraft.confidence"),
    derivedFrom: t("tradecraft.derived_from"),
  };
}

export interface ClaimEstimativeProps {
  hedging: string;
  docs: readonly ClaimSourceDoc[];
  labels: ClaimEstimativeLabels;
  /** Extra classes for the surface to control spacing only. */
  className?: string;
}

/**
 * Rendered as its own muted line immediately after the claim text rather than
 * inline before it: the hedging chip and the claim text are what an analyst
 * scans, and a 60-character estimative clause wedged between them buries the
 * claim. The hedging label is untouched and stays where it is — this is added
 * beside it, never in place of it.
 */
export function ClaimEstimative({ hedging, docs, labels, className }: ClaimEstimativeProps) {
  const estimate = estimateForClaim(hedging, summarizeClaimEvidence(docs));
  return (
    <div
      data-print="estimative"
      data-testid="claim-estimative"
      data-estimative-version={estimate.version}
      title={`${labels.derivedFrom} ${estimateDerivation(hedging, estimate)}`}
      className={`text-xs text-gray-600 dark:text-gray-400 ${className ?? "mt-1"}`}
    >
      <span>
        {labels.likelihood}: {likelihoodLabel(estimate)}
      </span>
      <span aria-hidden="true"> · </span>
      <span>
        {labels.confidence}: {confidenceLabel(estimate)}
      </span>
    </div>
  );
}

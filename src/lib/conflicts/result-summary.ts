// Pure derivations over a scored ConflictResultV1 — no IO, no DB, no fixtures.
//
// These lived in `product-view.ts` (the fixture provider) because that was the
// only provider. They are functions of the RESULT, not of where the result came
// from, so both providers and the shared presentation components read them from
// here instead: a component that needed `partialCountsOf` used to pull the
// fixture corpus loader into the DB-backed pages' module graph, which is the
// ruling-3 boundary `db-product-view.ts` exists to keep clean.

import type { ConflictScoredResultV1 } from "./eval-profile";

export interface PartialCounts {
  corpusRecall: number;
  publishedRetention: number;
  /** the headline diagnostic: the UNION of distinct partial units across both
   *  populations — never presented as a per-population number */
  union: number;
}

/** Distinct claims in the PUBLISHED-RETENTION union of one scored result —
 *  matched claims plus in-scope BNOW-only items. Zero means the gated
 *  evidence view for that record would be empty, so the surfaces re-label
 *  their evidence links instead of spending a sign-in wall on nothing
 *  (Gate-7 product NOTE-3). */
export function publishedUnionCountOf(result: ConflictScoredResultV1): number {
  return new Set([
    ...(result.agreements?.publishedRetention ?? []).flatMap((a) =>
      a.claims.map((c) => c.claimId),
    ),
    ...(result.bnowOnly?.publishedRetention.items ?? []).map((i) => i.claimId),
  ]).size;
}

export function partialCountsOf(result: ConflictScoredResultV1): PartialCounts {
  const count = (verdicts: Readonly<Record<string, string>>): number =>
    Object.values(verdicts).filter((v) => v === "partial").length;
  return {
    corpusRecall: count(result.corpusRecall),
    publishedRetention: count(result.publishedRetention),
    union: result.headline.partialDiagnostic ?? 0,
  };
}

/** Memo C8's companion count: matched takeaways whose published-retention
 *  evidence is ENTIRELY legacy-engine. C8 kept the shipped contract — legacy
 *  claims are MEMBERS of published retention, not excluded from the numerator —
 *  and asked the view to say, beside the number, how much of it rests on
 *  theaters with no mapped corpus. Computed over the agreement records rather
 *  than the verdict map, because "legacy" is a property of the contributing
 *  claims, not of the takeaway. */
export function legacyOnlyMatchedCount(result: ConflictScoredResultV1): number {
  let n = 0;
  for (const agreement of result.agreements?.publishedRetention ?? []) {
    if (agreement.claims.length > 0 && agreement.claims.every((c) => c.legacy)) n += 1;
  }
  return n;
}

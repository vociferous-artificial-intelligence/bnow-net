import {
  expandToponyms,
  extractSignature,
  matchScore,
  MATCH_THRESHOLD,
  type Signature,
} from "./keywords";
import type { IswTakeaway } from "./isw-extract";

// Scoring a digest against the same-day ISW assessment.
// Metrics (definitions are part of the product; see /scoreboard):
// - coveragePct: % of ISW takeaways matched by >=1 of our claims
// - divergences: isw_only (we missed), ours_only (we saw, ISW didn't - a potential lead)
// - thinSourcedRate ("unsupported-claim rate"): claims backed by <2 docs AND
//   hedged claimed/unverified. Schema guarantees >=1 source, so 'unsupported'
//   in the literal sense is impossible - thin-sourced is the honest analogue.
// - timelinessHours: median (ISW publish time - earliest supporting doc time)
//   across matched pairs; positive = we had the information first.

export interface ClaimForValidation {
  claimId: number;
  text: string;
  hedging: string;
  docCount: number;
  earliestDocAt: string | null; // ISO
}

export interface DivergenceEntry {
  kind: "agreement" | "isw_only" | "ours_only";
  iswIndex?: number;
  iswToponyms?: string[];
  iswActions?: string[];
  claimId?: number;
  claimText?: string;
  score?: number;
}

export interface ValidationScore {
  coveragePct: number | null;
  thinSourcedRate: number;
  timelinessHours: number | null;
  divergences: DivergenceEntry[];
  details: {
    iswTakeaways: number;
    matchableTakeaways: number;
    ourClaims: number;
    matchedPairs: number;
    threshold: number;
  };
}

import type { LlmMatch } from "./llm-match";

/** Score using precomputed LLM semantic matches (preferred when available). */
export function scoreDigestWithMatches(
  takeaways: IswTakeaway[],
  claims: ClaimForValidation[],
  iswPublishedAt: Date | null,
  matches: LlmMatch[],
): ValidationScore {
  const claimById = new Map(claims.map((c) => [c.claimId, c]));
  const divergences: DivergenceEntry[] = [];
  const matchedClaims = new Set<number>();
  const leadHours: number[] = [];
  let matched = 0;

  for (const t of takeaways) {
    const m = matches.find((x) => x.takeawayIndex === t.index);
    const claim = m?.claimId != null ? claimById.get(m.claimId) : undefined;
    if (claim) {
      matched++;
      matchedClaims.add(claim.claimId);
      divergences.push({
        kind: "agreement",
        iswIndex: t.index,
        iswToponyms: t.toponyms,
        iswActions: t.actions,
        claimId: claim.claimId,
        claimText: claim.text.slice(0, 200),
        score: +(m!.confidence).toFixed(2),
      });
      if (iswPublishedAt && claim.earliestDocAt) {
        leadHours.push(
          (iswPublishedAt.getTime() - new Date(claim.earliestDocAt).getTime()) / 3.6e6,
        );
      }
    } else {
      divergences.push({
        kind: "isw_only",
        iswIndex: t.index,
        iswToponyms: t.toponyms,
        iswActions: t.actions,
      });
    }
  }
  for (const c of claims) {
    if (!matchedClaims.has(c.claimId))
      divergences.push({ kind: "ours_only", claimId: c.claimId, claimText: c.text.slice(0, 200) });
  }

  const thin = claims.filter(
    (c) => c.docCount < 2 && (c.hedging === "claimed" || c.hedging === "unverified"),
  ).length;
  leadHours.sort((a, b) => a - b);
  const median = leadHours.length > 0 ? leadHours[Math.floor(leadHours.length / 2)] : null;

  return {
    coveragePct:
      takeaways.length > 0 ? +((matched / takeaways.length) * 100).toFixed(1) : null,
    thinSourcedRate: claims.length > 0 ? +(thin / claims.length).toFixed(4) : 0,
    timelinessHours: median !== null ? +median.toFixed(1) : null,
    divergences,
    details: {
      iswTakeaways: takeaways.length,
      matchableTakeaways: takeaways.length,
      ourClaims: claims.length,
      matchedPairs: matched,
      threshold: 0.6,
    },
  };
}

export function scoreDigest(
  takeaways: IswTakeaway[],
  claims: ClaimForValidation[],
  iswPublishedAt: Date | null,
): ValidationScore {
  const claimSigs = claims.map((c) => ({ claim: c, sig: extractSignature(c.text) }));
  const takeawaySigs = takeaways.map((t) => ({
    t,
    sig: {
      toponyms: expandToponyms(new Set(t.toponyms)),
      actions: new Set(t.actions),
    } as Signature,
  }));

  // takeaways with no toponym AND no action signal can't be matched by this matcher —
  // exclude from coverage denominator, report count in details
  const matchable = takeawaySigs.filter(
    ({ sig }) => sig.toponyms.size > 0 || sig.actions.size > 0,
  );

  const divergences: DivergenceEntry[] = [];
  const matchedClaims = new Set<number>();
  let matched = 0;
  const leadHours: number[] = [];

  for (const { t, sig } of matchable) {
    let best: { claim: ClaimForValidation; score: number } | null = null;
    for (const { claim, sig: cs } of claimSigs) {
      const s = matchScore(sig, cs);
      if (s >= MATCH_THRESHOLD && (!best || s > best.score)) best = { claim, score: s };
    }
    if (best) {
      matched++;
      matchedClaims.add(best.claim.claimId);
      divergences.push({
        kind: "agreement",
        iswIndex: t.index,
        iswToponyms: t.toponyms,
        iswActions: t.actions,
        claimId: best.claim.claimId,
        claimText: best.claim.text.slice(0, 200),
        score: +best.score.toFixed(2),
      });
      if (iswPublishedAt && best.claim.earliestDocAt) {
        leadHours.push(
          (iswPublishedAt.getTime() - new Date(best.claim.earliestDocAt).getTime()) / 3.6e6,
        );
      }
    } else {
      divergences.push({
        kind: "isw_only",
        iswIndex: t.index,
        iswToponyms: t.toponyms,
        iswActions: t.actions,
      });
    }
  }

  for (const { claim, sig } of claimSigs) {
    if (matchedClaims.has(claim.claimId)) continue;
    if (sig.toponyms.size === 0 && sig.actions.size === 0) continue;
    divergences.push({
      kind: "ours_only",
      claimId: claim.claimId,
      claimText: claim.text.slice(0, 200),
    });
  }

  const thin = claims.filter(
    (c) => c.docCount < 2 && (c.hedging === "claimed" || c.hedging === "unverified"),
  ).length;

  leadHours.sort((a, b) => a - b);
  const median =
    leadHours.length > 0 ? leadHours[Math.floor(leadHours.length / 2)] : null;

  return {
    coveragePct:
      matchable.length > 0 ? +((matched / matchable.length) * 100).toFixed(1) : null,
    thinSourcedRate: claims.length > 0 ? +(thin / claims.length).toFixed(4) : 0,
    timelinessHours: median !== null ? +median.toFixed(1) : null,
    divergences,
    details: {
      iswTakeaways: takeaways.length,
      matchableTakeaways: matchable.length,
      ourClaims: claims.length,
      matchedPairs: matched,
      threshold: MATCH_THRESHOLD,
    },
  };
}

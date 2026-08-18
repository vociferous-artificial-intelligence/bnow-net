// Contribution attribution (contract §7 — multi-label, NON-ADDITIVE,
// frozen).
//
// Computed over the CORPUS-RECALL matched units (the diagnosis-oriented
// population; register #6 froze the population rule). The published-
// retention view derives its OWN table separately when displayed — the
// scorer stores it as a separate field, never mixed in.
//
// The §7 arithmetic, exactly:
//   - each matched unit counts EXACTLY once in the headline numerator
//     (the scorer's headline; this module never touches it);
//   - per dimension (theater/track/source), a bucket counts the DISTINCT
//     matched units supported by ≥1 eligible contributor in that bucket;
//   - one matched unit may appear in several buckets, so bucket totals may
//     EXCEED the headline numerator and never claim to sum to it — the
//     totals object carries the literal `nonAdditive: true` and the UI label
//     is "matched takeaways with evidence from …" (Phase 6);
//   - no exclusive or fractional primary credit exists anywhere here.
//
// Only FULL-matched units contribute (verdict `matched`): a partial is a
// headline MISS (register #2) and earns no contribution credit — the corpus
// pin roca-compound-partial-009b expects an EMPTY contribution map. Sources
// are the contributing claims' NON-MIRROR document domains (a mirror is
// never an independent contributor — §6.3), sorted unique.

import type { Track } from "../analysis/tracks";
import type {
  ConflictContributionEntryV1,
  ConflictContributionTotalsV1,
} from "./eval-profile";
import type { CandidateDoc } from "./evidence-records";

export interface ContributingClaim {
  claimId: number;
  theater: string;
  track: Track;
  docs: readonly CandidateDoc[];
}

/** unitId → its FULL-matched contributing claims (the scorer feeds only
 *  units whose verdict is `matched`). */
export type ContributionInput = ReadonlyMap<string, readonly ContributingClaim[]>;

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/** Per-unit multi-label buckets, keys sorted (deterministic serialization). */
export function contributionByUnit(
  input: ContributionInput,
): Record<string, ConflictContributionEntryV1> {
  const out: Record<string, ConflictContributionEntryV1> = {};
  for (const unitId of [...input.keys()].sort()) {
    const claims = input.get(unitId) ?? [];
    if (claims.length === 0) continue;
    out[unitId] = {
      theaters: sortedUnique(claims.map((c) => c.theater)),
      tracks: sortedUnique(claims.map((c) => c.track)) as Track[],
      sources: sortedUnique(
        claims.flatMap((c) =>
          c.docs.filter((d) => d.mirrorOfDocId === null).map((d) => d.sourceDomain),
        ),
      ),
    };
  }
  return out;
}

/** Distinct-matched-unit counts per bucket over a per-unit table. */
export function contributionTotals(
  byUnit: Readonly<Record<string, ConflictContributionEntryV1>>,
): ConflictContributionTotalsV1 {
  const byTheater: Record<string, number> = {};
  const byTrack: Partial<Record<Track, number>> = {};
  const bySource: Record<string, number> = {};
  for (const unitId of Object.keys(byUnit).sort()) {
    const entry = byUnit[unitId];
    for (const theater of entry.theaters) byTheater[theater] = (byTheater[theater] ?? 0) + 1;
    for (const track of entry.tracks) byTrack[track] = (byTrack[track] ?? 0) + 1;
    for (const source of entry.sources ?? []) bySource[source] = (bySource[source] ?? 0) + 1;
  }
  return {
    nonAdditive: true,
    byTheater: sortKeys(byTheater),
    byTrack: sortKeys(byTrack) as Partial<Record<Track, number>>,
    bySource: sortKeys(bySource),
  };
}

function sortKeys<T>(record: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of Object.keys(record).sort()) out[key] = record[key];
  return out;
}

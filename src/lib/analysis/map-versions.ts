// THE single accessor for "which doc_claims rows are current" (OPEN-TASKS #35).
//
// doc_claims is append-only: superseded extractor versions stay in the store as
// history, so ANY consumer that reads doc_claims without filtering to the current
// (track, extractor_version) pairs double-counts. Every reduce/report/script
// query MUST go through this module — either take the pairs from
// currentVersionPairs() or splice versionFilterSql() into the WHERE clause.
// Do not call mapExtractorVersion() directly from consumer code.

import { mapExtractorVersion } from "./map-prompts";
import { TRACKS, type Track } from "./tracks";

export interface VersionPair {
  track: Track;
  extractorVersion: string;
}

/** Current (track, extractor_version) pairs for one theater — exactly the
 *  versions the map worker writes today for that theater's configured tracks. */
export function currentVersionPairs(theater: string): VersionPair[] {
  const out: VersionPair[] = [];
  for (const track of Object.keys(TRACKS) as Track[]) {
    if (!TRACKS[track].countries.includes(theater)) continue;
    out.push({ track, extractorVersion: mapExtractorVersion(track, theater) });
  }
  return out;
}

/** Current extractor version for one (track, theater), or null when the track
 *  is not configured for that theater (a gulf theater has no doc_claims). */
export function currentVersion(track: Track, theater: string): string | null {
  if (!TRACKS[track].countries.includes(theater)) return null;
  return mapExtractorVersion(track, theater);
}

/** SQL fragment `(alias.track, alias.extractor_version) IN (...)` with its
 *  parameter array, for queries that read doc_claims across tracks. Parameters
 *  are numbered from `startIndex` ($1-based). */
export function versionFilterSql(
  theater: string,
  alias = "dc",
  startIndex = 1,
): { sql: string; params: string[] } {
  const pairs = currentVersionPairs(theater);
  if (pairs.length === 0) return { sql: "false", params: [] };
  const tuples: string[] = [];
  const params: string[] = [];
  for (const p of pairs) {
    tuples.push(`($${startIndex + params.length}, $${startIndex + params.length + 1})`);
    params.push(p.track, p.extractorVersion);
  }
  return {
    sql: `(${alias}.track, ${alias}.extractor_version) IN (${tuples.join(", ")})`,
    params,
  };
}

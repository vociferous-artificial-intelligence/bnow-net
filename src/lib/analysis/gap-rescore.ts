// Pure planning/gating helpers for the bounded X-gap rescore operator
// (scripts/x-gap-rescore.ts; prompt docs/prompts/2026-07-13-x-gap-catchup-rescore.md
// §4). Kept separate from the script so the money-adjacent gates are unit tested
// without any network or DB.

import type { GapCheckpoint } from "../adapters/x-gap-backfill";
import { TRACKS, type Track } from "./tracks";

/** Theaters the rescore touches — the three with doc_claims + daily digests. */
export const RESCORE_THEATERS = ["ru", "ua", "ir"] as const;

export interface MatrixCell {
  country: string;
  track: Track;
}

/** The digest regeneration matrix, derived from TRACKS so a track added there is
 *  not silently skipped here: ru military+elite_politics, ua military,
 *  ir military+elite_politics+nuclear (pinned by test). */
export function rescoreMatrix(): MatrixCell[] {
  const cells: MatrixCell[] = [];
  for (const country of RESCORE_THEATERS) {
    for (const track of Object.keys(TRACKS) as Track[]) {
      if (TRACKS[track].countries.includes(country)) cells.push({ country, track });
    }
  }
  return cells;
}

/** Validation is military-only: RU/UA vs ROCA, IR vs the Iran Update
 *  (validation/run.ts referenceFor gates anything else to an error). */
export const RESCORE_VALIDATION_COUNTRIES = ["ru", "ua", "ir"] as const;

export interface RescoreGateInput {
  apply: boolean;
  /** operator's explicit acknowledgement that private-beta Workstreams B
   *  (publication guard) and E (entity canonicalization) are DEPLOYED */
  ackWorkstreamsBE: boolean;
  checkpoint: GapCheckpoint | null;
  /** inclusive UTC digest days */
  fromDate: string;
  toDate: string;
}

/** Why an --apply run must refuse; null = clear to proceed. Dry runs never
 *  refuse (they mutate nothing). */
export function applyRefusal(g: RescoreGateInput): string | null {
  if (!g.apply) return null;
  if (!g.ackWorkstreamsBE) {
    return (
      "--ack-workstreams-be missing: the operator must confirm private-beta Workstream B " +
      "(deterministic publication guard) and Workstream E (entity canonicalization) are DEPLOYED " +
      "before historical digests are regenerated"
    );
  }
  if (!g.checkpoint) {
    return "no X recovery checkpoint found — run scripts/x-gap-backfill.ts to completion first";
  }
  if (!g.checkpoint.complete) {
    return "X recovery checkpoint is not globally complete — resume scripts/x-gap-backfill.ts first";
  }
  const fromUnix = Date.parse(`${g.fromDate}T00:00:00Z`) / 1000;
  const toUnixExcl = Date.parse(`${g.toDate}T00:00:00Z`) / 1000 + 86_400;
  if (!Number.isFinite(fromUnix) || !Number.isFinite(toUnixExcl - 86_400)) {
    return "invalid --from-date/--to-date (expected YYYY-MM-DD)";
  }
  if (g.checkpoint.fromUnix > fromUnix || g.checkpoint.toUnix < toUnixExcl) {
    return (
      `recovery checkpoint covers [${g.checkpoint.fromUnix}, ${g.checkpoint.toUnix}) but rescoring ` +
      `${g.fromDate}..${g.toDate} needs [${fromUnix}, ${toUnixExcl}) — recover the full window first`
    );
  }
  return null;
}

/** A missing same-day ISW report is PENDING (ISW publishes late evening ET),
 *  never a false success and never fatal corruption. */
export function classifyValidation(result: Record<string, unknown>): "ok" | "pending" | "failed" {
  const err = typeof result.error === "string" ? result.error : null;
  if (!err) return "ok";
  return /no reference report/.test(err) ? "pending" : "failed";
}

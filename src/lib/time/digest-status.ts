// Cadence-aware digest status (docs/TIME-MODEL.md). A digest date is a UTC-day
// bucket with a known lifecycle: intraday writes at 04:00/10:00/19:30 UTC on day D
// (rolling 24h window), then ONE finalize write at 02:00 UTC on D+1 (full-day
// window) — which in ET lands at 10:00 PM on the evening of day D itself. This
// module turns (latest bucket, its last write time, now) into the truthful card
// state; the R2 hard rule — never "not yet generated" next to a nonzero claims
// count — holds by construction because the claims count is always keyed to and
// labeled with the same bucket this status names.

import { DISPLAY_TZ, dayString, toInstant } from "./day-boundary";

export type DigestStage = "intraday" | "final";

export type DigestStatus =
  | { kind: "none" }
  | {
      /** "today": bucket is the current ET day. "previous": no digest yet for the ET day. */
      kind: "today" | "previous";
      /** The bucket (digest_date, YYYY-MM-DD UTC day) this status describes. */
      date: string;
      stage: DigestStage;
      /** Last write to this bucket (digests.created_at is last-writer-wins), or null. */
      generatedAt: Date | null;
    };

/**
 * "final" iff the bucket was last written on a later UTC day than the bucket
 * itself. The 02:00 UTC D+1 finalize is the only scheduled writer that touches a
 * bucket after its UTC day ends; intraday writers always write within day D. A
 * refused thin/empty regeneration leaves the prior generation's timestamp in
 * place, so the stage stays honest about what is actually stored.
 */
export function digestStage(latestDate: string, generatedAt: Date | null): DigestStage {
  if (!generatedAt) return "intraday";
  return dayString(generatedAt, "UTC") > latestDate ? "final" : "intraday";
}

export function digestStatus(input: {
  latestDate: string | null;
  lastGeneratedAt: Date | string | null;
  now: Date;
}): DigestStatus {
  if (!input.latestDate) return { kind: "none" };
  const generatedAt = toInstant(input.lastGeneratedAt);
  const stage = digestStage(input.latestDate, generatedAt);
  // ">=" not "===": a bucket dated past the ET day (possible for two ET evening
  // hours once the UTC day rolls at 8 PM ET, or under clock skew) is still the
  // live "today" story, not a stale one.
  const kind = input.latestDate >= dayString(input.now, DISPLAY_TZ) ? "today" : "previous";
  return { kind, date: input.latestDate, stage, generatedAt };
}

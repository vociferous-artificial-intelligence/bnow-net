// Pure ET wall-clock → UTC instant conversion (Phase 2; contract §9).
//
// ISW declares data cutoffs as ET wall-clock times ("2:00 PM ET"). Converting
// a wall-clock time to a UTC instant requires the IANA zone rules — the ET
// offset is -04:00 under daylight saving and -05:00 outside it, and the
// switch dates move. This module reuses the repo's single ET authority
// (DISPLAY_TZ = "America/New_York", src/lib/time/day-boundary.ts) through
// Intl, so DST transitions stay correct without a redeploy and NOTHING here
// reads a wall clock or the server-local zone: every Date is constructed from
// an explicit epoch value.
//
// DST edge cases are explicit, never guessed:
// - a NONEXISTENT local time (inside the spring-forward gap, e.g. 02:30 on
//   the March transition day) converts to no instant at all;
// - an AMBIGUOUS local time (the repeated fall-back hour, e.g. 01:30 on the
//   November transition day) resolves to its FIRST occurrence (the daylight
//   offset) under a fixed, test-pinned rule, and the ambiguity is reported so
//   callers can surface it as a diagnostic.

import { DISPLAY_TZ } from "../time/day-boundary";
import { ConflictDomainError } from "./errors";
import { parseIsoDayMs } from "./instants";

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

/** How an ET wall-clock time mapped onto the UTC timeline. */
export const ET_WALL_CLOCK_RESOLUTIONS = [
  "unique",
  "ambiguous_first_occurrence",
  "nonexistent_local_time",
] as const;

export type EtWallClockResolution = (typeof ET_WALL_CLOCK_RESOLUTIONS)[number];

export interface EtWallClockConversion {
  resolution: EtWallClockResolution;
  /** epoch ms, or null when the local time does not exist (spring-forward gap) */
  instantMs: number | null;
}

// one shared formatter: en-CA date parts + h23 time parts in the display zone
const ET_PARTS_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: DISPLAY_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function etWallOf(ms: number): { day: string; hour: number; minute: number } {
  const parts = ET_PARTS_FORMAT.formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

/**
 * Convert an ET wall-clock time (calendar day in America/New_York + h23
 * hour/minute) to a UTC epoch instant. Pure: candidate instants at the two
 * possible ET offsets (-04:00 daylight, -05:00 standard) are round-tripped
 * through Intl and only a candidate that formats back to the requested wall
 * time survives. Throws typed on out-of-range arguments (a malformed DECLARED
 * time is the extractor's concern — by the time this function runs, the
 * caller holds structurally valid numbers).
 */
export function etWallClockToUtcMs(
  day: string,
  hour: number,
  minute: number,
): EtWallClockConversion {
  const dayMs = parseIsoDayMs(day);
  if (dayMs === null) {
    throw new ConflictDomainError("invalid_instant", `not a valid yyyy-mm-dd day: ${JSON.stringify(day)}`);
  }
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new ConflictDomainError(
      "invalid_instant",
      `not a valid h23 wall-clock time: hour=${String(hour)} minute=${String(minute)}`,
    );
  }

  const wallAsUtc = dayMs + hour * HOUR_MS + minute * MINUTE_MS;
  // daylight (-04:00) candidate FIRST: when both round-trip (the repeated
  // fall-back hour) the first occurrence on the UTC timeline is the daylight
  // one, which is exactly the fixed disambiguation rule documented above
  const candidates = [wallAsUtc + 4 * HOUR_MS, wallAsUtc + 5 * HOUR_MS];
  const matches = candidates.filter((ms) => {
    const w = etWallOf(ms);
    return w.day === day && w.hour === hour && w.minute === minute;
  });

  if (matches.length === 0) return { resolution: "nonexistent_local_time", instantMs: null };
  if (matches.length === 2) return { resolution: "ambiguous_first_occurrence", instantMs: matches[0] };
  return { resolution: "unique", instantMs: matches[0] };
}

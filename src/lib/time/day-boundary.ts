// The product's ONE day-boundary policy (docs/TIME-MODEL.md): pipeline buckets
// (digest_date, claim_date) are UTC calendar days; user-facing display is
// America/New_York, always labeled "ET". Every "what day is it" computation goes
// through dayString() with an EXPLICIT timezone — never inline new Date() day math
// in a component: the dev box's wall clock is ET while Vercel's is UTC, so
// implicit-local math silently diverges between environments.

export const DISPLAY_TZ = "America/New_York";

export type DayTimeZone = "UTC" | typeof DISPLAY_TZ;

/**
 * Parses a DB-driver or ISO value into a Date, or null when missing/invalid.
 * The Neon HTTP driver returns timestamptz columns as Date instances and text
 * casts as strings — callers can't know which they hold, so both are accepted.
 */
export function toInstant(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Calendar day (YYYY-MM-DD) of `instant` in `timeZone`. DST-safe (IANA zone via Intl). */
export function dayString(instant: Date, timeZone: DayTimeZone): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Today's date in the display timezone — the "today" every user-facing label means. */
export function etToday(now: Date): string {
  return dayString(now, DISPLAY_TZ);
}

/** The UTC day of `instant` — the bucket digest_date and claim_date are keyed by. */
export function utcDay(instant: Date): string {
  return dayString(instant, "UTC");
}

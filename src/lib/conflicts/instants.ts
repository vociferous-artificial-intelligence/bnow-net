// Strict, pure ISO-8601 parsing for the conflict domain (Phase 1).
//
// The frozen contract (docs/designs/CONFLICT-REGION-EVALUATION.md §5/§9) works
// in exactly two granularities: UTC calendar DAYS (yyyy-mm-dd — claim dates,
// report dates) and explicit-timezone INSTANTS (cutoffs, publication times,
// phase boundaries). Nothing here reads a wall clock — every instant arrives
// as a parameter. The existing lenient helper (src/lib/time/day-boundary.ts
// toInstant) is deliberately NOT reused for domain values: it accepts
// timezone-less strings, which JavaScript interprets in the process-local
// zone — the exact implicit-local divergence the contract's explicit-timezone
// rule exists to prevent. A malformed timestamp is never guessed at: it is
// classified `malformed_treated_as_missing` (the fixture corpus's timeAnchors
// vocabulary) and the caller records the raw value as a diagnostic.
//
// Node's own Date.parse is LENIENT about impossible calendar dates (observed
// on the pinned toolchain: "2026-02-30T00:00:00Z" rolls over to March 2), so
// every parser here round-trips the date component instead of trusting NaN.

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const INSTANT_RE =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

const DAY_MS = 86_400_000;

/** True iff `value` is a valid yyyy-mm-dd UTC calendar day (real date — no
 *  Feb 30 rollover). */
export function isIsoDay(value: unknown): value is string {
  return typeof value === "string" && parseIsoDayMs(value) !== null;
}

/** Epoch ms of 00:00:00.000Z on the given UTC day, or null when malformed or
 *  not a real calendar date. */
export function parseIsoDayMs(value: string): number | null {
  if (!DAY_RE.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(ms)) return null;
  // round-trip guard against the engine's day-of-month rollover
  return new Date(ms).toISOString().slice(0, 10) === value ? ms : null;
}

/** Epoch ms of the EXCLUSIVE end of the given UTC day (00:00:00.000Z of the
 *  next day), or null when the day is malformed. */
export function exclusiveEndOfDayMs(day: string): number | null {
  const start = parseIsoDayMs(day);
  return start === null ? null : start + DAY_MS;
}

/** True iff `value` is a valid ISO-8601 instant WITH an explicit timezone
 *  (Z or ±hh:mm). Timezone-less strings are rejected on purpose. */
export function isIsoInstant(value: unknown): value is string {
  return typeof value === "string" && parseIsoInstantMs(value) !== null;
}

/** Epoch ms of an explicit-timezone ISO instant, or null when malformed.
 *  Rejects: missing/implicit timezone, impossible calendar dates, and
 *  out-of-range time or offset components. */
export function parseIsoInstantMs(value: string): number | null {
  const m = INSTANT_RE.exec(value);
  if (!m) return null;
  const [, datePart, hh, mm, ss, tz] = m;
  if (parseIsoDayMs(datePart) === null) return null;
  if (Number(hh) > 23 || Number(mm) > 59 || (ss !== undefined && Number(ss) > 59)) return null;
  if (tz !== "Z") {
    const offH = Number(tz.slice(1, 3));
    const offM = Number(tz.slice(4, 6));
    if (offH > 14 || offM > 59) return null;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

// ---------------------------------------------------------------------------
// Time-anchor classification (the fixture corpus's `timeAnchors` vocabulary)
// ---------------------------------------------------------------------------

/** How a declared report time anchor (cutoffAt / publishedAt) is treated.
 *  `malformed_treated_as_missing` is the contract §9 rule: a malformed value
 *  is recorded raw for diagnostics and treated as missing — never guessed —
 *  which sends the evaluation-window END to the next rung of the frozen §5
 *  ladder (Phase 2 owns that ladder; this module only classifies). */
export const TIME_ANCHOR_TREATMENTS = [
  "present",
  "missing",
  "malformed_treated_as_missing",
] as const;

export type TimeAnchorTreatment = (typeof TIME_ANCHOR_TREATMENTS)[number];

export interface TimeAnchorClassification {
  treatment: TimeAnchorTreatment;
  /** epoch ms when treatment === "present", else null */
  instantMs: number | null;
  /** the raw input string when one was provided (malformed values keep their
   *  raw form here as the diagnostic record), else null */
  raw: string | null;
}

/** Classify a raw declared time anchor. Pure and total: never throws. */
export function classifyTimeAnchor(raw: string | null | undefined): TimeAnchorClassification {
  if (raw === null || raw === undefined) {
    return { treatment: "missing", instantMs: null, raw: null };
  }
  const ms = parseIsoInstantMs(raw);
  if (ms === null) {
    return { treatment: "malformed_treated_as_missing", instantMs: null, raw };
  }
  return { treatment: "present", instantMs: ms, raw };
}

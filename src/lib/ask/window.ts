import type { TimeWindow } from "./types";

// Deterministic, zero-LLM time-window parser for ASK questions. Every date is a
// UTC calendar day (yyyy-mm-dd, both bounds inclusive); `now` is injectable so
// tests are pure. Unrecognised phrasing -> null (the retrieval simply runs
// unwindowed). "between X and Y" is intentionally OUT of scope — left unmatched.
//
// Windowing conventions (locked by window.test.ts):
//  - relative lookbacks ("past/last N ...", "since ...", "this ...") end today.
//  - "past/last N days"  -> from = today - N days
//    "past/last N weeks" -> from = today - 7N days
//    "past/last N months"-> from = today - N calendar months (day clamped)
//    "past week"/"past month" (no N) -> N = 1.
//  - "since <Month>" with no year resolves to the MOST RECENT occurrence of that
//    month whose first day is not after today (so "since December" asked in
//    January is last year's December).

const MONTHS: Record<string, number> = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sept: 8, sep: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};
// Longer names first so "september" wins over "sep" and "sept" over "sep".
const MONTH_ALT = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .join("|");

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** UTC midnight of `now` — the reference "today". */
function utcMidnight(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

/** Subtract `n` calendar months, clamping the day to the target month's length
 *  (so "1 month before Jul 31" is Jun 30, not an overflowed Jul 1). */
function subMonths(d: Date, n: number): Date {
  const monthOrdinal = d.getUTCFullYear() * 12 + d.getUTCMonth() - n;
  const y = Math.floor(monthOrdinal / 12);
  const m = ((monthOrdinal % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay)));
}

/** Most recent valid calendar date for (monthIdx, day) whose day is not after
 *  `today`. Steps back up to 8 years to skip years where the day is invalid
 *  (e.g. Feb 29 outside a leap year); null if none is valid. */
function mostRecentOccurrence(monthIdx: number, day: number, today: Date): Date | null {
  const startYear = today.getUTCFullYear();
  for (let y = startYear; y >= startYear - 8; y--) {
    const cand = new Date(Date.UTC(y, monthIdx, day));
    if (
      cand.getUTCMonth() === monthIdx &&
      cand.getUTCDate() === day &&
      cand.getTime() <= today.getTime()
    ) {
      return cand;
    }
  }
  return null;
}

/** Parse a leading/embedded time window from a question. Returns the window with
 *  yyyy-mm-dd inclusive bounds and the exact consumed substring (matchedPhrase),
 *  or null when nothing matches. */
export function parseTimeWindow(question: string, now: Date = new Date()): TimeWindow | null {
  const today = utcMidnight(now);
  const toStr = ymd(today);
  let m: RegExpMatchArray | null;

  // 1. since <yyyy-mm-dd>
  m = question.match(/\bsince\s+(\d{4})-(\d{2})-(\d{2})\b/i);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const from = new Date(Date.UTC(y, mo - 1, d));
    if (from.getUTCFullYear() === y && from.getUTCMonth() === mo - 1 && from.getUTCDate() === d) {
      return { from: ymd(from), to: toStr, matchedPhrase: m[0] };
    }
  }

  // 2. since <Month> <D>[, <year>]  (day-form: try before the month-only form)
  m = question.match(new RegExp(`\\bsince\\s+(${MONTH_ALT})\\s+(\\d{1,2})\\b(?:,?\\s+(\\d{4})\\b)?`, "i"));
  if (m) {
    const monthIdx = MONTHS[m[1].toLowerCase()];
    const day = Number(m[2]);
    if (day >= 1 && day <= 31) {
      let from: Date | null;
      if (m[3]) {
        const y = Number(m[3]);
        const cand = new Date(Date.UTC(y, monthIdx, day));
        from = cand.getUTCMonth() === monthIdx && cand.getUTCDate() === day ? cand : null;
      } else {
        from = mostRecentOccurrence(monthIdx, day, today);
      }
      if (from) return { from: ymd(from), to: toStr, matchedPhrase: m[0] };
    }
  }

  // 3. since <Month> [<year>]
  m = question.match(new RegExp(`\\bsince\\s+(${MONTH_ALT})\\b(?:,?\\s+(\\d{4})\\b)?`, "i"));
  if (m) {
    const monthIdx = MONTHS[m[1].toLowerCase()];
    const from = m[2] ? new Date(Date.UTC(Number(m[2]), monthIdx, 1)) : mostRecentOccurrence(monthIdx, 1, today);
    if (from) return { from: ymd(from), to: toStr, matchedPhrase: m[0] };
  }

  // 4. in <Month> <yyyy>  (bounded calendar month)
  m = question.match(new RegExp(`\\bin\\s+(${MONTH_ALT})\\s+(\\d{4})\\b`, "i"));
  if (m) {
    const monthIdx = MONTHS[m[1].toLowerCase()];
    const y = Number(m[2]);
    const from = new Date(Date.UTC(y, monthIdx, 1));
    const to = new Date(Date.UTC(y, monthIdx + 1, 0)); // day 0 of next month = last day of this
    return { from: ymd(from), to: ymd(to), matchedPhrase: m[0] };
  }

  // 5. past/last [N] day|week|month(s)  (no N -> 1)
  m = question.match(/\b(?:past|last)\s+(?:(\d+)\s+)?(days?|weeks?|months?)\b/i);
  if (m) {
    const n = m[1] ? parseInt(m[1], 10) : 1;
    if (n >= 1) {
      const unit = m[2].toLowerCase();
      const from = unit.startsWith("day")
        ? addDays(today, -n)
        : unit.startsWith("week")
          ? addDays(today, -7 * n)
          : subMonths(today, n);
      return { from: ymd(from), to: toStr, matchedPhrase: m[0] };
    }
  }

  // 6. this week (Monday-start, UTC)
  m = question.match(/\bthis\s+week\b/i);
  if (m) {
    const dow = today.getUTCDay(); // 0=Sun .. 6=Sat
    const backToMonday = (dow + 6) % 7; // Mon->0 .. Sun->6
    return { from: ymd(addDays(today, -backToMonday)), to: toStr, matchedPhrase: m[0] };
  }

  // 7. this month
  m = question.match(/\bthis\s+month\b/i);
  if (m) {
    const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    return { from: ymd(from), to: toStr, matchedPhrase: m[0] };
  }

  // 8. yesterday
  m = question.match(/\byesterday\b/i);
  if (m) {
    const y = addDays(today, -1);
    return { from: ymd(y), to: ymd(y), matchedPhrase: m[0] };
  }

  // 9. today
  m = question.match(/\btoday\b/i);
  if (m) {
    return { from: toStr, to: toStr, matchedPhrase: m[0] };
  }

  return null;
}

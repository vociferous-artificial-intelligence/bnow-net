// Freshness logic for the data-dark tracker. Pure functions here; DB I/O in run.ts.
//
// 2026-07-13 rework (production defect: the CBR key-rate series showed
// "17.09.2013" as its latest period with status "ok"). Three fixes:
//   1. extractPeriod scans ALL regex matches and returns the LATEST comparable
//      period, not the first markup occurrence (the 2013 value was a date-filter
//      form default that appears before the data table).
//   2. Staleness depends on the AGE of the extracted period relative to the poll
//      instant — a first observation of a 2013 period can never be "ok" in 2026.
//      The old unchanged-across-polls rule remains for unparseable labels.
//   3. A parse that is OLDER than a credible stored period does not overwrite it;
//      the anomaly is surfaced (ProbeResult.anomaly) and recorded in history.

export type SeriesStatus = "ok" | "stale" | "gone" | "classified" | "unreachable" | "unknown";

export interface ProbeInput {
  baselineStatus: "live" | "classified" | "unreachable";
  httpStatus: number | null; // null = fetch failed
  bytes: number;
  period: string | null; // extracted latest-period label, if any
  prevPeriod: string | null;
  lastChangeDaysAgo: number | null; // days since lastChangedAt
  cadenceDays: number;
  /** poll instant (epoch ms) — the reference point for period-age staleness */
  nowMs: number;
}

export interface ProbeResult {
  status: SeriesStatus;
  period: string | null;
  changed: boolean; // status or period differs from previous
  reason: string;
  /** set when an obviously older parse tried to replace a credible newer stored
   *  period — the stored value was kept and this explains why (audit trail) */
  anomaly?: string;
}

const RU_MONTHS = [
  "январ", "феврал", "март", "апрел", "ма", "июн",
  "июл", "август", "сентябр", "октябр", "ноябр", "декабр",
];

/** Parse a period label to a comparable UTC instant (epoch ms); null when the
 *  label has no recognizable date shape. Supported shapes (the configured
 *  periodRe outputs): "dd.mm.yyyy", "<russian month> yyyy", bare "yyyy". */
export function parsePeriodLabel(label: string): number | null {
  const s = label.trim().toLowerCase();
  const dmy = s.match(/^(\d{2})\.(\d{2})\.(20\d\d)$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const mi = Number(m) - 1;
    if (mi < 0 || mi > 11 || Number(d) < 1 || Number(d) > 31) return null;
    return Date.UTC(Number(y), mi, Number(d));
  }
  const monthYear = s.match(/^([а-яё]+)\s+(20\d\d)$/);
  if (monthYear) {
    // "ма" (май) must not match "март"/"мая-adjacent" wrongly: prefer the longest
    // stem that prefixes the word.
    const word = monthYear[1];
    let best = -1;
    let bestLen = 0;
    RU_MONTHS.forEach((stem, i) => {
      if (word.startsWith(stem) && stem.length > bestLen) {
        best = i;
        bestLen = stem.length;
      }
    });
    if (best >= 0) return Date.UTC(Number(monthYear[2]), best, 1);
    return null;
  }
  const year = s.match(/^(20\d\d)$/);
  if (year) return Date.UTC(Number(year[1]), 0, 1);
  return null;
}

/** Decide a series' status from a fetch outcome. */
export function evaluate(input: ProbeInput, prevStatus: SeriesStatus): ProbeResult {
  // documented classification is sticky unless the page comes back with fresh data
  if (input.baselineStatus === "classified" && !(input.httpStatus === 200 && input.period)) {
    return mk("classified", input.period, prevStatus, input, "documented suppression, no fresh data");
  }

  if (input.httpStatus === null) {
    return mk("unreachable", input.period, prevStatus, input, "fetch failed");
  }
  if (input.httpStatus === 404 || (input.httpStatus === 200 && input.bytes < 500)) {
    return mk("gone", input.period, prevStatus, input, `http ${input.httpStatus}, ${input.bytes}b`);
  }
  if (input.httpStatus >= 400) {
    return mk("unreachable", input.period, prevStatus, input, `http ${input.httpStatus}`);
  }

  // 200 OK — judge freshness by the extracted period if we have one, else by cadence
  if (input.period) {
    const parsed = parsePeriodLabel(input.period);
    const prevParsed = input.prevPeriod ? parsePeriodLabel(input.prevPeriod) : null;

    // Anomaly guard: never let an obviously older parse replace a credible newer
    // stored period silently. Keep the stored one, judge freshness by IT, and
    // surface the anomaly for the history trail.
    if (parsed !== null && prevParsed !== null && parsed < prevParsed) {
      const ageDays = (input.nowMs - prevParsed) / 86400e3;
      const stale = ageDays > input.cadenceDays * 2;
      const res = mk(
        stale ? "stale" : "ok",
        input.prevPeriod,
        prevStatus,
        input,
        stale
          ? `kept period ${input.prevPeriod}, ~${Math.round(ageDays)}d old (> 2x cadence)`
          : `kept period ${input.prevPeriod}`,
      );
      return {
        ...res,
        anomaly: `parse "${input.period}" is older than stored "${input.prevPeriod}" — stored value kept`,
      };
    }

    if (parsed !== null) {
      // Period-age staleness: the poll instant, not poll-to-poll sameness, is the
      // reference. A freshly-first-seen ancient period is stale immediately.
      const ageDays = (input.nowMs - parsed) / 86400e3;
      const stale = ageDays > input.cadenceDays * 2;
      return mk(
        stale ? "stale" : "ok",
        input.period,
        prevStatus,
        input,
        stale
          ? `period ${input.period} is ~${Math.round(ageDays)}d old (> 2x cadence ${input.cadenceDays}d)`
          : `fresh period ${input.period}`,
      );
    }

    // Unparseable label: fall back to the unchanged-across-polls rule.
    const stale =
      input.prevPeriod !== null &&
      input.period === input.prevPeriod &&
      input.lastChangeDaysAgo !== null &&
      input.lastChangeDaysAgo > input.cadenceDays * 2;
    return mk(stale ? "stale" : "ok", input.period, prevStatus, input,
      stale ? `period ${input.period} unchanged ${input.lastChangeDaysAgo}d (>2x cadence)` : `fresh period ${input.period}`);
  }

  // reachable but no period parsed: treat as ok (page exists), note it
  return mk("ok", null, prevStatus, input, "reachable; no period label parsed");
}

function mk(
  status: SeriesStatus,
  period: string | null,
  prevStatus: SeriesStatus,
  input: ProbeInput,
  reason: string,
): ProbeResult {
  const changed = status !== prevStatus || (period !== null && period !== input.prevPeriod);
  return { status, period, changed, reason };
}

/** Extract the LATEST period label from the document: every periodRe match is a
 *  candidate; comparable candidates (parsePeriodLabel) compete by date and the
 *  newest wins. If no candidate parses, the first match is returned (legacy
 *  behavior for label-shaped regexes). */
export function extractPeriod(html: string, periodRe?: string): string | null {
  if (!periodRe) return null;
  try {
    const flags = "gi";
    const labels: string[] = [];
    for (const m of html.matchAll(new RegExp(periodRe, flags))) {
      const label = m.slice(1).filter(Boolean).join(" ").trim() || m[0];
      if (label) labels.push(label);
    }
    if (labels.length === 0) return null;
    let best: string | null = null;
    let bestMs = -Infinity;
    for (const label of labels) {
      const ms = parsePeriodLabel(label);
      if (ms !== null && ms > bestMs) {
        bestMs = ms;
        best = label;
      }
    }
    return best ?? labels[0];
  } catch {
    return null;
  }
}

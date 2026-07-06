// Freshness logic for the data-dark tracker. Pure functions here; DB I/O in run.ts.

export type SeriesStatus = "ok" | "stale" | "gone" | "classified" | "unreachable" | "unknown";

export interface ProbeInput {
  baselineStatus: "live" | "classified" | "unreachable";
  httpStatus: number | null; // null = fetch failed
  bytes: number;
  period: string | null; // extracted latest-period label, if any
  prevPeriod: string | null;
  lastChangeDaysAgo: number | null; // days since lastChangedAt
  cadenceDays: number;
}

export interface ProbeResult {
  status: SeriesStatus;
  period: string | null;
  changed: boolean; // status or period differs from previous
  reason: string;
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

export function extractPeriod(html: string, periodRe?: string): string | null {
  if (!periodRe) return null;
  try {
    const m = html.match(new RegExp(periodRe, "i"));
    if (!m) return null;
    // join capture groups (e.g. "май" + "2025") to a stable label
    return m.slice(1).filter(Boolean).join(" ").trim() || m[0];
  } catch {
    return null;
  }
}

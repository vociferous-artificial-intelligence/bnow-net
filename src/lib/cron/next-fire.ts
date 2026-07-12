// Fixed-field cron parser for `m h * * *` schedules ONLY — the shape every entry in
// vercel.json's digest group uses (finalize 0 2, intraday 0 4 / 0 10 / 30 19). Anything
// with a non-`*` day/month/weekday field (the monthly trade/materials crons) or a
// non-numeric minute/hour (the `*/15` fast-ingest cron) is deliberately UNSUPPORTED and
// skipped rather than mis-parsed — this file has no ambition to be a general cron parser.

export interface SimpleCron {
  minute: number;
  hour: number;
}

const SIMPLE_CRON_RE = /^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/;

/** Parses a `m h * * *` schedule; returns null for anything else (never throws). */
export function parseSimpleCron(schedule: string): SimpleCron | null {
  const m = SIMPLE_CRON_RE.exec(schedule.trim());
  if (!m) return null;
  const minute = Number(m[1]);
  const hour = Number(m[2]);
  if (minute < 0 || minute > 59 || hour < 0 || hour > 23) return null;
  return { minute, hour };
}

/**
 * Earliest next UTC fire time across `schedules`, relative to `nowUtc`. Non-simple
 * schedules are silently ignored (matches `parseSimpleCron`). A slot exactly equal to
 * `nowUtc` is treated as already fired and rolls to the next day — "next" is strictly
 * future. Throws if none of `schedules` parses (the caller has nothing to derive from).
 */
export function nextFire(nowUtc: Date, schedules: string[]): Date {
  const parsed = schedules
    .map(parseSimpleCron)
    .filter((c): c is SimpleCron => c !== null);
  if (parsed.length === 0) {
    throw new Error("nextFire: no simple `m h * * *` schedule in the given list");
  }

  let best: Date | null = null;
  for (const { minute, hour } of parsed) {
    const candidate = new Date(
      Date.UTC(
        nowUtc.getUTCFullYear(),
        nowUtc.getUTCMonth(),
        nowUtc.getUTCDate(),
        hour,
        minute,
        0,
        0,
      ),
    );
    if (candidate.getTime() <= nowUtc.getTime()) {
      candidate.setUTCDate(candidate.getUTCDate() + 1);
    }
    if (best === null || candidate.getTime() < best.getTime()) best = candidate;
  }
  return best as Date;
}

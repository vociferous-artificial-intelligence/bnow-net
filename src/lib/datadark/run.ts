import { Pool } from "@neondatabase/serverless";
import { SERIES_SEEDS } from "./config";
import { evaluate, extractPeriod, type SeriesStatus } from "./check";

// Seed + poll the data-dark tracker. Runs from Vercel (some gov hosts reachable
// there but not from the build host). Polite: 2s spacing between fetches.

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function seedSeries(): Promise<number> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (const s of SERIES_SEEDS) {
      await pool.query(
        `INSERT INTO watched_series (key, label, agency, url, cadence_days, baseline_status, note, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7, CASE WHEN $6='classified' THEN 'classified' ELSE 'unknown' END)
         ON CONFLICT (key) DO UPDATE SET
           label=$2, agency=$3, url=$4, cadence_days=$5, baseline_status=$6, note=$7`,
        [s.key, s.label, s.agency, s.url, s.cadenceDays, s.baselineStatus, s.note ?? null],
      );
    }
    const { rows } = await pool.query(`SELECT count(*)::int n FROM watched_series`);
    return rows[0].n;
  } finally {
    await pool.end();
  }
}

export interface DarkStats {
  checked: number;
  changed: number;
  byStatus: Record<string, number>;
}

export async function pollSeries(nowIso: string): Promise<DarkStats> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const stats: DarkStats = { checked: 0, changed: 0, byStatus: {} };
  try {
    const { rows } = await pool.query(`SELECT * FROM watched_series ORDER BY id`);
    for (const row of rows) {
      const seed = SERIES_SEEDS.find((s) => s.key === row.key);
      let httpStatus: number | null = null;
      let bytes = 0;
      let period: string | null = null;
      try {
        const res = await fetch(row.url, {
          headers: { "User-Agent": UA },
          redirect: "follow",
          signal: AbortSignal.timeout(20_000),
        });
        httpStatus = res.status;
        const body = await res.text();
        bytes = body.length;
        period = extractPeriod(body, seed?.periodRe);
      } catch {
        httpStatus = null;
      }

      const lastChangeDaysAgo = row.last_changed_at
        ? (Date.parse(nowIso) - new Date(row.last_changed_at).getTime()) / 86400e3
        : null;

      const result = evaluate(
        {
          baselineStatus: row.baseline_status,
          httpStatus,
          bytes,
          period,
          prevPeriod: row.last_seen_period,
          lastChangeDaysAgo,
          cadenceDays: row.cadence_days,
        },
        row.status as SeriesStatus,
      );

      const history = Array.isArray(row.history) ? row.history : [];
      if (result.changed) {
        history.push({ at: nowIso, status: result.status, period: result.period, reason: result.reason });
        stats.changed++;
      }

      await pool.query(
        `UPDATE watched_series SET
           status=$2, last_seen_period=COALESCE($3, last_seen_period),
           last_checked_at=$4::timestamptz,
           last_changed_at=CASE WHEN $5 THEN $4::timestamptz ELSE last_changed_at END,
           history=$6::jsonb
         WHERE id=$1`,
        [row.id, result.status, result.period, nowIso, result.changed, JSON.stringify(history.slice(-50))],
      );

      stats.checked++;
      stats.byStatus[result.status] = (stats.byStatus[result.status] ?? 0) + 1;
      await sleep(2100);
    }
    return stats;
  } finally {
    await pool.end();
  }
}

import { Pool } from "@neondatabase/serverless";
import { fetchReporterFlows } from "./comtrade";
import { computeDivergence, type DivergenceRow, type FlowPoint } from "./divergence";
import { RUSSIA_CODE, TRANSIT_PARTNERS, WATCHED_HS, WATCH_YEARS } from "./config";

// Pull partner→Russia flows into trade_flows (idempotent upsert), then expose
// divergence over what's stored. Runs from Vercel (Comtrade reachable there).

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface TradePullStats {
  reporters: number;
  rowsUpserted: number;
  failures: string[];
}

export async function pullTrade(): Promise<TradePullStats> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const stats: TradePullStats = { reporters: 0, rowsUpserted: 0, failures: [] };
  const hsCodes = WATCHED_HS.map((h) => h.code);
  try {
    for (const rep of TRANSIT_PARTNERS) {
      const rows = await fetchReporterFlows(rep.code, rep.name, hsCodes, WATCH_YEARS, "X");
      stats.reporters++;
      if (rows === null) {
        stats.failures.push(rep.name);
        await sleep(2500);
        continue;
      }
      for (const r of rows) {
        await pool.query(
          `INSERT INTO trade_flows
             (reporter_code, reporter_name, partner_code, partner_name, flow_code, hs_code, period, value_usd, net_weight_kg)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (reporter_code, partner_code, flow_code, hs_code, period)
           DO UPDATE SET value_usd = EXCLUDED.value_usd, net_weight_kg = EXCLUDED.net_weight_kg,
                         partner_name = COALESCE(EXCLUDED.partner_name, trade_flows.partner_name),
                         fetched_at = now()`,
          [r.reporterCode, r.reporterName, r.partnerCode, r.partnerName, r.flowCode, r.hsCode, r.period, r.valueUsd, r.netWeightKg],
        );
        stats.rowsUpserted++;
      }
      await sleep(2500); // polite; well under Comtrade's keyless limit
    }
    return stats;
  } finally {
    await pool.end();
  }
}

/** The /trade page's displayed cohort: partner-reported flows to Russia in ONE
 *  flow direction. SHARED by the data query (getDivergence) and the provenance
 *  query (tradeFetchWindow) so the displayed fetch date can never come from
 *  rows the page does not show — the materials job writes US IMPORT rows
 *  (flow 'M') into the same table, and Russia can appear among its partners
 *  with a newer fetched_at (2026-07-13 remediation). Bind $1 = RUSSIA_CODE,
 *  $2 = flow. */
export const TRADE_COHORT_SQL = `FROM trade_flows WHERE partner_code = $1 AND flow_code = $2`;

export interface TradeFetchWindow {
  oldest: string;
  newest: string;
}

/** fetched_at range across the displayed cohort — provenance display only.
 *  Null when the cohort is empty (never a date borrowed from another job). */
export async function tradeFetchWindow(flow: "X" | "M" = "X"): Promise<TradeFetchWindow | null> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(
      `SELECT min(fetched_at)::text AS oldest, max(fetched_at)::text AS newest ${TRADE_COHORT_SQL}`,
      [RUSSIA_CODE, flow],
    );
    const r = rows[0] as { oldest: string | null; newest: string | null } | undefined;
    if (!r?.oldest || !r?.newest) return null;
    return { oldest: r.oldest, newest: r.newest };
  } finally {
    await pool.end();
  }
}

/** Provenance wording for the fetch window: a single date only when the whole
 *  cohort was fetched on the same day; an explicit range otherwise, so a lone
 *  refreshed reporter never overstates the rest of the dataset's freshness. */
export function fetchWindowLabel(w: TradeFetchWindow | null): string | null {
  if (!w) return null;
  const oldest = w.oldest.slice(0, 10);
  const newest = w.newest.slice(0, 10);
  return oldest === newest ? `last fetched ${oldest}` : `fetched between ${oldest} and ${newest}`;
}

export async function getDivergence(flow: "X" | "M" = "X"): Promise<DivergenceRow[]> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(
      `SELECT reporter_code, reporter_name, hs_code, period, value_usd
       ${TRADE_COHORT_SQL}`,
      [RUSSIA_CODE, flow],
    );
    const flows: FlowPoint[] = rows.map((r) => ({
      reporterCode: r.reporter_code,
      reporterName: r.reporter_name,
      hsCode: r.hs_code,
      period: r.period,
      valueUsd: Number(r.value_usd),
    }));
    return computeDivergence(flows);
  } finally {
    await pool.end();
  }
}

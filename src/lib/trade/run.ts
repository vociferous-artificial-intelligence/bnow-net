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

/** Newest fetched_at across the RU bilateral rows — provenance display only. */
export async function latestTradeFetch(): Promise<string | null> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(
      `SELECT max(fetched_at)::text AS latest FROM trade_flows WHERE partner_code = $1`,
      [RUSSIA_CODE],
    );
    return (rows[0]?.latest as string | null) ?? null;
  } finally {
    await pool.end();
  }
}

export async function getDivergence(flow: "X" | "M" = "X"): Promise<DivergenceRow[]> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(
      `SELECT reporter_code, reporter_name, hs_code, period, value_usd
       FROM trade_flows WHERE partner_code = 643 AND flow_code = $1`,
      [flow],
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

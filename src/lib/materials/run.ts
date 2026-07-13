import { Pool } from "@neondatabase/serverless";
import { fetchBreakdown } from "../trade/comtrade";
import { computeConcentration, riskScore, type Concentration, type SupplierFlow } from "./concentration";
import { partnerDisplayName } from "../trade/partners";
import { CRITICAL_MATERIALS, MATERIALS_YEARS, US_REPORTER } from "./config";

// Pull US per-partner import breakdown for each critical HS into trade_flows
// (partner-specific rows, flow M, reporter US). Then compute concentration on read.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface MaterialsPullStats {
  materials: number;
  rowsUpserted: number;
  failures: string[];
}

export async function pullMaterials(): Promise<MaterialsPullStats> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const stats: MaterialsPullStats = { materials: 0, rowsUpserted: 0, failures: [] };
  try {
    for (const mat of CRITICAL_MATERIALS) {
      stats.materials++;
      for (const year of MATERIALS_YEARS) {
        const rows = await fetchBreakdown(US_REPORTER, mat.hsCode, year, "M");
        if (rows === null) {
          stats.failures.push(`${mat.hsCode}/${year}`);
          await sleep(2500);
          continue;
        }
        for (const r of rows) {
          await pool.query(
            `INSERT INTO trade_flows
               (reporter_code, reporter_name, partner_code, partner_name, flow_code, hs_code, period, value_usd, net_weight_kg)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (reporter_code, partner_code, flow_code, hs_code, period)
             DO UPDATE SET value_usd = EXCLUDED.value_usd,
                           partner_name = COALESCE(EXCLUDED.partner_name, trade_flows.partner_name),
                           fetched_at = now()`,
            [r.reporterCode, r.reporterName, r.partnerCode, r.partnerName, r.flowCode, r.hsCode, r.period, r.valueUsd, r.netWeightKg],
          );
          stats.rowsUpserted++;
        }
        await sleep(2500);
      }
    }
    return stats;
  } finally {
    await pool.end();
  }
}

export interface MaterialView {
  hsCode: string;
  label: string;
  category: string;
  chokepoint: string;
  latest: Concentration | null;
  risk: number;
  /** newest fetched_at across the material's rows (provenance display) */
  fetchedAt: string | null;
}

/** Latest-year concentration per critical material, ranked by risk. */
export async function getMaterials(): Promise<MaterialView[]> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const out: MaterialView[] = [];
    for (const mat of CRITICAL_MATERIALS) {
      const { rows } = await pool.query(
        `SELECT partner_code, partner_name, value_usd, period,
                max(fetched_at) OVER ()::text AS latest_fetch
         FROM trade_flows
         WHERE reporter_code = $1 AND flow_code = 'M' AND hs_code = $2`,
        [US_REPORTER, mat.hsCode],
      );
      // pick latest year with data
      const years = [...new Set(rows.map((r) => r.period as string))].sort();
      const latestYear = years[years.length - 1];
      let latest: Concentration | null = null;
      if (latestYear) {
        const flows: SupplierFlow[] = rows
          .filter((r) => r.period === latestYear)
          .map((r) => ({
            partnerCode: r.partner_code,
            // stored upstream description first; deterministic M49 map for
            // legacy rows; explicit "Partner code N" last resort — never "#N"
            partnerName: partnerDisplayName(r.partner_code, r.partner_name),
            valueUsd: Number(r.value_usd),
          }));
        latest = computeConcentration(mat.hsCode, latestYear, flows, mat.sensitiveSuppliers);
      }
      out.push({
        hsCode: mat.hsCode, label: mat.label, category: mat.category,
        chokepoint: mat.chokepoint, latest, risk: latest ? riskScore(latest) : 0,
        fetchedAt: (rows[0]?.latest_fetch as string | undefined) ?? null,
      });
    }
    return out.sort((a, b) => b.risk - a.risk);
  } finally {
    await pool.end();
  }
}



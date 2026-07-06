import { Pool } from "@neondatabase/serverless";
import {
  detectDataDark,
  detectPurge,
  detectTradeDivergence,
  rankSignals,
  type PressureClaim,
  type Signal,
} from "./signals";
import { getDivergence } from "../trade/run";
import { WATCHED_HS } from "../trade/config";

// Compute the active analyst signals from stored data. Read-only; deterministic.

const HS_LABEL = new Map(WATCHED_HS.map((h) => [h.code, h.label]));

export async function computeSignals(nowIso: string): Promise<Signal[]> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const signals: Signal[] = [];
  try {
    // purge pattern per validated-elite theater (ru, ir)
    for (const theater of ["ru", "ir"]) {
      const { rows } = await pool.query(
        `SELECT cl.id AS claim_id, e.name AS entity_name, e.kind AS entity_kind,
                ce.role, cl.claim_date::text AS claim_date
         FROM claims cl
         JOIN claim_entities ce ON ce.claim_id = cl.id
         JOIN entities e ON e.id = ce.entity_id
         JOIN countries c ON c.id = cl.country_id
         WHERE c.iso2 = $1 AND cl.claim_date > (CURRENT_DATE - INTERVAL '30 days')`,
        [theater],
      );
      const claims: PressureClaim[] = rows.map((r) => ({
        claimId: r.claim_id, entityName: r.entity_name, entityKind: r.entity_kind,
        role: r.role, claimDate: r.claim_date,
      }));
      const purge = detectPurge(claims, { windowDays: 14, minCount: 3, theater, nowIso });
      if (purge) signals.push(purge);
    }

    // data-dark (ru)
    const { rows: darkRows } = await pool.query(
      `SELECT key, label, status,
              (last_changed_at > now() - interval '45 days') AS changed_recently
       FROM watched_series`,
    );
    const dark = detectDataDark(
      darkRows.map((r) => ({ key: r.key, label: r.label, status: r.status, changedRecently: !!r.changed_recently })),
      "ru",
      nowIso,
    );
    if (dark) signals.push(dark);

    // trade divergence (ru)
    try {
      const div = await getDivergence("X");
      const flagged = div
        .filter((d) => d.flagged)
        .map((d) => ({ reporterName: d.reporterName, hsLabel: HS_LABEL.get(d.hsCode) ?? `HS ${d.hsCode}`, reason: d.reason }));
      const trade = detectTradeDivergence(flagged, nowIso);
      if (trade) signals.push(trade);
    } catch {
      // trade table may be empty
    }

    return rankSignals(signals);
  } finally {
    await pool.end();
  }
}

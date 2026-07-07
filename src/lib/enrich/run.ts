import { Pool } from "@neondatabase/serverless";
import { SpendGuard, envNum, pgUsageStore } from "../usage/spend-guard";
import { isLive, matchEntity, sanitizeForPersist } from "./opensanctions";

// Enrich entities lacking an OpenSanctions check. Idempotent + resumable: only
// touches rows never checked OR only stub-checked (a stub answer is not a real
// check; a live key upgrades them). ?refresh re-checks everything.
// Runs from Vercel (api.opensanctions.org is reachable there; not from the build host).
//
// Live /match calls are quota-metered (2,000/month account quota; EUR 0.10 each
// beyond free tiers) — every call passes the SpendGuard first, capped by
// OPENSANCTIONS_CALL_CAP (default 300, fail-closed accounting in provider_usage).
// Priority order: entities under pressure signals (defendant/target/dismissed
// claim roles) first, then persons, then companies — highest compliance value
// per call.

const OS_EST_USD_PER_MATCH = 0.11; // EUR 0.10 /match, ledger visibility only

export function opensanctionsGuardFromEnv(): SpendGuard {
  return new SpendGuard(
    {
      provider: "opensanctions",
      totalCapUsd: null,
      totalRequestCap: envNum("OPENSANCTIONS_CALL_CAP", 300),
      dailyUsdCap: envNum("OPENSANCTIONS_DAILY_USD_CAP", 40),
      dailyRequestCap: envNum("OPENSANCTIONS_DAILY_CALL_CAP", 200),
      runRequestCap: envNum("OPENSANCTIONS_RUN_CALL_CAP", 120),
    },
    pgUsageStore,
  );
}

export interface EnrichStats {
  scanned: number;
  checked: number;
  matched: number;
  sanctioned: number;
  failed: number;
  live: boolean;
  budgetStopped: string | null;
}

export async function enrichEntities(opts?: {
  limit?: number;
  refresh?: boolean;
  nowIso: string;
}): Promise<EnrichStats> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const live = isLive();
  const stats: EnrichStats = {
    scanned: 0, checked: 0, matched: 0, sanctioned: 0, failed: 0,
    live,
    budgetStopped: null,
  };
  const guard = opensanctionsGuardFromEnv();
  if (live) await guard.init();
  try {
    // needs-check = never checked or only stub-checked; pressure first, then
    // person > company > org/agency/faction, then most-cited claim graph
    const { rows } = await pool.query(
      `SELECT e.id, e.kind, e.name,
              count(ce.claim_id) FILTER (WHERE ce.role IN ('defendant','target','dismissed'))::int AS pressure,
              count(ce.claim_id)::int AS mentions
       FROM entities e
       LEFT JOIN claim_entities ce ON ce.entity_id = e.id
       WHERE e.kind IN ('person','company','org','agency','faction')
         ${
           opts?.refresh
             ? ""
             : `AND ((e.meta->'opensanctions') IS NULL
                 OR (e.meta->'opensanctions'->>'stub')::boolean IS TRUE)`
         }
       GROUP BY e.id, e.kind, e.name
       ORDER BY (count(ce.claim_id) FILTER (WHERE ce.role IN ('defendant','target','dismissed')) > 0) DESC,
                (e.kind = 'person') DESC,
                (e.kind = 'company') DESC,
                count(ce.claim_id) DESC,
                e.id
       LIMIT $1`,
      [opts?.limit ?? 200],
    );
    stats.scanned = rows.length;

    for (const e of rows) {
      if (live) {
        const r = guard.tryReserve();
        if (!r.ok) {
          stats.budgetStopped = r.reason;
          console.warn(`enrich: budget stop — ${r.reason}`);
          break;
        }
      }
      const raw = await matchEntity(e.name, e.kind);
      if (live) await guard.record(1, 1, OS_EST_USD_PER_MATCH);
      if (raw === null) {
        stats.failed++;
        continue;
      }
      raw.checkedAt = opts?.nowIso ?? "";
      // stub answers persist as "checked, unmatched" — never as fabricated sanctions
      const r = sanitizeForPersist(raw);
      await pool.query(
        `UPDATE entities SET meta = jsonb_set(coalesce(meta,'{}'::jsonb), '{opensanctions}', $2::jsonb)
         WHERE id = $1`,
        [e.id, JSON.stringify(r)],
      );
      stats.checked++;
      if (r.matched) stats.matched++;
      if (r.sanctioned) stats.sanctioned++;
    }
    return stats;
  } finally {
    await pool.end();
  }
}

// AI Search Phase 7: customer-facing ANALYSIS UNITS (§9.5) — the commercial
// currency, deliberately separate from vendor cost so product pricing
// survives provider price changes. Vendor tokens are NEVER exposed as
// customer currency; billing consumes the AGGREGATE feed below and never
// reaches into stage internals.
//
// Unit policy (explicit + tested, the master prompt's requirement):
//   billed standard run (answered/insufficient/refused — a real provider
//     exchange happened or was honestly attempted)          = 1 unit
//   exact-cache hit                                          = 0 units
//   idempotent replay (the ORIGINAL run already carries its
//     unit; the replay gesture adds nothing)                 = 0 units
//   refusals with no provider work (limit / error refusal
//     payloads, gate-unavailable)                            = 0 units
//   deep analysis                                            = 3 units (POLICY
//     SHAPE ONLY — Deep is unservable without its scorecard; recorded here so
//     the pre-execution disclosure has one source of truth)
//
// Payment NEVER overrides SpendGuard: this module reads run rows only; it
// imports nothing from the usage/guard layer and cannot influence a cap.

import { Pool } from "@neondatabase/serverless";
import type { AskAnswerV2 } from "./types";

export const UNITS_STANDARD = 1;
export const UNITS_CACHE_HIT = 0;
export const UNITS_DEEP = 3; // unservable today (no Deep route can pass the scorecard gate)

/** Providers that mark a DEGRADED answer — no real provider exchange
 *  happened (stub = offline/kill-switch; budget = BNOW's own cap refused the
 *  call). Billing a full unit for a deterministic claim list during a
 *  degraded window would charge for the thing the product says it is not
 *  (Gate 7 high finding). */
const DEGRADED_PROVIDERS = new Set(["stub", "budget"]);

/** Pure unit computation for a terminal payload. Registered beta decisions
 *  (re-decide before LIVE billing — decision register): cancelled runs bill
 *  0 units (validated sections may have been delivered; align
 *  CANCELLED_MESSAGE copy when this changes); model-refusal bills 1 while
 *  truncation bills 0 (both full-cost, zero-value — asymmetry registered). */
export function analysisUnits(result: AskAnswerV2, mode: "auto" | "fast" | "deep" = "auto"): number {
  if (result.replayed) return 0;
  if (result.cacheStatus === "exact") return UNITS_CACHE_HIT;
  if (result.state === "limit" || result.state === "error") return 0;
  if (DEGRADED_PROVIDERS.has(result.provider)) return 0; // degraded ≠ analysis
  // answered / insufficient / refused: a real analysis exchange
  return mode === "deep" ? UNITS_DEEP : UNITS_STANDARD;
}

export interface UnitsAggregate {
  userEmail: string;
  units: number;
  runs: number;
  settledCostUsd: number;
}

/** The aggregate feed billing consumes (§9.4): settled units/runs/cost per
 *  user over a UTC period. Read-only; exposes NO stage internals, NO
 *  questions, NO answers. */
export async function aggregateUnits(opts: {
  from: string; // inclusive ISO date/timestamp
  to: string; // exclusive
  userEmail?: string;
}): Promise<UnitsAggregate[]> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(
      `SELECT user_email,
              coalesce(sum(units), 0)::int AS units,
              count(*)::int AS runs,
              coalesce(sum(settled_cost_usd), 0)::float AS settled_cost_usd
       FROM ask_runs
       WHERE finished_at >= $1 AND finished_at < $2
         AND ($3::text IS NULL OR user_email = $3)
       GROUP BY user_email
       ORDER BY user_email`,
      [opts.from, opts.to, opts.userEmail ?? null],
    );
    return (rows as Array<Record<string, unknown>>).map((r) => ({
      userEmail: String(r.user_email),
      units: Number(r.units),
      runs: Number(r.runs),
      settledCostUsd: Number(r.settled_cost_usd),
    }));
  } finally {
    await pool.end();
  }
}

import { Pool } from "@neondatabase/serverless";
import { SpendGuard, envNum, pgUsageStore, stopCategory } from "../usage/spend-guard";
import type { StopCategory } from "../usage/spend-guard";
import { isLive, matchEntity, sanitizeForPersist } from "./opensanctions";

// Enrich entities lacking an OpenSanctions check. Idempotent + resumable.
//
// Two selection modes:
//   normal  (no refresh)  — rows never checked OR only stub-checked. A live key
//                            upgrades a stub on the next pass.
//   rescore (refresh=1)   — rows whose live checkedAt is strictly older than a
//                            FIXED operator-supplied `before` cutoff, PLUS the
//                            missing/stub/malformed rows. Because each successful
//                            check stamps checkedAt=now (which is after the fixed
//                            cutoff), the SAME cutoff advances to the next batch on
//                            every serverless invocation instead of re-selecting the
//                            same highest-priority prefix (the old refresh bug).
//
// Runs from Vercel (api.opensanctions.org is reachable there; not from the build host).
//
// Live /match calls are quota-metered against the account's 2,000-request CALENDAR
// MONTH allowance — the OpenSanctions guard uses totalPeriod:"calendar_month", so
// OPENSANCTIONS_CALL_CAP is a per-UTC-month request quota (it resets at the month
// boundary without deleting provider_usage history), not a lifetime cap. Every call
// passes SpendGuard first; per-day and per-run caps still apply. Priority order:
// entities under pressure signals (defendant/target/dismissed claim roles) first,
// then persons, then companies — highest compliance value per call.

const OS_EST_USD_PER_MATCH = 0.11; // EUR 0.10 /match, ledger visibility only

export function opensanctionsGuardFromEnv(): SpendGuard {
  return new SpendGuard(
    {
      provider: "opensanctions",
      totalCapUsd: null,
      // OPENSANCTIONS_CALL_CAP is the calendar-month request quota (2,000), not a
      // lifetime cap — see totalPeriod below. Env name kept for deployed-config compat.
      totalRequestCap: envNum("OPENSANCTIONS_CALL_CAP", 300),
      totalPeriod: "calendar_month",
      dailyUsdCap: envNum("OPENSANCTIONS_DAILY_USD_CAP", 40),
      dailyRequestCap: envNum("OPENSANCTIONS_DAILY_CALL_CAP", 200),
      runRequestCap: envNum("OPENSANCTIONS_RUN_CALL_CAP", 120),
    },
    pgUsageStore,
  );
}

export type EnrichMode = "normal" | "rescore";

export interface EnrichStats {
  scanned: number;
  checked: number;
  matched: number;
  sanctioned: number;
  failed: number;
  live: boolean;
  /** normal = missing/stub selection; rescore = fixed-cutoff advance. */
  mode: EnrichMode;
  /** the fixed rescore cutoff (ISO), or null in normal mode. Non-sensitive. */
  cutoff: string | null;
  /** eligible candidates left AFTER this batch (same predicate as selection). */
  remaining: number | null;
  /** rescore/normal selection is exhausted (remaining === 0). */
  completed: boolean;
  /** coarse budget-stop category (run_cap | daily_cap | monthly_cap | ...) or null. */
  stopReason: StopCategory;
  /** human-readable budget-stop reason (kept for logs), or null. */
  budgetStopped: string | null;
}

const ELIGIBLE_KINDS = "('person','company','org','agency','faction')";

// A checkedAt value PostgreSQL can safely cast to timestamptz: a leading ISO
// date+time. Anything else — missing, empty, or malformed legacy value — is
// treated as "needs refresh" and is NEVER cast, so a bad value cannot raise a
// JSON-to-timestamptz cast error that aborts the whole batch.
const ISO_TS_PREFIX = "^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}";

/** WHERE predicate (no leading AND) selecting entities that still need a check.
 *  `beforeParam` is the SQL placeholder ($n) for the rescore cutoff; unused in
 *  normal mode. The rescore CASE is ordered so the timestamptz cast runs ONLY on
 *  rows whose checkedAt matches the ISO prefix — malformed values fall to an
 *  earlier `true` branch. */
export function candidatePredicate(mode: EnrichMode, beforeParam: string): string {
  const os = "e.meta->'opensanctions'";
  if (mode === "normal") {
    return `((${os}) IS NULL OR (${os}->>'stub')::boolean IS TRUE)`;
  }
  return `CASE
      WHEN (${os}) IS NULL THEN true
      WHEN (${os}->>'stub')::boolean IS TRUE THEN true
      WHEN ${os}->>'checkedAt' IS NULL OR ${os}->>'checkedAt' = '' THEN true
      WHEN ${os}->>'checkedAt' !~ '${ISO_TS_PREFIX}' THEN true
      ELSE (${os}->>'checkedAt')::timestamptz < ${beforeParam}::timestamptz
    END`;
}

/** Parameterized SELECT for a candidate batch (pure — proven against Postgres in
 *  the enrich integration test). Params: normal -> [limit]; rescore -> [limit, before]. */
export function buildCandidateQuery(
  mode: EnrichMode,
  limit: number,
  before: string | null,
): { text: string; values: unknown[] } {
  const values: unknown[] = [limit];
  let pred: string;
  if (mode === "rescore") {
    values.push(before);
    pred = candidatePredicate("rescore", "$2");
  } else {
    pred = candidatePredicate("normal", "");
  }
  const text = `SELECT e.id, e.kind, e.name,
            count(ce.claim_id) FILTER (WHERE ce.role IN ('defendant','target','dismissed'))::int AS pressure,
            count(ce.claim_id)::int AS mentions
       FROM entities e
       LEFT JOIN claim_entities ce ON ce.entity_id = e.id
       WHERE e.kind IN ${ELIGIBLE_KINDS}
         AND ${pred}
       GROUP BY e.id, e.kind, e.name
       ORDER BY (count(ce.claim_id) FILTER (WHERE ce.role IN ('defendant','target','dismissed')) > 0) DESC,
                (e.kind = 'person') DESC,
                (e.kind = 'company') DESC,
                count(ce.claim_id) DESC,
                e.id
       LIMIT $1`;
  return { text, values };
}

/** Parameterized COUNT of remaining candidates (same predicate as selection).
 *  Params: normal -> []; rescore -> [before]. */
export function buildRemainingQuery(
  mode: EnrichMode,
  before: string | null,
): { text: string; values: unknown[] } {
  const values: unknown[] = [];
  let pred: string;
  if (mode === "rescore") {
    values.push(before);
    pred = candidatePredicate("rescore", "$1");
  } else {
    pred = candidatePredicate("normal", "");
  }
  const text = `SELECT count(*)::int AS remaining
       FROM entities e
       WHERE e.kind IN ${ELIGIBLE_KINDS}
         AND ${pred}`;
  return { text, values };
}

/** Largest candidate limit the route will accept. The sanctions pass clamps
 *  further to the per-run cap; this only bounds the ownership pass and the
 *  serverless duration against an absurd caller-supplied limit. */
export const MAX_ENRICH_LIMIT = 1000;
const DEFAULT_ENRICH_LIMIT = 200;

/** Canonicalize an operator-supplied ISO instant, or null if it is not a full
 *  date+time. Requires a time component so Date.parse leniency cannot turn a bare
 *  "2026" into a valid year-start — a rescore cutoff must be an exact instant. */
export function normalizeIsoInstant(raw: string | null): string | null {
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(raw)) return null;
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

export interface EnrichRequest {
  refresh: boolean;
  before: string | null;
  limit: number;
  only: string | null;
}
export type EnrichParamResult =
  | { ok: true; params: EnrichRequest }
  | { ok: false; error: string };

/** Validate the enrich cron query params. When refresh=1 a valid ISO `before`
 *  cutoff is REQUIRED (missing/invalid -> 400 so the caller never opens a paid
 *  loop with a per-invocation "now" that would re-select the same prefix). */
export function parseEnrichParams(sp: URLSearchParams): EnrichParamResult {
  const refresh = sp.get("refresh") === "1";
  const only = sp.get("only");

  let limit = DEFAULT_ENRICH_LIMIT;
  const rawLimit = sp.get("limit");
  if (rawLimit !== null && rawLimit !== "") {
    const n = Number(rawLimit);
    if (!Number.isInteger(n) || n <= 0 || n > MAX_ENRICH_LIMIT) {
      return { ok: false, error: `invalid limit (want a positive integer <= ${MAX_ENRICH_LIMIT})` };
    }
    limit = n;
  }

  let before: string | null = null;
  if (refresh) {
    before = normalizeIsoInstant(sp.get("before"));
    if (!before) {
      return {
        ok: false,
        error: "refresh=1 requires a valid ISO 'before' cutoff (e.g. 2026-07-15T18:00:00Z)",
      };
    }
  }
  return { ok: true, params: { refresh, before, limit, only } };
}

export async function enrichEntities(opts?: {
  limit?: number;
  refresh?: boolean;
  before?: string | null;
  nowIso: string;
}): Promise<EnrichStats> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const live = isLive();
  const mode: EnrichMode = opts?.refresh ? "rescore" : "normal";
  const before = mode === "rescore" ? (opts?.before ?? null) : null;

  // Clamp the candidate limit into [1, run cap] so a caller cannot bypass the
  // per-run cap (or the serverless duration) with an enormous limit.
  const runCap = envNum("OPENSANCTIONS_RUN_CALL_CAP", 120);
  const reqLimit = Number.isFinite(opts?.limit) ? Math.floor(opts?.limit as number) : 120;
  const limit = Math.min(Math.max(1, reqLimit), runCap);

  const guard = opensanctionsGuardFromEnv();
  const stats: EnrichStats = {
    scanned: 0, checked: 0, matched: 0, sanctioned: 0, failed: 0,
    live,
    mode,
    cutoff: before,
    remaining: null,
    completed: false,
    stopReason: null,
    budgetStopped: null,
  };
  if (live) await guard.init();
  try {
    const q = buildCandidateQuery(mode, limit, before);
    const { rows } = await pool.query(q.text, q.values);
    stats.scanned = rows.length;

    for (const e of rows) {
      if (live) {
        const r = guard.tryReserve();
        if (!r.ok) {
          stats.budgetStopped = r.reason;
          stats.stopReason = stopCategory(r, guard.cfg.totalPeriod);
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

    // Remaining eligible candidates AFTER this batch — rows just checked now sit
    // beyond the cutoff (rescore) or are no longer stub (normal). 0 with no budget
    // stop means the selection is exhausted (rescore complete).
    const rq = buildRemainingQuery(mode, before);
    const { rows: rem } = await pool.query(rq.text, rq.values);
    stats.remaining = rem[0]?.remaining ?? null;
    stats.completed = stats.remaining === 0;

    return stats;
  } finally {
    await pool.end();
  }
}

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
// passes SpendGuard first; per-day and per-run caps still apply. Only entities with
// >=1 linked claim are ever eligible (CLAIM_LINKED_SQL below). Priority order within
// that population: entities under pressure signals (defendant/target/dismissed claim
// roles) first, then persons, then companies — highest compliance value per call.

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

// PAID-SPEND ELIGIBILITY BOUNDARY (OPEN-TASKS #17) — not a ranking preference.
// An entity with no claim_entities row has no claim depending on it, so an
// OpenSanctions /match for it buys nothing and still costs a metered request
// against the calendar-month quota. Production evidence (2026-07-16 recount):
// 537 of 1,012 eligible rows had zero claim links; 351 had already been paid for.
// EXISTS, not a join: the candidate query's LEFT JOIN on claim_entities is there to
// RANK (pressure / mention counts) and must stay a LEFT JOIN, and the `remaining`
// COUNT has no join at all — joining it would count once per LINK and inflate the
// completion signal past the entity population. EXISTS uses its own alias, is
// row-count-neutral either way, and matches claim_entities_entity_idx (at today's
// ~1k entities the planner prefers a hash semi-join over an index scan; both are
// sub-millisecond). It is ANDed into every selection path by `selectionPredicate`,
// so the batch loop and the `remaining` count always see the identical population.
export const CLAIM_LINKED_SQL = `EXISTS (
        SELECT 1 FROM claim_entities ce_link WHERE ce_link.entity_id = e.id
      )`;

/** WHERE predicate (no leading AND) matching entities whose OpenSanctions METADATA
 *  still needs a check. This is only half of eligibility — paid selection must also
 *  require a claim link; use `selectionPredicate`, which ANDs in `CLAIM_LINKED_SQL`.
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

/** The ONE selection predicate every paid path uses: metadata needs a check AND the
 *  entity carries at least one linked claim. Both builders (candidate + remaining,
 *  both modes) go through here so the batch loop and the completion count can never
 *  drift apart — the drift is what would let an unlinked row be billed. */
export function selectionPredicate(mode: EnrichMode, beforeParam: string): string {
  return `(${candidatePredicate(mode, beforeParam)})
        AND ${CLAIM_LINKED_SQL}`;
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
    pred = selectionPredicate("rescore", "$2");
  } else {
    pred = selectionPredicate("normal", "");
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
    pred = selectionPredicate("rescore", "$1");
  } else {
    pred = selectionPredicate("normal", "");
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

// A rescore cutoff MUST be a timezone-qualified ISO-8601 instant: `YYYY-MM-DDThh:mm`
// (optional `:ss(.fff)`) followed by `Z` or a `±HH:MM` / `±HHMM` offset. A
// timezone-LESS timestamp is rejected on purpose — Date.parse would read it in the
// server's local zone, silently shifting the cutoff. The `T` separator is required
// (no space form) so the input is unambiguous.
const TZ_ISO_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})$/;

/** Canonicalize an operator-supplied ISO instant to UTC (`…Z`), or null when it is
 *  not a timezone-qualified full date+time, is unparseable, or — when `nowIso` is
 *  given — is LATER than that captured instant. Rejecting a future cutoff preserves
 *  the invariant `before <= checkedAt` (checkedAt is stamped with the same nowIso),
 *  so a freshly checked row leaves the rescore predicate instead of staying eligible
 *  and being billed again. */
export function normalizeIsoInstant(raw: string | null, nowIso?: string): string | null {
  if (!raw) return null;
  if (!TZ_ISO_INSTANT.test(raw)) return null;
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return null;
  if (nowIso !== undefined) {
    const now = Date.parse(nowIso);
    if (!Number.isFinite(now) || t > now) return null; // no future cutoff
  }
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

/** Validate the enrich cron query params against `nowIso` (captured once by the
 *  caller). The sanctions rescore requires a `before` cutoff that is timezone-
 *  qualified AND not later than `nowIso` (missing/invalid/future -> 400 before any
 *  paid loop, so a per-invocation "now" cannot re-select the same prefix and a
 *  future cutoff cannot keep re-billing fresh rows). An ownership-only refresh
 *  (`only=ownership`) has no checkedAt cutoff, so `before` is not required there —
 *  a deliberate contract: the cutoff belongs to the sanctions pass. */
export function parseEnrichParams(sp: URLSearchParams, nowIso: string): EnrichParamResult {
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
  if (refresh && only !== "ownership") {
    before = normalizeIsoInstant(sp.get("before"), nowIso);
    if (!before) {
      return {
        ok: false,
        error:
          "refresh=1 requires a timezone-qualified ISO 'before' cutoff no later than now " +
          "(e.g. 2026-07-15T18:00:00Z)",
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
  const mode: EnrichMode = opts?.refresh ? "rescore" : "normal";

  // Defense in depth: enforce the cutoff invariant at the enrichment boundary so a
  // direct caller (bypassing the route's parseEnrichParams) cannot rescore with a
  // future or timezone-less cutoff. Re-validating `before` against the SAME nowIso
  // that will stamp checkedAt guarantees before <= checkedAt, so a fresh check
  // always leaves the predicate. Throw BEFORE opening any pool/loop.
  let before: string | null = null;
  if (mode === "rescore") {
    if (!opts?.nowIso) {
      throw new Error("enrichEntities: rescore requires nowIso to validate and stamp the cutoff");
    }
    before = normalizeIsoInstant(opts.before ?? null, opts.nowIso);
    if (!before) {
      throw new Error(
        "enrichEntities: rescore requires a timezone-qualified `before` cutoff no later than nowIso",
      );
    }
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const live = isLive();

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

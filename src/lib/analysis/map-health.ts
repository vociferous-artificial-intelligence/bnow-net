// Map-stage health monitor + operator alerts (2026-08-15 Iran validation
// recovery, Workstream B).
//
// Root incident: openai_map crossed its all-time backstop on 2026-07-29 and 418
// consecutive hourly runs then recorded ok=true with zero claims — a correct
// fail-closed money decision that masqueraded as job health for 17 days while
// doc_claims (and with them the mapreduce digests and ISW validation) silently
// starved. This module makes that state unmistakably unhealthy:
//
// - a pure evaluator (episode identity, cooldown dedup, one recovery notice)
//   mirroring the production-proven x-health semantics;
// - a per-theater / current-extractor-version freshness check, so global map
//   activity can never mask one theater going stale (ir stale while ru flows);
// - a thin runner that emails FEEDBACK_EMAIL and persists state under
//   provider_state `map_health`; every failure is swallowed (the monitor never
//   breaks the job it measures) and the outcome lands in cron_runs counts as
//   numbers, so the alert result is auditable even when email is unavailable.
//
// Alerts carry ONLY safe operational fields: timestamps, theater codes, day
// dates, numeric counters, stop categories. No prompt/source content, no
// secrets, no provider diagnostics beyond the cap category.

import {
  alertDeliveryCode,
  alertKindCode,
  type AlertDelivery,
} from "../adapters/x-health";
import type { OutboundEmail } from "../email/send";
import { envNum } from "../usage/spend-guard";
import { MAP_EPOCH, mapTheaters } from "./map-worker";
import { currentVersionPairs } from "./map-versions";

export const MAP_HEALTH_PROVIDER = "map_health";

/** Stub marker duplicated from adapters/stubs.ts would drag adapter code into
 *  this module's import graph; the value is a stable public contract
 *  (stub-isolation tests pin it). */
const STUB_CONTENT_PREFIX = "[STUB FIXTURE]";

/** Numeric run counters the evaluator needs (a subset of runMapCycle counts). */
export interface MapHealthCounters {
  selected: number;
  claims: number;
  llmCalls: number;
  batchErrors: number;
  processedMarked: number;
  /** stopCategoryOfCode() of the run's budget stop, or null when none */
  budgetStopCategory: string | null;
}

export interface TheaterFreshness {
  theater: string;
  /** newest eligible raw-document UTC day (null = no eligible docs at all) */
  newestEligibleDay: string | null;
  /** newest UTC day with a doc_map_state disposition under the CURRENT
   *  extractor versions (null = nothing mapped under current versions yet —
   *  e.g. right after a version bump) */
  newestMappedDay: string | null;
  /** eligible-day lag behind the corpus; Infinity when nothing is mapped */
  staleDays: number;
  stale: boolean;
}

export interface MapHealthContext {
  freshness: TheaterFreshness[];
}

export interface MapHealthState extends Record<string, unknown> {
  /** stable identity of the current unhealthy episode; null = healthy */
  episodeKey: string | null;
  lastAlertAtMs: number | null;
}

export const DEFAULT_MAP_HEALTH_STATE: MapHealthState = {
  episodeKey: null,
  lastAlertAtMs: null,
};

export interface MapHealthConfig {
  cooldownMs: number;
  /** a theater is stale when its newest current-version disposition lags the
   *  newest eligible document by at least this many UTC days */
  staleDays: number;
}

export function mapHealthConfigFromEnv(): MapHealthConfig {
  return {
    cooldownMs: envNum("MAP_ALERT_COOLDOWN_SEC", 6 * 3600) * 1000,
    staleDays: Math.max(1, envNum("MAP_STALE_DAYS", 2)),
  };
}

export interface MapHealthEvaluation {
  fire: boolean;
  kind: "unhealthy" | "recovery" | null;
  reasons: string[];
  nextState: MapHealthState;
}

/**
 * Pure health evaluation. A budget stop's category decides its severity:
 * total/monthly-cap and cap-unset stops need operator action; a daily-cap stop
 * is an episode too (it must be visible), while the benign per-run request
 * ceiling ("run_cap") is normal pagination and never a problem. Theater
 * staleness fires independently of this run's own counters.
 */
export function evaluateMapHealth(
  counters: MapHealthCounters,
  context: MapHealthContext,
  prior: MapHealthState,
  config: MapHealthConfig,
  nowMs: number,
): MapHealthEvaluation {
  const state: MapHealthState = {
    episodeKey: prior.episodeKey ?? null,
    lastAlertAtMs: prior.lastAlertAtMs ?? null,
  };

  const problems: string[] = [];
  switch (counters.budgetStopCategory) {
    case "total_cap":
    case "monthly_cap":
      problems.push("budget_stop_total");
      break;
    case "daily_cap":
      problems.push("budget_stop_daily");
      break;
    case "cap_unset":
    case "not_initialized":
      problems.push("cap_unset");
      break;
    default:
      break; // null or "run_cap": not a problem
  }
  for (const f of context.freshness) {
    if (f.stale) problems.push(`stale_${f.theater}`);
  }

  const episodeKey = problems.length ? [...new Set(problems)].sort().join(",") : null;
  const reasons = episodeKey ? [...new Set(problems)].sort() : [];
  const withinCooldown =
    state.lastAlertAtMs !== null && nowMs - state.lastAlertAtMs < config.cooldownMs;

  let fire = false;
  let kind: "unhealthy" | "recovery" | null = null;
  if (episodeKey !== null) {
    if (prior.episodeKey === episodeKey && withinCooldown) {
      fire = false; // one alert per episode until the cooldown lapses
    } else {
      fire = true;
      kind = "unhealthy";
      state.lastAlertAtMs = nowMs;
    }
    state.episodeKey = episodeKey;
  } else {
    if (prior.episodeKey !== null) {
      fire = true; // single recovery notice when the episode clears
      kind = "recovery";
      state.lastAlertAtMs = nowMs;
    }
    state.episodeKey = null;
  }

  return { fire, kind, reasons, nextState: state };
}

// -- freshness ----------------------------------------------------------------

type QueryFn = (sql: string, params: unknown[]) => Promise<Array<Record<string, unknown>>>;

/** Per-theater freshness under the CURRENT extractor versions. One query per
 *  theater: newest eligible doc day vs newest doc_map_state disposition day
 *  restricted to mapVersions' current (track, extractor_version) pairs. */
export async function loadTheaterFreshness(
  query: QueryFn,
  config: MapHealthConfig,
  theaters: string[] = mapTheaters(),
): Promise<TheaterFreshness[]> {
  const out: TheaterFreshness[] = [];
  for (const theater of theaters) {
    const pairs = currentVersionPairs(theater);
    if (pairs.length === 0) continue; // theater not configured for any track
    const tuples: string[] = [];
    const params: unknown[] = [theater, `${STUB_CONTENT_PREFIX}%`, MAP_EPOCH];
    for (const p of pairs) {
      tuples.push(`($${params.length + 1}, $${params.length + 2})`);
      params.push(p.track, p.extractorVersion);
    }
    const rows = await query(
      `SELECT
         (SELECT max(COALESCE(rd.published_at, rd.fetched_at)::date)::text
          FROM raw_documents rd
          WHERE rd.country_iso2 = $1 AND length(rd.content) >= 40
            AND rd.content NOT LIKE $2
            AND COALESCE(rd.published_at, rd.fetched_at)::date >= $3::date) AS newest_eligible,
         (SELECT max(COALESCE(rd.published_at, rd.fetched_at)::date)::text
          FROM doc_map_state dms
          JOIN raw_documents rd ON rd.id = dms.raw_document_id
          WHERE rd.country_iso2 = $1
            AND (dms.track, dms.extractor_version) IN (${tuples.join(", ")})) AS newest_mapped`,
      params,
    );
    const r = rows[0] ?? {};
    const newestEligibleDay = (r.newest_eligible as string | null) ?? null;
    const newestMappedDay = (r.newest_mapped as string | null) ?? null;
    let staleDays = 0;
    if (newestEligibleDay !== null) {
      staleDays =
        newestMappedDay === null
          ? Number.POSITIVE_INFINITY
          : Math.round((Date.parse(newestEligibleDay) - Date.parse(newestMappedDay)) / 86_400_000);
    }
    out.push({
      theater,
      newestEligibleDay,
      newestMappedDay,
      staleDays,
      stale: newestEligibleDay !== null && staleDays >= config.staleDays,
    });
  }
  return out;
}

// -- alert email (safe fields only) -------------------------------------------

export function buildMapHealthEmail(
  to: string,
  kind: "unhealthy" | "recovery",
  reasons: string[],
  counters: MapHealthCounters,
  context: MapHealthContext,
  nowMs: number,
): OutboundEmail {
  const status = kind === "recovery" ? "RECOVERED" : "UNHEALTHY";
  const reasonLine = reasons.length ? reasons.join(", ") : kind === "recovery" ? "resumed" : "unknown";
  const freshnessLines = context.freshness.map(
    (f) =>
      `  ${f.theater}: newest eligible ${f.newestEligibleDay ?? "n/a"}, newest mapped ` +
      `${f.newestMappedDay ?? "none"} (${f.stale ? "STALE" : "ok"}, lag ${Number.isFinite(f.staleDays) ? f.staleDays : "∞"}d)`,
  );
  const lines = [
    `Map stage health (provider openai_map, cron job "map") — ${status}.`,
    "",
    `Reasons: ${reasonLine}`,
    `At: ${new Date(nowMs).toISOString()}`,
    "",
    `Run counters: selected=${counters.selected} claims=${counters.claims} llmCalls=${counters.llmCalls} ` +
      `batchErrors=${counters.batchErrors} processedMarked=${counters.processedMarked} ` +
      `budgetStop=${counters.budgetStopCategory ?? "none"}`,
    "Theater freshness (current extractor versions):",
    ...freshnessLines,
    "",
    "A total-cap/cap-unset stop needs operator action (raise or re-set the map cap envs);",
    "a daily-cap stop resumes at the next UTC day; staleness clears as the backlog drains.",
    "Automated monitor — no source content, prompts, or credentials are included.",
  ];
  return {
    to,
    subject: `[BNOW] map stage ${status.toLowerCase()}: ${reasonLine}`,
    text: lines.join("\n"),
    trackLinks: "None",
    trackOpens: false,
  };
}

// -- runner --------------------------------------------------------------------

export interface MapHealthOutcome {
  evaluated: boolean;
  alert: "unhealthy" | "recovery" | null;
  reasons: string[];
  delivery: AlertDelivery;
  episodeKey: string | null;
}

export interface MapHealthDeps {
  loadState<T extends Record<string, unknown>>(provider: string): Promise<T | null>;
  saveState(provider: string, state: Record<string, unknown>): Promise<void>;
  sendEmail(mail: OutboundEmail): Promise<{ delivered: boolean; via: string }>;
  recipient(): string | null;
  now(): number;
  query: QueryFn;
}

/** Evaluate map health, alert once per episode (+ one recovery notice), persist
 *  the next state, and return the safe outcome for cron counts. Never throws. */
export async function runMapHealthCheck(
  counters: MapHealthCounters,
  deps: MapHealthDeps,
  config: MapHealthConfig = mapHealthConfigFromEnv(),
): Promise<MapHealthOutcome> {
  const none: MapHealthOutcome = {
    evaluated: false,
    alert: null,
    reasons: [],
    delivery: "none",
    episodeKey: null,
  };
  let context: MapHealthContext;
  let prior: MapHealthState;
  try {
    context = { freshness: await loadTheaterFreshness(deps.query, config) };
    prior = (await deps.loadState<MapHealthState>(MAP_HEALTH_PROVIDER)) ?? DEFAULT_MAP_HEALTH_STATE;
  } catch (e) {
    console.warn(
      `map-health: could not load freshness/state — skipping this run: ${e instanceof Error ? e.message : e}`,
    );
    return none;
  }

  const evaln = evaluateMapHealth(counters, context, prior, config, deps.now());

  let delivery: AlertDelivery = "none";
  if (evaln.fire && evaln.kind) {
    const to = deps.recipient();
    if (!to) {
      delivery = "no_recipient";
    } else {
      try {
        await deps.sendEmail(
          buildMapHealthEmail(to, evaln.kind, evaln.reasons, counters, context, deps.now()),
        );
        delivery = "sent";
      } catch (e) {
        delivery = "failed";
        console.warn(
          `map-health: alert email failed (map job unaffected): ${e instanceof Error ? e.message : e}`,
        );
      }
    }
  }

  try {
    await deps.saveState(MAP_HEALTH_PROVIDER, evaln.nextState);
  } catch (e) {
    console.warn(`map-health: could not persist health state: ${e instanceof Error ? e.message : e}`);
  }

  return {
    evaluated: true,
    alert: evaln.fire ? evaln.kind : null,
    reasons: evaln.reasons,
    delivery,
    episodeKey: evaln.nextState.episodeKey,
  };
}

/** Production-wired convenience for the cron route: DB-backed state + Postmark
 *  email + FEEDBACK_EMAIL recipient. Records numeric outcome codes into the
 *  run's counts (auditable even when email is unavailable) and never throws. */
export async function runScheduledMapHealth(counts: Record<string, unknown>): Promise<void> {
  try {
    const counters: MapHealthCounters = {
      selected: Number(counts.selected ?? 0),
      claims: Number(counts.claims ?? 0),
      llmCalls: Number(counts.llmCalls ?? 0),
      batchErrors: Number(counts.batchErrors ?? 0),
      processedMarked: Number(counts.processedMarked ?? 0),
      budgetStopCategory: typeof counts.budgetStopCategory === "string" ? counts.budgetStopCategory : null,
    };
    const { rawSql } = await import("@/db");
    const { loadProviderState, saveProviderState } = await import("../usage/spend-guard");
    const { sendEmail } = await import("../email/send");
    const { feedbackEmail } = await import("../feedback");
    const outcome = await runMapHealthCheck(counters, {
      loadState: loadProviderState,
      saveState: saveProviderState,
      sendEmail,
      recipient: feedbackEmail,
      now: () => Date.now(),
      query: (sql, params) => rawSql.query(sql, params) as Promise<Array<Record<string, unknown>>>,
    });
    counts.alertEvaluated = outcome.evaluated ? 1 : 0;
    counts.alertKind = alertKindCode(outcome.alert);
    counts.alertDelivery = alertDeliveryCode(outcome.delivery);
    counts.alertReasons = outcome.reasons.length; // count only — no strings in cron counts
  } catch (e) {
    console.warn(`map-health: check failed (map job unaffected): ${e instanceof Error ? e.message : e}`);
  }
}

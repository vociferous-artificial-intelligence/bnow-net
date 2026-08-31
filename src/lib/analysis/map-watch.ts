// Map-stage failure detection INDEPENDENT of map-worker completion
// (OPEN-TASKS #103; born from the 2026-08-31 OOM incident, where eleven
// consecutive hourly map runs died after lease acquisition and produced
// #98-swept ok=false rows, a frozen doc_claims, and ZERO operator email —
// `map-health` evaluates only inside a COMPLETING steady run, so any
// pre-completion death class is invisible to it).
//
// This watcher runs piggybacked on OTHER job families' cron starts (the same
// home as the #98 sweep — every ingest start, i.e. at least every 15 minutes
// via ingest:fast), throttled through its own provider_state row, and detects:
//   - repeated map timeouts: ≥2 swept map-family rows in the lookback window
//     (the sweep signature: ok=false with finished_at still NULL — ruling 10's
//     honest bookkeeping, never a fabricated finish);
//   - a missing scheduled start: no map-family row STARTED within the window
//     an hourly cron plus slack allows;
//   - no mapping progress while eligible work exists: doc_map_state.mapped_at
//     stale beyond the threshold with eligible unprocessed docs present —
//     deliberately keyed on dispositions, not run success, because a
//     lease-contention `skipped` run is ok=true without progressing anything.
// Deliberate NON-alarms: an actively running job inside its ceiling (the sweep
// only marks rows past ceiling+grace, so a live run never counts), benign
// lease contention (progress signal, not run-ok, is what gates), an empty
// eligible set, and budget-stop categories — the in-run map-health alerting
// owns budget episodes, so a budget-stopped latest run suppresses the
// no-progress problem here.
//
// Episode identity, cooldown dedup, one recovery notice, and the numeric-only
// email contract mirror map-health.ts. Every failure is swallowed — the
// watcher must never break the job that triggered it.

import {
  alertDeliveryCode,
  alertKindCode,
  type AlertDelivery,
} from "../adapters/x-health";
import type { OutboundEmail } from "../email/send";
import { envNum } from "../usage/spend-guard";

export const MAP_WATCH_PROVIDER = "map_watch";

// Duplicated map-eligibility constants (MAP_EPOCH / stub prefix / theater env
// parsing) so this module — imported from the generic cron bookkeeping seam —
// never drags map-worker's heavy import graph (OpenAI client, prompts) into
// every cron route bundle. Same deliberate-duplication precedent as
// map-health's STUB_CONTENT_PREFIX; values are stable public contracts and
// the watch tests pin them against the originals.
const MAP_EPOCH = "2026-07-04";
const STUB_CONTENT_PREFIX = "[STUB FIXTURE]";
function watchTheaters(): string[] {
  const raw = process.env.MAP_THEATERS ?? "ru,ua,ir";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export interface MapWatchSignals {
  /** #98-swept map-family rows (ok=false, finished_at NULL) in the lookback */
  sweptRecent: number;
  /** seconds since the newest map-family row STARTED; null = none ever */
  lastStartAgeSec: number | null;
  /** seconds since the newest doc_map_state disposition; null = none ever */
  dispositionAgeSec: number | null;
  /** at least one eligible unprocessed document exists right now */
  eligibleExists: boolean;
  /** the newest FINISHED map run's budgetStopCategory, or null */
  lastBudgetStopCategory: string | null;
}

export interface MapWatchState extends Record<string, unknown> {
  episodeKey: string | null;
  lastAlertAtMs: number | null;
  /** throttle: the watch runs its signal queries at most once per interval */
  lastCheckAtMs: number | null;
}

export const DEFAULT_MAP_WATCH_STATE: MapWatchState = {
  episodeKey: null,
  lastAlertAtMs: null,
  lastCheckAtMs: null,
};

export interface MapWatchConfig {
  /** minimum spacing between signal evaluations */
  checkIntervalMs: number;
  /** swept-row lookback */
  lookbackMs: number;
  /** hourly cron + slack: older newest-start = missing schedule */
  startStaleMs: number;
  /** disposition staleness that counts as "no progress" */
  progressStaleMs: number;
  cooldownMs: number;
}

export function mapWatchConfigFromEnv(): MapWatchConfig {
  return {
    checkIntervalMs: envNum("MAP_WATCH_CHECK_SEC", 600) * 1000,
    lookbackMs: envNum("MAP_WATCH_LOOKBACK_SEC", 4 * 3600) * 1000,
    startStaleMs: envNum("MAP_WATCH_START_STALE_SEC", 75 * 60) * 1000,
    progressStaleMs: envNum("MAP_WATCH_PROGRESS_STALE_SEC", 3 * 3600) * 1000,
    cooldownMs: envNum("MAP_WATCH_COOLDOWN_SEC", 6 * 3600) * 1000,
  };
}

/** Budget categories whose episodes the in-run map-health alerting owns; a
 *  latest run stopped by one of these suppresses the no-progress problem here
 *  (known bounded condition, not a new failure). The benign per-run ceiling
 *  and NULL are not stops at all. */
const BUDGET_OWNED = new Set(["daily_cap", "total_cap", "monthly_cap", "cap_unset", "not_initialized"]);

export interface MapWatchEvaluation {
  fire: boolean;
  kind: "unhealthy" | "recovery" | null;
  reasons: string[];
  nextState: MapWatchState;
}

/** Pure evaluation — same episode/cooldown/recovery semantics as map-health. */
export function evaluateMapWatch(
  signals: MapWatchSignals,
  prior: MapWatchState,
  config: MapWatchConfig,
  nowMs: number,
): MapWatchEvaluation {
  const state: MapWatchState = {
    episodeKey: prior.episodeKey ?? null,
    lastAlertAtMs: prior.lastAlertAtMs ?? null,
    lastCheckAtMs: nowMs,
  };

  const problems: string[] = [];
  if (signals.sweptRecent >= 2) problems.push("map_timeouts");
  if (signals.lastStartAgeSec === null || signals.lastStartAgeSec * 1000 > config.startStaleMs) {
    problems.push("map_no_start");
  }
  const budgetOwned =
    signals.lastBudgetStopCategory !== null && BUDGET_OWNED.has(signals.lastBudgetStopCategory);
  if (
    signals.eligibleExists &&
    !budgetOwned &&
    (signals.dispositionAgeSec === null || signals.dispositionAgeSec * 1000 > config.progressStaleMs)
  ) {
    problems.push("map_no_progress");
  }

  const episodeKey = problems.length ? [...new Set(problems)].sort().join(",") : null;
  const reasons = episodeKey ? [...new Set(problems)].sort() : [];
  const withinCooldown =
    state.lastAlertAtMs !== null && nowMs - state.lastAlertAtMs < config.cooldownMs;

  let fire = false;
  let kind: "unhealthy" | "recovery" | null = null;
  if (episodeKey !== null) {
    if (prior.episodeKey === episodeKey && withinCooldown) {
      fire = false;
    } else {
      fire = true;
      kind = "unhealthy";
      state.lastAlertAtMs = nowMs;
    }
    state.episodeKey = episodeKey;
  } else {
    if (prior.episodeKey !== null) {
      fire = true;
      kind = "recovery";
      state.lastAlertAtMs = nowMs;
    }
    state.episodeKey = null;
  }

  return { fire, kind, reasons, nextState: state };
}

// -- signals -------------------------------------------------------------------

type QueryFn = (sql: string, params: unknown[]) => Promise<Array<Record<string, unknown>>>;

/** Four bounded queries; every instant is DB-clock-derived (epoch seconds),
 *  never a driver-rendered timestamp string. */
export async function loadMapWatchSignals(
  query: QueryFn,
  config: MapWatchConfig,
): Promise<MapWatchSignals> {
  const lookbackSec = Math.floor(config.lookbackMs / 1000);
  const [sweptRows, startRows, dispRows, eligRows, budgetRows] = [
    await query(
      `SELECT count(*)::int AS n FROM cron_runs
        WHERE job LIKE 'map%' AND ok = false AND finished_at IS NULL
          AND started_at > now() - make_interval(secs => $1)`,
      [lookbackSec],
    ),
    await query(
      `SELECT floor(extract(epoch from now() - max(started_at)))::bigint AS age
         FROM cron_runs WHERE job LIKE 'map%'`,
      [],
    ),
    await query(
      `SELECT floor(extract(epoch from now() - max(mapped_at)))::bigint AS age FROM doc_map_state`,
      [],
    ),
    await query(
      `SELECT EXISTS (
         SELECT 1 FROM raw_documents rd
          WHERE rd.processed = false AND rd.country_iso2 = ANY($1)
            AND length(rd.content) >= 40 AND rd.content NOT LIKE $2
            AND COALESCE(rd.published_at, rd.fetched_at)::date >= $3::date
        ) AS e`,
      [watchTheaters(), `${STUB_CONTENT_PREFIX}%`, MAP_EPOCH],
    ),
    await query(
      `SELECT counts->>'budgetStopCategory' AS c FROM cron_runs
        WHERE job = 'map' AND finished_at IS NOT NULL
        ORDER BY started_at DESC LIMIT 1`,
      [],
    ),
  ];
  const num = (v: unknown): number | null =>
    v === null || v === undefined ? null : Number(v);
  return {
    sweptRecent: Number(sweptRows[0]?.n ?? 0),
    lastStartAgeSec: num(startRows[0]?.age),
    dispositionAgeSec: num(dispRows[0]?.age),
    eligibleExists: Boolean(eligRows[0]?.e),
    lastBudgetStopCategory:
      typeof budgetRows[0]?.c === "string" && budgetRows[0].c.length > 0
        ? (budgetRows[0].c as string)
        : null,
  };
}

// -- alert email (numeric/safe fields only) ------------------------------------

export function buildMapWatchEmail(
  to: string,
  kind: "unhealthy" | "recovery",
  reasons: string[],
  signals: MapWatchSignals,
  nowMs: number,
): OutboundEmail {
  const status = kind === "recovery" ? "RECOVERED" : "UNHEALTHY";
  const reasonLine = reasons.length ? reasons.join(", ") : kind === "recovery" ? "resumed" : "unknown";
  const lines = [
    `Map stage watchdog (independent of map-run completion) — ${status}.`,
    "",
    `Reasons: ${reasonLine}`,
    `At: ${new Date(nowMs).toISOString()}`,
    "",
    `Signals: sweptTimeouts=${signals.sweptRecent} lastStartAgeSec=${signals.lastStartAgeSec ?? "none"} ` +
      `dispositionAgeSec=${signals.dispositionAgeSec ?? "none"} eligibleWork=${signals.eligibleExists ? 1 : 0} ` +
      `lastBudgetStop=${signals.lastBudgetStopCategory ?? "none"}`,
    "",
    "map_timeouts: map runs are dying before completion (the in-run health check",
    "cannot see this class); map_no_start: the hourly cron is not firing;",
    "map_no_progress: eligible documents exist but nothing is being dispositioned.",
    "Automated monitor — no source content, prompts, or credentials are included.",
  ];
  return {
    to,
    subject: `[BNOW] map watchdog ${status.toLowerCase()}: ${reasonLine}`,
    text: lines.join("\n"),
    trackLinks: "None",
    trackOpens: false,
  };
}

// -- runner --------------------------------------------------------------------

export interface MapWatchOutcome {
  evaluated: boolean;
  throttled: boolean;
  alert: "unhealthy" | "recovery" | null;
  reasons: string[];
  delivery: AlertDelivery;
}

export interface MapWatchDeps {
  loadState<T extends Record<string, unknown>>(provider: string): Promise<T | null>;
  saveState(provider: string, state: Record<string, unknown>): Promise<void>;
  sendEmail(mail: OutboundEmail): Promise<{ delivered: boolean; via: string }>;
  recipient(): string | null;
  now(): number;
  query: QueryFn;
}

/** Evaluate the watch once per interval: one state read on the throttled path,
 *  four bounded queries + episode-deduped alert otherwise. Never throws. */
export async function runMapWatchCheck(
  deps: MapWatchDeps,
  config: MapWatchConfig = mapWatchConfigFromEnv(),
): Promise<MapWatchOutcome> {
  const none: MapWatchOutcome = {
    evaluated: false,
    throttled: false,
    alert: null,
    reasons: [],
    delivery: "none",
  };
  let prior: MapWatchState;
  try {
    prior = (await deps.loadState<MapWatchState>(MAP_WATCH_PROVIDER)) ?? DEFAULT_MAP_WATCH_STATE;
  } catch (e) {
    console.warn(`map-watch: could not load state — skipping: ${e instanceof Error ? e.message : e}`);
    return none;
  }
  const nowMs = deps.now();
  if (prior.lastCheckAtMs !== null && nowMs - prior.lastCheckAtMs < config.checkIntervalMs) {
    return { ...none, throttled: true };
  }

  let signals: MapWatchSignals;
  try {
    signals = await loadMapWatchSignals(deps.query, config);
  } catch (e) {
    console.warn(
      `map-watch: could not load signals — skipping this check: ${e instanceof Error ? e.message : e}`,
    );
    return none;
  }

  const evaln = evaluateMapWatch(signals, prior, config, nowMs);

  let delivery: AlertDelivery = "none";
  if (evaln.fire && evaln.kind) {
    const to = deps.recipient();
    if (!to) {
      delivery = "no_recipient";
    } else {
      try {
        await deps.sendEmail(buildMapWatchEmail(to, evaln.kind, evaln.reasons, signals, nowMs));
        delivery = "sent";
      } catch (e) {
        delivery = "failed";
        console.warn(
          `map-watch: alert email failed (host job unaffected): ${e instanceof Error ? e.message : e}`,
        );
      }
    }
  }

  try {
    await deps.saveState(MAP_WATCH_PROVIDER, evaln.nextState);
  } catch (e) {
    console.warn(`map-watch: could not persist state: ${e instanceof Error ? e.message : e}`);
  }

  return {
    evaluated: true,
    throttled: false,
    alert: evaln.fire ? evaln.kind : null,
    reasons: evaln.reasons,
    delivery,
  };
}

/** Cron-start hook (called from withCronRun for NON-map job families so the
 *  detection path can never share the map worker's fate). Lazy-wired to the
 *  DB/Postmark seams like runScheduledMapHealth; swallows everything; returns
 *  numeric outcome codes for optional counts auditing. */
export async function runScheduledMapWatch(): Promise<{
  evaluated: number;
  alertKind: number;
  alertDelivery: number;
}> {
  try {
    const { rawSql } = await import("@/db");
    const { loadProviderState, saveProviderState } = await import("../usage/spend-guard");
    const { sendEmail } = await import("../email/send");
    const { feedbackEmail } = await import("../feedback");
    const outcome = await runMapWatchCheck({
      loadState: loadProviderState,
      saveState: saveProviderState,
      sendEmail,
      recipient: feedbackEmail,
      now: () => Date.now(),
      query: (sql, params) => rawSql.query(sql, params) as Promise<Array<Record<string, unknown>>>,
    });
    return {
      evaluated: outcome.evaluated ? 1 : 0,
      alertKind: alertKindCode(outcome.alert),
      alertDelivery: alertDeliveryCode(outcome.delivery),
    };
  } catch (e) {
    console.warn(`map-watch: check failed (host job unaffected): ${e instanceof Error ? e.message : e}`);
    return { evaluated: 0, alertKind: 0, alertDelivery: 0 };
  }
}

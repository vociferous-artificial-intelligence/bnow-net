// X/twitterapi.io ingestion health monitor + operator alerts (OPEN-TASKS #38 + #66).
//
// A pure evaluator (episode identity, cooldown dedup, recovery) plus a thin runner
// that emails the operator via the existing FEEDBACK_EMAIL destination and persists
// health state in provider_state under `x_api_health`. It NEVER breaks the ingest it
// measures (every failure is swallowed) and NEVER leaks a secret or message content:
// alerts carry only safe operational fields (timestamps/age, job, numeric counters,
// checkpoint batch + a cursor-PRESENT flag, stop category) — no API key, no auth
// header, no raw provider body, no tweet text, no email list, no CRON_SECRET.
//
// Provider is api.twitterapi.io (adapter/provider `x_api`, header `X-API-Key`) — the
// third-party service, NOT the official X developer API.

import type { OutboundEmail } from "../email/send";
import { envNum } from "../usage/spend-guard";
import type { AutoCatchupState } from "./x-auto-catchup";

export const X_HEALTH_PROVIDER = "x_api_health";

/** Numeric poll counters (a subset of the adapter runStats), the health inputs. */
export interface XHealthCounters {
  requests: number;
  docs: number;
  budgetStops: number;
  pageTruncations: number;
  requestFailures: number;
  lockSkips: number;
  incomplete: number;
}

export interface XHealthCatchupContext {
  state: AutoCatchupState;
  /** true only when a `refused` was caused by the lease being held (another job working) */
  leaseHeld: boolean;
  /** progress signature for stuck detection; null when the catch-up made no request */
  progressSig: string | null;
  inserted: number;
  watermarkAdvanced: boolean;
}

export interface XHealthContext {
  /** live watermark age in seconds at poll start, or null when no watermark exists yet */
  watermarkAgeSec: number | null;
  parkThresholdSec: number;
  /** catch-up outcome this run, or null when the steady poll ran */
  catchup: XHealthCatchupContext | null;
}

export interface XHealthState extends Record<string, unknown> {
  /** stable identity of the current unhealthy episode; null = healthy */
  episodeKey: string | null;
  lastAlertAtMs: number | null;
  /** consecutive clean-but-empty steady polls (for the persistent-empty condition) */
  consecutiveEmpty: number;
  /** last catch-up progress signature + how many runs it has been unchanged */
  stuckProgressSig: string | null;
  stuckRuns: number;
}

export const DEFAULT_HEALTH_STATE: XHealthState = {
  episodeKey: null,
  lastAlertAtMs: null,
  consecutiveEmpty: 0,
  stuckProgressSig: null,
  stuckRuns: 0,
};

export interface XHealthConfig {
  cooldownMs: number;
  emptyAlertRuns: number;
  stuckAlertRuns: number;
}

export function xHealthConfigFromEnv(): XHealthConfig {
  return {
    cooldownMs: envNum("X_ALERT_COOLDOWN_SEC", 6 * 3600) * 1000,
    emptyAlertRuns: envNum("X_EMPTY_ALERT_RUNS", 12),
    stuckAlertRuns: envNum("X_STUCK_ALERT_RUNS", 3),
  };
}

export interface XHealthEvaluation {
  /** whether to emit an operator notice this run (post-cooldown/dedup) */
  fire: boolean;
  kind: "unhealthy" | "recovery" | null;
  reasons: string[];
  nextState: XHealthState;
}

/**
 * Pure health evaluation. Decides, from this run's counters + catch-up context and
 * the prior health state, whether to alert (once per episode, honoring the cooldown)
 * or emit a single recovery notice, and returns the next health state.
 */
export function evaluateXHealth(
  counters: XHealthCounters,
  context: XHealthContext,
  prior: XHealthState,
  config: XHealthConfig,
  nowMs: number,
): XHealthEvaluation {
  const state: XHealthState = {
    episodeKey: prior.episodeKey ?? null,
    lastAlertAtMs: prior.lastAlertAtMs ?? null,
    consecutiveEmpty: prior.consecutiveEmpty ?? 0,
    stuckProgressSig: prior.stuckProgressSig ?? null,
    stuckRuns: prior.stuckRuns ?? 0,
  };

  const cu = context.catchup;

  // Neutral run: another valid lease owner is working (a steady poll lock-skip, or a
  // catch-up refused because the lease is held). No paid calls happened and there is
  // nothing to judge — do not fire and do not disturb the episode / empty / stuck
  // counters, so a legitimate concurrent recovery cannot create alert spam.
  const leaseSkipSteady =
    !cu &&
    counters.lockSkips > 0 &&
    counters.requests === 0 &&
    counters.pageTruncations === 0 &&
    counters.requestFailures === 0 &&
    counters.budgetStops === 0;
  const leaseHeldCatchup = cu?.state === "refused" && cu.leaseHeld === true;
  if (leaseSkipSteady || leaseHeldCatchup) {
    return { fire: false, kind: null, reasons: [], nextState: state };
  }

  const problems: string[] = [];

  if (cu) {
    // catch-up took over this invocation
    switch (cu.state) {
      case "started":
      case "resumed": {
        // stuck detection: no batch/cursor/insert progress across eligible runs
        if (state.stuckProgressSig !== null && state.stuckProgressSig === cu.progressSig) {
          state.stuckRuns = state.stuckRuns + 1;
        } else {
          state.stuckRuns = 0;
        }
        state.stuckProgressSig = cu.progressSig ?? null;
        if (state.stuckRuns >= config.stuckAlertRuns) problems.push("stuck_checkpoint");
        else problems.push("watermark_parked"); // recovery is in progress (episode)
        break;
      }
      case "complete":
      case "already_complete":
        state.stuckRuns = 0;
        state.stuckProgressSig = null;
        break; // recovery — handled below (problems stays empty)
      case "refused":
        state.stuckRuns = 0;
        state.stuckProgressSig = null;
        problems.push("catchup_stranded"); // non-lease refusal (missing snapshot)
        break;
      case "no_roster":
        problems.push("empty_roster");
        break;
      case "not_parked":
        break;
    }
    if (cu.inserted > 0) state.consecutiveEmpty = 0; // forward progress resets empties
  } else {
    // steady poll ran
    if (counters.pageTruncations > 0) problems.push("page_truncation");
    if (counters.requestFailures > 0) problems.push("request_failures");
    if (counters.budgetStops > 0) problems.push("budget_stop");
    if (counters.incomplete > 0) problems.push("incomplete");

    const cleanComplete =
      counters.incomplete === 0 &&
      counters.pageTruncations === 0 &&
      counters.requestFailures === 0 &&
      counters.budgetStops === 0 &&
      counters.requests > 0;
    if (counters.docs > 0) state.consecutiveEmpty = 0;
    else if (cleanComplete) state.consecutiveEmpty = state.consecutiveEmpty + 1;

    // catch-up isn't running — reset its stuck tracking
    state.stuckRuns = 0;
    state.stuckProgressSig = null;
    if (state.consecutiveEmpty >= config.emptyAlertRuns) problems.push("persistent_empty");
  }

  const episodeKey = problems.length ? [...new Set(problems)].sort().join(",") : null;
  const reasons = episodeKey ? [...new Set(problems)].sort() : [];
  const catchupCompleted = cu?.state === "complete";
  const withinCooldown =
    state.lastAlertAtMs !== null && nowMs - state.lastAlertAtMs < config.cooldownMs;

  let fire = false;
  let kind: "unhealthy" | "recovery" | null = null;

  if (episodeKey !== null) {
    if (prior.episodeKey === episodeKey && withinCooldown) {
      fire = false; // dedup: one alert per episode until the cooldown lapses
    } else {
      fire = true;
      kind = "unhealthy";
      state.lastAlertAtMs = nowMs;
    }
    state.episodeKey = episodeKey;
  } else {
    // healthy this run — one recovery notice when an episode clears or catch-up completes
    if (prior.episodeKey !== null || catchupCompleted) {
      fire = true;
      kind = "recovery";
      state.lastAlertAtMs = nowMs;
    }
    state.episodeKey = null;
  }

  return { fire, kind, reasons, nextState: state };
}

// -- alert email (safe fields only) -------------------------------------------

function isoFromMs(ms: number): string {
  return new Date(ms).toISOString();
}

export function buildXHealthEmail(
  to: string,
  kind: "unhealthy" | "recovery",
  reasons: string[],
  counters: XHealthCounters,
  context: XHealthContext,
  nowMs: number,
): OutboundEmail {
  const status = kind === "recovery" ? "RECOVERED" : "UNHEALTHY";
  const reasonLine = reasons.length ? reasons.join(", ") : kind === "recovery" ? "resumed" : "unknown";
  const cu = context.catchup;
  const lines = [
    `X ingestion health (api.twitterapi.io, provider x_api) — ${status}.`,
    "",
    `Reasons: ${reasonLine}`,
    `At: ${isoFromMs(nowMs)}`,
    "Job: ingest:x",
    "",
    `Watermark age: ${context.watermarkAgeSec ?? "n/a"}s (park threshold ${context.parkThresholdSec}s)`,
    `Poll counters: requests=${counters.requests} docs=${counters.docs} budgetStops=${counters.budgetStops} ` +
      `pageTruncations=${counters.pageTruncations} requestFailures=${counters.requestFailures} ` +
      `lockSkips=${counters.lockSkips} incomplete=${counters.incomplete}`,
    cu
      ? `Catch-up: state=${cu.state} progress=${cu.progressSig ?? "n/a"} inserted=${cu.inserted} ` +
        `watermarkAdvanced=${cu.watermarkAdvanced}`
      : "Catch-up: not running (steady poll)",
    "",
    "Automated monitor — no message content, cursors, or credentials are included.",
  ];
  return {
    to,
    subject: `[BNOW] X ingestion ${status.toLowerCase()}: ${reasonLine}`,
    text: lines.join("\n"),
    // operator ops mail: never let Postmark rewrite links or track opens
    trackLinks: "None",
    trackOpens: false,
  };
}

// -- runner --------------------------------------------------------------------

export type AlertDelivery = "none" | "sent" | "no_recipient" | "failed";

export interface XHealthOutcome {
  evaluated: boolean;
  alert: "unhealthy" | "recovery" | null;
  reasons: string[];
  delivery: AlertDelivery;
  episodeKey: string | null;
}

export interface XHealthDeps {
  loadState<T extends Record<string, unknown>>(provider: string): Promise<T | null>;
  saveState(provider: string, state: Record<string, unknown>): Promise<void>;
  sendEmail(mail: OutboundEmail): Promise<{ delivered: boolean; via: string }>;
  /** operator notification address (feedbackEmail()); null = record no_recipient */
  recipient(): string | null;
  now(): number;
}

/** Evaluate health, email the operator on a fire (once per episode + a recovery
 *  notice), persist the next state, and return the (safe) outcome for cron counts.
 *  Never throws — a monitor failure must not fail ingestion. */
export async function runXHealthCheck(
  counters: XHealthCounters,
  context: XHealthContext,
  deps: XHealthDeps,
  config: XHealthConfig,
): Promise<XHealthOutcome> {
  const nowMs = deps.now();

  let prior: XHealthState;
  try {
    prior = (await deps.loadState<XHealthState>(X_HEALTH_PROVIDER)) ?? DEFAULT_HEALTH_STATE;
  } catch (e) {
    console.warn(
      `x-health: could not load health state — skipping this run: ${e instanceof Error ? e.message : e}`,
    );
    return { evaluated: false, alert: null, reasons: [], delivery: "none", episodeKey: null };
  }

  const evaln = evaluateXHealth(counters, context, prior, config, nowMs);

  let delivery: AlertDelivery = "none";
  if (evaln.fire && evaln.kind) {
    const to = deps.recipient();
    if (!to) {
      delivery = "no_recipient";
    } else {
      try {
        await deps.sendEmail(
          buildXHealthEmail(to, evaln.kind, evaln.reasons, counters, context, nowMs),
        );
        delivery = "sent";
      } catch (e) {
        delivery = "failed";
        console.warn(
          `x-health: alert email failed (ingestion continues): ${e instanceof Error ? e.message : e}`,
        );
      }
    }
  }

  try {
    await deps.saveState(X_HEALTH_PROVIDER, evaln.nextState);
  } catch (e) {
    console.warn(
      `x-health: could not persist health state: ${e instanceof Error ? e.message : e}`,
    );
  }

  return {
    evaluated: true,
    alert: evaln.fire ? evaln.kind : null,
    reasons: evaln.reasons,
    delivery,
    episodeKey: evaln.nextState.episodeKey,
  };
}

/** Numeric encodings for cron_runs.counts.x_api (a Record<string, number>): the
 *  alert result must be auditable there even when FEEDBACK_EMAIL is missing or
 *  Postmark fails. Reason STRINGS never enter cron counts (they go to the email +
 *  console); only these codes + numeric counters do. */
export function alertKindCode(alert: "unhealthy" | "recovery" | null): number {
  return alert === "unhealthy" ? 1 : alert === "recovery" ? 2 : 0;
}

export function alertDeliveryCode(delivery: AlertDelivery): number {
  return { none: 0, sent: 1, no_recipient: 2, failed: 3 }[delivery];
}

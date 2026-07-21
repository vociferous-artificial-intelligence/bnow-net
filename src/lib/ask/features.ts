// Release hardening 2026-07-21: the ONE server-side resolver for every Ask
// feature flag. Raw env reads are no longer authority anywhere else — page.tsx,
// the run routes, limits.ts, sessions.ts, and the cache all consume THIS module,
// so an invalid flag combination resolves identically (and fails closed) at
// every boundary.
//
// Dependency rules (each enforced here, tested in features.test.ts):
//   ASK_RUNS_ENFORCE   → requires valid operator retention settings (persisted
//                        run content may not accumulate ungoverned) and stays
//                        byte-off otherwise (legacy gates remain authoritative).
//   ASK_RUNS_SHADOW    → explicit OPT-IN (default OFF — a deploy no longer
//                        silently stores questions/results); same retention
//                        requirement; ignored when enforce is effective.
//   ASK_PROGRESSIVE    → effective only when ASK_RUNS_ENFORCE is effective
//                        (register #44: replay semantics hold only under
//                        enforce) and only on the v2 pipeline.
//   ASK_STREAM_ANSWER  → effective only with progressive (the sink transport).
//   ASK_EXACT_CACHE    → effective only with progressive (only snapshot-
//                        carrying runs are F11-safely cacheable — register
//                        #55) and only with a valid cache TTL.
//   ASK_SESSIONS       → effective only under enforce on v2 (reuse turns
//                        refuse the legacy pipeline) with valid retention.
//   ASK_PIPELINE=legacy + ASK_RUNS_ENFORCE=1 (register #23's degenerate
//   combination): enforce STAYS effective — atomic replay/allowance are
//   strictly safer than the legacy read-then-act path — but every
//   v2-dependent feature above is forced off and the combination is
//   reported invalid.
//
// This module is server-only by construction (reads process.env at call time,
// never at import; no "use client" consumer may import it).

import { askExactCache, askPipeline, askStreamAnswer } from "./config";

/** Operator retention settings. Persistence-backed features are DISABLED
 *  without them: no valid content retention → no run persistence at all. */
export interface AskRetention {
  /** days ask_runs content (question/result/snapshot/idempotency material)
   *  and ask_usage.question survive before redaction */
  contentDays: number;
  /** days ask_run_events rows survive before deletion */
  eventsDays: number;
}

export interface EffectiveAskFeatures {
  pipeline: "v2" | "legacy";
  /** off = zero ask_runs writes (Phase 0 byte-equivalent); shadow = best-effort
   *  rows, legacy gates authoritative; enforce = atomic runs/replay/reservations */
  runsPersistence: "off" | "shadow" | "enforce";
  progressive: boolean;
  streamAnswer: boolean;
  exactCache: boolean;
  sessions: boolean;
  /** non-null exactly when runsPersistence !== "off" */
  retention: AskRetention | null;
  /** non-null exactly when exactCache is effective */
  cacheTtlDays: number | null;
  /** human-readable rejected combinations (each also warned once per process) */
  invalid: string[];
}

function posNum(name: string): number | null {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const warned = new Set<string>();
function warnOnce(msg: string): void {
  if (warned.has(msg)) return;
  warned.add(msg);
  console.warn(`ask features: ${msg}`);
}

/** Test hook: clear the warn-once memory (process-scoped otherwise). */
export function resetFeatureWarnings(): void {
  warned.clear();
}

/** Resolve the effective Ask feature set from the environment. Pure read —
 *  call per request/decision; never cached at module scope. */
export function effectiveAskFeatures(): EffectiveAskFeatures {
  const invalid: string[] = [];
  const pipeline = askPipeline();

  const contentDays = posNum("ASK_CONTENT_RETENTION_DAYS");
  const eventsDays = posNum("ASK_EVENTS_RETENTION_DAYS") ?? contentDays;
  const cacheTtl = posNum("ASK_CACHE_TTL_DAYS");
  const retention: AskRetention | null =
    contentDays !== null ? { contentDays, eventsDays: eventsDays as number } : null;

  const wantEnforce = process.env.ASK_RUNS_ENFORCE === "1";
  const wantShadow = process.env.ASK_RUNS_SHADOW === "1";
  let runsPersistence: EffectiveAskFeatures["runsPersistence"] = "off";
  if (wantEnforce) {
    if (retention === null) {
      invalid.push(
        "ASK_RUNS_ENFORCE=1 without valid ASK_CONTENT_RETENTION_DAYS — enforce disabled (legacy gates authoritative)",
      );
    } else {
      runsPersistence = "enforce";
      if (pipeline === "legacy") {
        invalid.push(
          "ASK_RUNS_ENFORCE=1 with ASK_PIPELINE=legacy (register #23) — enforce retained for money atomicity; every v2-dependent feature disabled",
        );
      }
    }
  } else if (wantShadow) {
    if (retention === null) {
      invalid.push(
        "ASK_RUNS_SHADOW=1 without valid ASK_CONTENT_RETENTION_DAYS — shadow persistence disabled",
      );
    } else {
      runsPersistence = "shadow";
    }
  }

  const enforceEffective = runsPersistence === "enforce";
  const v2 = pipeline === "v2";

  let progressive = false;
  if (process.env.ASK_PROGRESSIVE === "1") {
    if (enforceEffective && v2) progressive = true;
    else
      invalid.push(
        "ASK_PROGRESSIVE=1 requires effective ASK_RUNS_ENFORCE on the v2 pipeline (register #44) — progressive disabled",
      );
  }

  let streamAnswer = false;
  if (askStreamAnswer()) {
    if (progressive) streamAnswer = true;
    else invalid.push("ASK_STREAM_ANSWER=1 requires effective ASK_PROGRESSIVE — streaming disabled");
  }

  let exactCache = false;
  if (askExactCache()) {
    if (progressive && cacheTtl !== null) exactCache = true;
    else
      invalid.push(
        "ASK_EXACT_CACHE=1 requires effective ASK_PROGRESSIVE (snapshot-carrying runs — register #55) and valid ASK_CACHE_TTL_DAYS — cache disabled",
      );
  }

  let sessions = false;
  if (process.env.ASK_SESSIONS === "1") {
    if (enforceEffective && v2) sessions = true;
    else
      invalid.push(
        "ASK_SESSIONS=1 requires effective ASK_RUNS_ENFORCE on the v2 pipeline — sessions disabled",
      );
  }

  for (const msg of invalid) warnOnce(msg);

  return {
    pipeline,
    runsPersistence,
    progressive,
    streamAnswer,
    exactCache,
    sessions,
    retention: runsPersistence === "off" ? null : retention,
    cacheTtlDays: exactCache ? cacheTtl : null,
    invalid,
  };
}

/** Per-user progressive-transport policy (the internal-cohort rollout knob).
 *  ASK_PROGRESSIVE_COHORT unset/empty → every accepted user once the flag
 *  stack is effective; set to a comma-separated email list → ONLY those users
 *  (case-insensitive) get the progressive transport, everyone else stays on
 *  the server-action path. Server-side only — page.tsx AND the runs POST
 *  boundary both consult this, so a hand-crafted POST cannot bypass the
 *  cohort. */
export function progressiveAllowedFor(email: string | null): boolean {
  if (!effectiveAskFeatures().progressive) return false;
  const raw = process.env.ASK_PROGRESSIVE_COHORT;
  if (raw === undefined || raw.trim() === "") return true;
  if (email === null) return false; // cohort set: anonymous (dev/demo) is out
  const allow = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.toLowerCase());
}

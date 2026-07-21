// Release hardening 2026-07-21: operator-governed retention for every Ask
// content surface. Persistence-backed features only become effective when the
// retention envs are valid (features.ts), and this sweep enforces them lazily —
// piggybacked on the money path like the run-expiry sweep, no new cron.
//
// CONTENT is removed or redacted; ACCOUNTING survives. Concretely, past
// ASK_CONTENT_RETENTION_DAYS:
//   - ask_runs: question → '[deleted]', result/evidence_snapshot → NULL, and
//     the idempotency key is rotated to an unreplayable 'expired:<run id>'
//     marker (a key past retention names content that no longer exists; a
//     resubmission is honestly a new gesture). status/state/cost/units/
//     timestamps/error_class — the accounting — are retained.
//   - ask_usage: question → '[deleted]'; every cost/token/timing column stays.
//   - ask_sessions/ask_turns idle past retention are deleted (titles are
//     content; the runs they ordered are redacted by the rule above).
// Past ASK_EVENTS_RETENTION_DAYS (default: the content retention):
//   - ask_run_events rows are DELETED (payloads carry claim text and answer
//     sections).
// Past ASK_CACHE_TTL_DAYS (when set):
//   - ask_answer_cache rows are DELETED (question + result + snapshot).
//     cache.ts additionally enforces the TTL at lookup time — an expired row
//     is a miss even before this sweep reaches it.

import { Pool } from "@neondatabase/serverless";

export interface RetentionSweepResult {
  runsRedacted: number;
  usageRedacted: number;
  eventsDeleted: number;
  cacheDeleted: number;
  sessionsDeleted: number;
}

function cutoffIso(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

function ttlDays(): number | null {
  const raw = process.env.ASK_CACHE_TTL_DAYS;
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function posDays(name: string): number | null {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** One retention pass. Returns null (and does nothing) when no valid retention
 *  configuration exists. Deliberately keyed on the RAW retention envs, not the
 *  effective-feature resolver: after a rollback (every flag off) previously
 *  persisted content must KEEP aging out as long as the operator retention
 *  settings stand — disabling a feature must never suspend its data hygiene.
 *  Throws on DB failure; callers on the money path wrap it fail-soft. */
export async function sweepAskRetention(now: Date = new Date()): Promise<RetentionSweepResult | null> {
  const contentDays = posDays("ASK_CONTENT_RETENTION_DAYS");
  if (contentDays === null) return null;
  const eventsDays = posDays("ASK_EVENTS_RETENTION_DAYS") ?? contentDays;
  const contentCutoff = cutoffIso(now, contentDays);
  const eventsCutoff = cutoffIso(now, eventsDays);
  // Cache rows are content: sweep them at the cache TTL when configured, and
  // never let them outlive the content retention itself.
  const cacheTtl = ttlDays();
  const cacheCutoff = cutoffIso(now, Math.min(cacheTtl ?? contentDays, contentDays));

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const runs = await pool.query(
      `UPDATE ask_runs
       SET question = '[deleted]', result = NULL, evidence_snapshot = NULL,
           idempotency_key = 'expired:' || id::text
       WHERE created_at < $1
         AND (question <> '[deleted]' OR result IS NOT NULL
              OR evidence_snapshot IS NOT NULL OR idempotency_key NOT LIKE 'expired:%')`,
      [contentCutoff],
    );
    const usage = await pool.query(
      `UPDATE ask_usage SET question = '[deleted]'
       WHERE created_at < $1 AND question <> '[deleted]'`,
      [contentCutoff],
    );
    const events = await pool.query(`DELETE FROM ask_run_events WHERE at < $1`, [eventsCutoff]);
    const cache = await pool.query(`DELETE FROM ask_answer_cache WHERE created_at < $1`, [cacheCutoff]);
    await pool.query(
      `DELETE FROM ask_turns WHERE session_id IN
         (SELECT id FROM ask_sessions WHERE last_active_at < $1)`,
      [contentCutoff],
    );
    const sessions = await pool.query(`DELETE FROM ask_sessions WHERE last_active_at < $1`, [
      contentCutoff,
    ]);
    return {
      runsRedacted: runs.rowCount ?? 0,
      usageRedacted: usage.rowCount ?? 0,
      eventsDeleted: events.rowCount ?? 0,
      cacheDeleted: cache.rowCount ?? 0,
      sessionsDeleted: sessions.rowCount ?? 0,
    };
  } finally {
    await pool.end();
  }
}

/** Sweep at most once per interval per process (the money path calls this on
 *  every persisted run; five UPDATE/DELETE statements per ask would be waste).
 *  Fail-soft: housekeeping must never cost an answer. */
export const RETENTION_SWEEP_INTERVAL_MS = 5 * 60_000;
let lastSweepMs = 0;

export function resetRetentionSweepThrottle(): void {
  lastSweepMs = 0;
}

export async function sweepAskRetentionThrottled(now: Date = new Date()): Promise<void> {
  if (now.getTime() - lastSweepMs < RETENTION_SWEEP_INTERVAL_MS) return;
  lastSweepMs = now.getTime();
  try {
    await sweepAskRetention(now);
  } catch (e) {
    console.warn(`ask retention sweep failed (non-blocking): ${e instanceof Error ? e.message : e}`);
  }
}

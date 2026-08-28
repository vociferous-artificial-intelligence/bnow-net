// One cron_runs row per scheduled-job invocation.
//
// Before this, per-run success was unknowable (PIPELINE-AUDIT-2026-07 §12 #6):
// digests.created_at is last-writer-wins, so nothing in the DB could tell a cron
// that fired and found no work from a cron that never fired at all.
//
// The row is INSERTed at start and UPDATEd at finish. A run killed by maxDuration
// leaves finished_at NULL and ok NULL — that unterminated row is the timeout
// signal. Bookkeeping never breaks the job it is measuring: every DB error here is
// swallowed with a warning.

// @/db requires DATABASE_URL at module load; import it lazily so pure consumers
// can import this without a DB.
async function sql() {
  return (await import("@/db")).rawSql;
}

export type CronCounts = Record<string, unknown>;

/** Reserved key: a route that completed but carried REAL per-item failures
 *  marks itself degraded, and withCronRun records the run `ok=false` (#87 —
 *  nested errors must not produce a misleadingly healthy row). The signature
 *  of a degraded run is `ok=false AND error IS NULL AND counts.degraded`
 *  present — distinct from a thrown failure (`ok=false`, error text) and from
 *  a timeout (`finished_at IS NULL`, ruling 10). `error` deliberately stays
 *  NULL: readers keyed on `error IS NOT NULL` (ask-shadow-soak-check) keep
 *  their semantics.
 *
 *  ONLY the route decides what is degraded — benign non-zero counters exist on
 *  several jobs (validate's ISW-not-published returns, trade/materials
 *  `failures[]`, x/mtproto back-pressure counters) and a generic key-shape
 *  sweep would wrongly flip them. Categories in use: "nested_errors"
 *  (digest/validate thrown cells), "adapter_errors" (ingest adapter throws),
 *  "batch_errors" (map micro-batch failures). Never surface a degraded
 *  category through `budgetStopCategory` — the map:remap/backfill drivers
 *  abort on unknown stop categories. */
export function markDegraded(
  counts: CronCounts,
  category: string,
  fields: Record<string, number> = {},
): void {
  counts.degraded = { ...fields, category }; // category always wins the spread
}

/** Job name for a cron route, qualified by the param that splits its schedule
 *  (digest?group=core and digest?group=gulf are separate jobs on separate crons). */
export function cronJobName(route: string, qualifier?: string | null): string {
  return qualifier ? `${route}:${qualifier}` : route;
}

async function startRun(job: string): Promise<number | null> {
  try {
    const rows = (await (await sql()).query(
      `INSERT INTO cron_runs (job) VALUES ($1) RETURNING id`,
      [job],
    )) as Array<{ id: number }>;
    return rows[0]?.id ?? null;
  } catch (e) {
    console.warn(`cron-run: could not open a run row for ${job}: ${msg(e)}`);
    return null;
  }
}

async function finishRun(
  id: number | null,
  ok: boolean,
  error: string | null,
  counts: CronCounts,
): Promise<void> {
  if (id === null) return;
  try {
    await (await sql()).query(
      `UPDATE cron_runs SET finished_at = now(), ok = $2, error = $3, counts = $4 WHERE id = $1`,
      [id, ok, error?.slice(0, 2000) ?? null, JSON.stringify(counts)],
    );
  } catch (e) {
    console.warn(`cron-run: could not close run ${id}: ${msg(e)}`);
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Run `fn` as a recorded cron job. `fn` fills the `counts` object it is handed;
 *  whatever it holds when `fn` settles is persisted, so a job that throws halfway
 *  still records the work it had done. Errors propagate unchanged. A run whose
 *  route marked `counts.degraded` (see markDegraded) resolves normally but is
 *  recorded `ok=false` with `error` NULL. */
export async function withCronRun<T>(job: string, fn: (counts: CronCounts) => Promise<T>): Promise<T> {
  const counts: CronCounts = {};
  const id = await startRun(job);
  try {
    const out = await fn(counts);
    await finishRun(id, counts.degraded == null, null, counts);
    return out;
  } catch (e) {
    await finishRun(id, false, msg(e), counts);
    throw e;
  }
}

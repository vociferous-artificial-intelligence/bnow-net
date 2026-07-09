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
 *  still records the work it had done. Errors propagate unchanged. */
export async function withCronRun<T>(job: string, fn: (counts: CronCounts) => Promise<T>): Promise<T> {
  const counts: CronCounts = {};
  const id = await startRun(job);
  try {
    const out = await fn(counts);
    await finishRun(id, true, null, counts);
    return out;
  } catch (e) {
    await finishRun(id, false, msg(e), counts);
    throw e;
  }
}

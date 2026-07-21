// Shadow-soak monitoring pass (release 2026-07-21). Run anytime during the
// ASK_RUNS_SHADOW soak:  npx tsx scripts/ask-shadow-soak-check.ts
// Read-only. Prints every metric the soak checklist requires; flags anything
// that should block cohort activation. Uses the production DATABASE_URL from
// .env.local — never prints credentials or question content.
import "./env";
import { Pool } from "@neondatabase/serverless";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const problems: string[] = [];
  try {
    const runs = await pool.query(`SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE status = 'finished')::int AS finished,
      count(*) FILTER (WHERE status NOT IN ('finished','expired') AND created_at < now() - interval '15 minutes')::int AS stuck,
      count(*) FILTER (WHERE expired)::int AS expired,
      count(*) FILTER (WHERE billing_eligible)::int AS billing_eligible,
      count(*) FILTER (WHERE status = 'finished' AND state IS NULL)::int AS finished_without_state,
      count(*) FILTER (WHERE status = 'finished' AND state = 'answered' AND result IS NULL)::int AS answered_without_result
      FROM ask_runs`);
    const r = runs.rows[0];
    console.log("ask_runs:", JSON.stringify(r));
    if (r.stuck > 0) problems.push(`${r.stuck} stuck run(s) older than 15m without a terminal status`);
    if (r.billing_eligible > 0) problems.push(`${r.billing_eligible} billing-eligible row(s) — MUST be 0 during shadow`);
    if (r.finished_without_state > 0) problems.push(`${r.finished_without_state} finished run(s) missing terminal state`);
    if (r.answered_without_result > 0) problems.push(`${r.answered_without_result} answered run(s) missing a persisted result`);

    const perDay = await pool.query(`SELECT created_at::date::text AS day,
      count(*)::int AS created, count(*) FILTER (WHERE status='finished')::int AS finished
      FROM ask_runs GROUP BY 1 ORDER BY 1 DESC LIMIT 7`);
    console.log("runs per day:", JSON.stringify(perDay.rows));

    const usage = await pool.query(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE run_id IS NOT NULL)::int AS with_run_id,
      count(*) FILTER (WHERE question = '[deleted]')::int AS redacted
      FROM ask_usage`);
    console.log("ask_usage:", JSON.stringify(usage.rows[0]));

    const retention = await pool.query(`SELECT
      (SELECT count(*)::int FROM ask_runs WHERE created_at < now() - interval '30 days'
        AND (question <> '[deleted]' OR result IS NOT NULL)) AS runs_past_content_window,
      (SELECT count(*)::int FROM ask_usage WHERE created_at < now() - interval '30 days'
        AND question <> '[deleted]') AS usage_past_content_window,
      (SELECT count(*)::int FROM ask_run_events WHERE at < now() - interval '7 days') AS events_past_window,
      (SELECT count(*)::int FROM ask_answer_cache WHERE created_at < now() - interval '7 days') AS cache_past_window`);
    const ret = retention.rows[0];
    console.log("retention (content past window, must all be 0):", JSON.stringify(ret));
    for (const [k, v] of Object.entries(ret)) if (Number(v) > 0) problems.push(`retention breach: ${k}=${v}`);

    const reservations = await pool.query(`SELECT
      (SELECT count(*)::int FROM ask_allowance_reservations) AS allowance,
      (SELECT count(*)::int FROM provider_usage_reservations) AS provider`);
    const resv = reservations.rows[0];
    console.log("reservations (shadow never reserves):", JSON.stringify(resv));
    if (resv.allowance > 0 || resv.provider > 0)
      problems.push(`reservations present during shadow (allowance=${resv.allowance}, provider=${resv.provider})`);

    const spend = await pool.query(`SELECT provider, day::text, requests, round(est_usd::numeric, 4)::text AS est_usd
      FROM provider_usage WHERE provider LIKE 'openai_ask%' OR provider LIKE 'openai_embed%'
      ORDER BY day DESC, provider LIMIT 8`);
    console.log("ask/embed provider usage (recent):", JSON.stringify(spend.rows));

    const crons = await pool.query(`SELECT count(*) FILTER (WHERE finished_at IS NULL AND started_at < now() - interval '30 minutes')::int AS timed_out,
      count(*) FILTER (WHERE error IS NOT NULL)::int AS errored
      FROM cron_runs WHERE started_at > now() - interval '24 hours'`);
    console.log("cron_runs last 24h:", JSON.stringify(crons.rows[0]));
    if (crons.rows[0].errored > 0) problems.push(`${crons.rows[0].errored} cron error(s) in 24h — inspect cron_runs`);

    console.log(problems.length === 0
      ? "\nSOAK CHECK: PASS — no blocking findings"
      : `\nSOAK CHECK: ATTENTION —\n- ${problems.join("\n- ")}`);
    process.exitCode = problems.length === 0 ? 0 : 2;
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

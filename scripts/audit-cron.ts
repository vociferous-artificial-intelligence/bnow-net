// Unattended-run audit: did every cron leave DB evidence on schedule?
// Usage: npx tsx scripts/audit-cron.ts
// Read-only. Prints per-cron evidence for the last 24h (or the last scheduled
// window for the monthly trade/materials crons).
import "./env";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log("=== BNOW cron audit ===");
  console.log("now (UTC):", new Date().toISOString());

  console.log("\n-- ingest (fast */15 + telegram hourly): raw_documents by hour, last 24h --");
  const ingest = await sql`
    SELECT date_trunc('hour', fetched_at) AS hour, adapter, count(*)::int AS docs
    FROM raw_documents
    WHERE fetched_at > now() - interval '24 hours'
    GROUP BY 1, 2 ORDER BY 1 DESC, 2 LIMIT 60`;
  for (const r of ingest) console.log(`${r.hour.toISOString()}  ${String(r.adapter).padEnd(16)} ${r.docs}`);
  if (!ingest.length) console.log("NO INGEST ROWS IN 24H — ingest cron not landing");

  console.log("\n-- cron_runs: per-job outcome, last 24h --");
  const runs = await sql`
    SELECT job,
           count(*)::int AS runs,
           sum((ok IS TRUE)::int)::int AS ok,
           sum((ok IS FALSE)::int)::int AS failed,
           sum((finished_at IS NULL)::int)::int AS unfinished,
           max(started_at) AS latest
    FROM cron_runs WHERE started_at > now() - interval '24 hours'
    GROUP BY job ORDER BY job`;
  for (const r of runs)
    console.log(
      `${String(r.job).padEnd(18)} runs=${r.runs} ok=${r.ok} failed=${r.failed} ` +
        `unfinished=${r.unfinished} latest ${r.latest.toISOString()}`,
    );
  if (!runs.length) console.log("NO CRON RUNS IN 24H — either nothing fired, or the deploy predates cron_runs");
  const failures = await sql`
    SELECT job, started_at, error FROM cron_runs
    WHERE started_at > now() - interval '24 hours' AND ok IS FALSE
    ORDER BY started_at DESC LIMIT 5`;
  for (const r of failures)
    console.log(`  FAIL ${r.job} ${r.started_at.toISOString()}: ${String(r.error).slice(0, 160)}`);

  console.log("\n-- LLM spend by provider, last 3 days (digest path must appear) --");
  const llm = await sql`
    SELECT provider, day::text AS day, requests, units, round(est_usd::numeric, 5) AS est_usd
    FROM provider_usage WHERE day > (now() - interval '3 days')::date
    ORDER BY day DESC, provider`;
  for (const r of llm)
    console.log(`${r.day} ${String(r.provider).padEnd(20)} req=${r.requests} units=${r.units} $${r.est_usd}`);
  if (!llm.some((r) => r.provider === "openai_digest"))
    console.log("WARNING: no openai_digest rows — the digest path is unmetered again");

  console.log("\n-- digests: rows for yesterday + today by country/track/status/provider --");
  const digests = await sql`
    SELECT c.iso2, d.digest_date, d.track, d.status, d.provider, d.created_at
    FROM digests d JOIN countries c ON c.id = d.country_id
    WHERE d.digest_date >= (now() - interval '1 day')::date
    ORDER BY d.digest_date DESC, c.iso2, d.track`;
  for (const r of digests)
    console.log(`${r.digest_date} ${r.iso2} ${String(r.track).padEnd(15)} ${String(r.status).padEnd(9)} ${String(r.provider ?? "-").padEnd(7)} created ${r.created_at.toISOString()}`);
  if (!digests.length) console.log("NO DIGEST ROWS for yesterday/today — digest cron not landing");

  console.log("\n-- active countries (have any digest, last 7d) --");
  const active = await sql`
    SELECT c.iso2, count(*)::int AS digests_7d, max(d.digest_date) AS latest
    FROM digests d JOIN countries c ON c.id = d.country_id
    WHERE d.digest_date > (now() - interval '7 days')::date
    GROUP BY c.iso2 ORDER BY c.iso2`;
  for (const r of active) console.log(`${r.iso2}  ${r.digests_7d} digests, latest ${r.latest}`);

  console.log("\n-- validation runs, last 48h --");
  const val = await sql`
    SELECT v.run_at, c.iso2, d.digest_date, d.track, v.coverage_pct, v.details->>'matcher' AS matcher
    FROM validation_runs v
    JOIN digests d ON d.id = v.digest_id
    JOIN countries c ON c.id = d.country_id
    WHERE v.run_at > now() - interval '48 hours'
    ORDER BY v.run_at DESC LIMIT 30`;
  for (const r of val)
    console.log(`${r.run_at.toISOString()} ${r.iso2} ${r.digest_date} ${String(r.track).padEnd(10)} coverage=${r.coverage_pct} matcher=${r.matcher ?? "?"}`);
  if (!val.length) console.log("NO VALIDATION RUNS IN 48H — validate cron not landing");

  console.log("\n-- enrich: entities with enrichment meta, freshest first --");
  const enrich = await sql`
    SELECT id, name, meta->'opensanctions'->>'checkedAt' AS os_checked
    FROM entities WHERE meta ? 'opensanctions'
    ORDER BY meta->'opensanctions'->>'checkedAt' DESC NULLS LAST LIMIT 5`;
  for (const r of enrich) console.log(`entity ${r.id} ${r.name}: os checked ${r.os_checked}`);
  if (!enrich.length) console.log("no opensanctions meta on any entity");

  console.log("\n-- datadark: watched_series last checks --");
  const dark = await sql`
    SELECT key, status, last_checked_at FROM watched_series ORDER BY last_checked_at DESC NULLS LAST`;
  for (const r of dark) console.log(`${String(r.key).padEnd(30)} ${String(r.status).padEnd(22)} checked ${r.last_checked_at?.toISOString() ?? "never"}`);

  console.log("\n-- trade_flows: last fetch (monthly cron, 2nd of month) --");
  const trade = await sql`
    SELECT max(fetched_at) AS latest, count(*)::int AS rows FROM trade_flows`;
  console.log(`rows=${trade[0].rows} latest fetch=${trade[0].latest?.toISOString() ?? "never"}`);

  console.log("\n-- stub-adapter documents present (truth-in-UI check) --");
  const stubs = await sql`
    SELECT adapter, count(*)::int AS docs FROM raw_documents
    WHERE adapter IN ('telegram_mtproto', 'x', 'acled') OR content LIKE '[STUB FIXTURE]%'
    GROUP BY adapter`;
  for (const r of stubs) console.log(`${r.adapter}: ${r.docs} docs`);
  if (!stubs.length) console.log("none");

  console.log("\n-- digest claims citing stub-adapter docs --");
  const stubCites = await sql`
    SELECT count(DISTINCT cs.claim_id)::int AS claims, count(DISTINCT cl.digest_id)::int AS digests
    FROM claim_sources cs
    JOIN raw_documents rd ON rd.id = cs.raw_document_id
    JOIN claims cl ON cl.id = cs.claim_id
    WHERE rd.adapter IN ('telegram_mtproto', 'x', 'acled') OR rd.content LIKE '[STUB FIXTURE]%'`;
  console.log(`claims citing stub docs: ${stubCites[0].claims} across ${stubCites[0].digests} digests`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

import "./env";

// 14-day MTProto history backfill for the ru/ua/ir channel set (MTProto sprint
// TASK 3). Estimate FIRST: prints expected docs (observed telegram_web docs/day
// per channel × a depth multiplier) and the map-stage LLM cost at the measured
// $/1K docs, then refuses to run without --apply, and refuses entirely if the
// estimate blows the sprint's LLM budget. The docs themselves are free; the
// spend is the hourly map cron picking them up (inside MAP_USD_CAP_DAILY).
//
// Resumable, not restartable: the adapter walks each channel down via
// backfill_min_id and flips backfill_done at the window edge; marks commit only
// after each pass's docs are inserted. A killed run costs one channel's pass.
//
// Usage: tsx scripts/mtproto-backfill.ts [days=14] [--apply]
//        (needs .telegram.session or TELEGRAM_SESSION; flood-safe: sequential,
//         2s spacing, FLOOD_WAIT aborts the pass and the next pass resumes)

const MAP_USD_PER_1K_DOCS = 0.076; // measured, docs/reviews/MAP-SHADOW-RESULTS.md
const SPRINT_LLM_BUDGET_USD = 6; // ground rule 3 of the sprint prompt
const DEPTH_MULTIPLIER = 2; // MTProto full history vs ~20-post preview window
const THEATERS = new Set(["ru", "ua", "ir"]);

async function main() {
  const days = parseInt(process.argv.find((a) => /^\d+$/.test(a)) ?? "14", 10);
  const apply = process.argv.includes("--apply");

  const { TelegramMtprotoAdapter, mtprotoDepsFromEnv, loadTelegramSession } = await import(
    "../src/lib/adapters/telegram-mtproto"
  );
  const { insertDocs, telegramChannelRoster } = await import("../src/lib/ingest/run");
  const { REGISTRY_TELEGRAM_TOP_N_MTPROTO } = await import("../src/lib/ingest/config");
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!);

  const roster = (await telegramChannelRoster(REGISTRY_TELEGRAM_TOP_N_MTPROTO)).filter((c) =>
    THEATERS.has(c.countryIso2),
  );
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 3600 * 1000);

  // -- estimate from observed preview-scrape volume -------------------------------
  const observed = (await sql`
    SELECT s.canonical_url AS key, count(*)::int AS docs
    FROM raw_documents rd JOIN sources s ON s.id = rd.source_id
    WHERE rd.adapter = 'telegram_web' AND rd.fetched_at > now() - interval '7 days'
    GROUP BY s.canonical_url`) as Array<{ key: string; docs: number }>;
  const perDay = new Map(observed.map((r) => [r.key, r.docs / 7]));
  const FALLBACK_PER_DAY = 5; // channels the preview never reached (the reach gap)

  let estDocs = 0;
  for (const c of roster) {
    const key = `t.me/${c.channel.toLowerCase()}`;
    estDocs += (perDay.get(key) ?? FALLBACK_PER_DAY) * days * DEPTH_MULTIPLIER;
  }
  estDocs = Math.round(estDocs);
  const estUsd = (estDocs / 1000) * MAP_USD_PER_1K_DOCS;
  const estPerDayDocs = Math.round(estDocs / days);

  console.log(`backfill window: ${from.toISOString()} .. ${to.toISOString()} (${days} days)`);
  console.log(`channels (ru/ua/ir): ${roster.length}`);
  console.log(
    `ESTIMATE: ~${estDocs} docs (${estPerDayDocs}/day) -> map cost ~$${estUsd.toFixed(2)} ` +
      `at $${MAP_USD_PER_1K_DOCS}/1K (sprint budget $${SPRINT_LLM_BUDGET_USD})`,
  );
  if (estUsd > SPRINT_LLM_BUDGET_USD) {
    console.error("estimated map cost exceeds the sprint LLM budget — NOT running");
    process.exit(2);
  }
  if (!apply) {
    console.log("estimate only — re-run with --apply to backfill");
    process.exit(0);
  }
  if (!loadTelegramSession()) {
    console.error("no TELEGRAM_SESSION / .telegram.session — run scripts/telegram-login.ts first");
    process.exit(2);
  }

  // -- run: passes over the roster until every channel is done ---------------------
  const adapter = new TelegramMtprotoAdapter(roster, mtprotoDepsFromEnv(), {
    maxChannelsPerRun: roster.length,
    maxMsgsPerChannel: 2000, // per pass per channel; deep channels take extra passes
    maxResolvesPerRun: 15,
    timeBudgetMs: 30 * 60_000,
    spacingMs: 2000,
  });

  const byDay = new Map<string, number>();
  let pass = 0;
  let fetched = 0;
  let inserted = 0;
  for (;;) {
    pass++;
    const docs = await adapter.backfill({ from, to });
    if (docs.length === 0 && (adapter.runStats.msgsPaged ?? 0) === 0) break;
    // oldest day first, so the hourly map cron drains the window in date order
    docs.sort((a, b) => (a.publishedAt?.getTime() ?? 0) - (b.publishedAt?.getTime() ?? 0));
    const n = await insertDocs(docs);
    await adapter.commitMarks(); // marks advance only now — docs are in
    fetched += docs.length;
    inserted += n;
    for (const d of docs) {
      const day = d.publishedAt?.toISOString().slice(0, 10) ?? "unknown";
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
    console.log(
      `pass ${pass}: fetched=${docs.length} inserted=${n} stats=${JSON.stringify(adapter.runStats)}`,
    );
    if (adapter.runStats.floodAborts) {
      console.warn("pass ended on a FLOOD_WAIT abort — resuming with the next pass after 60s");
      await new Promise((r) => setTimeout(r, 60_000));
    }
    if (pass >= 40) {
      console.warn("pass limit reached — remaining channels resume on a later run");
      break;
    }
  }

  console.log(`\nper-day actual vs estimate (${estPerDayDocs}/day estimated):`);
  for (const [day, n] of [...byDay.entries()].sort()) console.log(`  ${day}: ${n}`);
  const actualUsd = (inserted / 1000) * MAP_USD_PER_1K_DOCS;
  console.log(
    `\nDONE: fetched=${fetched} inserted=${inserted} across ${pass} passes; ` +
      `estimated ${estDocs} docs/$${estUsd.toFixed(2)} -> actual ${inserted} docs/~$${actualUsd.toFixed(2)} map cost`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

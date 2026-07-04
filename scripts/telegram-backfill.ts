import "./env";

// Backfill Telegram history via t.me/s/ pagination for the digest backtest window.
// Usage: tsx scripts/telegram-backfill.ts [days=14]
// Idempotent: content-hash dedupe makes reruns cheap.

async function main() {
  const days = parseInt(process.argv[2] ?? "14", 10);
  const until = new Date(Date.now() - days * 24 * 3600 * 1000);

  const { TelegramWebAdapter } = await import("../src/lib/adapters/telegram-web");
  const { insertDocs } = await import("../src/lib/ingest/run");
  const { TELEGRAM_CURATED } = await import("../src/lib/ingest/config");
  const { neon } = await import("@neondatabase/serverless");

  const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!);
  const registryRows = (await sql`
    SELECT name FROM sources
    WHERE platform = 'telegram' AND decayed = false AND citation_count >= 5
    ORDER BY citation_count DESC LIMIT 15`) as Array<{ name: string }>;

  const seen = new Set(TELEGRAM_CURATED.map((c) => c.channel.toLowerCase()));
  const channels = [
    ...TELEGRAM_CURATED,
    ...registryRows
      .filter((r) => !seen.has(r.name.toLowerCase()))
      .map((r) => ({ channel: r.name, countryIso2: "ru" })),
  ];

  const adapter = new TelegramWebAdapter([]);
  let total = 0,
    inserted = 0;
  for (const { channel, countryIso2 } of channels) {
    const docs = await adapter.backfillChannel(channel, countryIso2, until);
    const n = await insertDocs(docs);
    total += docs.length;
    inserted += n;
    console.log(`${channel}: fetched=${docs.length} inserted=${n}`);
  }
  console.log(`done: fetched=${total} inserted=${inserted} channels=${channels.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

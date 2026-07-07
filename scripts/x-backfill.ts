import "./env";

// One-shot ~7-day X backfill via last_tweets (every returned tweet is billed:
// $0.15/1k), tiered by ISW citation rank so spend concentrates on the accounts
// ISW actually leans on. SpendGuard enforces X_SPRINT_USD_CAP / daily caps —
// budget-stop mid-tier is safe (recent-first per account; dedupe absorbs reruns).
//
// Usage: X_SPRINT_USD_CAP=5 [X_DAILY_USD_CAP=3.5] [DAYS=7] tsx scripts/x-backfill.ts

async function main() {
  const days = Number(process.env.DAYS ?? 7);
  const { XApiAdapter, registryXAccounts, xGuardFromEnv } = await import(
    "../src/lib/adapters/x-api"
  );
  const { insertDocs } = await import("../src/lib/ingest/run");

  const accounts = await registryXAccounts();
  console.log(`${accounts.length} registry X accounts, backfilling ${days} days`);

  const range = {
    from: new Date(Date.now() - days * 24 * 3600 * 1000),
    to: new Date(),
  };

  // (start, end, last_tweets pages @20 tweets) — depth follows citation rank
  const tiers: Array<[number, number, number]> = [
    [0, 50, 6],
    [50, 150, 3],
    [150, accounts.length, 1],
  ];

  let totalFetched = 0;
  let totalInserted = 0;
  for (const [start, end, pages] of tiers) {
    const slice = accounts.slice(start, end);
    if (slice.length === 0) continue;
    const guard = xGuardFromEnv(); // fresh init -> sees cumulative persisted spend
    const adapter = new XApiAdapter(slice, guard, {
      maxPagesPerAccount: pages,
      spacingMs: 250,
    });
    console.log(`tier ${start}-${end} (${slice.length} accounts, ${pages} pages max)...`);
    const docs = await adapter.backfill(range);
    const inserted = await insertDocs(docs);
    totalFetched += docs.length;
    totalInserted += inserted;
    console.log(`tier done: ${docs.length} in-range docs, ${inserted} inserted`);
  }
  console.log(`backfill complete: ${totalFetched} fetched, ${totalInserted} inserted`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});

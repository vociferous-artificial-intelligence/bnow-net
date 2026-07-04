import "./env";

// Local ingest runner (same code path as /api/cron/ingest).
// Usage: tsx scripts/ingest.ts [fast|telegram|all]

async function main() {
  const which = (process.argv[2] ?? "all") as "fast" | "telegram" | "all";
  const { runIngest } = await import("../src/lib/ingest/run");
  const started = Date.now();
  const stats = await runIngest(which);
  console.table(stats);
  console.log(`total ${Date.now() - started}ms`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

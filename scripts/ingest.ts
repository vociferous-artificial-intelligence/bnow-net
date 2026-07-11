import "./env";

// Local ingest runner (same code path as /api/cron/ingest).
// Usage: tsx scripts/ingest.ts [fast|telegram|mtproto|x|all]
// NOTE: "x" (paid, spend-guarded) and "mtproto" (telegram-account flood budget)
// run only on their own explicit groups; neither is part of "all".

async function main() {
  const which = (process.argv[2] ?? "all") as
    | "fast"
    | "telegram"
    | "mtproto"
    | "x"
    | "all";
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

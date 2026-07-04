import "./env";

// Local validation runner.
// Usage: tsx scripts/validate.ts [countryIso2] [yyyy-mm-dd]
// Defaults: ru + ua for yesterday (UTC) — ISW publishes late evening ET.

async function main() {
  const country = process.argv[2];
  const date =
    process.argv[3] ??
    new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const { validateDigest } = await import("../src/lib/validation/run");

  for (const c of country ? [country] : ["ru", "ua"]) {
    const res = await validateDigest(c, date);
    console.log(c, date, JSON.stringify(res));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import "./env";

// Local digest runner.
// Usage: tsx scripts/digest.ts [countryIso2] [yyyy-mm-dd]
// Defaults: ru + ua for today (UTC).

async function main() {
  const country = process.argv[2];
  const date = process.argv[3] ?? new Date().toISOString().slice(0, 10);
  const { generateDigest } = await import("../src/lib/analysis/digest");

  const countries = country ? [country] : ["ru", "ua"];
  for (const c of countries) {
    const res = await generateDigest(c, date);
    console.log(res ? JSON.stringify(res) : `no digest for ${c} ${date} (no docs)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

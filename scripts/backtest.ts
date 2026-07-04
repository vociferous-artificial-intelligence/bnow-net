import "./env";

// Backtest: regenerate digests from ingested history and validate vs ISW
// for a date range. Usage: tsx scripts/backtest.ts [from] [to]
// Defaults: 14 days ending yesterday (UTC).

async function main() {
  const to = process.argv[3] ?? new Date(Date.now() - 24 * 3600e3).toISOString().slice(0, 10);
  const from =
    process.argv[2] ??
    new Date(new Date(to + "T00:00:00Z").getTime() - 13 * 24 * 3600e3)
      .toISOString()
      .slice(0, 10);

  const { generateDigest } = await import("../src/lib/analysis/digest");
  const { validateDigest } = await import("../src/lib/validation/run");

  const dates: string[] = [];
  for (
    let d = new Date(from + "T00:00:00Z");
    d <= new Date(to + "T00:00:00Z");
    d = new Date(d.getTime() + 24 * 3600e3)
  ) {
    dates.push(d.toISOString().slice(0, 10));
  }

  console.log(`backtest ${from} → ${to} (${dates.length} days)`);
  for (const date of dates) {
    for (const c of ["ru", "ua"]) {
      try {
        const dig = await generateDigest(c, date);
        if (!dig) {
          console.log(`${date} ${c}: no docs, skipped`);
          continue;
        }
        const val = await validateDigest(c, date);
        const summary =
          "error" in val
            ? `digest ok (${dig.claims} claims) / validate: ${val.error}`
            : `claims=${dig.claims} coverage=${val.coveragePct}% lead=${val.timelinessHours}h agree=${val.agreements} iswOnly=${val.iswOnly} oursOnly=${val.oursOnly}`;
        console.log(`${date} ${c}: ${summary}`);
      } catch (e) {
        console.log(`${date} ${c}: ERROR ${e instanceof Error ? e.message : e}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

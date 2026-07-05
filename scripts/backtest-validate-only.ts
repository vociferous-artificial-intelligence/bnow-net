import "./env";

// Re-run validation for a date range against existing digests.
async function main() {
  const from = process.argv[2];
  const to = process.argv[3];
  const { validateDigest } = await import("../src/lib/validation/run");
  for (
    let d = new Date(from + "T00:00:00Z");
    d <= new Date(to + "T00:00:00Z");
    d = new Date(d.getTime() + 24 * 3600e3)
  ) {
    const date = d.toISOString().slice(0, 10);
    for (const c of ["ru", "ua"]) {
      try {
        const v = await validateDigest(c, date);
        console.log(
          date, c,
          "error" in v
            ? v.error
            : `coverage=${v.coveragePct}% lead=${v.timelinessHours}h agree=${v.agreements} iswOnly=${v.iswOnly} oursOnly=${v.oursOnly}`,
        );
      } catch (e) {
        console.log(date, c, "ERROR", e instanceof Error ? e.message : e);
      }
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

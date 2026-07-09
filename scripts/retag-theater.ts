// Retag historical raw_documents whose theater predates the ingest routing rules.
//
// Two rules, applied in the same order ingest applies them (src/lib/ingest/theater.ts
// and TELEGRAM_CHANNEL_THEATER in src/lib/ingest/config.ts):
//   1. per-channel override — every doc from a channel with a known theater
//   2. fa -> ir — Persian is an Iran-theater language whatever the source default
//
// Idempotent: re-running retags nothing once the corpus is clean. Read-only unless
// --apply is passed.
//
// Usage: npx tsx scripts/retag-theater.ts [--apply]
import "./env";
import { neon } from "@neondatabase/serverless";
import { TELEGRAM_CHANNEL_THEATER } from "../src/lib/ingest/config";

const sql = neon(process.env.DATABASE_URL!);
const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(`=== retag-theater (${APPLY ? "APPLY" : "DRY RUN — pass --apply to write"}) ===`);

  const channels = Object.keys(TELEGRAM_CHANNEL_THEATER);
  const byTheater = new Map<string, string[]>();
  for (const ch of channels) {
    const t = TELEGRAM_CHANNEL_THEATER[ch];
    byTheater.set(t, [...(byTheater.get(t) ?? []), `t.me/${ch}`]);
  }

  let total = 0;

  // 1. per-channel override: catches the channel's non-Persian output too
  for (const [theater, sourceKeys] of byTheater) {
    const preview = await sql`
      SELECT rd.country_iso2, rd.lang, count(*)::int AS n
      FROM raw_documents rd JOIN sources s ON s.id = rd.source_id
      WHERE s.canonical_url = ANY(${sourceKeys}) AND rd.country_iso2 IS DISTINCT FROM ${theater}
      GROUP BY 1, 2 ORDER BY 3 DESC`;
    const n = preview.reduce((s, r) => s + Number(r.n), 0);
    console.log(`\n-- channel override -> ${theater} (${sourceKeys.length} channels): ${n} docs`);
    for (const r of preview) console.log(`   ${r.country_iso2} / ${r.lang ?? "?"} : ${r.n}`);
    if (APPLY && n > 0) {
      const res = await sql`
        UPDATE raw_documents rd SET country_iso2 = ${theater}
        FROM sources s
        WHERE s.id = rd.source_id AND s.canonical_url = ANY(${sourceKeys})
          AND rd.country_iso2 IS DISTINCT FROM ${theater}
        RETURNING rd.id`;
      console.log(`   UPDATED ${res.length}`);
      total += res.length;
    } else total += n;
  }

  // 2. language rule: any REMAINING Persian doc outside the ir theater. Rule 1 has
  // already claimed its channels (in --apply it really has; in a dry run we exclude
  // them here) so the two counts never double-report the same document.
  const overrideKeys = [...byTheater.values()].flat();
  const faPreview = await sql`
    SELECT country_iso2, adapter, count(*)::int AS n
    FROM raw_documents rd
    WHERE lang = 'fa' AND country_iso2 IS DISTINCT FROM 'ir'
      AND NOT EXISTS (
        SELECT 1 FROM sources s
        WHERE s.id = rd.source_id AND s.canonical_url = ANY(${overrideKeys}))
    GROUP BY 1, 2 ORDER BY 3 DESC`;
  const faN = faPreview.reduce((s, r) => s + Number(r.n), 0);
  console.log(`\n-- fa -> ir language rule: ${faN} docs`);
  for (const r of faPreview) console.log(`   ${r.country_iso2} / ${r.adapter} : ${r.n}`);
  if (APPLY && faN > 0) {
    const res = await sql`
      UPDATE raw_documents SET country_iso2 = 'ir'
      WHERE lang = 'fa' AND country_iso2 IS DISTINCT FROM 'ir' RETURNING id`;
    console.log(`   UPDATED ${res.length}`);
    total += res.length;
  } else total += faN;

  console.log(`\n${APPLY ? "retagged" : "would retag"} ${total} raw_documents`);
  if (!APPLY) return;

  const after = await sql`
    SELECT country_iso2, count(*)::int AS n FROM raw_documents
    WHERE lang = 'fa' GROUP BY 1 ORDER BY 2 DESC`;
  console.log("\n-- fa docs by theater, after --");
  for (const r of after) console.log(`   ${r.country_iso2}: ${r.n}`);
  console.log(
    "\nNOTE: ir digests for the affected days would improve on regeneration.\n" +
      "Do NOT mass-regenerate — the daily cron will pick up new days on its own.",
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

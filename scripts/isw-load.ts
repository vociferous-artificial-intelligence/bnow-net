import "./env";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";
import { canonicalSource } from "../src/lib/isw/urls";
import type { ParsedReport } from "../src/lib/isw/parse";

// Load parsed-reports.jsonl into isw_reports / sources / source_citations.
// Idempotent: reports upsert by url; citations deduped by (report,url,endnote);
// sources get-or-create by canonical key.

const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!);

async function main() {
  // Usage: tsx scripts/isw-load.ts [--in <jsonl>] [--theater ru|ir]
  const inIdx = process.argv.indexOf("--in");
  const theaterIdx = process.argv.indexOf("--theater");
  const inFile = inIdx !== -1 ? process.argv[inIdx + 1] : "data/derived/parsed-reports.jsonl";
  const theater = theaterIdx !== -1 ? process.argv[theaterIdx + 1] : "ru";

  const lines = readFileSync(join(process.cwd(), inFile), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean);
  const reports: ParsedReport[] = lines.map((l) => JSON.parse(l));
  console.log(`loading ${reports.length} parsed reports (theater=${theater})`);

  // -- 1. upsert reports, collect url->id
  const reportIdByUrl = new Map<string, number>();
  let dateSkipped = 0;
  for (const r of reports) {
    if (!r.reportDate) continue;
    try {
      const rows = await sql`
        INSERT INTO isw_reports (url, theater, report_date, title, fetched_at, parse_status, endnote_count, citation_count)
        VALUES (${r.url}, ${theater}, ${r.reportDate}, ${r.title}, now(), ${r.parseOk ? "parsed" : "failed"}, ${r.endnoteCount}, ${r.citations.length})
        ON CONFLICT (url) DO UPDATE
          SET parse_status = EXCLUDED.parse_status,
              endnote_count = EXCLUDED.endnote_count,
              citation_count = EXCLUDED.citation_count,
              title = EXCLUDED.title
        RETURNING id`;
      reportIdByUrl.set(r.url, rows[0].id as number);
    } catch (e) {
      if (e instanceof Error && e.message.includes("theater_date")) {
        dateSkipped++; // duplicate (theater, date) — first one wins
      } else throw e;
    }
  }
  console.log(`reports upserted: ${reportIdByUrl.size} (date-dupes skipped: ${dateSkipped})`);

  // -- 2. get-or-create sources by canonical key
  const wanted = new Map<string, { platform: string; name: string; domain: string }>();
  for (const r of reports) {
    for (const c of r.citations) {
      const cs = canonicalSource(c.rawUrl);
      if (cs && !wanted.has(cs.key)) wanted.set(cs.key, cs);
    }
  }
  console.log(`distinct canonical sources in citations: ${wanted.size}`);

  const entries = [...wanted.entries()];
  for (let i = 0; i < entries.length; i += 200) {
    const chunk = entries.slice(i, i + 200);
    const values: string[] = [];
    const params: unknown[] = [];
    chunk.forEach(([key, s], j) => {
      const o = j * 4;
      values.push(`($${o + 1}, $${o + 2}, $${o + 3}::platform, $${o + 4})`);
      params.push(key, s.domain, s.platform, s.name);
    });
    await sql.query(
      `INSERT INTO sources (canonical_url, domain, platform, name) VALUES ${values.join(",")}
       ON CONFLICT (canonical_url) DO NOTHING`,
      params,
    );
  }
  const srcRows = (await sql`SELECT id, canonical_url FROM sources`) as Array<{
    id: number;
    canonical_url: string;
  }>;
  const sourceIdByKey = new Map<string, number>(
    srcRows.map((r) => [r.canonical_url, r.id]),
  );

  // -- 3. citations in batches
  let citTotal = 0;
  for (const r of reports) {
    const reportId = reportIdByUrl.get(r.url);
    if (!reportId) continue;
    const rows = r.citations
      .map((c) => {
        const cs = canonicalSource(c.rawUrl);
        if (!cs) return null; // self-citations / unparseable
        const sourceId = sourceIdByKey.get(cs.key);
        if (!sourceId) return null;
        return { reportId, sourceId, rawUrl: c.rawUrl, endnoteIndex: c.endnoteIndex, hedging: c.hedging, cue: c.hedgingCue };
      })
      .filter(Boolean) as Array<{ reportId: number; sourceId: number; rawUrl: string; endnoteIndex: number; hedging: string; cue: string | null }>;

    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const values: string[] = [];
      const params: unknown[] = [];
      chunk.forEach((c, j) => {
        const o = j * 6;
        values.push(`($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}::hedging, $${o + 6})`);
        params.push(c.reportId, c.sourceId, c.rawUrl, c.endnoteIndex, c.hedging, c.cue);
      });
      await sql.query(
        `INSERT INTO source_citations (report_id, source_id, raw_url, endnote_index, hedging, hedging_cue)
         VALUES ${values.join(",")} ON CONFLICT (report_id, raw_url, endnote_index) DO NOTHING`,
        params,
      );
      citTotal += chunk.length;
    }
  }
  console.log(`citations loaded: ${citTotal}`);

  const [s] = await sql`SELECT count(*)::int n FROM sources`;
  const [c] = await sql`SELECT count(*)::int n FROM source_citations`;
  const [ir] = await sql`SELECT count(*)::int n FROM isw_reports`;
  console.log(`DB now: isw_reports=${ir.n} sources=${s.n} source_citations=${c.n}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

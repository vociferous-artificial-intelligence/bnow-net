import "./env";
import { neon } from "@neondatabase/serverless";
import { parseReport } from "../src/lib/isw/parse";
import { loadParsedReportById, refreshSourceStats, type QueryFn } from "../src/lib/isw/load";
import { iranUpdateUrlCandidatesForDate, iswUrlForDate } from "../src/lib/validation/run";
import { politeFetch } from "../src/lib/fetch-cache";
import { utcDayRange } from "../src/lib/time/day-boundary";

// Idempotent ISW citation refresh (2026-08-15 Iran validation recovery,
// Workstream C runbook). Two modes, both resumable per report and safe to
// re-run (unique keys absorb replays; a parse failure never downgrades an
// already-parsed report):
//
//   1. pending drain (default): fetch + parse every parse_status='pending'
//      (or 'failed' with --retry-failed) report for --theater, oldest first,
//      and load its endnote citations. politeFetch disk-caches every page and
//      spaces same-host requests (~2.1s), so re-runs cost zero network.
//   2. --discover --from A --to B: for dates in [A, B] with NO isw_reports row
//      for the theater, probe the known slug shapes; a page is inserted ONLY
//      after it fetches 200 with a real body — nothing is manufactured for
//      ISW publication gaps.
//
//   npx tsx scripts/isw-refresh.ts --theater ir                  # drain pending
//   npx tsx scripts/isw-refresh.ts --theater ir --dry            # report only
//   npx tsx scripts/isw-refresh.ts --theater ir --discover --from 2026-07-04 --to 2026-08-15
//
// ISW prose never persists: only URLs, canonical source identities, hedging
// enums, ≤60-char hedging cues, and counts reach the database (ruling 1).

const args = process.argv.slice(2);
const argVal = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const THEATER = argVal("--theater") ?? "ir";
const DRY = args.includes("--dry");
const RETRY_FAILED = args.includes("--retry-failed");
const LIMIT = Number(argVal("--limit") ?? 500);

// NOTE: deliberately DATABASE_URL, not DATABASE_URL_UNPOOLED (this was a
// stale-credential fact in one WSL2 .env.local, not a code portability issue;
// the Mac .env.local holds both URL names — re-verify UNPOOLED's credentials
// before switching this to it)
const sql = neon(process.env.DATABASE_URL!);
const query: QueryFn = (text, params) => sql.query(text, params) as Promise<Array<Record<string, unknown>>>;

function candidatesFor(theater: string, date: string): string[] {
  return theater === "ir" ? iranUpdateUrlCandidatesForDate(date) : [iswUrlForDate(date)];
}

async function refreshOne(reportId: number, url: string): Promise<string> {
  const page = await politeFetch(url);
  if (!page || page.status !== 200 || page.html.length < 1000) {
    return `fetch-failed(${page?.status ?? "network"})`;
  }
  const parsed = parseReport(url, page.html);
  if (DRY) {
    return `DRY parseOk=${parsed.parseOk} endnotes=${parsed.endnoteCount} citations=${parsed.citations.length}`;
  }
  const r = await loadParsedReportById(query, reportId, THEATER, parsed);
  return `${r.action} endnotes=${r.endnoteCount} citations=${r.citationCount} inserted=${r.citationsInserted} newSources=${r.sourcesCreated} statsRows=${r.statsRefreshed}`;
}

async function main() {
  console.log(`isw-refresh theater=${THEATER} dry=${DRY}`);
  const touched: number[] = [];

  if (args.includes("--discover")) {
    const from = argVal("--from");
    const to = argVal("--to");
    if (!from || !to) throw new Error("--discover needs --from and --to (yyyy-mm-dd)");
    for (const date of utcDayRange(from, to)) {
      const existing = await query(
        `SELECT id FROM isw_reports WHERE theater = $1 AND report_date = $2`,
        [THEATER, date],
      );
      if (existing.length > 0) continue;
      let inserted = false;
      for (const url of candidatesFor(THEATER, date)) {
        const probe = await politeFetch(url);
        if (!probe || probe.status !== 200 || probe.html.length < 10_000) continue;
        if (DRY) {
          console.log(`${date}  DISCOVER DRY would insert ${url}`);
          inserted = true;
          break;
        }
        const ins = await query(
          `INSERT INTO isw_reports (url, theater, report_date, fetched_at, parse_status)
           VALUES ($1, $2, $3, now(), 'pending')
           ON CONFLICT (url) DO UPDATE SET fetched_at = now()
           RETURNING id`,
          [url, THEATER, date],
        );
        const id = Number(ins[0].id);
        console.log(`${date}  DISCOVERED ${url} -> ${await refreshOne(id, url)}`);
        touched.push(id);
        inserted = true;
        break;
      }
      if (!inserted) console.log(`${date}  no report found (publication gap or unknown slug)`);
    }
  }

  const statuses = RETRY_FAILED ? ["pending", "failed"] : ["pending"];
  const rows = await query(
    `SELECT id, url, report_date::text AS date FROM isw_reports
     WHERE theater = $1 AND parse_status = ANY($2)
     ORDER BY report_date ASC LIMIT $3`,
    [THEATER, statuses, LIMIT],
  );
  console.log(`${rows.length} ${statuses.join("/")} reports to refresh`);
  for (const r of rows) {
    const id = Number(r.id);
    console.log(`${r.date}  ${await refreshOne(id, String(r.url))}`);
    touched.push(id);
  }

  if (!DRY) {
    const after = await query(
      `SELECT parse_status, count(*)::int AS n, max(report_date)::text AS newest
       FROM isw_reports WHERE theater = $1 GROUP BY parse_status ORDER BY parse_status`,
      [THEATER],
    );
    console.log("isw_reports now:", JSON.stringify(after));
    const cits = await query(
      `SELECT max(ir.report_date)::text AS newest_cited
       FROM source_citations sc JOIN isw_reports ir ON ir.id = sc.report_id WHERE ir.theater = $1`,
      [THEATER],
    );
    console.log(`newest cited ${THEATER} report date:`, cits[0]?.newest_cited);
  }
}

// re-exported so a follow-up can refresh stats for an explicit source set
export { refreshSourceStats };

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

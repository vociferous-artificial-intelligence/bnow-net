import "./env";

// Source-to-publication quality-funnel report (quality foundation, 2026-08-17).
// Read-only SELECTs via src/lib/analysis/quality-funnel.ts — no writes, no
// provider contact, no LLM. Prints one funnel per (theater, track, date):
// eligible corpus -> mirrors -> current-version map dispositions -> map claims
// -> reduce/vote stages -> publication guard -> persisted events/claims/
// citations, with per-adapter conversion so "where does RSS/Telegram material
// fall out on an X-heavy theater" is answerable from one screen.
//
//   npx tsx scripts/quality-funnel-report.ts --theater ir --from 2026-08-14
//   npx tsx scripts/quality-funnel-report.ts --theater ir --from 2026-08-10 --to 2026-08-16
//   npx tsx scripts/quality-funnel-report.ts --theater ru --track military --from 2026-08-16 --json

import { neon } from "@neondatabase/serverless";
import {
  loadQualityFunnel,
  type QualityFunnelReport,
  type QueryFn,
} from "../src/lib/analysis/quality-funnel";
import { TRACKS, type Track } from "../src/lib/analysis/tracks";
import { utcDayRange } from "../src/lib/time/day-boundary";

const HOW_TO_READ = `how to read this
  Corpus counts are DOCUMENTS on the report date's UTC day bucket
  (COALESCE(published_at, fetched_at)::date, the map worker's own predicate).
  mapClaims counts doc_claims ROWS (one doc fans out to 0-3 claims per track);
  groups (gids) are cross-doc claim clusters; links are claim_sources rows
  (one claim cites 1-N docs, one doc backs 1-N claims — stages are NOT
  monotone counts of one unit). Superseded extractor versions and dedup
  mirrors are shown but EXCLUDED from every current stage.
  Docs without a map disposition for THIS track split two ways: pending =
  genuine unmapped backlog (processed=false, the cron still drains it);
  notApplicable = the track's lexicon never matched (processed=true) — those
  docs will NEVER map under this track and are NOT extraction loss.
  Per adapter, read the fall-out left to right: eligible -> map claims
  (extraction yield) -> cited in the digest (final attachment). The reduce
  stage between them (groupsFed, vote survival) is global-only — fed-group
  membership per adapter is not persisted. citedDocs can include neighboring
  days for rolling-window digests, so docConversionPct is measured against
  the report date's corpus only. evidenceRecency ages anchor to each
  engine's own asOf: a mid-day LEGACY digest anchors to its fixed window END,
  a rolling mapreduce one to its run clock — do not compare their
  evidenceWithin24hPct head-to-head. INTERNAL, UNCALIBRATED observability.`;

function usage(): never {
  console.error(
    "usage: npx tsx scripts/quality-funnel-report.ts --theater <iso2> --from <yyyy-mm-dd> " +
      "[--to <yyyy-mm-dd>] [--track military|elite_politics|nuclear] [--json]",
  );
  process.exit(1);
}

function fmtSplit(rec: Record<string, number>): string {
  const entries = Object.entries(rec).sort((a, b) => b[1] - a[1]);
  return entries.length ? entries.map(([k, v]) => `${k} ${v}`).join(", ") : "none";
}

function printHuman(r: QualityFunnelReport): void {
  const c = r.corpus;
  console.log(`\n=== quality funnel ${r.theater}/${r.track} ${r.date} (funnelVersion ${r.funnelVersion}) ===`);
  console.log(`current extractor version: ${r.currentExtractorVersion ?? "n/a (track not configured)"}`);
  console.log(`corpus (documents, UTC day bucket):`);
  console.log(`  rawEligibleDocs ${c.rawEligibleDocs}  (adapters: ${fmtSplit(c.byAdapter)})`);
  console.log(`  platforms: ${fmtSplit(c.byPlatform)} · languages: ${fmtSplit(c.byLang)}`);
  console.log(
    `  mirrors ${c.mirrorDocs} (${fmtSplit(c.mirrorMethods)}) -> canonical ${c.canonicalDocs}`,
  );
  console.log(
    `  map dispositions ${c.mapDispositions} (withClaims ${c.docsWithClaims}, noClaims ${c.docsNoClaims}) -> mapClaims ${c.mapClaims}`,
  );
  console.log(
    `  undispositioned: pending ${c.pendingDocs} (backlog) · notApplicable ${c.notApplicableDocs} (lexicon skip — never maps under this track)`,
  );
  console.log(
    `  superseded (EXCLUDED): ${c.supersededDispositions} dispositions / ${c.supersededClaims} claims` +
      (c.supersededOnly ? "  << SUPERSEDED-ONLY DAY (version bump, not a gap)" : ""),
  );

  const d = r.digest;
  if (!d) {
    console.log(`digest: none for this (theater, track, date)`);
  } else {
    console.log(`digest #${d.digestId} engine=${d.engine} provider=${d.provider ?? "n/a"}`);
    console.log(`  dispatch: ${JSON.stringify(d.dispatch)}`);
    if (d.reduce) {
      const red = d.reduce;
      const win = red.window as Record<string, unknown> | undefined;
      console.log(
        `  reduce: window ${win?.from ?? "?"}..${win?.to ?? "?"} ${win?.mode ?? "?"} · ` +
          `claims ${red.claims} -> groupsTotal ${red.groupsTotal} -> groupsFed ${red.groupsFed} -> ` +
          `votes ${red.votes}/${red.votesRequested} (failed ${red.failedVotes}) -> ` +
          `surviving ${red.survivingEvents} events · droppedGidRefs ${red.droppedGidRefs}`,
      );
      console.log(
        `  vote stage (groups): gidsCitedAnyVote ${red.gidsCitedAnyVote ?? "n/a"} -> gidsMajority ${red.gidsMajority ?? "n/a"} · ` +
          `docs in fed groups ${d.docsInFedGroups ?? "n/a (not persisted — pre-stat digest)"}`,
      );
    }
    if (d.legacyStages) {
      const l = d.legacyStages;
      console.log(
        `  legacy stages: docsRaw ${l.docsRaw ?? "n/a"} -> trackRows ${l.trackRows ?? "n/a"} -> ` +
          `docsAnalyzed ${l.docsAnalyzed ?? "n/a"} · droppedClaims ${l.droppedClaims ?? "n/a"}`,
      );
    }
    if (d.publicationGuard) console.log(`  publicationGuard: ${JSON.stringify(d.publicationGuard)}`);
    if (d.evidenceRecency) {
      const er = d.evidenceRecency;
      console.log(
        `  evidenceRecency: coverage ${er.timestampCoveragePct ?? "n/a"}% · median age ` +
          `${er.medianEvidenceAgeHours ?? "n/a"}h · p90 ${er.p90EvidenceAgeHours ?? "n/a"}h · ` +
          `within24h ${er.evidenceWithin24hPct ?? "n/a"}% · stale>48h ${er.staleClaimsOver48hPct ?? "n/a"}% · ` +
          `unknown-age ${er.unknownAgeClaimPct}%`,
      );
    }
    console.log(
      `  persisted: ${d.persisted.events} events, ${d.persisted.claims} claims, ` +
        `${d.persisted.citationLinks} links -> ${d.persisted.citedDocs} distinct docs`,
    );
  }

  console.log(`per-adapter conversion (eligible -> map claims -> cited):`);
  for (const [adapter, a] of Object.entries(r.adapters).sort((x, y) => y[1].eligibleDocs - x[1].eligibleDocs)) {
    console.log(
      `  ${adapter}: eligible ${a.eligibleDocs} (pending ${a.pendingDocs}, notApplicable ${a.notApplicableDocs}) -> ` +
        `withClaims ${a.docsWithClaims} (${a.mapClaims} claims) -> ` +
        `cited ${a.citedDocs} docs / ${a.citationLinks} links · ` +
        `linkShare ${a.linkSharePct ?? "n/a"}% · docConversion ${a.docConversionPct ?? "n/a"}%`,
    );
  }
  if (r.warnings.length) {
    console.log(`warnings:`);
    for (const w of r.warnings) console.log(`  ! ${w}`);
  }
  if (r.unknownReasons.length) console.log(`unknown labels preserved: ${r.unknownReasons.join("; ")}`);
}

async function main() {
  const args = process.argv.slice(2);
  const argVal = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const theater = argVal("--theater");
  const track = (argVal("--track") ?? "military") as Track;
  const from = argVal("--from");
  const to = argVal("--to") ?? from;
  const asJson = args.includes("--json");

  if (!theater || !from || !to) usage();
  if (!(track in TRACKS)) {
    console.error(`quality-funnel-report: unknown track "${track}" (${Object.keys(TRACKS).join("|")})`);
    process.exit(1);
  }
  const days = utcDayRange(from, to);
  if (days.length === 0) {
    console.error(`quality-funnel-report: bad date range ${from}..${to} (yyyy-mm-dd, from <= to)`);
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error(
      "quality-funnel-report: DATABASE_URL is not set — this read-only report needs a " +
        "database to read; put DATABASE_URL in .env.local (never point it at a test stub).",
    );
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);
  const query: QueryFn = (text, params) =>
    sql.query(text, params) as Promise<Array<Record<string, unknown>>>;

  const reports: QualityFunnelReport[] = [];
  for (const date of days) {
    reports.push(await loadQualityFunnel(query, { theater, track, date }));
  }

  if (asJson) {
    console.log(JSON.stringify(reports, null, 2));
    return;
  }
  console.log(HOW_TO_READ);
  for (const r of reports) printHuman(r);
}

main().catch((e) => {
  console.error(`quality-funnel-report failed: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});

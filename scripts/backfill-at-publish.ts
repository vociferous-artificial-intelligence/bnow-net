// Backfill the "evidence in hand at ISW publish" dual-coverage metric onto recent
// validation_runs.details (analyst-trust sprint W4, 2026-07-12 — audit in
// docs/reviews/ANALYST-TRUST-NOTE-2026-07-12.md §④).
//
// $0 and deterministic BY CONSTRUCTION: it never re-runs the paid matcher. It
// recomputes exactly what src/lib/validation/score.ts now computes at scoring
// time, from durable stored data: the run's agreement divergences (claimId), the
// matched claims' supporting documents' min(fetched_at) (claims for past digest
// dates are stable after the D+1 finalize), the run's own stored denominator
// (details.matchableTakeaways), and isw_reports.derived->>'publishedAt'.
// Headline columns (coverage_pct etc.) are NEVER touched — the write is one
// additive jsonb key, details.atPublish (marked "backfilled": true).
//
// Honesty guards — a run is SKIPPED (with a printed reason), never guessed:
//   - details.atPublish already present (idempotent; --force recomputes)
//   - no stored ISW publish instant
//   - stored coverage_pct does not reproduce from matchedPairs/matchableTakeaways
//     (an unknown legacy scoring shape — do not bolt a new metric onto it)
//   - any matched claim no longer exists (regenerated digest — evidence gone)
//
// Usage (estimate first; nothing is written without --apply):
//   npx tsx scripts/backfill-at-publish.ts [--days 7] [--apply] [--force]
// Branch-DB runs MUST override BOTH url vars (the standing trap):
//   DATABASE_URL=... DATABASE_URL_UNPOOLED=... npx tsx scripts/backfill-at-publish.ts ...

import "./env";
import { neon } from "@neondatabase/serverless";
import { computeAtPublish } from "../src/lib/validation/at-publish";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const FORCE = args.includes("--force");
const daysIdx = args.indexOf("--days");
const DAYS = daysIdx >= 0 ? Number(args[daysIdx + 1]) : 7;
if (!Number.isFinite(DAYS) || DAYS < 1 || DAYS > 60) {
  console.error(`--days must be 1..60 (got ${args[daysIdx + 1]})`);
  process.exit(2);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(2);
}
// Echo + assert the target host so a branch run can prove it hit the branch
// (and so both-URL overrides are visible). UNPOOLED matters even though this
// script only uses DATABASE_URL: dotenv above loads .env.local, and a partial
// override is exactly the MERGE-1 trap this repo already fell into once.
const host = new URL(url).host;
const unpooledHost = process.env.DATABASE_URL_UNPOOLED
  ? new URL(process.env.DATABASE_URL_UNPOOLED).host
  : "(unset)";
console.log(`target host: ${host}`);
console.log(`unpooled host: ${unpooledHost}`);
if (process.env.DATABASE_URL_UNPOOLED && unpooledHost.replace(/-pooler\./, ".") !== host.replace(/-pooler\./, ".")) {
  console.error("DATABASE_URL and DATABASE_URL_UNPOOLED point at DIFFERENT hosts — refusing (partial override).");
  process.exit(2);
}
console.log(`mode: ${APPLY ? "APPLY" : "estimate (dry-run)"} · window: last ${DAYS} days${FORCE ? " · force" : ""}`);

const sql = neon(url);

interface RunRow {
  id: number;
  iso2: string;
  digest_date: string;
  coverage_pct: number | null;
  divergences: Array<{ kind: string; claimId?: number }>;
  details: {
    matchableTakeaways?: number;
    matchedPairs?: number;
    atPublish?: unknown;
  };
  published_at: string | null;
}

async function main() {
  const runs = (await sql.query(
    `SELECT vr.id, c.iso2, d.digest_date::text AS digest_date, vr.coverage_pct,
            vr.divergences, vr.details, r.derived->>'publishedAt' AS published_at
     FROM validation_runs vr
     JOIN digests d ON d.id = vr.digest_id
     JOIN countries c ON c.id = d.country_id
     JOIN isw_reports r ON r.id = vr.isw_report_id
     WHERE d.digest_date > current_date - $1::int
     ORDER BY d.digest_date, c.iso2`,
    [DAYS],
  )) as RunRow[];
  console.log(`candidate runs: ${runs.length}`);

  let written = 0;
  for (const run of runs) {
    const tag = `${run.iso2} ${run.digest_date} (vr ${run.id})`;
    if (run.details?.atPublish != null && !FORCE) {
      console.log(`SKIP ${tag}: details.atPublish already present`);
      continue;
    }
    if (!run.published_at) {
      console.log(`SKIP ${tag}: no stored ISW publish instant`);
      continue;
    }
    const denominator = run.details?.matchableTakeaways;
    const matchedPairs = run.details?.matchedPairs;
    if (typeof denominator !== "number" || typeof matchedPairs !== "number" || denominator <= 0) {
      console.log(`SKIP ${tag}: details lack matchableTakeaways/matchedPairs`);
      continue;
    }
    // The stored headline number must reproduce from the stored parts, or this
    // run was scored by a shape we don't understand — don't decorate it.
    const reproduced = +((matchedPairs / denominator) * 100).toFixed(1);
    if (run.coverage_pct === null || Math.abs(reproduced - Number(run.coverage_pct)) > 0.15) {
      console.log(
        `SKIP ${tag}: stored coverage_pct ${run.coverage_pct} != reproduced ${reproduced}`,
      );
      continue;
    }

    const agreements = (run.divergences ?? []).filter((d) => d.kind === "agreement");
    if (agreements.length !== matchedPairs) {
      console.log(
        `SKIP ${tag}: ${agreements.length} agreement entries != matchedPairs ${matchedPairs}`,
      );
      continue;
    }
    const claimIds = agreements.map((a) => a.claimId).filter((x): x is number => x != null);
    if (claimIds.length !== agreements.length) {
      console.log(`SKIP ${tag}: agreement entries missing claimId (legacy shape)`);
      continue;
    }

    // One claim can evidence several takeaways (each such agreement counts in the
    // numerator, exactly like final coverage counts per-takeaway) — so existence
    // is checked against the DISTINCT claim set, while the computation below maps
    // over the full agreement list, duplicates preserved.
    const distinctClaimIds = [...new Set(claimIds)];
    let evidence: Array<{ claim_id: number; earliest_fetched_at: string }> = [];
    if (distinctClaimIds.length > 0) {
      evidence = (await sql.query(
        `SELECT cs.claim_id, min(rd.fetched_at) AS earliest_fetched_at
         FROM claim_sources cs
         JOIN raw_documents rd ON rd.id = cs.raw_document_id
         WHERE cs.claim_id = ANY($1::int[])
         GROUP BY cs.claim_id`,
        [distinctClaimIds],
      )) as Array<{ claim_id: number; earliest_fetched_at: string }>;
      if (evidence.length !== distinctClaimIds.length) {
        console.log(
          `SKIP ${tag}: ${distinctClaimIds.length - evidence.length} matched claim(s) no longer exist (digest regenerated after scoring)`,
        );
        continue;
      }
    }
    const fetchedByClaim = new Map(evidence.map((e) => [e.claim_id, e.earliest_fetched_at]));

    const atPublish = computeAtPublish(
      run.published_at,
      claimIds.map((id) => ({ earliestFetchedAt: fetchedByClaim.get(id) ?? null })),
      denominator,
    );
    if (!atPublish) {
      console.log(`SKIP ${tag}: publish instant unparseable`);
      continue;
    }

    console.log(
      `${APPLY ? "WRITE" : "would write"} ${tag}: final ${run.coverage_pct}% -> at-publish ${atPublish.coveragePct}% (${atPublish.matchedBefore}/${atPublish.matchedTotal} matches evidenced pre-publish)`,
    );
    if (APPLY) {
      await sql.query(
        `UPDATE validation_runs
         SET details = details || jsonb_build_object('atPublish', $1::jsonb)
         WHERE id = $2`,
        [JSON.stringify({ ...atPublish, backfilled: true }), run.id],
      );
      written++;
    }
  }
  console.log(`done. ${APPLY ? `wrote ${written}` : "dry-run, wrote 0"} of ${runs.length} candidates.`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);

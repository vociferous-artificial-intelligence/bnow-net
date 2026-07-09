// MR sprint 3 TASK 3 — the A/B gate driver. Legacy batch engine vs map-reduce
// engine, K=3 regenerations per arm, validated against ISW with the majority
// matcher, on a DISPOSABLE NEON BRANCH (never prod — the driver refuses the
// prod DATABASE_URL).
//
// RESUMABLE BY CONSTRUCTION: every sample is keyed (day, theater, arm, k) and
// appended to docs/reviews/MR3-AB-RESULTS.jsonl the moment it completes; on
// startup existing keys are skipped. A kill mid-run costs at most one sample.
// FORCE_REGEN=1 is set so the #32 overwrite guards never block a re-roll (the
// whole point is measuring roll-to-roll variance).
//
// Usage (env recipe in docs/reviews/MR3-CHECKPOINT.md):
//   NODE_OPTIONS="--require ./scripts/pin-dns.cjs" \
//   AB_DATABASE_URL=<branch connection string> LLM_SPRINT_USD_CAP=12 \
//   npx tsx scripts/ab-mapreduce.ts [--from 2026-06-29] [--to 2026-07-08]

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import "./env";

const RESULTS = "docs/reviews/MR3-AB-RESULTS.jsonl";
const THEATERS = ["ru", "ua", "ir"] as const;
const ARMS = ["legacy", "mapreduce"] as const;
const K = 3;

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

const FROM = arg("from", "2026-06-29");
const TO = arg("to", "2026-07-08"); // inclusive

function days(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

async function main() {
  const branchUrl = process.env.AB_DATABASE_URL;
  if (!branchUrl) throw new Error("AB_DATABASE_URL not set (the Neon BRANCH connection string)");
  const prodUrl = process.env.DATABASE_URL ?? "";
  const host = (u: string) => u.split("@")[1]?.split("/")[0] ?? u;
  if (host(branchUrl) === host(prodUrl)) {
    throw new Error("AB_DATABASE_URL points at the PROD host — refusing to run the A/B on prod");
  }
  // everything below (both engines, the validator) reads DATABASE_URL
  process.env.DATABASE_URL = branchUrl;
  process.env.FORCE_REGEN = "1";
  if (!process.env.LLM_SPRINT_USD_CAP) {
    throw new Error("LLM_SPRINT_USD_CAP not set — guards fail closed and the matcher degrades");
  }

  // deferred imports: they capture env at call time, but keep the safety rail first
  const { generateDigest } = await import("../src/lib/analysis/digest");
  const { generateMapReduceDigest } = await import("../src/lib/analysis/synthesize");
  const { validateDigest } = await import("../src/lib/validation/run");
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(branchUrl);

  const done = new Set<string>();
  if (existsSync(RESULTS)) {
    for (const line of readFileSync(RESULTS, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        done.add(r.key);
      } catch {
        /* tolerate a torn last line from a crash — that sample reruns */
      }
    }
  }
  console.log(`A/B ${FROM}..${TO} on branch ${host(branchUrl)}; ${done.size} samples already done`);

  const allDays = days(FROM, TO);
  const total = allDays.length * THEATERS.length * ARMS.length * K;
  let n = done.size;

  for (const day of allDays) {
    for (const theater of THEATERS) {
      for (let k = 1; k <= K; k++) {
        for (const arm of ARMS) {
          const key = `${day}|${theater}|${arm}|k${k}`;
          if (done.has(key)) continue;
          const t0 = Date.now();
          const record: Record<string, unknown> = { key, day, theater, arm, k };
          try {
            const gen =
              arm === "legacy"
                ? await generateDigest(theater, day, "military")
                : await generateMapReduceDigest(theater, day, "military");
            if (!gen) {
              record.outcome = "null"; // no corpus / no claims for this cell
            } else if ("skipped" in gen) {
              record.outcome = `skipped:${gen.skipped}`; // should not happen under FORCE_REGEN
            } else {
              record.outcome = "ok";
              record.digestId = gen.digestId;
              record.events = gen.events;
              record.claims = gen.claims;

              // per-digest stats + citation profile from the branch
              const [dig] = await sql.query(
                `SELECT structured->'stats' AS stats FROM digests WHERE id = $1`,
                [gen.digestId],
              );
              const stats = dig?.stats ?? {};
              record.estUsd = stats.llm?.estUsd ?? null;
              record.llmCalls = stats.llm?.calls ?? null;
              record.truncationRetries = stats.llm?.truncationRetries ?? null;
              record.docsAnalyzed = stats.docsAnalyzed ?? null;
              if (stats.reduce) {
                record.reduce = {
                  groupsTotal: stats.reduce.groupsTotal,
                  groupsFed: stats.reduce.groupsFed,
                  eventsPerVote: stats.reduce.eventsPerVote,
                  droppedGidRefs: stats.reduce.droppedGidRefs,
                };
              }
              const cites = (await sql.query(
                `SELECT rd.adapter, count(*)::int AS edges, count(DISTINCT cs.raw_document_id)::int AS docs
                 FROM claim_sources cs
                 JOIN claims cl ON cl.id = cs.claim_id
                 JOIN raw_documents rd ON rd.id = cs.raw_document_id
                 WHERE cl.digest_id = $1 GROUP BY rd.adapter`,
                [gen.digestId],
              )) as Array<{ adapter: string; edges: number; docs: number }>;
              const edgeTotal = cites.reduce((s, r) => s + r.edges, 0);
              const xEdges = cites.find((r) => r.adapter === "x_api")?.edges ?? 0;
              record.citationEdges = edgeTotal;
              record.distinctDocsCited = cites.reduce((s, r) => s + r.docs, 0);
              record.xShare = edgeTotal > 0 ? xEdges / edgeTotal : 0;

              // claim texts for the #28 reproducibility analysis (offline)
              const claimRows = (await sql.query(
                `SELECT cl.text, cl.hedging,
                        array_agg(cs.raw_document_id ORDER BY cs.raw_document_id) AS doc_ids
                 FROM claims cl JOIN claim_sources cs ON cs.claim_id = cl.id
                 WHERE cl.digest_id = $1 GROUP BY cl.id ORDER BY cl.id`,
                [gen.digestId],
              )) as Array<{ text: string; hedging: string; doc_ids: number[] }>;
              record.claimDetail = claimRows.map((r) => ({
                text: r.text,
                hedging: r.hedging,
                docIds: r.doc_ids,
              }));

              // validate THIS roll against ISW (majority matcher)
              const val = await validateDigest(theater, day);
              if ("error" in val) {
                record.validation = { error: val.error };
              } else {
                record.validation = {
                  coveragePct: val.coveragePct,
                  unsupportedRate: val.thinSourcedRate,
                  timelinessHours: val.timelinessHours,
                  agreements: val.agreements,
                  iswOnly: val.iswOnly,
                  oursOnly: val.oursOnly,
                };
              }
            }
          } catch (e) {
            record.outcome = "error";
            record.error = e instanceof Error ? e.message.slice(0, 500) : String(e);
          }
          record.wallMs = Date.now() - t0;
          appendFileSync(RESULTS, JSON.stringify(record) + "\n");
          done.add(key);
          n++;
          console.log(
            `[${n}/${total}] ${key} -> ${record.outcome}` +
              (record.outcome === "ok"
                ? ` events=${record.events} claims=${record.claims} cov=${(record.validation as { coveragePct?: number })?.coveragePct ?? "?"} $${Number(record.estUsd ?? 0).toFixed(4)} (${Math.round((record.wallMs as number) / 1000)}s)`
                : record.error
                  ? ` ${record.error}`
                  : ""),
          );
        }
      }
    }
  }
  console.log("A/B sweep complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

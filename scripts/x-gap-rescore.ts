import "./env";

// Bounded map/regenerate/revalidate operator for the X historical recovery
// (OPEN-TASKS #38; prompt docs/prompts/2026-07-13-x-gap-catchup-rescore.md §4).
// Pure gates + matrix live in src/lib/analysis/gap-rescore.ts (unit tested).
//
// DEFAULT IS READ-ONLY: snapshots before-state to gitignored data/outbox/ and
// prints the plan — no route calls, no paid work, no writes outside the outbox.
// --apply (operator approval required) is REFUSED unless the matching X recovery
// checkpoint is globally complete AND --ack-workstreams-be confirms the
// private-beta publication guard (B) and entity canonicalization (E) are
// deployed. All LLM work runs on the DEPLOYED Vercel routes (map -> digest ->
// validate, serially): the deployed mapreduce engine, K=5 votes, the shared
// persist path and its publication/overwrite guards apply by construction.
// FORCE_REGEN is never set — empty/thin overwrite refusals are REPORTED, not
// overridden. Validation is military-only (ru/ua vs ROCA, ir vs Iran Update);
// a missing same-day ISW report is recorded as PENDING, never a failure. This
// script never sends digest email (that is scripts/email-digest.ts, untouched).
//
//   npx tsx scripts/x-gap-rescore.ts --from-date 2026-07-09 --to-date 2026-07-13 \
//     --budget-map-usd 2 --budget-reduce-usd 2
//   ... --apply --ack-workstreams-be    DO NOT RUN WITHOUT OPERATOR APPROVAL
//       (runbook: docs/reviews/X-GAP-RECOVERY-RUNBOOK-2026-07-13.md)
//
// Options: --checkpoint-key (default derived from the range: <from>_<to+1d>),
//          --base (default https://bnow-net.vercel.app), --out (outbox dir).

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";
import type { GapCheckpoint } from "../src/lib/adapters/x-gap-backfill";
import { gapCheckpointProvider } from "../src/lib/adapters/x-gap-backfill";
import {
  applyRefusal,
  classifyValidation,
  rescoreMatrix,
  RESCORE_VALIDATION_COUNTRIES,
  type MatrixCell,
} from "../src/lib/analysis/gap-rescore";
import { utcDayRange } from "../src/lib/time/day-boundary";
import { driveMapBackfill } from "./map-backfill";

type Row = Record<string, unknown>;
type Query = (text: string, params?: unknown[]) => Promise<Row[]>;

function argVal(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function nextUtcDay(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ---------- snapshots (read-only) ----------

async function snapshot(q: Query, fromDate: string, toDate: string, checkpointProvider: string) {
  const fromTs = `${fromDate}T00:00:00Z`;
  const toTsExcl = `${nextUtcDay(toDate)}T00:00:00Z`;
  const [providerUsage, xDocsByDayTheater, docClaimsByDay, digests, validation, providerState] =
    await Promise.all([
      q(
        `SELECT provider, sum(requests)::int AS requests, sum(units)::int AS units,
                round(sum(est_usd)::numeric, 4)::float AS est_usd
         FROM provider_usage
         WHERE provider IN ('x_api','openai_map','openai_reduce','openai_digest')
         GROUP BY provider ORDER BY provider`,
      ),
      q(
        `SELECT to_char(published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
                country_iso2 AS theater, count(*)::int AS docs
         FROM raw_documents
         WHERE adapter = 'x_api' AND published_at >= $1::timestamptz AND published_at < $2::timestamptz
         GROUP BY 1, 2 ORDER BY 1, 2`,
        [fromTs, toTsExcl],
      ),
      q(
        `SELECT to_char(dc.claim_date, 'YYYY-MM-DD') AS day, rd.country_iso2 AS theater,
                dc.track, count(*)::int AS claims
         FROM doc_claims dc JOIN raw_documents rd ON rd.id = dc.raw_document_id
         WHERE dc.claim_date >= $1::date AND dc.claim_date <= $2::date
         GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`,
        [fromDate, toDate],
      ),
      q(
        `SELECT d.id, c.iso2, d.track, to_char(d.digest_date, 'YYYY-MM-DD') AS date,
                d.provider, d.created_at::text AS created_at,
                (SELECT count(*)::int FROM claims cl WHERE cl.digest_id = d.id) AS claims
         FROM digests d JOIN countries c ON c.id = d.country_id
         WHERE d.digest_date >= $1::date AND d.digest_date <= $2::date
           AND c.iso2 = ANY($3::text[])
         ORDER BY c.iso2, d.track, d.digest_date`,
        [fromDate, toDate, [...RESCORE_VALIDATION_COUNTRIES]],
      ),
      q(
        `SELECT vr.id, c.iso2, to_char(d.digest_date, 'YYYY-MM-DD') AS date,
                vr.coverage_pct, vr.unsupported_claim_rate, vr.timeliness_hours,
                vr.run_at::text AS run_at
         FROM validation_runs vr
         JOIN digests d ON d.id = vr.digest_id
         JOIN countries c ON c.id = d.country_id
         WHERE d.digest_date >= $1::date AND d.digest_date <= $2::date
         ORDER BY c.iso2, d.digest_date, vr.id`,
        [fromDate, toDate],
      ),
      q(
        `SELECT provider, state, updated_at::text AS updated_at
         FROM provider_state WHERE provider IN ('x_api', $1)`,
        [checkpointProvider],
      ),
    ]);
  return {
    range: { fromDate, toDate },
    providerUsage,
    xDocsByDayTheater,
    docClaimsByDay,
    digests,
    validation,
    liveWatermark: providerState.find((r) => r.provider === "x_api") ?? null,
    recoveryCheckpoint: providerState.find((r) => r.provider === checkpointProvider) ?? null,
  };
}

type Snapshot = Awaited<ReturnType<typeof snapshot>>;

// ---------- deployed-route client ----------

async function callRoute(base: string, secret: string, path: string): Promise<Row> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 850_000);
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: ctrl.signal,
    });
    const body = (await res.json()) as Row;
    if (!res.ok || body.ok !== true) {
      throw new Error(`${path} -> ${res.status}: ${String(body.error ?? "").slice(0, 300)}`);
    }
    return body;
  } finally {
    clearTimeout(t);
  }
}

// ---------- report ----------

interface DigestCallResult {
  date: string;
  cell: MatrixCell;
  outcome: "regenerated" | "refused" | "error" | "skipped_budget" | "no_result";
  detail?: string;
}

interface ValidationCallResult {
  date: string;
  country: string;
  outcome: "ok" | "pending" | "failed";
  detail?: string;
}

function indexBy<T extends Row>(rows: T[], key: (r: T) => string): Map<string, T> {
  return new Map(rows.map((r) => [key(r), r]));
}

function renderResultMd(input: {
  args: Record<string, unknown>;
  gate: string | null;
  applied: boolean;
  before: Snapshot;
  after: Snapshot | null;
  mapResult: { estTotal: number; actualTotal: number; aborted?: string } | null;
  digestCalls: DigestCallResult[];
  validationCalls: ValidationCallResult[];
  cronRuns: Row[];
}): string {
  const { before, after } = input;
  const L: string[] = [];
  L.push(`# X gap rescore — ${input.args.fromDate}..${input.args.toDate}`);
  L.push("");
  L.push(`- mode: ${input.applied ? "**APPLY**" : "dry run (read-only)"}`);
  L.push(`- args: \`${JSON.stringify(input.args)}\``);
  if (input.gate) L.push(`- apply gate: **REFUSED** — ${input.gate}`);
  L.push("");

  L.push(`## Spend (provider_usage totals, before -> after)`);
  const afterUsage = after ? indexBy(after.providerUsage, (r) => String(r.provider)) : null;
  for (const b of before.providerUsage) {
    const a = afterUsage?.get(String(b.provider));
    const delta = a ? (Number(a.est_usd) - Number(b.est_usd)).toFixed(4) : "n/a";
    L.push(
      `- ${b.provider}: $${b.est_usd} -> ${a ? `$${a.est_usd}` : "(no after snapshot)"} (delta $${delta})`,
    );
  }
  L.push("");

  if (input.mapResult) {
    L.push(`## Map stage`);
    L.push(
      `- modelled $${input.mapResult.estTotal.toFixed(4)}, actual $${input.mapResult.actualTotal.toFixed(4)}` +
        (input.mapResult.aborted ? ` — **ABORTED: ${input.mapResult.aborted}**` : ""),
    );
    L.push("");
  }

  if (input.digestCalls.length) {
    L.push(`## Digest regeneration (deployed engine, shared persist path, no FORCE_REGEN)`);
    for (const d of input.digestCalls) {
      L.push(`- ${d.date} ${d.cell.country}/${d.cell.track}: ${d.outcome}${d.detail ? ` — ${d.detail}` : ""}`);
    }
    L.push("");
  }

  if (input.validationCalls.length) {
    L.push(`## Validation (military only; missing ISW reference = pending)`);
    for (const v of input.validationCalls) {
      L.push(`- ${v.date} ${v.country}: ${v.outcome}${v.detail ? ` — ${v.detail}` : ""}`);
    }
    L.push("");
  }

  L.push(`## X docs by day/theater (before -> after)`);
  const afterDocs = after ? indexBy(after.xDocsByDayTheater, (r) => `${r.day}|${r.theater}`) : null;
  const seen = new Set<string>();
  for (const b of before.xDocsByDayTheater) {
    const k = `${b.day}|${b.theater}`;
    seen.add(k);
    const a = afterDocs?.get(k);
    L.push(`- ${b.day} ${b.theater}: ${b.docs} -> ${a ? a.docs : "?"}`);
  }
  if (after) {
    for (const a of after.xDocsByDayTheater) {
      const k = `${a.day}|${a.theater}`;
      if (!seen.has(k)) L.push(`- ${a.day} ${a.theater}: 0 -> ${a.docs} (new)`);
    }
  }
  L.push("");

  L.push(`## Digests (claims before -> after; created_at change = regenerated)`);
  const afterDigests = after
    ? indexBy(after.digests, (r) => `${r.iso2}|${r.track}|${r.date}`)
    : null;
  for (const b of before.digests) {
    const a = afterDigests?.get(`${b.iso2}|${b.track}|${b.date}`);
    const regen = a && a.created_at !== b.created_at ? " (regenerated)" : "";
    L.push(`- ${b.date} ${b.iso2}/${b.track}: claims ${b.claims} -> ${a ? a.claims : "?"}${regen}`);
  }
  L.push("");

  L.push(`## Validation metrics (coverage_pct before -> after)`);
  const afterVal = after ? indexBy(after.validation, (r) => `${r.iso2}|${r.date}`) : null;
  for (const b of before.validation) {
    const a = afterVal?.get(`${b.iso2}|${b.date}`);
    L.push(
      `- ${b.date} ${b.iso2}: coverage ${b.coverage_pct} -> ${a ? a.coverage_pct : "?"}, ` +
        `unsupported ${b.unsupported_claim_rate} -> ${a ? a.unsupported_claim_rate : "?"}`,
    );
  }
  L.push("");

  if (input.cronRuns.length) {
    L.push(`## Cron runs recorded during this rescore`);
    for (const r of input.cronRuns) {
      L.push(`- #${r.id} ${r.job} ok=${r.ok} counts=${JSON.stringify(r.counts).slice(0, 200)}`);
    }
    L.push("");
  }

  L.push(`## Residual risks / notes`);
  L.push(`- Overwrite/publication-guard refusals above are DELIBERATE (ruling 17/19); review before any FORCE_REGEN decision (operator-only, manual).`);
  L.push(`- "pending" validations need a later rerun once ISW publishes (validate cron also self-heals at 07:00 UTC).`);
  L.push(`- The live x_api watermark is never written by this script; steady-state polls continue on their own schedule.`);
  return L.join("\n");
}

// ---------- main ----------

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const ack = args.includes("--ack-workstreams-be");
  const fromDate = argVal(args, "--from-date");
  const toDate = argVal(args, "--to-date");
  const budgetMapUsd = Number(argVal(args, "--budget-map-usd"));
  const budgetReduceUsd = Number(argVal(args, "--budget-reduce-usd"));

  if (
    !fromDate || !toDate || !DATE_RE.test(fromDate) || !DATE_RE.test(toDate) ||
    !Number.isFinite(budgetMapUsd) || budgetMapUsd <= 0 ||
    !Number.isFinite(budgetReduceUsd) || budgetReduceUsd <= 0
  ) {
    console.error(
      "usage: npx tsx scripts/x-gap-rescore.ts --from-date YYYY-MM-DD --to-date YYYY-MM-DD\n" +
        "       --budget-map-usd <n> --budget-reduce-usd <n>\n" +
        "       [--apply --ack-workstreams-be] [--checkpoint-key <k>] [--base <url>] [--out <dir>]",
    );
    process.exit(2);
  }
  const days = utcDayRange(fromDate, toDate);
  if (days.length === 0) {
    console.error("--from-date must not be after --to-date");
    process.exit(2);
  }
  const checkpointKey = argVal(args, "--checkpoint-key") ?? `${fromDate}_${nextUtcDay(toDate)}`;
  const checkpointProvider = gapCheckpointProvider(checkpointKey);
  const base = argVal(args, "--base") ?? process.env.MAP_BACKFILL_BASE ?? "https://bnow-net.vercel.app";

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const sql = neon(process.env.DATABASE_URL);
  const q: Query = (text, params) => sql.query(text, params ?? []) as Promise<Row[]>;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir =
    argVal(args, "--out") ?? join("data", "outbox", `x-gap-rescore-${fromDate}_${toDate}-${stamp}`);
  mkdirSync(outDir, { recursive: true });

  const matrix = rescoreMatrix();
  const argRecord = { fromDate, toDate, budgetMapUsd, budgetReduceUsd, checkpointKey, base, apply };
  console.log(`x-gap-rescore ${JSON.stringify(argRecord)}`);
  console.log(`matrix: ${matrix.map((c) => `${c.country}/${c.track}`).join(", ")} x ${days.length} days`);
  console.log(`outbox: ${outDir}`);

  // -- before snapshot (always; reads only) --
  const dbStart = (await q(`SELECT now()::text AS now`))[0].now as string;
  const before = await snapshot(q, fromDate, toDate, checkpointProvider);
  writeFileSync(join(outDir, "before.json"), JSON.stringify(before, null, 2));
  console.log(`before.json written (${before.digests.length} digests, ${before.validation.length} validation runs in range)`);

  // -- apply gate --
  const cpState = before.recoveryCheckpoint?.state as GapCheckpoint | undefined;
  const gate = applyRefusal({
    apply,
    ackWorkstreamsBE: ack,
    checkpoint: cpState ?? null,
    fromDate,
    toDate,
  });

  const digestCalls: DigestCallResult[] = [];
  const validationCalls: ValidationCallResult[] = [];
  let mapResult: { estTotal: number; actualTotal: number; aborted?: string } | null = null;
  let after: Snapshot | null = null;
  let cronRuns: Row[] = [];

  if (!apply) {
    console.log(
      "\nDRY RUN — nothing mutated, no paid calls. Apply gate would " +
        (applyRefusal({ apply: true, ackWorkstreamsBE: ack, checkpoint: cpState ?? null, fromDate, toDate }) ??
          "PASS") +
        "\nRerun with --apply --ack-workstreams-be after operator approval (runbook).",
    );
  } else if (gate) {
    console.error(`\nREFUSED: ${gate}`);
  } else {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      console.error("CRON_SECRET not set — cannot drive the deployed routes");
      process.exit(1);
    }

    // -- stage 1: drain the map for the window (estimate-first, oldest-first) --
    console.log(`\n== stage 1: map drain ${fromDate}..${toDate} (budget $${budgetMapUsd}) ==`);
    mapResult = await driveMapBackfill({
      base,
      secret,
      from: fromDate,
      to: toDate,
      budgetUsd: budgetMapUsd,
      apply: true,
    });
    if (mapResult.aborted) {
      console.error(`map stage aborted: ${mapResult.aborted} — stopping before digest regeneration`);
    } else {
      // -- stage 2: regenerate the digest matrix serially, reduce-budget-bounded --
      console.log(`\n== stage 2: digest regeneration (budget $${budgetReduceUsd}) ==`);
      const reduceSpend = async () =>
        Number(
          (
            await q(
              `SELECT coalesce(sum(est_usd), 0)::float AS usd FROM provider_usage
               WHERE provider IN ('openai_reduce','openai_digest')`,
            )
          )[0].usd,
        );
      const reduceBase = await reduceSpend();
      outer: for (const date of days) {
        for (const cell of matrix) {
          const spent = (await reduceSpend()) - reduceBase;
          if (spent >= budgetReduceUsd) {
            console.error(
              `reduce budget exhausted ($${spent.toFixed(4)} >= $${budgetReduceUsd}) — remaining cells skipped`,
            );
            for (const d2 of days.slice(days.indexOf(date))) {
              for (const c2 of matrix) {
                if (d2 === date && matrix.indexOf(c2) < matrix.indexOf(cell)) continue;
                digestCalls.push({ date: d2, cell: c2, outcome: "skipped_budget" });
              }
            }
            break outer;
          }
          try {
            const body = await callRoute(
              base,
              secret,
              `/api/cron/digest?date=${date}&country=${cell.country}&track=${cell.track}`,
            );
            const results = (body.results ?? []) as Row[];
            const errors = results.filter((r) => "error" in r);
            const refused = results.filter((r) => "skipped" in r);
            const outcome: DigestCallResult["outcome"] = errors.length
              ? "error"
              : refused.length
                ? "refused"
                : results.length
                  ? "regenerated"
                  : "no_result";
            const detail = errors.length
              ? String(errors[0].error).slice(0, 200)
              : refused.length
                ? String(refused[0].skipped).slice(0, 200)
                : undefined;
            digestCalls.push({ date, cell, outcome, detail });
            console.log(`${date} ${cell.country}/${cell.track}: ${outcome}${detail ? ` — ${detail}` : ""}`);
          } catch (e) {
            const detail = e instanceof Error ? e.message : String(e);
            digestCalls.push({ date, cell, outcome: "error", detail });
            console.error(`${date} ${cell.country}/${cell.track}: route error — ${detail}`);
          }
        }
      }

      // -- stage 3: validate military digests (ru/ua vs ROCA, ir vs Iran Update) --
      console.log(`\n== stage 3: validation ==`);
      for (const date of days) {
        for (const country of RESCORE_VALIDATION_COUNTRIES) {
          try {
            const body = await callRoute(base, secret, `/api/cron/validate?date=${date}&country=${country}`);
            const result = ((body.results ?? []) as Row[])[0] ?? {};
            const outcome = classifyValidation(result);
            const detail =
              outcome === "ok"
                ? `coverage ${result.coveragePct ?? "?"}%`
                : String(result.error ?? "").slice(0, 200);
            validationCalls.push({ date, country, outcome, detail });
            console.log(`${date} ${country}: ${outcome} — ${detail}`);
          } catch (e) {
            const detail = e instanceof Error ? e.message : String(e);
            validationCalls.push({ date, country, outcome: "failed", detail });
            console.error(`${date} ${country}: route error — ${detail}`);
          }
        }
      }
    }

    // -- after snapshot + cron run ids --
    after = await snapshot(q, fromDate, toDate, checkpointProvider);
    writeFileSync(join(outDir, "after.json"), JSON.stringify(after, null, 2));
    cronRuns = await q(
      `SELECT id, job, started_at::text AS started_at, finished_at::text AS finished_at, ok, counts
       FROM cron_runs
       WHERE started_at >= $1::timestamptz AND job IN ('map:backfill', 'digest', 'validate')
       ORDER BY id`,
      [dbStart],
    );
  }

  const md = renderResultMd({
    args: argRecord,
    gate: apply ? gate : null,
    applied: apply && !gate,
    before,
    after,
    mapResult,
    digestCalls,
    validationCalls,
    cronRuns,
  });
  writeFileSync(join(outDir, "result.md"), md);
  console.log(`\nresult.md written -> ${join(outDir, "result.md")}`);

  if (apply && gate) process.exit(1);
  if (mapResult?.aborted) process.exit(1);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);

// MR sprint 3 TASK 3 — evaluate the A/B gate from MR3-AB-RESULTS.jsonl.
// Pure file computation; no DB, no LLM. Prints per-arm aggregates, the per-cell
// coverage table, the #28 reproducibility metric, and the gate verdict.
//   npx tsx scripts/ab-report.ts [path=docs/reviews/MR3-AB-RESULTS.jsonl]

import { readFileSync } from "node:fs";
import { claimTokens } from "../src/lib/analysis/reduce";

interface Sample {
  key: string;
  day: string;
  theater: string;
  arm: "legacy" | "mapreduce";
  k: number;
  outcome: string;
  events?: number;
  claims?: number;
  estUsd?: number | null;
  docsAnalyzed?: number | null;
  distinctDocsCited?: number;
  citationEdges?: number;
  xShare?: number;
  claimDetail?: Array<{ text: string; hedging: string; docIds: number[] }>;
  validation?: {
    coveragePct?: number | null;
    unsupportedRate?: number | null;
    timelinessHours?: number | null;
    agreements?: number;
    iswOnly?: number;
    oursOnly?: number;
    error?: string;
  };
}

const path = process.argv[2] ?? "docs/reviews/MR3-AB-RESULTS.jsonl";
const samples: Sample[] = readFileSync(path, "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const sd = (xs: number[]) => {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};
const fmt = (x: number, d = 2) => (Number.isNaN(x) ? "—" : x.toFixed(d));

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** #28 claim-level reproducibility: for one cell's runs, the mean fraction of
 *  run-i claims that have a token-jaccard>=0.5 match in run j (all ordered
 *  pairs). 1 = every roll reproduces every claim. */
function reproducibility(runs: Sample[]): number {
  const claimSets = runs
    .filter((r) => r.claimDetail && r.claimDetail.length > 0)
    .map((r) => r.claimDetail!.map((c) => claimTokens(c.text)));
  if (claimSets.length < 2) return NaN;
  const fracs: number[] = [];
  for (let i = 0; i < claimSets.length; i++) {
    for (let j = 0; j < claimSets.length; j++) {
      if (i === j) continue;
      let matched = 0;
      for (const ci of claimSets[i]) {
        if (claimSets[j].some((cj) => jaccard(ci, cj) >= 0.5)) matched++;
      }
      fracs.push(matched / claimSets[i].length);
    }
  }
  return mean(fracs);
}

const ok = samples.filter((s) => s.outcome === "ok");
const errors = samples.filter((s) => s.outcome === "error");
console.log(
  `${samples.length} samples (${ok.length} ok, ${errors.length} error, ${samples.length - ok.length - errors.length} null/skip)`,
);
if (errors.length) {
  for (const e of errors.slice(0, 8)) console.log(`  ERROR ${e.key}: ${(e as { error?: string }).error}`);
}

// per-cell (day, theater, arm) aggregates
interface Cell {
  day: string;
  theater: string;
  arm: string;
  coverages: number[];
  covSd: number;
  repro: number;
}
const cells = new Map<string, Sample[]>();
for (const s of ok) {
  const key = `${s.day}|${s.theater}|${s.arm}`;
  cells.set(key, [...(cells.get(key) ?? []), s]);
}
const cellRows: Cell[] = [];
for (const [key, runs] of cells) {
  const [day, theater, arm] = key.split("|");
  const coverages = runs
    .map((r) => r.validation?.coveragePct)
    .filter((c): c is number => typeof c === "number");
  cellRows.push({ day, theater, arm, coverages, covSd: sd(coverages), repro: reproducibility(runs) });
}

function armStats(arm: "legacy" | "mapreduce") {
  const rows = ok.filter((s) => s.arm === arm);
  const cov = rows
    .map((r) => r.validation?.coveragePct)
    .filter((c): c is number => typeof c === "number");
  const unsupported = rows
    .map((r) => r.validation?.unsupportedRate)
    .filter((c): c is number => typeof c === "number");
  const armCells = cellRows.filter((c) => c.arm === arm);
  const cellSds = armCells.map((c) => c.covSd).filter((x) => !Number.isNaN(x));
  const repros = armCells.map((c) => c.repro).filter((x) => !Number.isNaN(x));
  return {
    n: rows.length,
    covMean: mean(cov),
    covSdWithinCell: mean(cellSds),
    unsupportedMean: mean(unsupported),
    claims: mean(rows.map((r) => r.claims ?? 0)),
    events: mean(rows.map((r) => r.events ?? 0)),
    distinctDocs: mean(rows.map((r) => r.distinctDocsCited ?? 0)),
    xShare: mean(rows.map((r) => r.xShare ?? 0)),
    usd: mean(rows.map((r) => Number(r.estUsd ?? 0))),
    repro: mean(repros),
    timeliness: mean(
      rows
        .map((r) => r.validation?.timelinessHours)
        .filter((c): c is number => typeof c === "number"),
    ),
  };
}

const L = armStats("legacy");
const M = armStats("mapreduce");
console.log("\nmetric                      legacy      mapreduce");
console.log(`samples ok                  ${String(L.n).padEnd(11)} ${M.n}`);
console.log(`coverage mean %             ${fmt(L.covMean).padEnd(11)} ${fmt(M.covMean)}`);
console.log(`coverage within-cell SD     ${fmt(L.covSdWithinCell).padEnd(11)} ${fmt(M.covSdWithinCell)}`);
console.log(`unsupported-claim rate      ${fmt(L.unsupportedMean, 3).padEnd(11)} ${fmt(M.unsupportedMean, 3)}`);
console.log(`claims / digest             ${fmt(L.claims, 1).padEnd(11)} ${fmt(M.claims, 1)}`);
console.log(`events / digest             ${fmt(L.events, 1).padEnd(11)} ${fmt(M.events, 1)}`);
console.log(`distinct docs cited         ${fmt(L.distinctDocs, 1).padEnd(11)} ${fmt(M.distinctDocs, 1)}`);
console.log(`x-share of citation edges   ${fmt(L.xShare, 3).padEnd(11)} ${fmt(M.xShare, 3)}`);
console.log(`LLM cost / digest $         ${fmt(L.usd, 4).padEnd(11)} ${fmt(M.usd, 4)}`);
console.log(`repro (#28, claim-level)    ${fmt(L.repro, 3).padEnd(11)} ${fmt(M.repro, 3)}`);
console.log(`info-lead hours (median-ish)${fmt(L.timeliness, 1).padEnd(11)} ${fmt(M.timeliness, 1)}`);

// per-theater coverage
console.log("\nper-theater coverage mean (legacy vs mapreduce):");
for (const th of ["ru", "ua", "ir"]) {
  const l = ok.filter((s) => s.arm === "legacy" && s.theater === th)
    .map((r) => r.validation?.coveragePct).filter((c): c is number => typeof c === "number");
  const m = ok.filter((s) => s.arm === "mapreduce" && s.theater === th)
    .map((r) => r.validation?.coveragePct).filter((c): c is number => typeof c === "number");
  console.log(`  ${th}: ${fmt(mean(l))} vs ${fmt(mean(m))}  (n=${l.length}/${m.length})`);
}

// the gate
const gate = {
  coverage: M.covMean >= L.covMean,
  unsupported: M.unsupportedMean <= L.unsupportedMean,
  variance: M.covSdWithinCell <= L.covSdWithinCell,
};
console.log("\nGATE:");
console.log(`  coverage    mapreduce >= legacy : ${gate.coverage ? "PASS" : "FAIL"}`);
console.log(`  unsupported mapreduce <= legacy : ${gate.unsupported ? "PASS" : "FAIL"}`);
console.log(`  variance    mapreduce <= legacy : ${gate.variance ? "PASS" : "FAIL"}`);
console.log(
  gate.coverage && gate.unsupported && gate.variance
    ? "  => GATE PASSES"
    : "  => GATE FAILS — do not cut over; write the honest diagnosis",
);

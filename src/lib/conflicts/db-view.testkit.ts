// TEST-ONLY builders for the DB-backed conflict view.
//
// NOT production code and NOT reachable from any of it: it reads the committed
// golden results — a FIXTURE artifact — so importing it from a page or from
// `db-product-view.ts` would smuggle the synthetic corpus back into the real
// surfaces' module graph, which is precisely what ruling 3 forbids here.
// `db-product-view.test.ts` scans the tree and fails if any non-test file
// imports this module (the `.testkit.ts` suffix is what makes that scan exact);
// vitest's own `include` never collects it as a suite.
//
// Why the goldens and not a hand-written literal: `ConflictScoredResultV1` is a
// large, heavily-validated shape, and the observation store re-runs the full
// identity + persistability + prose audit on every read. A hand-built stub
// would drift from the real contract silently; a golden cannot.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ConflictScoredResultV1 } from "./eval-profile";
import { GOLDEN_RESULTS_FILE } from "./goldens";
import { UNIT_FLAGS_VERSION } from "./unit-flags";
import type { StoredConflictObservation } from "./observation-store";
import type { ConflictId, ReferenceSeriesId } from "./vocabulary";

/** The only KEYWORD-rung scored golden — the rung the live pipeline actually
 *  produces today, and the one the observation integration test retargets. */
export const KEYWORD_GOLDEN = "cc-matcher-failclosed-013b#B-zero-valid-rounds" as const;

/** A scored Iran golden carrying a legacy-only matched takeaway (memo C8). */
export const IRAN_LEGACY_GOLDEN = "iran-gulf-unavailable-010b" as const;

export function goldenResult(key: string): ConflictScoredResultV1 {
  const goldens = JSON.parse(
    readFileSync(join(process.cwd(), GOLDEN_RESULTS_FILE), "utf8"),
  ) as Record<string, unknown>;
  const raw = goldens[key];
  if (raw === undefined) throw new Error(`no golden result ${key}`);
  return JSON.parse(JSON.stringify(raw)) as ConflictScoredResultV1;
}

/** A scored result retargeted at one (series, day, label) edition, in the shape
 *  the LIVE path could actually have produced.
 *
 *  Two transforms, both deliberate: the report identity moves to the named
 *  edition, and a `fixture-oracle` matcher stamp is rewritten to the KEYWORD
 *  rung — `persistObservation` refuses a fixture-oracle result outright
 *  (observation-store.ts:262-267), so a stored observation can never carry one
 *  and a test that pretended otherwise would be testing an impossible row.
 *  Every verdict, headline and version stamp is left exactly as the scorer
 *  emitted it. */
export function resultForEdition(
  goldenKey: string,
  series: ReferenceSeriesId,
  reportDate: string,
  label: string,
): ConflictScoredResultV1 {
  const r = goldenResult(goldenKey);
  const editionKey = `${series}:${reportDate}:${label}`;
  r.report.series = series;
  r.report.reportDate = reportDate;
  r.report.editionKey = editionKey;
  if (r.window) r.window.reportDate = reportDate;
  if (r.matcherRung === "fixture-oracle") {
    r.matcherRung = "keyword";
    r.matcher = {
      kind: "llm-compatible",
      label: "keyword",
      model: null,
      votesK: 5,
      corpusRecall: { label: "keyword", voteRounds: null },
      publishedRetention: { label: "keyword", voteRounds: null },
    };
  }
  r.runGroupKey = [
    r.conflictId,
    editionKey,
    r.evaluationKind,
    r.methodologyEpoch,
    r.matcher?.kind ?? r.matcherRung,
    `k=${r.matcher?.votesK ?? 0}`,
  ].join("|");
  return r;
}

export interface StoredObservationOverrides {
  id?: number;
  referenceEditionId?: number;
  unitFlagsVersion?: string;
  gazetteerVersion?: string;
  cronRunId?: number | null;
  observedAt?: string;
}

/** A `StoredConflictObservation` exactly as `latestObservationsFor` returns it,
 *  including the derived headline. */
export function storedObservation(
  result: ConflictScoredResultV1,
  overrides: StoredObservationOverrides = {},
): StoredConflictObservation {
  return {
    id: overrides.id ?? 1,
    conflictId: result.conflictId as ConflictId,
    referenceEditionId: overrides.referenceEditionId ?? 1,
    series: result.report.series,
    reportDate: result.report.reportDate,
    editionKey: result.report.editionKey,
    matcherRung: result.matcherRung as StoredConflictObservation["matcherRung"],
    runGroupKey: result.runGroupKey ?? "",
    unitFlagsVersion: overrides.unitFlagsVersion ?? UNIT_FLAGS_VERSION,
    gazetteerVersion: overrides.gazetteerVersion ?? "ru-ua-v1",
    cronRunId: overrides.cronRunId ?? null,
    observedAt: overrides.observedAt ?? `${result.report.reportDate}T12:00:00.000Z`,
    headline: {
      corpusRecall: result.headline.corpusRecall,
      publishedRetention: result.headline.publishedRetention,
    },
    result,
  };
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** The REAL provider URL shape for a (series, day, label), so a seeded row
 *  survives `parseEditionRecord`'s cross-check that the canonical URL
 *  normalizes back to the row's own edition key (editions.ts:423-436). A
 *  hand-waved URL would make every seeded edition unreadable. */
export function canonicalUrlFor(
  series: ReferenceSeriesId,
  reportDate: string,
  label: string,
): string {
  const [y, m, d] = reportDate.split("-");
  const slugDay = `${MONTHS[Number(m) - 1]}-${Number(d)}-${y}`;
  if (series === "roca") {
    return `https://understandingwar.org/research/russia-ukraine/russian-offensive-campaign-assessment-${slugDay}/`;
  }
  const base = "https://understandingwar.org/research/middle-east";
  if (label === "plain") return `${base}/iran-update-${slugDay}/`;
  if (label === "special") return `${base}/iran-update-special-report-${slugDay}/`;
  return `${base}/iran-update-${label}-special-report-${slugDay}/`;
}

/** A `benchmark_report_editions` row shaped as `EDITION_SELECT` returns it, for
 *  a fake QueryFn feeding `SqlReferenceReportRepository`. */
export function editionRow(
  series: ReferenceSeriesId,
  reportDate: string,
  label: string,
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    series,
    provider: "isw",
    edition_key: `${series}:${reportDate}:${label}`,
    report_date: reportDate,
    canonical_url: canonicalUrlFor(series, reportDate, label),
    norm_version: "isw-edition-norm-v1",
    scope_version: series === "roca" ? "roca-scope-v1" : "iran-update-scope-v1",
    cutoff_at: null,
    published_at: null,
    cutoff_treatment: "missing",
    published_treatment: "missing",
    designated_final: null,
    parse_status: "pending",
    isw_report_id: null,
    derived: {},
    ...overrides,
  };
}

/** A `conflict_validation_observations` row shaped as `OBSERVATION_SELECT`
 *  returns it. `result` is a JSON STRING, the way a text-mode driver hands back
 *  jsonb, so a test that uses this exercises the store's real fail-closed parse
 *  rather than skipping it. */
export function observationRow(
  result: ConflictScoredResultV1,
  overrides: StoredObservationOverrides = {},
): Record<string, unknown> {
  return {
    id: overrides.id ?? 1,
    conflict_id: result.conflictId,
    reference_edition_id: overrides.referenceEditionId ?? 1,
    series: result.report.series,
    report_date: result.report.reportDate,
    edition_key: result.report.editionKey,
    matcher_rung: result.matcherRung,
    run_group_key: result.runGroupKey ?? "",
    unit_flags_version: overrides.unitFlagsVersion ?? UNIT_FLAGS_VERSION,
    gazetteer_version: overrides.gazetteerVersion ?? "ru-ua-v1",
    cron_run_id: overrides.cronRunId ?? null,
    observed_at: overrides.observedAt ?? `${result.report.reportDate}T12:00:00.000Z`,
    result: JSON.stringify(result),
  };
}

export interface FakeConflictDb {
  observations?: ReadonlyArray<Record<string, unknown>>;
  editions?: ReadonlyArray<Record<string, unknown>>;
  claims?: ReadonlyArray<Record<string, unknown>>;
  docs?: ReadonlyArray<Record<string, unknown>>;
}

/** A QueryFn that answers every statement the conflict surfaces issue, routed
 *  by the statement's own table. It honours the bound parameters (conflict id,
 *  report-date floor, series/day) so a page test exercises the REAL read path —
 *  `latestObservationsFor`'s fail-closed parse, `SqlReferenceReportRepository`'s
 *  row mapping and `selectDailyFinal` — instead of a mocked provider. */
export function fakeConflictQuery(db: FakeConflictDb = {}): {
  query: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;
  calls: Array<{ sql: string; params: unknown[] }>;
} {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.includes("conflict_validation_observations")) {
      return (db.observations ?? []).filter(
        (r) => r.conflict_id === params[0] && String(r.report_date) >= String(params[1]),
      ) as Array<Record<string, unknown>>;
    }
    if (sql.includes("benchmark_report_editions")) {
      return (db.editions ?? []).filter(
        (r) => r.series === params[0] && r.report_date === params[1],
      ) as Array<Record<string, unknown>>;
    }
    if (sql.includes("FROM claims cl")) return (db.claims ?? []) as Array<Record<string, unknown>>;
    if (sql.includes("claim_sources cs")) return (db.docs ?? []) as Array<Record<string, unknown>>;
    return [];
  };
  return { query, calls };
}

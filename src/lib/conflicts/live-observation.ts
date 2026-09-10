// The live conflict observation pipeline (PLAN-WS-3 §3.3b) — report-only and
// INERT: nothing imports this except the unscheduled conflict-validate route,
// and that route is deliberately absent from vercel.json.
//
// One (conflict, day) in, at most ONE observation row out:
//
//   editionsForDay -> selectDailyFinal (C4: discovery stores every edition, the
//   DAILY-FINAL WINNER is chosen here at scoring time) -> re-fetch the winner's
//   page -> extract declared units -> lane + flags + attribution -> assemble the
//   two evidence populations -> score -> persist.
//
// WHY THE PAGE IS RE-FETCHED. The edition row stores SIGNATURES ONLY (ordinal,
// sha256, canonical toponym/action keys) — standing ruling 1 keeps unit prose
// out of the column. The matcher needs the TEXT, so it is re-extracted here and
// stays transient, exactly as production `validateDigest` does it. The join back
// to what discovery saw is `sha256`, then `ordinal` — never the signature
// tokens, which are the very thing a gazetteer version change moves.
//
// WHAT NEVER HAPPENS HERE:
//   * ruling 1 — no reference prose is returned, counted or persisted. Unit text
//     lives in this function's frame and in the matcher prompt, and the
//     observation store re-audits the whole stored result on the way in.
//   * ruling 12 — dedup verdicts are untouched; this reads them, never writes.
//   * ruling 14 — the two corpora are never merged. Each source queries by the
//     def's theater set and the assemblies aggregate; there is no cross-theater
//     digest gather anywhere in this path.
//   * a gap is never fabricated. No edition -> no observation, recorded as a day
//     outcome. `persistObservation` refuses an unscored result outright.
//
// A NOTE ON `probe_failed`, because it is easy to misread (step 18's WS3-F01,
// OPEN-TASKS #114): today `probe_failed` means "discovery could not tell",
// NOT "the publisher did not publish" — a throttled 403 lands there just as a
// genuine absence does. This pipeline therefore never treats the absence of
// editions as evidence of anything: it records `no_editions` and moves on.

import { createHash } from "node:crypto";
import { politeFetch, type FetchResult } from "../fetch-cache";
import { normalizeUnitTextForHash } from "../isw/edition-discovery";
import type { QueryFn } from "../isw/load";
import { extractTakeawaysWithText } from "../validation/isw-extract";
import { gazetteerFor } from "../validation/gazetteer";
import { CONFLICT_REGISTRY_VERSION, type ConflictDefinition } from "./definitions";
import {
  DAILY_FINAL_POLICY,
  EDITION_NORMALIZATION_VERSION,
  selectDailyFinal,
  type ReferenceEditionRecord,
} from "./editions";
import {
  assembleCorpusRecallEvidence,
  assemblePublishedRetentionEvidence,
  type CorpusRecallClaimSource,
  type PublishedRetentionClaimSource,
} from "./evidence-assembler";
import { ConflictKeywordMatcher } from "./keyword-matcher";
import { createLiveMatcher, type LiveMatcherRefusal } from "./live-matcher";
import type { MatchableUnit } from "./match-contract";
import { persistObservation, type ConflictDispatchIdentity } from "./observation-store";
import type { ReferenceReportRepository } from "./reference-repo";
import { scoreConflictReport } from "./scorer";
import { UNIT_FLAGS_VERSION, deriveUnitFlags } from "./unit-flags";
import { unitAttributionMap } from "./unit-attribution";
import { classifyReferenceUnit } from "./unit-lanes";

export interface LiveObservationDeps {
  repo: ReferenceReportRepository;
  query: QueryFn;
  corpusSource: CorpusRecallClaimSource;
  retentionSource: PublishedRetentionClaimSource;
  /** distinct digests the retention source read, when it can report them */
  contributingDigestIds?: () => readonly number[];
  /** injectable for tests; production uses the disk-cached polite fetcher */
  fetch?: (url: string) => Promise<FetchResult | null>;
  /** ruling 10: the cron_runs row this observation belongs to */
  cronRunId?: number | null;
}

/** Why a (conflict, day) produced no observation. Every value is a bounded
 *  token safe to put in `cron_runs.counts` — none of them carries page content. */
export type ObservationSkip =
  | "no_editions"
  | "no_canonical_url"
  | "fetch_failed"
  | "no_units"
  | "edition_row_missing"
  | "evidence_unavailable";

export interface ObservationOutcome {
  conflictId: string;
  series: string;
  reportDate: string;
  /** the daily-final winner's key, when one was selected */
  editionKey: string | null;
  editionsSeen: number;
  units: number;
  observationId: number | null;
  matcherRung: string | null;
  /** why the paid rung did not run; null when it did */
  matcherRefusal: LiveMatcherRefusal | null;
  skipped: ObservationSkip | null;
}

function unitSha256(text: string): string {
  return createHash("sha256").update(normalizeUnitTextForHash(text)).digest("hex");
}

function skip(
  def: ConflictDefinition,
  day: string,
  editionsSeen: number,
  editionKey: string | null,
  reason: ObservationSkip,
  matcherRefusal: LiveMatcherRefusal | null = null,
): ObservationOutcome {
  return {
    conflictId: def.id,
    series: def.referenceSeries,
    reportDate: day,
    editionKey,
    editionsSeen,
    units: 0,
    observationId: null,
    matcherRung: null,
    matcherRefusal,
    skipped: reason,
  };
}

/** The winner's durable row id, resolved from its DOMAIN identity.
 *
 *  Step 18's WS3-F04 handoff is explicit: never pass a caller-chosen edition id
 *  to `persistObservation`. The observation's FK is what makes the row
 *  unambiguously about ONE edition, so the id is looked up by the same triple
 *  that identifies the edition everywhere else — `edition_key` (UNIQUE) plus
 *  `series` and `report_date`, so a key that somehow addressed another day's
 *  row would fail to resolve rather than mis-attribute an observation. */
async function editionRowId(
  query: QueryFn,
  edition: ReferenceEditionRecord,
): Promise<number | null> {
  const rows = await query(
    `SELECT id FROM benchmark_report_editions
      WHERE edition_key = $1 AND series = $2 AND report_date = $3::date`,
    [edition.identity.editionKey, edition.identity.series, edition.identity.reportDate],
  );
  const id = rows[0]?.id;
  if (id === undefined || id === null) return null;
  const n = Number(id);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * Observe ONE (conflict, day). Returns an outcome describing what happened;
 * throws only on a genuine defect (a repository refusal, a contradictory
 * edition set, an unscorable result) so the route's per-cell catch can degrade
 * the run under the #87 discipline. A day with nothing to score is NOT a defect.
 */
export async function observeConflictDay(
  deps: LiveObservationDeps,
  def: ConflictDefinition,
  day: string,
): Promise<ObservationOutcome> {
  const series = def.referenceSeries;
  const editions = await deps.repo.editionsForDay(series, day);
  if (editions.length === 0) return skip(def, day, 0, null, "no_editions");

  // C4: every edition is stored; the winner is chosen HERE, at scoring time,
  // and an older row is never mutated when a later edition wins tomorrow
  const selection = selectDailyFinal(editions);
  const winner = selection.selected;
  const editionKey = winner.identity.editionKey;
  if (winner.canonicalUrl === null) {
    return skip(def, day, editions.length, editionKey, "no_canonical_url");
  }

  const page = await (deps.fetch ?? politeFetch)(winner.canonicalUrl);
  if (page === null) return skip(def, day, editions.length, editionKey, "fetch_failed");

  const { transientTexts } = extractTakeawaysWithText(page.html);
  if (transientTexts.length === 0) {
    // a parse failure and an empty report are indistinguishable from here, so
    // neither becomes a scored zero (scorer.ts:494-502 refuses a unit-less
    // report for the same reason)
    return skip(def, day, editions.length, editionKey, "no_units");
  }

  const units: MatchableUnit[] = transientTexts.map((text, ordinal) => ({
    unitId: `u${ordinal}`,
    ordinal,
    text,
    lane: classifyReferenceUnit(def, text).lane,
    ...deriveUnitFlags(text),
  }));

  // C3: attribution, RECORDED — never a filter. Nothing below narrows the
  // evidence a unit may match against, and the denominator stays every declared
  // takeaway of the selected edition.
  const unitAttribution = unitAttributionMap(
    series,
    units.map((u) => ({ unitId: u.unitId, ordinal: u.ordinal, sha256: unitSha256(u.text) })),
    winner.derived.units ?? [],
  );

  // ONLY the allowlisted report keys — the assembler refuses a report object
  // carrying anything else, which is what keeps unit text structurally out of
  // eligibility (contract §5 anti-gaming freeze)
  const request = {
    conflictId: def.id,
    kind: "retrospective" as const,
    report: {
      series,
      editionKey,
      reportDate: winner.identity.reportDate,
      cutoffAt: winner.identity.cutoffAt,
      publishedAt: winner.identity.publishedAt,
    },
    snapshot: null,
  };

  const corpus = await assembleCorpusRecallEvidence(request, deps.corpusSource);
  const retention = await assemblePublishedRetentionEvidence(request, deps.retentionSource);
  if (corpus.status === "unavailable" || retention.status === "unavailable") {
    // an unavailable evaluation is not an observation — it has no matcher, no
    // window-end source and no run-group key, and persistObservation refuses it
    return skip(def, day, editions.length, editionKey, "evidence_unavailable");
  }

  const live = await createLiveMatcher(series);
  const matcher = live.ok ? live.live.matcher : new ConflictKeywordMatcher(gazetteerFor(series));
  // the dispatch identity is a flat record of scalars by construction
  // (model-config.ts:332-341); the store re-validates every key and value
  const dispatch: ConflictDispatchIdentity | null = live.ok ? { ...live.live.dispatch } : null;

  const result = await scoreConflictReport(
    {
      conflictId: def.id,
      evaluationKind: "retrospective",
      report: {
        series,
        editionKey,
        reportDate: winner.identity.reportDate,
        cutoffAt: winner.identity.cutoffAt,
        publishedAt: winner.identity.publishedAt,
        units,
      },
      gap: null,
    },
    corpus,
    retention,
    matcher,
  );

  const referenceEditionId = await editionRowId(deps.query, winner);
  if (referenceEditionId === null) {
    return skip(
      def,
      day,
      editions.length,
      editionKey,
      "edition_row_missing",
      live.ok ? null : live.reason,
    );
  }

  const observationId = await persistObservation(deps.query, {
    referenceEditionId,
    result,
    contributingDigestIds: deps.contributingDigestIds?.() ?? [],
    unitAttribution,
    dispatch,
    gazetteerVersion: gazetteerFor(series).version,
    unitFlagsVersion: UNIT_FLAGS_VERSION,
    // the winner's own normalizer version when it carries one; a fixture-abstract
    // row has none, and the table's version column is NOT NULL, so fall back to
    // the current constant rather than write an empty stamp
    editionNormVersion: winner.normVersion ?? EDITION_NORMALIZATION_VERSION,
    dailyFinalPolicy: DAILY_FINAL_POLICY,
    registryVersion: CONFLICT_REGISTRY_VERSION,
    cronRunId: deps.cronRunId ?? null,
  });

  return {
    conflictId: def.id,
    series,
    reportDate: day,
    editionKey,
    editionsSeen: editions.length,
    units: units.length,
    observationId,
    matcherRung: result.state === "scored" ? result.matcherRung : null,
    matcherRefusal: live.ok ? null : live.reason,
    skipped: null,
  };
}

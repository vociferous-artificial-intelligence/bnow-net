// Series/edition-aware ISW reference discovery (WS-3.2; PLAN-WS-3 §3.2a).
//
// WHY THIS EXISTS. Production discovery (src/lib/validation/run.ts:96-122)
// probes the candidate slugs in likelihood order, `break`s at the FIRST hit,
// and inserts ONE isw_reports row per (theater, report_date). A second same-day
// edition — the morning/evening Iran Update pair — is therefore never
// registered, and which of the two the corpus holds depends on probe ORDER
// rather than on finality. This module probes EVERY shape the versioned
// normalization table knows and records each hit as its own edition row
// (decision C4 = store every edition; the daily-final WINNER is selected at
// scoring time by selectDailyFinal, never by discovery).
//
// WHAT IT WRITES, EXACTLY. Only the migration-0028 tables, through
// SqlReferenceReportRepository and therefore through the ONE merge authority
// (mergeEditionRecords / nextStoredDayStatus). It NEVER inserts or updates
// isw_reports or source_citations and never calls refreshReportCitations: the
// production validation path stays byte-identical and remains the sole writer
// of the citation registry. `isw_report_id` is set by LINK-ONLY lookup
// (decision C5): an edition is anchored iff the existing isw_reports row for
// its (theater, report_date) carries a URL that canonicalizes to the SAME
// canonical URL. On a multi-edition day the sibling editions stay NULL — the
// consequence is honest and recorded, not papered over by borrowing the day's
// other endnote list.
//
// LEGAL (standing ruling 1). Report prose never leaves this module. The page
// body is transient: what persists is the edition identity, instants,
// treatments, enum values, version identifiers, and `derived.units` — ordinal +
// sha256 content hash + canonical gazetteer signature keys + a length bucket,
// the same rule isw_reports.derived follows. The derived payload's shape is
// CLOSED (editions.ts validateEditionDerived), so a free-text field cannot be
// smuggled into the column even by a future caller.
//
// GAPS ARE NEVER FABRICATED (the 2026-08-15 lesson: six "gap" days turned out
// to be transient probe failures). A day with no hit records `probe_failed`;
// it hardens into `publication_gap` only on a LATER run that again sees every
// shape return a clean 404, and only once the day is old enough that a late
// publication is no longer plausible. See confirmGapEligible below for exactly
// what that does and does not guarantee.

import { createHash } from "node:crypto";
import {
  SCOPE_VERSIONS,
  canonicalizeIswUrl,
  normalizeIswEditionUrl,
  selectDailyFinal,
  type EditionParseStatus,
  type EditionUnitSignature,
  type NormalizedEditionUrl,
  type ReferenceDayStatus,
} from "../conflicts/editions";
import { ConflictDomainError } from "../conflicts/errors";
import {
  DryRunReferenceReportRepository,
  type DayStatusResult,
  type EditionRepairedField,
  type ReferenceReportRepository,
} from "../conflicts/reference-repo";
import type { ReferenceSeriesId } from "../conflicts/vocabulary";
import { politeFetch, type FetchResult } from "../fetch-cache";
import { isIsoDay, type TimeAnchorTreatment } from "../conflicts/instants";
import { extractReportInstants, type ReportInstantExtraction } from "../conflicts/report-extract";
import { extractTakeawaysWithText } from "../validation/isw-extract";
// The URL builders are IMPORTED, never re-derived: production and discovery
// must probe the same slugs or the two corpora diverge silently.
// (run.ts:15 iswUrlForDate, :21 iranUpdateUrlForDate — subsumed by the
// candidate list — and :31 iranUpdateUrlCandidatesForDate.)
import { iranUpdateUrlCandidatesForDate, iswUrlForDate } from "../validation/run";
import { utcDayRange } from "../time/day-boundary";
import type { QueryFn } from "./load";

/** A probe body must clear this to count as a report — the SAME threshold
 *  production uses (run.ts:105), so discovery cannot register a page
 *  production would have skipped. */
export const MIN_REPORT_BYTES = 10_000;

/** The versioned unit-signature payload identity. Bump it when the hash input
 *  normalization or the signature source changes, so stored units from two
 *  derivations are never silently compared. */
export const EDITION_UNITS_VERSION = "isw-unit-sig-v1" as const;

/** A day may be CONFIRMED a publication gap only once this much time has
 *  passed since 00:00Z of the report date — i.e. at least 24 h after the day
 *  itself closed. ISW publishes late in the ET evening, so a same-day or
 *  next-morning all-404 is routine and must never read as a gap. */
export const GAP_CONFIRM_MIN_DAY_AGE_HOURS = 48;

/** isw_reports.theater for a reference series — the SAME mapping production's
 *  `referenceFor` uses (run.ts:44-56: ru/ua → theater "ru", ir → "ir"). Only
 *  used to find the citation-anchor row; discovery never writes that table. */
export const SERIES_ISW_THEATER: Readonly<Record<ReferenceSeriesId, string>> = {
  roca: "ru",
  iran_update: "ir",
};

export interface DiscoveryProbe {
  url: string;
  /** HTTP status, or null when no response was produced at all (network
   *  error/timeout after politeFetch's own retries, or a retried 5xx) */
  status: number | null;
  bytes: number;
}

export interface DiscoveredEdition {
  editionKey: string;
  label: string;
  canonicalUrl: string;
  action: "inserted" | "unchanged" | "repaired";
  repairedFields: readonly EditionRepairedField[];
  parseStatus: EditionParseStatus;
  /** how many declared units the page yielded (0 ⇒ parseStatus "failed") */
  units: number;
  /** isw_reports.id when link-only anchoring matched, else null (C5) */
  anchoredReportId: number | null;
}

export interface EditionDiscoveryResult {
  series: ReferenceSeriesId;
  reportDate: string;
  editions: readonly DiscoveredEdition[];
  /** derived status AFTER this run */
  dayStatus: ReferenceDayStatus;
  dayStatusAction: DayStatusResult["action"] | "editions_found";
  /** one entry per probed shape — url, status and byte count only, NEVER html */
  probes: readonly DiscoveryProbe[];
  /** probes that were neither a report hit nor a clean 404 */
  probeFailures: number;
  anchored: number;
}

export interface EditionDiscoveryDeps {
  repo: ReferenceReportRepository;
  /** read-only access to isw_reports for the C5 anchor lookup */
  query: QueryFn;
  /** injected for tests; defaults to the polite disk-cached fetcher */
  fetch?: (url: string) => Promise<FetchResult | null>;
  /** injected clock for the gap-confirmation age rule */
  now?: () => Date;
}

// ---------------------------------------------------------------------------
// Pure helpers (each independently testable without network or DB)
// ---------------------------------------------------------------------------

/** Every candidate URL for a (series, date), each already normalized to its
 *  edition identity. Refuses BEFORE any fetch if a builder emits a shape the
 *  versioned normalization table does not know, or a URL whose own slug
 *  disagrees with the requested series/date — builder drift must be a loud
 *  refusal, never a mislabeled edition row. */
export function seriesProbeUrls(
  series: ReferenceSeriesId,
  reportDate: string,
): { url: string; normalized: NormalizedEditionUrl }[] {
  const urls =
    series === "roca" ? [iswUrlForDate(reportDate)] : iranUpdateUrlCandidatesForDate(reportDate);
  return urls.map((url) => {
    const normalized = normalizeIswEditionUrl(url); // typed refusal on an unknown shape
    if (normalized.series !== series || normalized.reportDate !== reportDate) {
      throw new ConflictDomainError(
        "invalid_edition_url",
        `candidate ${JSON.stringify(url)} normalizes to ${normalized.series}:${normalized.reportDate}, not ${series}:${reportDate}`,
      );
    }
    return { url, normalized };
  });
}

/** Map the report extractor's outcomes onto the edition record's anchor pair.
 *  Anything that is not a cleanly parsed instant becomes NULL: `absent` →
 *  "missing", every other non-parsed outcome (malformed, conflicting
 *  declarations, a nonexistent DST-gap local time) →
 *  "malformed_treated_as_missing". The raw declared string is NEVER carried
 *  over — contract §9's "recorded raw and treated as missing, never guessed",
 *  with the raw half staying transient here (§5.8 legal boundary). */
export function editionAnchorsFrom(extraction: ReportInstantExtraction): {
  cutoffAt: string | null;
  cutoffTreatment: TimeAnchorTreatment;
  publishedAt: string | null;
  publishedTreatment: TimeAnchorTreatment;
} {
  const treat = (outcome: string, value: string | null): TimeAnchorTreatment =>
    outcome === "parsed" && value !== null
      ? "present"
      : outcome === "absent"
        ? "missing"
        : "malformed_treated_as_missing";
  return {
    cutoffAt: extraction.cutoff.outcome === "parsed" ? extraction.cutoff.cutoffAt : null,
    cutoffTreatment: treat(extraction.cutoff.outcome, extraction.cutoff.cutoffAt),
    publishedAt: extraction.published.outcome === "parsed" ? extraction.published.publishedAt : null,
    publishedTreatment: treat(extraction.published.outcome, extraction.published.publishedAt),
  };
}

/** The hash input: whitespace-collapsed, trimmed unit text. Deliberately NOT
 *  lowercased or punctuation-stripped — the hash is an identity, not a matcher,
 *  and a looser normalization would collide two genuinely different units. */
export function normalizeUnitTextForHash(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Reduce a report page to the ONLY unit data that may be stored: ordinal,
 *  content hash, canonical signature keys, length bucket. The bullet texts stay
 *  in this function's stack frame. */
export function unitSignaturesFrom(html: string): EditionUnitSignature[] {
  const { takeaways, transientTexts } = extractTakeawaysWithText(html);
  if (takeaways.length !== transientTexts.length) {
    // both halves walk the SAME DOM with the same algorithm, so a mismatch
    // means the extractor changed under us — refuse rather than pair units
    // with the wrong text
    throw new ConflictDomainError(
      "invalid_edition_record",
      `takeaway/text arity mismatch: ${takeaways.length} vs ${transientTexts.length}`,
    );
  }
  return takeaways.map((t, i) => ({
    ordinal: t.index,
    sha256: createHash("sha256").update(normalizeUnitTextForHash(transientTexts[i])).digest("hex"),
    toponyms: [...t.toponyms],
    actions: [...t.actions],
    chars: t.chars,
  }));
}

/** A probe that produced no report: was it a CLEAN 404 (the shape genuinely
 *  does not exist) or a failure we cannot distinguish from a transient one? */
export function isCleanNotFound(probe: DiscoveryProbe): boolean {
  return probe.status === 404;
}

/** May an all-404 day be CONFIRMED a publication gap on this run?
 *
 *  Both conditions must hold: a previous run already stored `probe_failed` for
 *  the day (so a gap is never asserted from ONE run — the monotone
 *  probe_failed → publication_gap transition is the confirmation mechanism),
 *  AND the report day is at least GAP_CONFIRM_MIN_DAY_AGE_HOURS old.
 *
 *  HONEST LIMIT: benchmark_series_days stores no timestamp, so "the earlier
 *  probe_failed came from a run ≥24 h ago" cannot be verified — only "an
 *  earlier run stored it" and "the day is old". Two runs minutes apart during
 *  one transient outage over an old window can therefore still confirm a gap.
 *  Closing that needs a `first_observed_at` column (a later migration), not a
 *  code change here. */
export function confirmGapEligible(
  priorStatus: ReferenceDayStatus,
  reportDate: string,
  now: Date,
): boolean {
  if (priorStatus !== "probe_failed") return false;
  const dayStartMs = Date.parse(`${reportDate}T00:00:00Z`);
  if (Number.isNaN(dayStartMs)) return false;
  return now.getTime() - dayStartMs >= GAP_CONFIRM_MIN_DAY_AGE_HOURS * 3_600_000;
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/** The C5 link-only anchor: the existing isw_reports row for this
 *  (theater, report_date) — at most one, the table's UNIQUE (theater,
 *  report_date) guarantees it — read READ-ONLY. Comparison is on the
 *  CANONICAL form of both URLs, so a www./scheme/trailing-slash spelling of
 *  the same edition still anchors, while a DIFFERENT edition of the same day
 *  correctly does not. */
async function anchorReportIdFor(
  query: QueryFn,
  theater: string,
  reportDate: string,
  canonicalUrl: string,
): Promise<number | null> {
  const rows = await query(
    `SELECT id, url FROM isw_reports WHERE theater = $1 AND report_date = $2`,
    [theater, reportDate],
  );
  for (const row of rows) {
    let stored: string;
    try {
      stored = canonicalizeIswUrl(String(row.url));
    } catch {
      continue; // a stored URL this canonicalizer refuses simply does not match
    }
    if (stored === canonicalUrl) return Number(row.id);
  }
  return null;
}

/**
 * Probe every shape of one (series, reportDate), record EVERY edition found,
 * and update the day status by the monotone rule. Idempotent: a replay repairs
 * (anchors fill in, a parse upgrades) and never duplicates.
 *
 * Cost: ROCA 1 probe/day, Iran Update 4 probes/day, at politeFetch's ≥2.1 s
 * per-host spacing (fetch-cache.ts:11) — about 2 s and 8.4 s respectively, so
 * a two-conflict two-day cron cycle spends roughly 21 s in fetch spacing alone.
 * A hit needs no second fetch: the probe body IS the page.
 */
export async function discoverEditions(
  deps: EditionDiscoveryDeps,
  series: ReferenceSeriesId,
  reportDate: string,
): Promise<EditionDiscoveryResult> {
  const fetchPage = deps.fetch ?? politeFetch;
  const now = deps.now ?? (() => new Date());
  const candidates = seriesProbeUrls(series, reportDate); // refuses before any network
  const theater = SERIES_ISW_THEATER[series];

  const probes: DiscoveryProbe[] = [];
  const editions: DiscoveredEdition[] = [];

  for (const { url, normalized } of candidates) {
    const page = await fetchPage(url);
    const probe: DiscoveryProbe = {
      url,
      status: page?.status ?? null,
      bytes: page?.html.length ?? 0,
    };
    probes.push(probe);
    // NO `break` — this is the whole point of the module (C4)
    if (page === null || page.status !== 200 || page.html.length <= MIN_REPORT_BYTES) continue;

    const canonicalUrl = canonicalizeIswUrl(url);
    const units = unitSignaturesFrom(page.html);
    const anchors = editionAnchorsFrom(extractReportInstants(page.html, reportDate));
    const anchoredReportId = await anchorReportIdFor(deps.query, theater, reportDate, canonicalUrl);

    const result = await deps.repo.upsertEdition({
      identity: {
        series,
        editionKey: normalized.editionKey,
        reportDate,
        cutoffAt: anchors.cutoffAt,
        publishedAt: anchors.publishedAt,
        scopeVersion: SCOPE_VERSIONS[series],
      },
      provider: "isw",
      canonicalUrl,
      normVersion: normalized.normVersion,
      // discovery never DESIGNATES a final edition: C4 selects the winner at
      // scoring time through selectDailyFinal's total ordering
      designatedFinal: null,
      cutoffTreatment: anchors.cutoffTreatment,
      publishedTreatment: anchors.publishedTreatment,
      parseStatus: units.length > 0 ? "parsed" : "failed",
      citationAnchorId: anchoredReportId,
      derived: units.length > 0 ? { units, unitsVersion: EDITION_UNITS_VERSION } : {},
    });

    editions.push({
      editionKey: normalized.editionKey,
      label: normalized.label,
      canonicalUrl,
      action: result.action,
      repairedFields: result.repairedFields,
      parseStatus: units.length > 0 ? "parsed" : "failed",
      units: units.length,
      anchoredReportId,
    });
  }

  const probeFailures = probes.filter((p) => !isCleanNotFound(p)).length - editions.length;

  if (editions.length > 0) {
    // an edition proves publication; upsertEdition already cleared any stored
    // gap/probe row for the day
    return {
      series,
      reportDate,
      editions,
      dayStatus: "published",
      dayStatusAction: "editions_found",
      probes,
      probeFailures,
      anchored: editions.filter((e) => e.anchoredReportId !== null).length,
    };
  }

  const priorStatus = await deps.repo.dayStatus(series, reportDate);
  const everyProbeCleanNotFound = probes.length > 0 && probes.every(isCleanNotFound);
  const observed =
    everyProbeCleanNotFound && confirmGapEligible(priorStatus, reportDate, now())
      ? "publication_gap"
      : "probe_failed";
  const recorded = await deps.repo.recordDayStatus(series, reportDate, observed);
  return {
    series,
    reportDate,
    editions,
    dayStatus: recorded.status,
    dayStatusAction: recorded.action,
    probes,
    probeFailures,
    anchored: 0,
  };
}

// ---------------------------------------------------------------------------
// `isw-refresh --series` driver (the C5 measurement pass)
// ---------------------------------------------------------------------------

export interface SeriesDiscoveryPlan {
  series: ReferenceSeriesId;
  /** inclusive yyyy-mm-dd bounds */
  from: string;
  to: string;
  /** compute and report, write nothing */
  dry: boolean;
}

/** Parse the `--series` CLI mode out of an argv tail. Returns null when the
 *  flag is absent (the caller then falls through to the historical
 *  `--theater` behaviour, untouched). Every malformed invocation is a REFUSAL,
 *  never a silent default: an unknown series, a missing or malformed window
 *  bound, or an inverted range all throw before any network or DB work. */
export function parseSeriesDiscoveryArgs(args: readonly string[]): SeriesDiscoveryPlan | null {
  const at = args.indexOf("--series");
  if (at === -1) return null;
  const value = args[at + 1];
  if (value !== "roca" && value !== "iran_update") {
    throw new Error(`--series must be roca|iran_update, got ${JSON.stringify(value ?? null)}`);
  }
  const val = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const from = val("--from");
  const to = val("--to");
  // isIsoDay round-trips the parse, so an engine day-of-month rollover
  // ("2026-02-30" -> March 2) cannot slip through as a valid bound
  if (!isIsoDay(from) || !isIsoDay(to)) {
    throw new Error("--series needs --from and --to (yyyy-mm-dd)");
  }
  if (from! > to!) throw new Error(`--from ${from} is after --to ${to}`);
  return { series: value, from: from!, to: to!, dry: args.includes("--dry") };
}

export interface SeriesDiscoverySummary {
  series: ReferenceSeriesId;
  from: string;
  to: string;
  dry: boolean;
  days: number;
  editions: number;
  /** days that produced more than one edition — the C5 measurement */
  multiEditionDays: number;
  /** days whose citation anchor is NOT on the daily-final winner (C5: how
   *  often production's probe-order anchor disagrees with finality) */
  anchorNotFinalDays: number;
  /** days with exactly one edition and no anchor at all */
  unanchoredDays: number;
  publishedDays: number;
  probeFailedDays: number;
  publicationGapDays: number;
  probes: number;
  probeFailures: number;
}

/** Drive discovery across a date window, one line per day. This is the
 *  operator-facing measurement C5 asks step 14 to take: how many days carry
 *  more than one edition, and how often the citation anchor is NOT the
 *  daily-final winner. With `dry` it makes ZERO writes. */
export async function runSeriesDiscovery(
  plan: SeriesDiscoveryPlan,
  deps: Omit<EditionDiscoveryDeps, "repo"> & { repo: ReferenceReportRepository },
  log: (line: string) => void = console.log,
  days: readonly string[] = utcDayRange(plan.from, plan.to),
): Promise<SeriesDiscoverySummary> {
  const repo = plan.dry ? new DryRunReferenceReportRepository(deps.repo) : deps.repo;
  const summary: SeriesDiscoverySummary = {
    series: plan.series,
    from: plan.from,
    to: plan.to,
    dry: plan.dry,
    days: 0,
    editions: 0,
    multiEditionDays: 0,
    anchorNotFinalDays: 0,
    unanchoredDays: 0,
    publishedDays: 0,
    probeFailedDays: 0,
    publicationGapDays: 0,
    probes: 0,
    probeFailures: 0,
  };

  for (const day of days) {
    const out = await discoverEditions({ ...deps, repo }, plan.series, day);
    summary.days += 1;
    summary.editions += out.editions.length;
    summary.probes += out.probes.length;
    summary.probeFailures += out.probeFailures;
    if (out.editions.length > 1) summary.multiEditionDays += 1;
    if (out.dayStatus === "published") summary.publishedDays += 1;
    if (out.dayStatus === "probe_failed") summary.probeFailedDays += 1;
    if (out.dayStatus === "publication_gap") summary.publicationGapDays += 1;

    // C5 measurement: compare the anchored edition against the daily-final
    // winner. In dry mode the anchor a live run WOULD have set is the one this
    // run computed, so the measurement is identical either way.
    let anchorNote = "";
    if (out.editions.length > 0) {
      const anchored = out.editions.filter((e) => e.anchoredReportId !== null);
      const stored = await repo.editionsForDay(plan.series, day);
      const finalKey =
        stored.length > 0 ? selectDailyFinal(stored).selected.identity.editionKey : out.editions[0].editionKey;
      if (anchored.length === 0) {
        summary.unanchoredDays += 1;
        anchorNote = " anchor=none";
      } else if (!anchored.some((e) => e.editionKey === finalKey)) {
        summary.anchorNotFinalDays += 1;
        anchorNote = ` anchor≠final(${anchored.map((e) => e.label).join(",")} vs ${finalKey.split(":")[2]})`;
      } else {
        anchorNote = " anchor=final";
      }
    }
    log(
      `${day}  ${plan.dry ? "DRY " : ""}${out.dayStatus} editions=${out.editions.length}` +
        `${out.editions.length > 0 ? ` [${out.editions.map((e) => `${e.label}:${e.action}:${e.parseStatus}:u${e.units}`).join(" ")}]` : ""}` +
        `${anchorNote} probes=${out.probes.length} probeFailures=${out.probeFailures}`,
    );
  }
  return summary;
}

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
//
// AND EDITIONS ARE NEVER FABRICATED EITHER (D-b, 2026-09-09). A probe body is
// an edition only if it clears MIN_REPORT_BYTES *and* declares at least one
// Key Takeaway. Size alone is not evidence: the host's not-found page measured
// 9,661 bytes against a 10,000-byte threshold. Anything else that comes back
// over the wire is INDETERMINATE (classifyProbe), which is a statement about
// our knowledge rather than about ISW's publishing.

import { createHash } from "node:crypto";
import {
  SCOPE_VERSIONS,
  canonicalizeIswUrl,
  normalizeIswEditionUrl,
  parseEditionRecord,
  selectDailyFinal,
  type EditionParseStatus,
  type EditionUnitSignature,
  type NormalizedEditionUrl,
  type ReferenceDayStatus,
  type ReferenceEditionRecord,
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
import { extractSignatureWith, gazetteerFor, type Gazetteer } from "../validation/gazetteer";
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

/** The versioned unit-signature payload identity, WITHOUT its gazetteer. Bump
 *  it when the hash input normalization or the signature algorithm changes.
 *  Never stamped on its own — see editionUnitsVersion. */
export const EDITION_UNITS_BASE_VERSION = "isw-unit-sig-v2" as const;

/** The stamp that goes into `derived.unitsVersion`.
 *
 *  It NAMES THE GAZETTEER (WS3-F05 / D-c). `derived.units[].toponyms` are
 *  canonical keys of one vocabulary, so two rows stamped with the same version
 *  but derived under different gazetteers would be silently incomparable —
 *  and every Iran Update edition written before this change carried an EMPTY
 *  toponym list, because the signature came through the RU/UA-bound
 *  `extractSignature`. `v1` rows are distinguishable by having no gazetteer
 *  component at all.
 *
 *  Stays inside EDITION_DERIVED_VERSION_RE (`editions.ts`): lowercase
 *  alphanumerics separated by single hyphens, which both gazetteer version ids
 *  already satisfy. */
export function editionUnitsVersion(gaz: Gazetteer): string {
  return `${EDITION_UNITS_BASE_VERSION}-${gaz.version}`;
}

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
  /** how many declared units the page yielded — always ≥ 1, because a
   *  zero-unit body is not an edition (D-b) */
  units: number;
  /** isw_reports.id when link-only anchoring matched, else null (C5) */
  anchoredReportId: number | null;
  /** the CANONICAL record this run wrote (or would have written in --dry).
   *  Carried because finality is a property of the record set, not of probe
   *  ORDER: without it a caller can only ask "which shape did we hit first",
   *  which is the question the whole module exists to stop asking (WS3-F02).
   *  Prose-free by construction — the same payload the repository stores. */
  record: ReferenceEditionRecord;
}

/** What one probe established about the shape it asked for.
 *
 *  `clean_not_found` is the ONLY class that disproves a shape's existence; it
 *  is what gap confirmation is allowed to reason from. `indeterminate` is the
 *  #114 class: the shape's existence is UNKNOWN, whether because the host
 *  refused us (403 / 429), because it failed (≥500, or no response at all
 *  after politeFetch's own retries), or because the body it returned is not
 *  usable as a report. */
export type ProbeClass = "edition" | "clean_not_found" | "indeterminate";

/** Why a day could not be resolved. RETURN SHAPE ONLY: `benchmark_series_days`
 *  keeps its two-value CHECK and this window adds no migration (D-a).
 *
 *  - `throttled`   — a 403 / 429 / ≥500 / no-response / undersized-200 probe.
 *  - `unparseable_body` — a body over MIN_REPORT_BYTES that declared no Key
 *    Takeaway at all (D-b). Kept distinct so the new indeterminate class does
 *    not re-conflate one level down: "the host would not talk to us" and
 *    "the host served something that is not a report" are different problems. */
export type DayStatusReason = "throttled" | "unparseable_body";

export const DAY_STATUS_REASONS: readonly DayStatusReason[] = ["throttled", "unparseable_body"];

export interface EditionDiscoveryResult {
  series: ReferenceSeriesId;
  reportDate: string;
  editions: readonly DiscoveredEdition[];
  /** derived status AFTER this run */
  dayStatus: ReferenceDayStatus;
  dayStatusAction: DayStatusResult["action"] | "editions_found";
  /** WHY the day is unresolved, when it is. Null on a published day and on a
   *  day whose every probe answered cleanly — a `probe_failed` with no reason
   *  is a real all-404 day awaiting its confirming run, which is exactly the
   *  distinction #114 found missing. */
  dayStatusReason: DayStatusReason | null;
  /** one entry per probed shape — url, status and byte count only, NEVER html */
  probes: readonly DiscoveryProbe[];
  /** probes that were neither a REGISTERED edition nor a clean 404. The
   *  historical counter under its shipped name and its shipped value, so the
   *  WS-3.6 soak can keep predeclaring against it. */
  probeFailures: number;
  /** probes whose class is `indeterminate` — the shape's existence is unknown
   *  rather than disproved (#114 / D-a). Reported separately from
   *  `probeFailures` because the two are different claims: `probeFailures` is
   *  an operational key, this is the semantic statement the soak needs. Every
   *  probe failure is indeterminate today; a future class of DEFINITE failure
   *  would narrow this without moving `probeFailures`. */
  probeIndeterminate: number;
  /** the same count split by reason, so a throttled window is distinguishable
   *  from a run of unusable bodies without re-reading the probe list */
  probeIndeterminateReasons: Readonly<Record<DayStatusReason, number>>;
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
 *  in this function's stack frame.
 *
 *  The GAZETTEER IS A REQUIRED ARGUMENT (WS3-F05). It used to take the
 *  signatures straight off `extractTakeaways`, which binds ru-ua-v1 through
 *  `keywords.ts` — so every Iran Update edition stored `toponyms: []`, on the
 *  column the 3.6-prep names as part of the compound-calibration substrate.
 *  Measured on fixtures/isw/iran-update-2026-07-24.html: 0 toponyms under
 *  ru-ua-v1, 8 under iran-levant-v1. There is deliberately no default: a
 *  caller must say which vocabulary it means, and the answer is stamped into
 *  the version.
 *
 *  `extractTakeawaysWithText` is left byte-identical and still computes its
 *  own RU/UA signatures — it is the production `isw_reports` path and must not
 *  move. Only `transientTexts` is used here, and only in this stack frame. */
export function unitSignaturesFrom(html: string, gaz: Gazetteer): EditionUnitSignature[] {
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
  return takeaways.map((t, i) => {
    const sig = extractSignatureWith(gaz, transientTexts[i]);
    return {
      ordinal: t.index,
      sha256: createHash("sha256").update(normalizeUnitTextForHash(transientTexts[i])).digest("hex"),
      toponyms: [...sig.toponyms],
      actions: [...sig.actions],
      chars: t.chars,
    };
  });
}

/** A probe that produced no report: was it a CLEAN 404 (the shape genuinely
 *  does not exist) or a failure we cannot distinguish from a transient one?
 *
 *  404-ONLY, deliberately. understandingwar.org answers 403 for a not-found
 *  slug once a run has made roughly twenty not-found requests, and the same
 *  403 state suppresses REAL pages (#114, measured 2026-09-08: three identical
 *  ROCA passes over the same 23 days returned publishedDays 6 → 6 → 13 with
 *  all 23 published). Accepting 403 here would let a throttled window
 *  manufacture publication gaps — see classifyProbe for where a 403 goes
 *  instead. */
export function isCleanNotFound(probe: DiscoveryProbe): boolean {
  return probe.status === 404;
}

/** The three-way probe class (#114 / D-a). An edition is a 200 whose body
 *  clears the production threshold; everything that is neither that nor a
 *  clean 404 leaves the shape's existence UNKNOWN and is `indeterminate`.
 *
 *  Transport only: whether an `edition`-classed body actually declares a Key
 *  Takeaway is D-b's question and is decided in discoverEditions, which
 *  demotes a zero-unit body to `indeterminate` with the `unparseable_body`
 *  reason. */
export function classifyProbe(probe: DiscoveryProbe): ProbeClass {
  if (isCleanNotFound(probe)) return "clean_not_found";
  if (probe.status === 200 && probe.bytes > MIN_REPORT_BYTES) return "edition";
  return "indeterminate";
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
  // fail-closed on an unknown series before any network call
  const gazetteer = gazetteerFor(series);
  const candidates = seriesProbeUrls(series, reportDate); // refuses before any network
  const theater = SERIES_ISW_THEATER[series];

  const probes: DiscoveryProbe[] = [];
  const editions: DiscoveredEdition[] = [];
  const indeterminate: Record<DayStatusReason, number> = { throttled: 0, unparseable_body: 0 };

  for (const { url, normalized } of candidates) {
    const page = await fetchPage(url);
    const probe: DiscoveryProbe = {
      url,
      status: page?.status ?? null,
      bytes: page?.html.length ?? 0,
    };
    probes.push(probe);
    // NO `break` — this is the whole point of the module (C4)
    const probeClass = classifyProbe(probe);
    if (probeClass !== "edition" || page === null) {
      // `page === null` cannot survive classifyProbe as an edition (a null
      // page has a null status); the check is here so the narrowing is the
      // compiler's, not a comment's.
      if (probeClass === "indeterminate") indeterminate.throttled += 1;
      continue;
    }

    const canonicalUrl = canonicalizeIswUrl(url);
    const units = unitSignaturesFrom(page.html, gazetteer);
    if (units.length === 0) {
      // D-b: a body over the threshold that declares no Key Takeaway is NOT an
      // edition. The host's own not-found page measured 9,661 bytes against
      // this 10,000-byte threshold — a template change 340 bytes wide would
      // otherwise mint an edition that proves the day published, deletes a
      // CONFIRMED publication_gap row, and can outrank the real report in
      // selectDailyFinal (which ignores parseStatus). Counting it
      // indeterminate keeps the day probe_failed and re-probes it next run.
      // The accepted cost, recorded: a real-but-unparseable report is no
      // longer stored for a later re-parse — the reason code is what records
      // that a body was seen at all.
      indeterminate.unparseable_body += 1;
      continue;
    }
    const anchors = editionAnchorsFrom(extractReportInstants(page.html, reportDate));
    const anchoredReportId = await anchorReportIdFor(deps.query, theater, reportDate, canonicalUrl);

    // parsed through the SAME authority the repository uses, so the record a
    // caller ranks is byte-identical to the one that was (or would be) stored
    const record = parseEditionRecord({
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
      // always `parsed`: a zero-unit body was refused above (D-b), so
      // discovery can no longer mint a `failed` edition
      parseStatus: "parsed",
      citationAnchorId: anchoredReportId,
      derived: { units, unitsVersion: editionUnitsVersion(gazetteer) },
    });
    const result = await deps.repo.upsertEdition(record);

    editions.push({
      editionKey: normalized.editionKey,
      label: normalized.label,
      canonicalUrl,
      action: result.action,
      repairedFields: result.repairedFields,
      parseStatus: record.parseStatus,
      units: units.length,
      anchoredReportId,
      record,
    });
  }

  const probeIndeterminate = indeterminate.throttled + indeterminate.unparseable_body;
  // Identical to the shipped formula `probes.filter(p => !isCleanNotFound(p)).length
  // - editions.length`, because a probe that is neither a clean 404 nor a
  // REGISTERED edition is exactly an indeterminate one. Kept as its own name
  // and its own field so the operational key and the semantic claim can drift
  // apart later without a silent redefinition.
  const probeFailures = probeIndeterminate;
  const probeIndeterminateReasons = { ...indeterminate };

  if (editions.length > 0) {
    // an edition proves publication; upsertEdition already cleared any stored
    // gap/probe row for the day
    return {
      series,
      reportDate,
      editions,
      dayStatus: "published",
      dayStatusAction: "editions_found",
      dayStatusReason: null,
      probes,
      probeFailures,
      probeIndeterminate,
      probeIndeterminateReasons,
      anchored: editions.filter((e) => e.anchoredReportId !== null).length,
    };
  }

  const priorStatus = await deps.repo.dayStatus(series, reportDate);
  // D-a, made EXPLICIT rather than emergent: a gap may be confirmed only when
  // every probe of the day answered cleanly. One indeterminate probe means the
  // day is not confirmable under throttling, and the reason says which kind of
  // silence we met. (This is the same predicate as the old
  // `probes.every(isCleanNotFound)` in this branch — where no edition was
  // registered, "not indeterminate" and "clean 404" are the same set — but it
  // is now a named condition with a reportable reason instead of a filter.)
  const confirmable = probes.length > 0 && probeIndeterminate === 0;
  const observed =
    confirmable && confirmGapEligible(priorStatus, reportDate, now())
      ? "publication_gap"
      : "probe_failed";
  const recorded = await deps.repo.recordDayStatus(series, reportDate, observed);
  return {
    series,
    reportDate,
    editions,
    dayStatus: recorded.status,
    dayStatusAction: recorded.action,
    dayStatusReason: dayStatusReasonFrom(indeterminate),
    probes,
    probeFailures,
    probeIndeterminate,
    probeIndeterminateReasons,
    anchored: 0,
  };
}

/** The single reason to report for a day, when it has one. `throttled`
 *  dominates: if the host refused any probe we cannot claim to know what the
 *  other shapes would have said, so an unparseable body alongside a 403 is
 *  reported as throttling. */
function dayStatusReasonFrom(counts: Record<DayStatusReason, number>): DayStatusReason | null {
  if (counts.throttled > 0) return "throttled";
  if (counts.unparseable_body > 0) return "unparseable_body";
  return null;
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
  // `--backfill-from-isw-reports` is a DIFFERENT --series mode with no date
  // bounds (parseSeriesBackfillArgs); returning null here keeps one dispatch
  // authority rather than two that can both claim the same argv.
  if (args.includes("--backfill-from-isw-reports")) return null;
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
  /** #114: probes whose class is indeterminate, and the days that carried at
   *  least one. A window with a non-zero `throttledDays` is a window whose
   *  `probeFailedDays` is a fetch artifact, not a coverage measure. */
  probeIndeterminate: number;
  throttledDays: number;
  unparseableBodyDays: number;
}

/** The daily-final winner over the UNION of what the store already holds and
 *  what THIS run discovered, keyed by editionKey.
 *
 *  WHY A UNION (WS3-F02). `editionsForDay` answers with what is stored. In
 *  LIVE mode that already includes this run's writes, so the union is a no-op.
 *  In `--dry` mode nothing is written, so on a fresh store the stored set is
 *  EMPTY and the shipped code fell back to `discovered[0]` — probe order,
 *  which is not finality: probe order puts `special` before `evening` (ranks
 *  40 < 50) and `morning` before `plain` (20 < 30), so a dry C5 measurement
 *  reported anchor≠final where the anchor WAS final, and the reverse. On a
 *  partially populated store the stored set is stale in the same way. The
 *  union is exactly the record set a live run would have left behind, so the
 *  measurement is mode-independent by construction.
 *
 *  A key present on both sides resolves to the STORED record: in live mode
 *  that is the post-merge row, which is authoritative; in dry mode the merge
 *  only ever fills anchors in, and the label — which carries the finality
 *  rank — is fixed by the key itself. */
export function dailyFinalKeyFor(
  stored: readonly ReferenceEditionRecord[],
  discovered: readonly DiscoveredEdition[],
): string {
  const byKey = new Map<string, ReferenceEditionRecord>();
  for (const e of discovered) byKey.set(e.record.identity.editionKey, e.record);
  for (const r of stored) byKey.set(r.identity.editionKey, r);
  return selectDailyFinal([...byKey.values()]).selected.identity.editionKey;
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
    probeIndeterminate: 0,
    throttledDays: 0,
    unparseableBodyDays: 0,
  };

  for (const day of days) {
    const out = await discoverEditions({ ...deps, repo }, plan.series, day);
    summary.days += 1;
    summary.editions += out.editions.length;
    summary.probes += out.probes.length;
    summary.probeFailures += out.probeFailures;
    summary.probeIndeterminate += out.probeIndeterminate;
    if (out.dayStatusReason === "throttled") summary.throttledDays += 1;
    if (out.dayStatusReason === "unparseable_body") summary.unparseableBodyDays += 1;
    if (out.editions.length > 1) summary.multiEditionDays += 1;
    if (out.dayStatus === "published") summary.publishedDays += 1;
    if (out.dayStatus === "probe_failed") summary.probeFailedDays += 1;
    if (out.dayStatus === "publication_gap") summary.publicationGapDays += 1;

    // C5 measurement: compare the anchored edition against the daily-final
    // winner over stored ∪ discovered (dailyFinalKeyFor), so the dry and live
    // figures are the same number and not an artifact of probe order.
    let anchorNote = "";
    if (out.editions.length > 0) {
      const anchored = out.editions.filter((e) => e.anchoredReportId !== null);
      const finalKey = dailyFinalKeyFor(await repo.editionsForDay(plan.series, day), out.editions);
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
        `${anchorNote} probes=${out.probes.length} probeFailures=${out.probeFailures}` +
        `${out.dayStatusReason === null ? "" : ` reason=${out.dayStatusReason}`}`,
    );
  }
  return summary;
}

// ---------------------------------------------------------------------------
// `isw-refresh --series … --backfill-from-isw-reports` (the N3 operator mode)
// ---------------------------------------------------------------------------

export interface SeriesBackfillPlan {
  series: ReferenceSeriesId;
  /** compute and report, write nothing */
  dry: boolean;
  /** OPTIONAL inclusive report_date bounds. Absent = the whole corpus, which
   *  is N3's literal wording; present lets the operator run the registration
   *  in bounded passes (the #116 window is one) instead of one sweep over
   *  every historical row, and is what makes the mode provable on a fork
   *  without walking the production corpus copy. */
  from?: string | null;
  to?: string | null;
}

/** A row the backfill would not register, and why. Bounded and prose-free:
 *  a report URL, a typed code, and the domain error's own message. */
export interface BackfillRefusal {
  reportId: number;
  url: string;
  code: string;
  reason: string;
}

export interface SeriesBackfillSummary {
  series: ReferenceSeriesId;
  theater: string;
  dry: boolean;
  /** the bounds actually applied, so a summary says what it covered */
  from: string | null;
  to: string | null;
  rows: number;
  inserted: number;
  unchanged: number;
  repaired: number;
  refused: number;
  /** capped sample — the COUNT is the number that matters */
  refusals: readonly BackfillRefusal[];
}

const BACKFILL_REFUSAL_SAMPLE = 20;

/** Parse the `--backfill-from-isw-reports` CLI mode. Returns null when the
 *  flag is absent, so `parseSeriesDiscoveryArgs` keeps the plain `--series`
 *  window. Requires `--series` and refuses an unknown one; it takes no date
 *  bounds, because the corpus itself is the window. */
export function parseSeriesBackfillArgs(args: readonly string[]): SeriesBackfillPlan | null {
  if (!args.includes("--backfill-from-isw-reports")) return null;
  const at = args.indexOf("--series");
  const value = at === -1 ? undefined : args[at + 1];
  if (value !== "roca" && value !== "iran_update") {
    throw new Error(
      `--backfill-from-isw-reports needs --series roca|iran_update, got ${JSON.stringify(value ?? null)}`,
    );
  }
  const val = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  // the window is OPTIONAL here (unlike --series discovery, where it is the
  // whole plan), but a MALFORMED bound is still a refusal, never a silent
  // whole-corpus sweep
  const from = val("--from");
  const to = val("--to");
  for (const [name, bound] of [["--from", from], ["--to", to]] as const) {
    if (bound !== undefined && !isIsoDay(bound)) {
      throw new Error(`--backfill-from-isw-reports ${name} must be yyyy-mm-dd, got ${JSON.stringify(bound)}`);
    }
  }
  if (from !== undefined && to !== undefined && from > to) {
    throw new Error(`--from ${from} is after --to ${to}`);
  }
  return { series: value, dry: args.includes("--dry"), from: from ?? null, to: to ?? null };
}

/**
 * Register every existing `isw_reports` row of the series' theater as an
 * edition row, by normalizing its stored URL. Decision N3's operator step.
 *
 * ZERO NETWORK, by construction: it reads one table and writes the
 * migration-0028 tables through the same merge authority discovery uses. It
 * never fetches a page, never writes `isw_reports` or `source_citations`, and
 * never calls refreshReportCitations. `--dry` writes nothing at all.
 *
 * NO HTML MEANS NO UNITS, so these rows are `parseStatus: "pending"` with an
 * empty `derived` and both anchors `missing`. That is NOT the D-b criterion
 * failing — D-b judges a fetched BODY, and there is no body here. A later
 * discovery run upgrades the row in place: `mergeEditionRecords` ranks
 * pending < failed < parsed and an empty incoming `derived` never erases a
 * stored one, so nothing this mode writes can degrade a real parse. Writing
 * `failed` instead would claim we tried to parse something.
 *
 * EVERY REFUSAL IS PER ROW AND COUNTED, NEVER FATAL. A typed
 * `ConflictDomainError` — an unknown URL shape, a URL that normalizes to
 * another series, a slug date that disagrees with the row's `report_date` —
 * is recorded and the walk continues. Anything else propagates: a programming
 * error should be loud, and the mode is idempotent, so a re-run resumes.
 */
export async function backfillFromIswReports(
  deps: { repo: ReferenceReportRepository; query: QueryFn },
  plan: SeriesBackfillPlan,
  log: (line: string) => void = console.log,
): Promise<SeriesBackfillSummary> {
  const repo = plan.dry ? new DryRunReferenceReportRepository(deps.repo) : deps.repo;
  const theater = SERIES_ISW_THEATER[plan.series];
  const summary: SeriesBackfillSummary = {
    series: plan.series,
    theater,
    dry: plan.dry,
    from: plan.from ?? null,
    to: plan.to ?? null,
    rows: 0,
    inserted: 0,
    unchanged: 0,
    repaired: 0,
    refused: 0,
    refusals: [],
  };
  const refusals: BackfillRefusal[] = [];

  const params: unknown[] = [theater];
  let bounds = "";
  if (plan.from) {
    params.push(plan.from);
    bounds += ` AND report_date >= $${params.length}::date`;
  }
  if (plan.to) {
    params.push(plan.to);
    bounds += ` AND report_date <= $${params.length}::date`;
  }
  const rows = await deps.query(
    `SELECT id, url, report_date::text AS report_date FROM isw_reports
      WHERE theater = $1${bounds} ORDER BY report_date, id`,
    params,
  );

  for (const row of rows) {
    summary.rows += 1;
    const reportId = Number(row.id);
    const url = String(row.url);
    const reportDate = String(row.report_date);
    try {
      const normalized = normalizeIswEditionUrl(url);
      if (normalized.series !== plan.series) {
        throw new ConflictDomainError(
          "invalid_edition_url",
          `normalizes to series ${normalized.series}, not ${plan.series}`,
        );
      }
      if (normalized.reportDate !== reportDate) {
        // the slug and the stored report_date disagree: registering either one
        // would be inventing an identity
        throw new ConflictDomainError(
          "invalid_edition_url",
          `slug date ${normalized.reportDate} disagrees with isw_reports.report_date ${reportDate}`,
        );
      }
      const result = await repo.upsertEdition(
        parseEditionRecord({
          identity: {
            series: plan.series,
            editionKey: normalized.editionKey,
            reportDate,
            cutoffAt: null,
            publishedAt: null,
            scopeVersion: SCOPE_VERSIONS[plan.series],
          },
          provider: "isw",
          canonicalUrl: canonicalizeIswUrl(url),
          normVersion: normalized.normVersion,
          designatedFinal: null,
          cutoffTreatment: "missing",
          publishedTreatment: "missing",
          parseStatus: "pending",
          citationAnchorId: reportId,
          derived: {},
        }),
      );
      summary[result.action] += 1;
    } catch (e) {
      if (!(e instanceof ConflictDomainError)) throw e;
      summary.refused += 1;
      if (refusals.length < BACKFILL_REFUSAL_SAMPLE) {
        refusals.push({ reportId, url, code: e.code, reason: e.message });
      }
      log(`${reportDate}  ${plan.dry ? "DRY " : ""}REFUSED ${e.code} report=${reportId} ${url}`);
    }
  }

  return { ...summary, refusals };
}

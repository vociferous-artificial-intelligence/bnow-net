// Reference-report editions (Phase 2; contract §9, prompt §5.7/§10).
//
// This module owns: (a) the VERSIONED normalization table mapping real
// provider URL shapes to edition labels (Gate-1 carried NOTE: explicit
// versioned normalization, no silent acceptance — an unrecognized shape is a
// typed refusal, never an invented label); (b) the edition RECORD built on
// Phase 1's ReferenceReportIdentity; (c) the deterministic daily-final
// selection under an explicit TOTAL ordering (never rows[0] of an unordered
// same-date set); (d) day-status vocabulary for publication gaps vs probe
// failures (gaps are represented, never fabricated — the 2026-08-15 recovery
// found six "gap" days that were transient probe failures, so the two states
// are structurally distinct here).

import { ConflictDomainError } from "./errors";
import { deepFreeze } from "./freeze";
import { classifyTimeAnchor, isIsoDay, parseIsoInstantMs, type TimeAnchorTreatment } from "./instants";
import {
  parseReferenceReportIdentity,
  validateReferenceReportIdentity,
  type ReferenceReportIdentity,
} from "./reference-report";
import { isReferenceSeriesId, type ReferenceSeriesId, type UnavailableReason } from "./vocabulary";

// ---------------------------------------------------------------------------
// Scope versions (contract §0/§9 — the series' versioned editorial scope)
// ---------------------------------------------------------------------------

export const SCOPE_VERSIONS: Readonly<Record<ReferenceSeriesId, string>> = deepFreeze({
  roca: "roca-scope-v1",
  iran_update: "iran-update-scope-v1",
});

// ---------------------------------------------------------------------------
// Versioned edition-label normalization (real provider URL shapes)
// ---------------------------------------------------------------------------

export const EDITION_NORMALIZATION_VERSION = "isw-edition-norm-v1" as const;

/** Labels the v1 normalization table can produce, per series. The four
 *  observed Iran Update slug shapes (2026-08-15 audit, mirrored in the
 *  frozen probe list in src/lib/validation/run.ts): special-report (the
 *  current daily form), evening-/morning- special reports (two-a-day form),
 *  and the plain historical form. ROCA has one observed daily shape. */
export const NORMALIZED_EDITION_LABELS: Readonly<Record<ReferenceSeriesId, readonly string[]>> =
  deepFreeze({
    roca: ["daily"],
    iran_update: ["special", "evening", "morning", "plain"],
  });

/** The reserved series-agnostic label the Phase 0/1 fixture corpus uses for
 *  an abstract designated-final edition. NEVER produced by normalization; a
 *  provider URL can only yield a NORMALIZED_EDITION_LABELS member. */
export const FIXTURE_FINAL_LABEL = "final" as const;

export interface NormalizedEditionUrl {
  series: ReferenceSeriesId;
  /** yyyy-mm-dd parsed from the slug */
  reportDate: string;
  label: string;
  /** `<series>:<reportDate>:<label>` */
  editionKey: string;
  normVersion: typeof EDITION_NORMALIZATION_VERSION;
}

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const ROCA_PATH_RE =
  /^\/research\/russia-ukraine\/russian-offensive-campaign-assessment-([a-z]+)-(\d{1,2})-(\d{4})\/?$/;
const IRAN_SPECIAL_PATH_RE =
  /^\/research\/middle-east\/iran-update-(?:(morning|evening)-)?special-report-([a-z]+)-(\d{1,2})-(\d{4})\/?$/;
const IRAN_PLAIN_PATH_RE = /^\/research\/middle-east\/iran-update-([a-z]+)-(\d{1,2})-(\d{4})\/?$/;

function slugDate(monthName: string, day: string, year: string): string | null {
  const monthIdx = MONTH_NAMES.indexOf(monthName);
  if (monthIdx === -1) return null;
  const iso = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
  return isIsoDay(iso) ? iso : null;
}

/** Normalize a provider report URL to its series/date/edition-label identity.
 *  Throws typed on anything outside the versioned table — an unknown host,
 *  path shape, or impossible slug date is REFUSED, never silently accepted
 *  or guessed into a label. */
export function normalizeIswEditionUrl(rawUrl: string): NormalizedEditionUrl {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new ConflictDomainError("invalid_edition_url", `not a URL: ${JSON.stringify(rawUrl)}`);
  }
  const host = u.host.toLowerCase().replace(/^www\./, "");
  if (host !== "understandingwar.org" || (u.protocol !== "https:" && u.protocol !== "http:")) {
    throw new ConflictDomainError("invalid_edition_url", `not an ISW report host: ${JSON.stringify(rawUrl)}`);
  }
  const path = u.pathname.toLowerCase();

  const finish = (series: ReferenceSeriesId, label: string, m: string, d: string, y: string) => {
    const reportDate = slugDate(m, d, y);
    if (reportDate === null) {
      throw new ConflictDomainError(
        "invalid_edition_url",
        `slug date is not a real calendar date: ${JSON.stringify(rawUrl)}`,
      );
    }
    return {
      series,
      reportDate,
      label,
      editionKey: `${series}:${reportDate}:${label}`,
      normVersion: EDITION_NORMALIZATION_VERSION,
    } satisfies NormalizedEditionUrl;
  };

  const roca = ROCA_PATH_RE.exec(path);
  if (roca) return finish("roca", "daily", roca[1], roca[2], roca[3]);
  const special = IRAN_SPECIAL_PATH_RE.exec(path);
  if (special) return finish("iran_update", special[1] ?? "special", special[2], special[3], special[4]);
  const plain = IRAN_PLAIN_PATH_RE.exec(path);
  if (plain) {
    // "iran-update-<month>-<d>-<y>": the first segment must be a real month
    // name or this is an unknown shape (e.g. a future "iran-update-weekly-…"
    // form must be refused, not mislabeled "plain")
    return finish("iran_update", "plain", plain[1], plain[2], plain[3]);
  }
  throw new ConflictDomainError(
    "invalid_edition_url",
    `URL path matches no ${EDITION_NORMALIZATION_VERSION} shape: ${JSON.stringify(rawUrl)}`,
  );
}

// ---------------------------------------------------------------------------
// Edition records
// ---------------------------------------------------------------------------

export const EDITION_PARSE_STATUSES = deepFreeze(["pending", "parsed", "failed"] as const);
export type EditionParseStatus = (typeof EDITION_PARSE_STATUSES)[number];

export function isEditionParseStatus(value: unknown): value is EditionParseStatus {
  return typeof value === "string" && (EDITION_PARSE_STATUSES as readonly string[]).includes(value);
}

export const EDITION_PROVIDERS = deepFreeze(["isw", "fixture"] as const);
export type EditionProvider = (typeof EDITION_PROVIDERS)[number];

export interface ReferenceEditionRecord {
  identity: ReferenceReportIdentity;
  provider: EditionProvider;
  /** canonical report URL; null only in fixture mode */
  canonicalUrl: string | null;
  /** the normalization-table version that produced the label; null only for
   *  fixture-abstract labels */
  normVersion: string | null;
  /** explicit daily-final designation when a policy source declares one
   *  (fixture `designatedFinal`); null = undesignated */
  designatedFinal: boolean | null;
  /** how the raw declared anchors were classified (the raw malformed string
   *  itself stays transient — never persisted, per the §5.8 legal boundary) */
  cutoffTreatment: TimeAnchorTreatment;
  publishedTreatment: TimeAnchorTreatment;
  parseStatus: EditionParseStatus;
  /** optional link to the citation-registry anchor row (isw_reports.id) —
   *  the ISW adapter seam; null when unlinked or in fixture mode */
  citationAnchorId: number | null;
}

/** The editionKey's label segment. Identity validation guarantees shape. */
export function editionLabel(identity: ReferenceReportIdentity): string {
  return identity.editionKey.split(":")[2];
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Precise structural + cross-field validation. [] = valid (house style). */
export function validateEditionRecord(raw: unknown): string[] {
  if (!isRecord(raw)) return ["edition record: not an object"];
  const r = raw as Partial<ReferenceEditionRecord>;
  const errs = validateReferenceReportIdentity(r.identity).map((e) => `identity.${e}`);
  if (errs.length > 0) return errs;
  const identity = r.identity as ReferenceReportIdentity;
  const label = editionLabel(identity);

  if (r.provider !== "isw" && r.provider !== "fixture") {
    errs.push(`provider: must be isw|fixture, got ${JSON.stringify(r.provider)}`);
  }
  if (r.canonicalUrl !== null && typeof r.canonicalUrl !== "string") {
    errs.push("canonicalUrl: must be a string or null");
  }
  if (r.normVersion !== null && typeof r.normVersion !== "string") {
    errs.push("normVersion: must be a string or null");
  }
  if (r.designatedFinal !== null && typeof r.designatedFinal !== "boolean") {
    errs.push("designatedFinal: must be a boolean or null");
  }
  if (!isEditionParseStatus(r.parseStatus)) {
    errs.push(`parseStatus: must be pending|parsed|failed, got ${JSON.stringify(r.parseStatus)}`);
  }
  if (r.citationAnchorId !== null && !Number.isInteger(r.citationAnchorId)) {
    errs.push("citationAnchorId: must be an integer id or null");
  }

  // label discipline (no silent acceptance): a provider edition must carry a
  // label its versioned normalization table can produce; the reserved
  // fixture-abstract label is valid only for provider "fixture"
  const normalized = NORMALIZED_EDITION_LABELS[identity.series] as readonly string[];
  if (r.provider === "isw") {
    if (!normalized.includes(label)) {
      errs.push(
        `identity.editionKey: label ${JSON.stringify(label)} is not a ${EDITION_NORMALIZATION_VERSION} label for ${identity.series}`,
      );
    }
    if (typeof r.canonicalUrl !== "string" || r.canonicalUrl.length === 0) {
      errs.push("canonicalUrl: required for provider isw");
    }
    if (typeof r.normVersion !== "string" || r.normVersion.length === 0) {
      errs.push("normVersion: required for provider isw");
    }
    // URL↔key cross-validation, scoped to the CURRENT normalization version
    // (an older-version record's URL cannot be interpreted by this table):
    // the canonical URL must normalize to exactly this editionKey, so a
    // record can never claim a key its own URL contradicts
    if (
      typeof r.canonicalUrl === "string" &&
      r.canonicalUrl.length > 0 &&
      r.normVersion === EDITION_NORMALIZATION_VERSION
    ) {
      try {
        const urlIdentity = normalizeIswEditionUrl(r.canonicalUrl);
        if (urlIdentity.editionKey !== identity.editionKey) {
          errs.push(
            `canonicalUrl: normalizes to ${urlIdentity.editionKey}, not ${identity.editionKey}`,
          );
        }
      } catch {
        errs.push(`canonicalUrl: not a ${EDITION_NORMALIZATION_VERSION} URL shape for provider isw`);
      }
    }
  } else if (r.provider === "fixture") {
    if (!normalized.includes(label) && label !== FIXTURE_FINAL_LABEL) {
      errs.push(
        `identity.editionKey: label ${JSON.stringify(label)} is neither a normalized label nor the reserved ${JSON.stringify(FIXTURE_FINAL_LABEL)}`,
      );
    }
  }

  // anchor/treatment consistency: "present" iff the identity holds an instant
  for (const [field, treatment] of [
    ["cutoffAt", r.cutoffTreatment],
    ["publishedAt", r.publishedTreatment],
  ] as const) {
    const value = identity[field];
    if (treatment === undefined || !["present", "missing", "malformed_treated_as_missing"].includes(treatment)) {
      errs.push(`${field === "cutoffAt" ? "cutoffTreatment" : "publishedTreatment"}: invalid ${JSON.stringify(treatment)}`);
    } else if ((treatment === "present") !== (value !== null)) {
      errs.push(
        `${field === "cutoffAt" ? "cutoffTreatment" : "publishedTreatment"}: ${JSON.stringify(treatment)} inconsistent with identity.${field} ${JSON.stringify(value)}`,
      );
    }
  }
  return errs;
}

/** Canonical UTC ISO form (toISOString) of a valid explicit-timezone
 *  instant. Edition records canonicalize their anchors so equal instants are
 *  BYTE-identical regardless of the declared offset form ("+00:00" vs "Z",
 *  with/without ms) — a DB round trip and an in-memory record then serialize
 *  identically, and hash/merge equality never depends on formatting. */
function canonicalInstant(value: string | null): string | null {
  if (value === null) return null;
  return new Date(parseIsoInstantMs(value) as number).toISOString();
}

/** Parse + validate from unknown input; canonical frozen projection
 *  (anchors normalized to canonical UTC ISO form). */
export function parseEditionRecord(raw: unknown): ReferenceEditionRecord {
  const issues = validateEditionRecord(raw);
  if (issues.length > 0) {
    throw new ConflictDomainError("invalid_edition_record", "invalid edition record", issues);
  }
  const r = raw as ReferenceEditionRecord;
  return deepFreeze({
    identity: parseReferenceReportIdentity({
      ...r.identity,
      cutoffAt: canonicalInstant(r.identity.cutoffAt),
      publishedAt: canonicalInstant(r.identity.publishedAt),
    }),
    provider: r.provider,
    canonicalUrl: r.canonicalUrl,
    normVersion: r.normVersion,
    designatedFinal: r.designatedFinal,
    cutoffTreatment: r.cutoffTreatment,
    publishedTreatment: r.publishedTreatment,
    parseStatus: r.parseStatus,
    citationAnchorId: r.citationAnchorId,
  });
}

/** Build an edition record from the fixture corpus's report shape
 *  ({ series, editionKey, reportDate, cutoffAt?, publishedAt?,
 *  designatedFinal? }) — no network, no DB. RAW anchors go through
 *  classifyTimeAnchor: a malformed declared timestamp (e.g. the
 *  cc-window-rung2-017 cutoff) becomes null + malformed_treated_as_missing,
 *  never a guess and never a validation failure. */
export function editionRecordFromFixtureReport(raw: unknown): ReferenceEditionRecord {
  if (!isRecord(raw)) {
    throw new ConflictDomainError("invalid_edition_record", "fixture report: not an object");
  }
  if (!isReferenceSeriesId(raw.series)) {
    throw new ConflictDomainError(
      "invalid_edition_record",
      `fixture report: unknown series ${JSON.stringify(raw.series)}`,
    );
  }
  const cutoff = classifyTimeAnchor(raw.cutoffAt as string | null | undefined);
  const published = classifyTimeAnchor(raw.publishedAt as string | null | undefined);
  return parseEditionRecord({
    identity: {
      series: raw.series,
      editionKey: raw.editionKey,
      reportDate: raw.reportDate,
      cutoffAt: cutoff.treatment === "present" ? cutoff.raw : null,
      publishedAt: published.treatment === "present" ? published.raw : null,
      scopeVersion: SCOPE_VERSIONS[raw.series],
    },
    provider: "fixture",
    canonicalUrl: null,
    normVersion: null,
    designatedFinal: typeof raw.designatedFinal === "boolean" ? raw.designatedFinal : null,
    cutoffTreatment: cutoff.treatment,
    publishedTreatment: published.treatment,
    parseStatus: "parsed",
    citationAnchorId: null,
  });
}

// ---------------------------------------------------------------------------
// Deterministic daily-final selection (explicit TOTAL ordering)
// ---------------------------------------------------------------------------

export const DAILY_FINAL_POLICY = "designated-final-v1" as const;

/** Finality rank per label (higher = more final). Part of the versioned
 *  normalization policy: the reserved abstract "final" outranks everything;
 *  evening outranks the daily special form (it summarizes the later state of
 *  the same day); the historical plain form sits under special; morning is
 *  the least final. Distinct ranks everywhere so label comparison alone is
 *  already decisive across distinct labels. */
export const EDITION_FINALITY_RANK: Readonly<Record<string, number>> = deepFreeze({
  [FIXTURE_FINAL_LABEL]: 90,
  evening: 50,
  special: 40,
  daily: 35,
  plain: 30,
  morning: 20,
});

function finalityRank(record: ReferenceEditionRecord): number {
  const rank = EDITION_FINALITY_RANK[editionLabel(record.identity)];
  if (rank === undefined) {
    throw new ConflictDomainError(
      "invalid_edition_selection",
      `no finality rank for edition label ${JSON.stringify(editionLabel(record.identity))} (${EDITION_NORMALIZATION_VERSION})`,
    );
  }
  return rank;
}

function anchorMsDescNullsLast(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return Date.parse(b) - Date.parse(a);
}

/** Designation rank: explicit designatedFinal===true dominates everything;
 *  undesignated (null) sits in the middle; an edition EXPLICITLY declared
 *  not-final ranks BELOW every undesignated sibling — "not the final" is a
 *  statement, not an absence, and must never silently win over a sibling
 *  that made no claim either way. */
function designationRank(r: ReferenceEditionRecord): number {
  return r.designatedFinal === true ? 2 : r.designatedFinal === null ? 1 : 0;
}

/** TOTAL ordering, most-final FIRST: (1) designation rank — explicit true >
 *  undesignated > explicit false; (2) label finality rank desc;
 *  (3) publishedAt desc, nulls last; (4) cutoffAt desc, nulls last;
 *  (5) editionKey ascending — the last-resort tiebreak that makes the
 *  ordering total and input-order-independent. */
export function compareEditionFinality(a: ReferenceEditionRecord, b: ReferenceEditionRecord): number {
  const desA = designationRank(a);
  const desB = designationRank(b);
  if (desA !== desB) return desB - desA;
  const rank = finalityRank(b) - finalityRank(a);
  if (rank !== 0) return rank;
  const pub = anchorMsDescNullsLast(a.identity.publishedAt, b.identity.publishedAt);
  if (pub !== 0) return pub;
  const cut = anchorMsDescNullsLast(a.identity.cutoffAt, b.identity.cutoffAt);
  if (cut !== 0) return cut;
  return a.identity.editionKey < b.identity.editionKey ? -1 : a.identity.editionKey > b.identity.editionKey ? 1 : 0;
}

/** Sorted copy, most-final first. Rejects duplicate editionKeys (an upstream
 *  repository violation — ordering duplicates would be arbitrary). */
export function orderEditionsByFinality(
  editions: readonly ReferenceEditionRecord[],
): ReferenceEditionRecord[] {
  const seen = new Set<string>();
  for (const e of editions) {
    if (seen.has(e.identity.editionKey)) {
      throw new ConflictDomainError(
        "invalid_edition_selection",
        `duplicate editionKey ${JSON.stringify(e.identity.editionKey)}`,
      );
    }
    seen.add(e.identity.editionKey);
  }
  return [...editions].sort(compareEditionFinality);
}

export interface DailyFinalSelection {
  selected: ReferenceEditionRecord;
  policy: typeof DAILY_FINAL_POLICY;
  /** the full deterministic ordering, most-final first (audit trail) */
  orderedKeys: readonly string[];
  /** the deterministic winner carries an EXPLICIT designatedFinal===false —
   *  possible only when no edition of the day is designated true and every
   *  rank-superior sibling is also explicitly not-final (e.g. a lone
   *  explicitly-not-final edition). Selection still proceeds — refusing would
   *  make the whole day unavailable on a metadata quirk — but the oddity
   *  stays VISIBLE here instead of being silently absorbed. */
  winnerExplicitlyNotFinal: boolean;
}

/**
 * Deterministic daily-final selection over ONE (series, reportDate) edition
 * set. An explicit designatedFinal===true edition wins (exactly one may be
 * designated); otherwise the versioned total ordering decides. Throws typed
 * on an empty set (a publication gap or unknown day is the caller's
 * first-class outcome — selection never fabricates), on mixed series/dates,
 * and on contradictory designation.
 */
export function selectDailyFinal(editions: readonly ReferenceEditionRecord[]): DailyFinalSelection {
  if (editions.length === 0) {
    throw new ConflictDomainError(
      "invalid_edition_selection",
      "cannot select a daily final from zero editions (represent the gap or probe failure explicitly instead)",
    );
  }
  const series = editions[0].identity.series;
  const reportDate = editions[0].identity.reportDate;
  for (const e of editions) {
    if (e.identity.series !== series || e.identity.reportDate !== reportDate) {
      throw new ConflictDomainError(
        "invalid_edition_selection",
        `mixed series/reportDate in daily-final selection: ${e.identity.editionKey} vs ${series}:${reportDate}`,
      );
    }
  }
  const designated = editions.filter((e) => e.designatedFinal === true);
  if (designated.length > 1) {
    throw new ConflictDomainError(
      "invalid_edition_selection",
      `contradictory designation: ${designated.length} editions marked designatedFinal for ${series}:${reportDate}`,
    );
  }
  const ordered = orderEditionsByFinality(editions);
  return {
    selected: ordered[0],
    policy: DAILY_FINAL_POLICY,
    orderedKeys: ordered.map((e) => e.identity.editionKey),
    winnerExplicitlyNotFinal: ordered[0].designatedFinal === false,
  };
}

// ---------------------------------------------------------------------------
// Day status (publication gaps vs probe failures — never fabricated)
// ---------------------------------------------------------------------------

/** Derived day statuses: `published` (≥1 edition record exists — derived,
 *  never stored) · `publication_gap` (CONFIRMED: the series truly published
 *  nothing that day) · `probe_failed` (discovery attempted and failed —
 *  cannot be distinguished from a transient failure, so it is NEVER
 *  presented as a gap) · `unknown` (no record at all — derived). */
export const REFERENCE_DAY_STATUSES = deepFreeze([
  "published",
  "publication_gap",
  "probe_failed",
  "unknown",
] as const);
export type ReferenceDayStatus = (typeof REFERENCE_DAY_STATUSES)[number];

/** The two STORABLE statuses (published/unknown are derived states). */
export const STORED_DAY_STATUSES = deepFreeze(["publication_gap", "probe_failed"] as const);
export type StoredDayStatus = (typeof STORED_DAY_STATUSES)[number];

export function isStoredDayStatus(value: unknown): value is StoredDayStatus {
  return typeof value === "string" && (STORED_DAY_STATUSES as readonly string[]).includes(value);
}

/** Monotone day-status transition rule shared by every repository
 *  implementation: a probe failure may be CONFIRMED into a gap; a confirmed
 *  gap is never un-confirmed by a later probe failure (kept prior); replays
 *  of the same status are no-ops. Editions trump everything — the repository
 *  clears a stored row when an edition arrives (a "gap" that later grows an
 *  edition was a discovery failure, repaired, never duplicated). */
export function nextStoredDayStatus(
  current: StoredDayStatus | null,
  observed: StoredDayStatus,
): { status: StoredDayStatus; action: "set" | "unchanged" | "kept_prior" } {
  if (!isStoredDayStatus(observed)) {
    throw new ConflictDomainError(
      "invalid_day_status",
      `not a storable day status: ${JSON.stringify(observed)}`,
    );
  }
  if (current === null) return { status: observed, action: "set" };
  if (current === observed) return { status: current, action: "unchanged" };
  if (current === "probe_failed" && observed === "publication_gap") {
    return { status: "publication_gap", action: "set" };
  }
  // publication_gap ← probe_failed: a later failed probe never un-confirms
  return { status: current, action: "kept_prior" };
}

/** Phase 1 publication-gap vocabulary bridge: only a CONFIRMED gap maps to
 *  the `publication_gap` unavailable reason; probe_failed/unknown map to
 *  nothing (never fabricate a gap out of a failed probe). */
export function dayUnavailableReason(
  status: ReferenceDayStatus,
): Extract<UnavailableReason, "publication_gap"> | null {
  return status === "publication_gap" ? "publication_gap" : null;
}

// Pure cutoff/publication extraction from reference-report HTML (Phase 2;
// contract §9, prompt §10).
//
// LEGAL BOUNDARY (standing ruling 1, prompt §5.8): the HTML is a TRANSIENT
// in-memory input. Every value this module returns is an instant (epoch ms /
// canonical ISO string), a boolean, or a bounded enum — never a prose
// snippet, never a raw matched substring, never an error message embedding
// report text. A missing or unparseable declaration yields an explicit null
// plus a machine-readable outcome (the classifyTimeAnchor pattern), never a
// guess and never server-local time.
//
// datePublished: JSON-LD `"datePublished":"…"`. At least as robust as the
// production regex in src/lib/validation/run.ts (which takes the first match
// and trusts `new Date`): this extractor scans EVERY match, accepts only
// explicit-timezone instants via the strict Phase 1 parser (a timezone-less
// value would be interpreted in the server-local zone — the exact divergence
// the contract forbids, so it is treated as malformed, a deliberate
// documented divergence from production leniency), uses the FIRST valid one
// (production-compatible), and reports when later matches conflict.
//
// Declared data cutoff: ISW states cutoffs as ET wall-clock times inside an
// Analyst Notes block — observed shapes "Data Cutoff: 2:00 PM ET" and
// "Assessment as of: 6:00 PM ET. Data Cutoff: 12:15 PM ET." Body prose also
// REFERS to earlier cutoffs ("… since ISW-CTP's last data cutoff at 2:00 PM
// ET on July 23") — a reference, not a declaration, excluded by the
// last/previous/prior guard. The pattern set is VERSIONED
// (CUTOFF_PATTERN_VERSION) so a parser change is visible in provenance, and
// `windowEndSource` (recorded by the §5 window ladder) makes any regression
// that silently widens windows visible in every result.

import { etWallClockToUtcMs } from "./et-time";
import { parseIsoDayMs, parseIsoInstantMs } from "./instants";

export const CUTOFF_PATTERN_VERSION = "isw-cutoff-v1" as const;

// ---------------------------------------------------------------------------
// datePublished (JSON-LD)
// ---------------------------------------------------------------------------

export const PUBLISHED_EXTRACTION_OUTCOMES = ["parsed", "absent", "malformed"] as const;
export type PublishedExtractionOutcome = (typeof PUBLISHED_EXTRACTION_OUTCOMES)[number];

export interface PublishedExtraction {
  outcome: PublishedExtractionOutcome;
  /** epoch ms of the FIRST valid declaration, else null */
  publishedAtMs: number | null;
  /** canonical UTC ISO instant (toISOString) of publishedAtMs, else null */
  publishedAt: string | null;
  /** true when valid declarations disagree — the first one is used
   *  (production-compatible) but the conflict stays visible */
  conflicting: boolean;
}

const DATE_PUBLISHED_RE = /"datePublished"\s*:\s*"([^"]+)"/g;

export function extractDatePublished(html: string): PublishedExtraction {
  const validMs: number[] = [];
  let sawAny = false;
  for (const m of html.matchAll(DATE_PUBLISHED_RE)) {
    sawAny = true;
    const ms = parseIsoInstantMs(m[1]);
    if (ms !== null) validMs.push(ms);
  }
  if (validMs.length === 0) {
    return {
      outcome: sawAny ? "malformed" : "absent",
      publishedAtMs: null,
      publishedAt: null,
      conflicting: false,
    };
  }
  const first = validMs[0];
  return {
    outcome: "parsed",
    publishedAtMs: first,
    publishedAt: new Date(first).toISOString(),
    conflicting: validMs.some((ms) => ms !== first),
  };
}

// ---------------------------------------------------------------------------
// Declared data cutoff (ET wall clock → UTC)
// ---------------------------------------------------------------------------

export const CUTOFF_EXTRACTION_OUTCOMES = [
  /** exactly one declared cutoff value (repeated identical declarations collapse) */
  "parsed",
  /** no cutoff declaration found */
  "absent",
  /** a declaration exists but its time (or explicit date) is unparseable */
  "malformed",
  /** multiple declarations with DIFFERENT resulting instants — fail closed to
   *  the next window rung rather than pick one (unlike datePublished there is
   *  no production first-match precedent to stay compatible with) */
  "conflicting",
  /** the declared ET wall time falls in the spring-forward DST gap — the
   *  local time does not exist; treated as missing, never guessed */
  "nonexistent_local_time",
] as const;

export type CutoffExtractionOutcome = (typeof CUTOFF_EXTRACTION_OUTCOMES)[number];

export interface CutoffExtraction {
  outcome: CutoffExtractionOutcome;
  /** epoch ms of the declared cutoff, else null */
  cutoffAtMs: number | null;
  /** canonical UTC ISO instant of cutoffAtMs, else null */
  cutoffAt: string | null;
  /** true when the ET wall time fell in the repeated fall-back hour and the
   *  fixed first-occurrence (daylight) rule resolved it */
  dstAmbiguousFirstOccurrence: boolean;
  patternVersion: typeof CUTOFF_PATTERN_VERSION;
}

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

// label: "data cutoff" / "data cut-off", joined to its time by ":", "at" or
// "as of"; tags/entities/whitespace may sit between label and time
const CUTOFF_LABEL_RE = /data\s+cut-?off\s*(?::|\bat\b|\bas\s+of\b)/gi;

// a reference to an EARLIER report's cutoff ("since ISW-CTP's last data
// cutoff…"), not this report's own declaration. The guard runs over
// TAG-STRIPPED, entity-collapsed text so markup between the qualifier and
// the label ("the last <em>data cutoff…", "the <em>last</em> data cutoff…")
// cannot defeat it, and it is WORD-based over the preceding few words so an
// intervening word ("the previous ISW-CTP data cutoff") still excludes. A
// prior reference slipping PAST the guard is the dangerous direction: it
// reads as a second, disagreeing declaration → `conflicting` → the window
// ladder falls a rung — systematic window WIDENING.
const PRIOR_REFERENCE_WORDS = new Set(["last", "previous", "prior"]);
const PRIOR_REFERENCE_WORD_WINDOW = 5;
// raw chars comfortably holding the word window plus interleaved markup
const PRIOR_REFERENCE_SCAN_CHARS = 160;

function isPriorReference(html: string, labelIdx: number): boolean {
  const words = html
    .slice(Math.max(0, labelIdx - PRIOR_REFERENCE_SCAN_CHARS), labelIdx)
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;|&#x?[0-9a-f]+;/gi, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .slice(-PRIOR_REFERENCE_WORD_WINDOW);
  return words.some((w) =>
    PRIOR_REFERENCE_WORDS.has(w.replace(/^[^a-z]+/, "").replace(/[^a-z]+$/, "")),
  );
}
const SKIP_RE = /^(?:\s|<[^>]*>|&nbsp;|&#160;)+/;
const TIME_RE = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?\s*ET\b/i;
const EXPLICIT_DATE_RE = /^(?:\s|<[^>]*>|&nbsp;|&#160;)*on\s+([a-z]+)\s+(\d{1,2})(?:\s*,\s*(\d{4}))?/i;

const DAY_MS = 86_400_000;

/** Resolve the ET calendar day a declared cutoff belongs to. An undated
 *  declaration anchors to the REPORT DATE (the provider's report day is its
 *  ET publication day, so the declared wall time reads in that day). An
 *  explicit "on <Month> <D>[, <YYYY>]" date is honored when it lands within
 *  [reportDate − 7 days, reportDate]; a yearless date tries the report year
 *  and the prior year and accepts the UNIQUE candidate in that range —
 *  anything else is malformed (fixed rules, never a guess). */
function resolveEtDay(
  reportDate: string,
  explicit: { monthName: string; day: number; year: number | null } | null,
): string | null {
  if (explicit === null) return reportDate;
  const monthIdx = MONTH_NAMES.indexOf(explicit.monthName.toLowerCase());
  if (monthIdx === -1) return null;
  const reportMs = parseIsoDayMs(reportDate);
  if (reportMs === null) return null;
  const reportYear = Number(reportDate.slice(0, 4));
  const years = explicit.year !== null ? [explicit.year] : [reportYear, reportYear - 1];
  const inRange: string[] = [];
  for (const y of years) {
    const candidate = `${String(y).padStart(4, "0")}-${String(monthIdx + 1).padStart(2, "0")}-${String(explicit.day).padStart(2, "0")}`;
    const ms = parseIsoDayMs(candidate);
    if (ms === null) continue;
    if (ms <= reportMs && ms >= reportMs - 7 * DAY_MS) inRange.push(candidate);
  }
  return inRange.length === 1 ? inRange[0] : null;
}

/**
 * Extract THE declared data cutoff for a report. `reportDate` (yyyy-mm-dd)
 * anchors undated declarations. Pure and total.
 */
export function extractDeclaredCutoff(html: string, reportDate: string): CutoffExtraction {
  const none = (outcome: CutoffExtractionOutcome): CutoffExtraction => ({
    outcome,
    cutoffAtMs: null,
    cutoffAt: null,
    dstAmbiguousFirstOccurrence: false,
    patternVersion: CUTOFF_PATTERN_VERSION,
  });
  if (parseIsoDayMs(reportDate) === null) return none("malformed");

  const instants = new Set<number>();
  let sawDeclaration = false;
  let sawMalformed = false;
  let sawNonexistent = false;
  let sawAmbiguous = false;

  for (const label of html.matchAll(CUTOFF_LABEL_RE)) {
    const idx = label.index ?? 0;
    if (isPriorReference(html, idx)) continue; // reference to an earlier report
    sawDeclaration = true;

    let rest = html.slice(idx + label[0].length);
    const skip = SKIP_RE.exec(rest);
    if (skip) rest = rest.slice(skip[0].length);
    const time = TIME_RE.exec(rest);
    if (!time) {
      sawMalformed = true;
      continue;
    }
    const rawHour = Number(time[1]);
    const minute = time[2] === undefined ? 0 : Number(time[2]);
    if (rawHour < 1 || rawHour > 12 || minute > 59) {
      sawMalformed = true;
      continue;
    }
    const pm = time[3].toLowerCase() === "p";
    const hour = (rawHour % 12) + (pm ? 12 : 0);

    const afterTime = rest.slice(time[0].length);
    const dateMatch = EXPLICIT_DATE_RE.exec(afterTime);
    const etDay = resolveEtDay(
      reportDate,
      dateMatch
        ? { monthName: dateMatch[1], day: Number(dateMatch[2]), year: dateMatch[3] ? Number(dateMatch[3]) : null }
        : null,
    );
    if (etDay === null) {
      sawMalformed = true;
      continue;
    }

    const converted = etWallClockToUtcMs(etDay, hour, minute);
    if (converted.instantMs === null) {
      sawNonexistent = true;
      continue;
    }
    if (converted.resolution === "ambiguous_first_occurrence") sawAmbiguous = true;
    instants.add(converted.instantMs);
  }

  if (!sawDeclaration) return none("absent");
  if (instants.size > 1) return none("conflicting");
  if (instants.size === 0) {
    // every declaration failed: nonexistent-local-time only when NO
    // declaration failed for an ordinary structural reason
    return none(sawNonexistent && !sawMalformed ? "nonexistent_local_time" : "malformed");
  }
  const ms = [...instants][0];
  // a parallel malformed declaration alongside one clean value: the clean
  // value stands (the malformed copy is a rendering artifact, not a second
  // declared cutoff) — conflicting is reserved for two VALID disagreeing values
  return {
    outcome: "parsed",
    cutoffAtMs: ms,
    cutoffAt: new Date(ms).toISOString(),
    dstAmbiguousFirstOccurrence: sawAmbiguous,
    patternVersion: CUTOFF_PATTERN_VERSION,
  };
}

// ---------------------------------------------------------------------------
// Combined extraction + the cutoff/publication ordering diagnostic
// ---------------------------------------------------------------------------

export interface ReportInstantExtraction {
  published: PublishedExtraction;
  cutoff: CutoffExtraction;
  /** Gate-1 carried NOTE — VISIBLE, NON-REJECTING: the declared cutoff parsed
   *  to an instant strictly AFTER the publication instant. The §5 window
   *  ladder still applies unchanged (rung 1 still uses the cutoff); this only
   *  surfaces the inversion for operators/reviewers. */
  cutoffAfterPublication: boolean;
}

export function extractReportInstants(html: string, reportDate: string): ReportInstantExtraction {
  const published = extractDatePublished(html);
  const cutoff = extractDeclaredCutoff(html, reportDate);
  return {
    published,
    cutoff,
    cutoffAfterPublication:
      cutoff.cutoffAtMs !== null &&
      published.publishedAtMs !== null &&
      cutoff.cutoffAtMs > published.publishedAtMs,
  };
}

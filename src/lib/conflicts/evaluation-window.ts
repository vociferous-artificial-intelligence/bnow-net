// The FROZEN evaluation-window ladder (Phase 2; contract §5, decision
// register #6; windowEndSource per §6.4 / register #8 M2).
//
// Per report: START = reportDate − 2 days at 00:00Z (inclusive). END, by
// rung: (1) cutoffAt when parseable → windowEndSource "cutoff"; (2) else
// publishedAt when known → "published"; (3) else the EXCLUSIVE end of the
// report date's UTC day → "report_day". The END boundary is INCLUSIVE ("at
// or before") wherever an instant comparison applies — rung 3's end is the
// only exclusive boundary (midnight of the next day, which no in-day instant
// equals anyway).
//
// DAY-GRANULARITY RULE (register #6 / Gate-0 science NOTE-2, expressed in
// this API): claims are day-granular (`claimDate`), so an END-rung change
// affects ELIGIBILITY only when it changes the window's END DATE (e.g. a
// publication instant past UTC midnight — fixture cc-window-rung2-017);
// sub-day END differences drive only per-document instant diagnostics. The
// window therefore carries BOTH the instant bounds and the derived day span,
// and windowEndSource keeps either case visible.
//
// Malformed anchors are classified through the Phase 1 classifyTimeAnchor
// rule (malformed_treated_as_missing — recorded, never guessed) and send the
// END to the next rung. The cutoff-after-publication ordering diagnostic
// (Gate-1 carried NOTE) is VISIBLE and NON-REJECTING: the ladder applies
// unchanged either way.

import { ConflictDomainError } from "./errors";
import {
  classifyTimeAnchor,
  exclusiveEndOfDayMs,
  parseIsoDayMs,
  type TimeAnchorTreatment,
} from "./instants";
import type { WindowEndSource } from "./vocabulary";

const DAY_MS = 86_400_000;

export interface EvaluationWindowInput {
  /** yyyy-mm-dd UTC day of the report */
  reportDate: string;
  /** RAW declared cutoff anchor — a valid instant, a malformed string
   *  (treated as missing), or null/undefined (missing) */
  cutoffAt: string | null | undefined;
  /** RAW publication anchor, same semantics */
  publishedAt: string | null | undefined;
}

export interface EvaluationWindow {
  /** inclusive start: 00:00:00.000Z of startDate */
  startMs: number;
  /** rung 1/2: the INCLUSIVE end instant; rung 3: the EXCLUSIVE end of the
   *  report date's UTC day */
  endMs: number;
  endBoundary: "inclusive" | "exclusive";
  windowEndSource: WindowEndSource;
  /** first UTC day whose day-granular claims are eligible (reportDate − 2) */
  startDate: string;
  /** LAST UTC day whose day-granular claims are eligible */
  endDate: string;
  /** true when the end instant precedes the start (a pathological parseable
   *  cutoff far in the past) — kept visible, never silently reordered; every
   *  instant and every day is out-of-window then */
  empty: boolean;
  cutoffTreatment: TimeAnchorTreatment;
  publishedTreatment: TimeAnchorTreatment;
  /** visible, non-rejecting ordering diagnostic (Gate-1 carried NOTE):
   *  cutoff and publication both parseable AND cutoff > publication */
  orderingDiagnostic: "cutoff_after_publication" | null;
}

/** Compute the frozen §5 window. Throws typed only on a malformed reportDate
 *  (the report identity guarantees one upstream); anchor malformation is a
 *  classified outcome, never a throw. */
export function computeEvaluationWindow(input: EvaluationWindowInput): EvaluationWindow {
  const reportDayMs = parseIsoDayMs(input.reportDate);
  if (reportDayMs === null) {
    throw new ConflictDomainError(
      "invalid_instant",
      `reportDate must be a valid yyyy-mm-dd UTC day, got ${JSON.stringify(input.reportDate)}`,
    );
  }
  const cutoff = classifyTimeAnchor(input.cutoffAt);
  const published = classifyTimeAnchor(input.publishedAt);

  const startMs = reportDayMs - 2 * DAY_MS;
  const startDate = new Date(startMs).toISOString().slice(0, 10);

  let endMs: number;
  let endBoundary: "inclusive" | "exclusive";
  let windowEndSource: WindowEndSource;
  let endDate: string;
  if (cutoff.treatment === "present") {
    endMs = cutoff.instantMs as number;
    endBoundary = "inclusive";
    windowEndSource = "cutoff";
    endDate = new Date(endMs).toISOString().slice(0, 10);
  } else if (published.treatment === "present") {
    endMs = published.instantMs as number;
    endBoundary = "inclusive";
    windowEndSource = "published";
    endDate = new Date(endMs).toISOString().slice(0, 10);
  } else {
    endMs = exclusiveEndOfDayMs(input.reportDate) as number;
    endBoundary = "exclusive";
    windowEndSource = "report_day";
    // exclusive midnight end: the last INCLUDED day is the report date itself
    endDate = input.reportDate;
  }

  return {
    startMs,
    endMs,
    endBoundary,
    windowEndSource,
    startDate,
    endDate,
    empty: endMs < startMs,
    cutoffTreatment: cutoff.treatment,
    publishedTreatment: published.treatment,
    orderingDiagnostic:
      cutoff.treatment === "present" &&
      published.treatment === "present" &&
      (cutoff.instantMs as number) > (published.instantMs as number)
        ? "cutoff_after_publication"
        : null,
  };
}

/** Instant comparison against the window: inclusive END ("at or before")
 *  where an instant comparison applies; rung 3's exclusive midnight end. */
export function isInstantInWindow(window: EvaluationWindow, instantMs: number): boolean {
  if (window.empty) return false;
  if (instantMs < window.startMs) return false;
  return window.endBoundary === "inclusive" ? instantMs <= window.endMs : instantMs < window.endMs;
}

/** Day-granular claim eligibility: claimDate within [startDate, endDate].
 *  ISO days compare lexicographically. Malformed days are simply out. */
export function isClaimDateInWindow(window: EvaluationWindow, claimDate: string): boolean {
  if (window.empty) return false;
  if (parseIsoDayMs(claimDate) === null) return false;
  return claimDate >= window.startDate && claimDate <= window.endDate;
}

/** The window's eligible UTC days, oldest first ([] for an empty window). */
export function windowDaySpan(window: EvaluationWindow): string[] {
  if (window.empty) return [];
  const days: string[] = [];
  for (let ms = parseIsoDayMs(window.startDate) as number; ; ms += DAY_MS) {
    const day = new Date(ms).toISOString().slice(0, 10);
    if (day > window.endDate) break;
    days.push(day);
  }
  return days;
}

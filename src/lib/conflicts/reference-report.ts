// Reference report/edition identity (Phase 1; contract §3/§9).
//
// One reference report/edition = one benchmark observation (contract §2).
// This module owns only the IDENTITY shape and its pure validation; edition
// discovery, daily-final selection, and the evaluation-window ladder are
// Phase 2. The identity is STRICT: cutoffAt/publishedAt are either valid
// explicit-timezone instants or null — never a guessed or malformed value.
// A loader holding a RAW (possibly malformed) declared timestamp normalizes
// it through classifyTimeAnchor first (malformed → null here + the raw string
// kept as a diagnostic wherever the loader records provenance), per the
// contract §9 "recorded raw and treated as missing, never guessed" rule.

import { ConflictDomainError } from "./errors";
import { deepFreeze } from "./freeze";
import { isIsoDay, isIsoInstant } from "./instants";
import { isReferenceSeriesId, type ReferenceSeriesId } from "./vocabulary";

export interface ReferenceReportIdentity {
  series: ReferenceSeriesId;
  /** `<series>:<reportDate>:<edition-label>` (the documented §9 identity
   *  shape; e.g. "iran_update:2026-08-08:final") — the segments MUST agree
   *  with `series` and `reportDate`, so one identity can never quietly claim
   *  two different reports */
  editionKey: string;
  /** yyyy-mm-dd (UTC calendar day of the report) */
  reportDate: string;
  /** declared data-cutoff instant (explicit timezone) or null when absent or
   *  unparseable — never guessed */
  cutoffAt: string | null;
  /** publication instant (explicit timezone) or null */
  publishedAt: string | null;
  /** the reference series' versioned editorial scope (contract §0/§9) */
  scopeVersion: string;
}

const EDITION_LABEL_RE = /^[a-z0-9][a-z0-9-]*$/;

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Precise structural + consistency validation. [] = valid (house style). */
export function validateReferenceReportIdentity(raw: unknown): string[] {
  const errs: string[] = [];
  if (!isRecord(raw)) return ["reference report identity: not an object"];
  const r = raw as Partial<ReferenceReportIdentity>;

  if (!isReferenceSeriesId(r.series)) {
    errs.push(`series: unknown reference series ${JSON.stringify(r.series)}`);
  }
  if (typeof r.reportDate !== "string" || !isIsoDay(r.reportDate)) {
    errs.push(`reportDate: must be a valid yyyy-mm-dd UTC day, got ${JSON.stringify(r.reportDate)}`);
  }

  if (typeof r.editionKey !== "string" || r.editionKey.length === 0) {
    errs.push("editionKey: must be a non-empty string");
  } else {
    const segments = r.editionKey.split(":");
    if (segments.length !== 3 || !EDITION_LABEL_RE.test(segments[2] ?? "")) {
      errs.push(
        `editionKey: must be <series>:<reportDate>:<edition-label>, got ${JSON.stringify(r.editionKey)}`,
      );
    } else {
      if (isReferenceSeriesId(r.series) && segments[0] !== r.series) {
        errs.push(`editionKey: series segment ${JSON.stringify(segments[0])} != series ${r.series}`);
      }
      if (typeof r.reportDate === "string" && isIsoDay(r.reportDate) && segments[1] !== r.reportDate) {
        errs.push(
          `editionKey: date segment ${JSON.stringify(segments[1])} != reportDate ${r.reportDate}`,
        );
      }
    }
  }

  // both anchors must be PRESENT — explicitly null when absent (an omitted
  // field is indistinguishable from a forgotten one and is rejected)
  for (const field of ["cutoffAt", "publishedAt"] as const) {
    const v = r[field];
    if (v === null) continue;
    if (typeof v !== "string" || !isIsoInstant(v)) {
      // PHASE 5 STORED-ERROR OBLIGATION (Gate-4 legal note, comment only):
      // this message embeds the raw anchor value via JSON.stringify. Fine
      // while errors are transient (thrown, logged locally, never persisted);
      // if Phase 5 ever STORES validation errors, this message becomes a
      // free-text channel and must be redacted/bounded at the storage seam
      // (the persistence gate's isPersistableRawAnchor rule is the model).
      errs.push(
        `${field}: must be null or an explicit-timezone ISO instant, got ${JSON.stringify(v)} ` +
          "(normalize raw declared timestamps through classifyTimeAnchor first — malformed is treated as missing, never guessed)",
      );
    }
  }

  if (typeof r.scopeVersion !== "string" || r.scopeVersion.length === 0) {
    errs.push("scopeVersion: must be a non-empty string");
  }
  return errs;
}

/** Parse + validate from unknown input. Throws typed on any issue. */
export function parseReferenceReportIdentity(raw: unknown): ReferenceReportIdentity {
  const issues = validateReferenceReportIdentity(raw);
  if (issues.length > 0) {
    throw new ConflictDomainError("invalid_reference_report", "invalid reference report identity", issues);
  }
  const r = raw as Record<string, unknown>;
  // rebuild with exactly the contract fields (extra keys are dropped, never
  // silently carried into a canonical identity); frozen for symmetry with the
  // rest of the package — a parsed identity is a value, not a scratch buffer
  return deepFreeze({
    series: r.series as ReferenceSeriesId,
    editionKey: r.editionKey as string,
    reportDate: r.reportDate as string,
    cutoffAt: r.cutoffAt as string | null,
    publishedAt: r.publishedAt as string | null,
    scopeVersion: r.scopeVersion as string,
  });
}

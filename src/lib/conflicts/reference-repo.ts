// Reference-report repository (Phase 2; contract §9, §13 P2).
//
// ONE repository contract with two implementations: the pure in-memory /
// fixture implementation below (no network, no DB — loadable from the
// fixtures/conflicts report shapes) and the disposable-SQL-backed
// implementation in ./reference-repo-sql.ts (integration tests only; durable
// DB wiring is DEFERRED to the operator-selected integration phase, per
// docs/designs/CONFLICT-REFERENCE-REPORTS-SCHEMA.md).
//
// BOTH implementations route every write through the ONE pure merge
// authority here (mergeEditionRecords + nextStoredDayStatus), so replay
// semantics cannot drift between them: same inputs give same records;
// replays REPAIR (missing anchors fill in, parse failures never downgrade a
// parse, stale gap rows clear when an edition arrives) and never duplicate
// (editionKey is the identity). The existing citation-refresh loader
// (src/lib/isw/load.ts) keeps working unchanged — isw_reports rows remain
// the citation anchor; this layer only LINKS to them via citationAnchorId.

import {
  editionLabel,
  editionRecordFromFixtureReport,
  nextStoredDayStatus,
  orderEditionsByFinality,
  parseEditionRecord,
  type ReferenceDayStatus,
  type ReferenceEditionRecord,
  type StoredDayStatus,
} from "./editions";
import { ConflictDomainError } from "./errors";
import type { ReferenceSeriesId } from "./vocabulary";

// ---------------------------------------------------------------------------
// Merge semantics (the shared write authority)
// ---------------------------------------------------------------------------

export const EDITION_REPAIRED_FIELDS = [
  "cutoff",
  "published",
  "parse_status",
  "canonical_url",
  "norm_version",
  "designated_final",
  "citation_anchor",
] as const;
export type EditionRepairedField = (typeof EDITION_REPAIRED_FIELDS)[number];

export interface EditionMergeResult {
  merged: ReferenceEditionRecord;
  /** which bounded fields the incoming record changed */
  repairedFields: readonly EditionRepairedField[];
  /** an anchor moved from one PRESENT value to a DIFFERENT present value —
   *  visible repair, never silent */
  anchorChanged: boolean;
}

function mergeAnchor(
  existing: { value: string | null; treatment: ReferenceEditionRecord["cutoffTreatment"] },
  incoming: { value: string | null; treatment: ReferenceEditionRecord["cutoffTreatment"] },
): { value: string | null; treatment: ReferenceEditionRecord["cutoffTreatment"]; changed: boolean; presentChanged: boolean } {
  if (incoming.treatment === "present") {
    const presentChanged = existing.treatment === "present" && existing.value !== incoming.value;
    const changed = existing.treatment !== "present" || presentChanged;
    return { value: incoming.value, treatment: "present", changed, presentChanged };
  }
  if (existing.treatment === "present") {
    // never downgrade a known instant to missing/malformed
    return { value: existing.value, treatment: existing.treatment, changed: false, presentChanged: false };
  }
  // both absent: adopt the incoming classification (missing vs malformed is a
  // diagnostic refinement, not a downgrade)
  return {
    value: null,
    treatment: incoming.treatment,
    changed: existing.treatment !== incoming.treatment,
    presentChanged: false,
  };
}

const PARSE_RANK = { pending: 0, failed: 1, parsed: 2 } as const;

/**
 * Merge a replayed/refreshed observation of the SAME edition into its stored
 * record. Deterministic and idempotent: merge(merge(a, b), b) === merge(a, b).
 * Identity fields must agree; canonicalUrl and citationAnchorId may fill in
 * (null → value) but never silently MOVE — a differing non-null value is a
 * typed conflict (an editionKey pointing at two URLs or two anchor rows is an
 * identity violation, not a repair). Anchors and parse status upgrade only;
 * designation may flip (a policy update) but the flip is a visible repair.
 */
export function mergeEditionRecords(
  existing: ReferenceEditionRecord,
  incoming: ReferenceEditionRecord,
): EditionMergeResult {
  const a = existing.identity;
  const b = incoming.identity;
  if (a.editionKey !== b.editionKey || a.series !== b.series || a.reportDate !== b.reportDate) {
    throw new ConflictDomainError(
      "edition_merge_conflict",
      `cannot merge different editions: ${a.editionKey} vs ${b.editionKey}`,
    );
  }
  if (a.scopeVersion !== b.scopeVersion) {
    throw new ConflictDomainError(
      "edition_merge_conflict",
      `scopeVersion conflict for ${a.editionKey}: ${a.scopeVersion} vs ${b.scopeVersion}`,
    );
  }
  if (existing.provider !== incoming.provider) {
    throw new ConflictDomainError(
      "edition_merge_conflict",
      `provider conflict for ${a.editionKey}: ${existing.provider} vs ${incoming.provider}`,
    );
  }
  for (const [field, ev, iv] of [
    ["canonicalUrl", existing.canonicalUrl, incoming.canonicalUrl],
    ["citationAnchorId", existing.citationAnchorId, incoming.citationAnchorId],
  ] as const) {
    if (ev !== null && iv !== null && ev !== iv) {
      throw new ConflictDomainError(
        "edition_merge_conflict",
        `${field} conflict for ${a.editionKey}: ${JSON.stringify(ev)} vs ${JSON.stringify(iv)}`,
      );
    }
  }

  const repaired: EditionRepairedField[] = [];
  const cutoff = mergeAnchor(
    { value: a.cutoffAt, treatment: existing.cutoffTreatment },
    { value: b.cutoffAt, treatment: incoming.cutoffTreatment },
  );
  if (cutoff.changed) repaired.push("cutoff");
  const published = mergeAnchor(
    { value: a.publishedAt, treatment: existing.publishedTreatment },
    { value: b.publishedAt, treatment: incoming.publishedTreatment },
  );
  if (published.changed) repaired.push("published");

  // parse status: strictly upgrade (pending < failed < parsed) — a replayed
  // failure never destroys a good parse (the isw/load.ts never-downgrade rule)
  const parseStatus =
    PARSE_RANK[incoming.parseStatus] > PARSE_RANK[existing.parseStatus]
      ? incoming.parseStatus
      : existing.parseStatus;
  if (parseStatus !== existing.parseStatus) repaired.push("parse_status");

  const canonicalUrl = existing.canonicalUrl ?? incoming.canonicalUrl;
  if (canonicalUrl !== existing.canonicalUrl) repaired.push("canonical_url");
  const normVersion = incoming.normVersion ?? existing.normVersion;
  if (normVersion !== existing.normVersion) repaired.push("norm_version");
  const citationAnchorId = existing.citationAnchorId ?? incoming.citationAnchorId;
  if (citationAnchorId !== existing.citationAnchorId) repaired.push("citation_anchor");
  const designatedFinal = incoming.designatedFinal ?? existing.designatedFinal;
  if (designatedFinal !== existing.designatedFinal) repaired.push("designated_final");

  const merged = parseEditionRecord({
    identity: {
      series: a.series,
      editionKey: a.editionKey,
      reportDate: a.reportDate,
      cutoffAt: cutoff.value,
      publishedAt: published.value,
      scopeVersion: a.scopeVersion,
    },
    provider: existing.provider,
    canonicalUrl,
    normVersion,
    designatedFinal,
    cutoffTreatment: cutoff.treatment,
    publishedTreatment: published.treatment,
    parseStatus,
    citationAnchorId,
  } satisfies ReferenceEditionRecord);

  return {
    merged,
    repairedFields: repaired,
    anchorChanged: cutoff.presentChanged || published.presentChanged,
  };
}

// ---------------------------------------------------------------------------
// Repository contract
// ---------------------------------------------------------------------------

export interface EditionUpsertResult {
  action: "inserted" | "unchanged" | "repaired";
  repairedFields: readonly EditionRepairedField[];
  anchorChanged: boolean;
  /** a stored gap/probe-failed day row was cleared because this edition now
   *  proves the day published */
  dayStatusCleared: boolean;
}

export interface DayStatusResult {
  status: ReferenceDayStatus;
  /** `published_wins`: editions exist for the day, so nothing was stored —
   *  a gap is never fabricated over a known edition */
  action: "set" | "unchanged" | "kept_prior" | "published_wins";
}

export interface ReferenceReportRepository {
  /** Idempotent write keyed by editionKey (replays repair, never duplicate). */
  upsertEdition(record: ReferenceEditionRecord): Promise<EditionUpsertResult>;
  getEdition(editionKey: string): Promise<ReferenceEditionRecord | null>;
  /** ALL editions of one (series, reportDate), in the deterministic finality
   *  ordering (most-final first) — never an unordered same-date set. */
  editionsForDay(series: ReferenceSeriesId, reportDate: string): Promise<readonly ReferenceEditionRecord[]>;
  /** Record a discovery outcome for a day with NO edition. */
  recordDayStatus(
    series: ReferenceSeriesId,
    reportDate: string,
    observed: StoredDayStatus,
  ): Promise<DayStatusResult>;
  /** Derived status: published (editions exist) → stored gap/probe row →
   *  unknown. */
  dayStatus(series: ReferenceSeriesId, reportDate: string): Promise<ReferenceDayStatus>;
}

// ---------------------------------------------------------------------------
// Pure in-memory / fixture implementation
// ---------------------------------------------------------------------------

export class InMemoryReferenceReportRepository implements ReferenceReportRepository {
  private editions = new Map<string, ReferenceEditionRecord>();
  private dayRows = new Map<string, StoredDayStatus>();

  private static dayKey(series: ReferenceSeriesId, reportDate: string): string {
    return `${series}:${reportDate}`;
  }

  /** Load fixture-corpus report shapes (each `{ series, editionKey,
   *  reportDate, cutoffAt?, publishedAt?, designatedFinal? }`). */
  async loadFixtureReports(reports: readonly unknown[]): Promise<void> {
    for (const raw of reports) {
      await this.upsertEdition(editionRecordFromFixtureReport(raw));
    }
  }

  async upsertEdition(record: ReferenceEditionRecord): Promise<EditionUpsertResult> {
    const canonical = parseEditionRecord(record); // validate + canonical projection
    const key = canonical.identity.editionKey;
    const existing = this.editions.get(key) ?? null;
    const dayKey = InMemoryReferenceReportRepository.dayKey(
      canonical.identity.series,
      canonical.identity.reportDate,
    );
    const dayStatusCleared = this.dayRows.delete(dayKey); // an edition proves publication

    if (existing === null) {
      this.editions.set(key, canonical);
      return { action: "inserted", repairedFields: [], anchorChanged: false, dayStatusCleared };
    }
    const { merged, repairedFields, anchorChanged } = mergeEditionRecords(existing, canonical);
    this.editions.set(key, merged);
    return {
      action: repairedFields.length === 0 ? "unchanged" : "repaired",
      repairedFields,
      anchorChanged,
      dayStatusCleared,
    };
  }

  async getEdition(editionKey: string): Promise<ReferenceEditionRecord | null> {
    return this.editions.get(editionKey) ?? null;
  }

  async editionsForDay(
    series: ReferenceSeriesId,
    reportDate: string,
  ): Promise<readonly ReferenceEditionRecord[]> {
    const day = [...this.editions.values()].filter(
      (e) => e.identity.series === series && e.identity.reportDate === reportDate,
    );
    return orderEditionsByFinality(day);
  }

  async recordDayStatus(
    series: ReferenceSeriesId,
    reportDate: string,
    observed: StoredDayStatus,
  ): Promise<DayStatusResult> {
    const editions = await this.editionsForDay(series, reportDate);
    if (editions.length > 0) return { status: "published", action: "published_wins" };
    const key = InMemoryReferenceReportRepository.dayKey(series, reportDate);
    const next = nextStoredDayStatus(this.dayRows.get(key) ?? null, observed);
    if (next.action === "set") this.dayRows.set(key, next.status);
    return { status: next.status, action: next.action };
  }

  async dayStatus(series: ReferenceSeriesId, reportDate: string): Promise<ReferenceDayStatus> {
    const editions = await this.editionsForDay(series, reportDate);
    if (editions.length > 0) return "published";
    return this.dayRows.get(InMemoryReferenceReportRepository.dayKey(series, reportDate)) ?? "unknown";
  }
}

export { editionLabel, editionRecordFromFixtureReport };

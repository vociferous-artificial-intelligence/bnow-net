// Disposable-SQL-backed ReferenceReportRepository (Phase 2).
//
// Exercised ONLY by integration tests against the DISPOSABLE DDL in
// src/integration/sql/ (see its README) on a throwaway Neon fork. This is
// NOT durable production wiring: the real forward migration is generated
// later on the operator-selected integration base
// (docs/designs/CONFLICT-REFERENCE-REPORTS-SCHEMA.md §Migration). Nothing in
// production imports this module.
//
// Every write routes through the SAME pure merge authority as the in-memory
// implementation (mergeEditionRecords / nextStoredDayStatus in
// ./reference-repo and ./editions), so the two implementations cannot drift:
// the SQL layer is a persistence shim, not a second semantics. Writes use
// read-merge-write with an ON CONFLICT DO NOTHING insert race guard; the
// production-grade concurrent upsert (single-statement CASE-guarded ON
// CONFLICT DO UPDATE or advisory locking) is a recorded LATER integration
// gate — disposable SQL cannot certify it (design doc §Deferred).
//
// LEGAL: stored strings are URLs, keys, dates, enum values, and version
// identifiers only — no report prose, no raw malformed-timestamp text.

import type { QueryFn } from "../isw/load";
import {
  nextStoredDayStatus,
  orderEditionsByFinality,
  parseEditionRecord,
  type ReferenceDayStatus,
  type ReferenceEditionRecord,
  type StoredDayStatus,
} from "./editions";
import { ConflictDomainError } from "./errors";
import {
  mergeEditionRecords,
  type DayStatusResult,
  type EditionUpsertResult,
  type ReferenceReportRepository,
} from "./reference-repo";
import type { ReferenceSeriesId } from "./vocabulary";

// re-exported type alias keeps the itest import surface small
export type { QueryFn };

type Row = Record<string, unknown>;

function toIsoInstantOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) {
    throw new ConflictDomainError("invalid_edition_record", "unreadable timestamptz from driver");
  }
  return d.toISOString();
}

function toIsoDay(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function rowToRecord(row: Row): ReferenceEditionRecord {
  return parseEditionRecord({
    identity: {
      series: String(row.series),
      editionKey: String(row.edition_key),
      reportDate: toIsoDay(row.report_date),
      cutoffAt: toIsoInstantOrNull(row.cutoff_at),
      publishedAt: toIsoInstantOrNull(row.published_at),
      scopeVersion: String(row.scope_version),
    },
    provider: String(row.provider) as ReferenceEditionRecord["provider"],
    canonicalUrl: row.canonical_url === null ? null : String(row.canonical_url),
    normVersion: row.norm_version === null ? null : String(row.norm_version),
    designatedFinal: row.designated_final === null ? null : Boolean(row.designated_final),
    cutoffTreatment: String(row.cutoff_treatment) as ReferenceEditionRecord["cutoffTreatment"],
    publishedTreatment: String(row.published_treatment) as ReferenceEditionRecord["publishedTreatment"],
    parseStatus: String(row.parse_status) as ReferenceEditionRecord["parseStatus"],
    citationAnchorId: row.isw_report_id === null ? null : Number(row.isw_report_id),
  });
}

const EDITION_COLUMNS = `series, provider, edition_key, edition_label, report_date, canonical_url,
   norm_version, scope_version, cutoff_at, published_at, cutoff_treatment, published_treatment,
   designated_final, parse_status, isw_report_id`;

function recordParams(r: ReferenceEditionRecord): unknown[] {
  return [
    r.identity.series,
    r.provider,
    r.identity.editionKey,
    r.identity.editionKey.split(":")[2],
    r.identity.reportDate,
    r.canonicalUrl,
    r.normVersion,
    r.identity.scopeVersion,
    r.identity.cutoffAt,
    r.identity.publishedAt,
    r.cutoffTreatment,
    r.publishedTreatment,
    r.designatedFinal,
    r.parseStatus,
    r.citationAnchorId,
  ];
}

export class SqlReferenceReportRepository implements ReferenceReportRepository {
  constructor(private readonly query: QueryFn) {}

  async upsertEdition(record: ReferenceEditionRecord): Promise<EditionUpsertResult> {
    const canonical = parseEditionRecord(record);
    const key = canonical.identity.editionKey;

    const inserted = await this.query(
      `INSERT INTO benchmark_report_editions (${EDITION_COLUMNS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (edition_key) DO NOTHING RETURNING id`,
      recordParams(canonical),
    );

    // an edition proves the day published: clear any stale gap/probe row —
    // AFTER the insert statement succeeds, so a failed insert (a
    // canonical_url duplicated from another day hitting the partial unique
    // index, or a transient DB error) never erases a stored probe_failed/
    // gap discovery record. Mirrors the in-memory backend, where validation
    // precedes the clear so a refused record cannot clear the row.
    const cleared = await this.query(
      `DELETE FROM benchmark_series_days WHERE series = $1 AND report_date = $2 RETURNING series`,
      [canonical.identity.series, canonical.identity.reportDate],
    );
    const dayStatusCleared = cleared.length > 0;
    if (inserted.length > 0) {
      return { action: "inserted", repairedFields: [], anchorChanged: false, dayStatusCleared };
    }

    const existingRows = await this.query(
      `SELECT * FROM benchmark_report_editions WHERE edition_key = $1`,
      [key],
    );
    if (existingRows.length === 0) {
      throw new ConflictDomainError("invalid_edition_record", `upsert race lost twice for ${key}`);
    }
    const existing = rowToRecord(existingRows[0]);
    const { merged, repairedFields, anchorChanged } = mergeEditionRecords(existing, canonical);
    if (repairedFields.length === 0) {
      return { action: "unchanged", repairedFields, anchorChanged, dayStatusCleared };
    }
    await this.query(
      `UPDATE benchmark_report_editions SET
         canonical_url = $2, norm_version = $3, cutoff_at = $4, published_at = $5,
         cutoff_treatment = $6, published_treatment = $7, designated_final = $8,
         parse_status = $9, isw_report_id = $10
       WHERE edition_key = $1`,
      [
        key,
        merged.canonicalUrl,
        merged.normVersion,
        merged.identity.cutoffAt,
        merged.identity.publishedAt,
        merged.cutoffTreatment,
        merged.publishedTreatment,
        merged.designatedFinal,
        merged.parseStatus,
        merged.citationAnchorId,
      ],
    );
    return { action: "repaired", repairedFields, anchorChanged, dayStatusCleared };
  }

  async getEdition(editionKey: string): Promise<ReferenceEditionRecord | null> {
    const rows = await this.query(
      `SELECT * FROM benchmark_report_editions WHERE edition_key = $1`,
      [editionKey],
    );
    return rows.length === 0 ? null : rowToRecord(rows[0]);
  }

  async editionsForDay(
    series: ReferenceSeriesId,
    reportDate: string,
  ): Promise<readonly ReferenceEditionRecord[]> {
    // edition_key ordering here is only a stable FETCH order; the meaningful
    // ordering is the shared finality comparator applied below — the same
    // single authority the in-memory implementation uses (never rows[0] of
    // an unordered same-date set)
    const rows = await this.query(
      `SELECT * FROM benchmark_report_editions WHERE series = $1 AND report_date = $2
       ORDER BY edition_key`,
      [series, reportDate],
    );
    return orderEditionsByFinality(rows.map(rowToRecord));
  }

  async recordDayStatus(
    series: ReferenceSeriesId,
    reportDate: string,
    observed: StoredDayStatus,
  ): Promise<DayStatusResult> {
    const editions = await this.editionsForDay(series, reportDate);
    if (editions.length > 0) return { status: "published", action: "published_wins" };
    const rows = await this.query(
      `SELECT status FROM benchmark_series_days WHERE series = $1 AND report_date = $2`,
      [series, reportDate],
    );
    const current = rows.length === 0 ? null : (String(rows[0].status) as StoredDayStatus);
    const next = nextStoredDayStatus(current, observed);
    if (next.action === "set") {
      await this.query(
        `INSERT INTO benchmark_series_days (series, report_date, status) VALUES ($1, $2, $3)
         ON CONFLICT (series, report_date) DO UPDATE SET status = EXCLUDED.status`,
        [series, reportDate, next.status],
      );
    }
    return { status: next.status, action: next.action };
  }

  async dayStatus(series: ReferenceSeriesId, reportDate: string): Promise<ReferenceDayStatus> {
    const editions = await this.editionsForDay(series, reportDate);
    if (editions.length > 0) return "published";
    const rows = await this.query(
      `SELECT status FROM benchmark_series_days WHERE series = $1 AND report_date = $2`,
      [series, reportDate],
    );
    return rows.length === 0 ? "unknown" : (String(rows[0].status) as ReferenceDayStatus);
  }
}

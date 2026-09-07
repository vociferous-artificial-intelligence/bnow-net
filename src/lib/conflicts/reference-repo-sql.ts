// Postgres-backed ReferenceReportRepository.
//
// Targets the DURABLE tables created by migration 0028
// (benchmark_report_editions, benchmark_series_days — src/db/schema.ts). Until
// that migration this file ran against disposable integration-test DDL; the
// tables are now part of the schema, and the integration test applies the real
// migrations with scripts/migrations-lib.ts runMigrations().
//
// Nothing in production imports this module yet: the conflict layer stays
// dormant until the shadow-soak gate (docs/reviews/PLAN-WS-3-validation-by-
// conflict-2026-09-05.md). The tables it writes are additive and start empty;
// isw_reports, source_citations, sources, source_theater_stats and
// validation_runs are never written here — an edition only ever REFERENCES the
// citation anchor row (nullable FK).
//
// Every write routes through the SAME pure merge authority as the in-memory
// implementation (mergeEditionRecords / nextStoredDayStatus in ./reference-repo
// and ./editions), so the two implementations cannot drift: this layer is a
// persistence shim, not a second semantics.
//
// Concurrency posture (design doc §5 "Concurrent-writer hardening"). The
// repository's transport is a bare QueryFn — one autocommit statement per call,
// with no transaction handle to hold — so `SELECT … FOR UPDATE` would release
// its lock at statement end and buy nothing. Instead:
//   * the edition insert and the day-row clear are ONE statement (a
//     data-modifying CTE), so they commit or roll back together and a failed
//     insert can never erase a stored probe_failed/publication_gap record;
//   * the read-merge-write path is a COMPARE-AND-SWAP: the UPDATE is guarded on
//     the exact column values the merge was computed from and retried on a lost
//     race. Because mergeEditionRecords is monotone and idempotent, a retry
//     re-merges against the winner's row and the two writers' repairs converge
//     to their union instead of one silently overwriting the other.
//
// LEGAL (standing ruling 1): stored strings are URLs, keys, dates, enum values,
// version identifiers and instants only — no report prose, no raw
// malformed-timestamp text. `anchor_journal` entries hold instants and field
// names only.

import type { QueryFn } from "../isw/load";
import {
  canonicalEditionDerived,
  canonicalizeIswUrl,
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

/** the partial unique index whose violation is a cross-edition URL claim */
export const EDITION_URL_INDEX = "benchmark_report_editions_url_idx";

/** bounded retries for the compare-and-swap merge path; exhaustion is a typed
 *  refusal, never a silent last-writer-wins */
export const MERGE_ATTEMPT_LIMIT = 4;

/** the anchor journal keeps the most recent entries only — an append-only audit
 *  trail must not become an unbounded column */
export const ANCHOR_JOURNAL_LIMIT = 50;

function toIsoInstantOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) {
    throw new ConflictDomainError("invalid_edition_record", "unreadable timestamptz from driver");
  }
  return d.toISOString();
}

/** Read a report_date value from the driver. Every SELECT in this module
 *  casts `report_date::text` so the driver returns the literal yyyy-mm-dd
 *  string; the Date branch is defense in depth for an uncast read:
 *  node-postgres and @neondatabase/serverless parse a Postgres `date` column
 *  into a JS Date at LOCAL midnight, so reading it back via toISOString()
 *  (UTC) shifts the day BACKWARD on any host east of UTC — the LOCAL
 *  accessors mirror how the driver constructed the value and are correct in
 *  every host zone. */
export function toIsoDay(v: unknown): string {
  if (v instanceof Date) {
    const y = String(v.getFullYear()).padStart(4, "0");
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
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
    // jsonb arrives as a parsed object from both drivers; a text-mode read is
    // parsed here so the canonical projection sees the same shape either way
    derived: canonicalEditionDerived(
      typeof row.derived === "string" ? safeJsonParse(row.derived) : row.derived,
    ),
  });
}

const EDITION_COLUMNS = `series, provider, edition_key, edition_label, report_date, canonical_url,
   norm_version, scope_version, cutoff_at, published_at, cutoff_treatment, published_treatment,
   designated_final, parse_status, isw_report_id, derived`;

// SELECT list for reads: report_date is cast to text so the driver hands back
// the literal yyyy-mm-dd (a bare `date` column becomes a host-local-midnight
// JS Date — see toIsoDay)
export const EDITION_SELECT = `series, provider, edition_key, report_date::text AS report_date, canonical_url,
   norm_version, scope_version, cutoff_at, published_at, cutoff_treatment, published_treatment,
   designated_final, parse_status, isw_report_id, derived`;

/** the merge path additionally reads the stored audit journal so the appended
 *  entry is computed (and length-bounded) in one place */
export const EDITION_MERGE_SELECT = `${EDITION_SELECT}, anchor_journal`;

/** Edition insert + day-row clear as ONE data-modifying CTE.
 *
 *  Both sub-statements are executed exactly once and commit or roll back
 *  together, which is what the design's "wrap the insert + clear pair in ONE
 *  transaction" asks for on a transaction-less QueryFn. Ordering is no longer
 *  load-bearing: a failed insert (a canonical_url duplicated from another day
 *  hitting the partial unique index, or a transient DB error) aborts the whole
 *  statement, so a stored probe_failed/publication_gap discovery record cannot
 *  be erased by a write that never landed. Exported so the integration test
 *  proves the deployed statement, not a copy of it. */
export const EDITION_UPSERT_SQL = `WITH ins AS (
     INSERT INTO benchmark_report_editions (${EDITION_COLUMNS})
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)
     ON CONFLICT (edition_key) DO NOTHING
     RETURNING id
   ), cleared AS (
     DELETE FROM benchmark_series_days WHERE series = $1 AND report_date = $5
     RETURNING series
   )
   SELECT (SELECT count(*) FROM ins)::int AS inserted,
          (SELECT count(*) FROM cleared)::int AS cleared`;

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
    JSON.stringify(r.derived ?? {}),
  ];
}

/** The monotone day-status upsert. The DO UPDATE re-derives the
 *  nextStoredDayStatus transition rule in SQL itself (probe_failed may harden
 *  into publication_gap; a confirmed gap is NEVER downgraded), so even a
 *  stale or racing writer issuing this statement cannot regress a stored
 *  status — single-writer semantics are unchanged (the app layer already
 *  passes a rule-obeying next status). Exported so the integration test
 *  proves the deployed statement, not a copy of it. */
export const DAY_STATUS_UPSERT_SQL = `INSERT INTO benchmark_series_days (series, report_date, status) VALUES ($1, $2, $3)
   ON CONFLICT (series, report_date) DO UPDATE SET status = CASE
     WHEN benchmark_series_days.status = 'probe_failed' AND EXCLUDED.status = 'publication_gap'
       THEN EXCLUDED.status
     ELSE benchmark_series_days.status
   END`;

// ---------------------------------------------------------------------------
// Anchor-change journal (design §5 "Anchor-change journaling")
// ---------------------------------------------------------------------------

export const ANCHOR_JOURNAL_FIELDS = ["cutoff", "published"] as const;
export type AnchorJournalField = (typeof ANCHOR_JOURNAL_FIELDS)[number];

export interface AnchorJournalEntry {
  /** when the move was recorded (canonical UTC ISO instant) */
  at: string;
  field: AnchorJournalField;
  /** the displaced instant and the one that replaced it — both canonical UTC
   *  ISO; `from` is never null (only a present -> present move journals) */
  from: string;
  to: string;
}

function isCanonicalInstant(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const ms = Date.parse(v);
  return !Number.isNaN(ms) && new Date(ms).toISOString() === v;
}

/** Read a stored journal fail-closed: anything that is not an array of
 *  {at, field, from, to} instants/field-names is REFUSED, so the column cannot
 *  quietly accumulate a shape (or a string) the legal rule forbids. */
export function parseStoredAnchorJournal(value: unknown): AnchorJournalEntry[] {
  if (value === null || value === undefined) return [];
  const raw = typeof value === "string" ? safeJsonParse(value) : value;
  if (!Array.isArray(raw)) {
    throw new ConflictDomainError("invalid_edition_record", "anchor_journal: not an array");
  }
  return raw.map((entry, i) => {
    const e = entry as Partial<AnchorJournalEntry> & Record<string, unknown>;
    const keys = Object.keys(e ?? {}).sort().join(",");
    if (
      e === null ||
      typeof e !== "object" ||
      keys !== "at,field,from,to" ||
      !isCanonicalInstant(e.at) ||
      !ANCHOR_JOURNAL_FIELDS.includes(e.field as AnchorJournalField) ||
      !isCanonicalInstant(e.from) ||
      !isCanonicalInstant(e.to)
    ) {
      throw new ConflictDomainError(
        "invalid_edition_record",
        `anchor_journal[${i}]: not an {at, field, from, to} instant entry`,
      );
    }
    return { at: e.at, field: e.field as AnchorJournalField, from: e.from, to: e.to };
  });
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    throw new ConflictDomainError("invalid_edition_record", "anchor_journal: unparseable json");
  }
}

/** The entries a merge adds: exactly the present -> DIFFERENT-present anchor
 *  moves, which is the same condition mergeEditionRecords reports as
 *  `anchorChanged` (asserted by the caller). A fill-in (null -> value) is a
 *  repair, not a move, and journals nothing. */
export function anchorJournalEntriesFor(
  existing: ReferenceEditionRecord,
  merged: ReferenceEditionRecord,
  at: string,
): AnchorJournalEntry[] {
  const entries: AnchorJournalEntry[] = [];
  for (const [field, from, to] of [
    ["cutoff", existing.identity.cutoffAt, merged.identity.cutoffAt],
    ["published", existing.identity.publishedAt, merged.identity.publishedAt],
  ] as const) {
    if (from !== null && to !== null && from !== to) {
      entries.push({ at, field, from, to });
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------

/** Map the driver's constraint violations to typed domain errors where the
 *  domain has a name for them (design §5 "typed constraint errors"). The index
 *  name stays in the message: it is the machine-checkable evidence of WHICH
 *  constraint refused the write. */
function rethrowTyped(e: unknown): never {
  const err = e as { code?: unknown; constraint?: unknown; message?: unknown };
  const constraint = typeof err?.constraint === "string" ? err.constraint : "";
  const message = typeof err?.message === "string" ? err.message : "";
  if (
    (err?.code === "23505" || /duplicate key value/i.test(message)) &&
    (constraint === EDITION_URL_INDEX || message.includes(EDITION_URL_INDEX))
  ) {
    throw new ConflictDomainError(
      "edition_url_conflict",
      `canonical_url is already claimed by another edition (${EDITION_URL_INDEX})`,
    );
  }
  throw e;
}

export interface SqlReferenceReportRepositoryOptions {
  /** injected clock for the anchor journal (tests); defaults to the wall clock */
  now?: () => Date;
  /** compare-and-swap attempt budget; defaults to MERGE_ATTEMPT_LIMIT */
  mergeAttemptLimit?: number;
}

export class SqlReferenceReportRepository implements ReferenceReportRepository {
  private readonly now: () => Date;
  private readonly mergeAttemptLimit: number;

  constructor(
    private readonly query: QueryFn,
    opts: SqlReferenceReportRepositoryOptions = {},
  ) {
    this.now = opts.now ?? (() => new Date());
    this.mergeAttemptLimit = opts.mergeAttemptLimit ?? MERGE_ATTEMPT_LIMIT;
  }

  async upsertEdition(record: ReferenceEditionRecord): Promise<EditionUpsertResult> {
    // canonicalize BEFORE validation and storage: merge equality for
    // canonicalUrl is byte-level, so a trailing-slash/www/scheme variant of the
    // same edition would otherwise replay as an identity conflict. The
    // canonical form is what the partial unique index sees, too. Scoped to
    // provider "isw" on purpose — the table is provider-neutral by design, and a
    // future provider brings its OWN canonicalizer rather than being forced
    // through an ISW-host one that would refuse it.
    const canonical = parseEditionRecord(
      record.provider === "isw" && record.canonicalUrl !== null
        ? { ...record, canonicalUrl: canonicalizeIswUrl(record.canonicalUrl) }
        : record,
    );
    const key = canonical.identity.editionKey;

    const [counts] = await this.query(EDITION_UPSERT_SQL, recordParams(canonical)).catch(
      rethrowTyped,
    );
    const dayStatusCleared = Number(counts?.cleared ?? 0) > 0;
    if (Number(counts?.inserted ?? 0) > 0) {
      return { action: "inserted", repairedFields: [], anchorChanged: false, dayStatusCleared };
    }

    // the key already existed: read-merge-write under compare-and-swap
    for (let attempt = 0; attempt < this.mergeAttemptLimit; attempt++) {
      const existingRows = await this.query(
        `SELECT ${EDITION_MERGE_SELECT} FROM benchmark_report_editions WHERE edition_key = $1`,
        [key],
      );
      if (existingRows.length === 0) {
        throw new ConflictDomainError("invalid_edition_record", `upsert race lost twice for ${key}`);
      }
      const before = existingRows[0];
      const existing = rowToRecord(before);
      const { merged, repairedFields, anchorChanged } = mergeEditionRecords(existing, canonical);
      if (repairedFields.length === 0) {
        return { action: "unchanged", repairedFields, anchorChanged, dayStatusCleared };
      }

      const entries = anchorJournalEntriesFor(existing, merged, this.now().toISOString());
      if ((entries.length > 0) !== anchorChanged) {
        // the journal derivation and the merge authority disagree about what a
        // present -> present move is: refuse rather than write a trail that
        // contradicts the returned result
        throw new ConflictDomainError(
          "invalid_edition_record",
          `anchor journal disagrees with mergeEditionRecords for ${key}`,
        );
      }
      const journal = [...parseStoredAnchorJournal(before.anchor_journal), ...entries].slice(
        -ANCHOR_JOURNAL_LIMIT,
      );

      // CAS: every mutable column must still hold the value the merge was
      // computed from, or a concurrent writer changed the row and this merge is
      // stale. IS NOT DISTINCT FROM so NULLs compare equal.
      const updated = await this.query(
        `UPDATE benchmark_report_editions SET
           canonical_url = $2, norm_version = $3, cutoff_at = $4, published_at = $5,
           cutoff_treatment = $6, published_treatment = $7, designated_final = $8,
           parse_status = $9, isw_report_id = $10, anchor_journal = $11::jsonb,
           derived = $12::jsonb
         WHERE edition_key = $1
           AND canonical_url IS NOT DISTINCT FROM $13
           AND norm_version IS NOT DISTINCT FROM $14
           AND cutoff_at IS NOT DISTINCT FROM $15
           AND published_at IS NOT DISTINCT FROM $16
           AND cutoff_treatment = $17
           AND published_treatment = $18
           AND designated_final IS NOT DISTINCT FROM $19
           AND parse_status = $20
           AND isw_report_id IS NOT DISTINCT FROM $21
           AND derived IS NOT DISTINCT FROM $22::jsonb
         RETURNING id`,
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
          JSON.stringify(journal),
          JSON.stringify(merged.derived ?? {}),
          existing.canonicalUrl,
          existing.normVersion,
          existing.identity.cutoffAt,
          existing.identity.publishedAt,
          existing.cutoffTreatment,
          existing.publishedTreatment,
          existing.designatedFinal,
          existing.parseStatus,
          existing.citationAnchorId,
          JSON.stringify(existing.derived ?? {}),
        ],
      ).catch(rethrowTyped);
      if (updated.length > 0) {
        return { action: "repaired", repairedFields, anchorChanged, dayStatusCleared };
      }
      // lost the race: re-read and re-merge against the winner's row
    }
    throw new ConflictDomainError(
      "edition_write_contention",
      `merge for ${key} lost ${this.mergeAttemptLimit} compare-and-swap attempts`,
    );
  }

  async getEdition(editionKey: string): Promise<ReferenceEditionRecord | null> {
    const rows = await this.query(
      `SELECT ${EDITION_SELECT} FROM benchmark_report_editions WHERE edition_key = $1`,
      [editionKey],
    );
    return rows.length === 0 ? null : rowToRecord(rows[0]);
  }

  /** The stored anchor-change trail for one edition, oldest first (read model
   *  for the discovery/soak reports — never a write path). */
  async anchorJournal(editionKey: string): Promise<readonly AnchorJournalEntry[]> {
    const rows = await this.query(
      `SELECT anchor_journal FROM benchmark_report_editions WHERE edition_key = $1`,
      [editionKey],
    );
    return rows.length === 0 ? [] : parseStoredAnchorJournal(rows[0].anchor_journal);
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
      `SELECT ${EDITION_SELECT} FROM benchmark_report_editions WHERE series = $1 AND report_date = $2
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
      await this.query(DAY_STATUS_UPSERT_SQL, [series, reportDate, next.status]);
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

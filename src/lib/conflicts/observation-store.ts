// Durable persistence for conflict validation observations (migration 0030).
//
// One row per (conflict, reference edition, cron invocation) in
// `conflict_validation_observations` — the append-only home of a scored
// ConflictResultV1 (PLAN-WS-3 §3.1b; decision C6 = (b), the WS-3.0 memo
// :218-244).
//
// APPEND-ONLY IS THE WHOLE POINT. There is no UPDATE and no ON CONFLICT DO
// UPDATE anywhere in this module, and the table carries no unique key on
// (conflict_id, reference_edition_id): the shadow soak grades verdict FLIPS
// across >=3 independent runs of the SAME days, so an overwrite key would
// destroy exactly the variance instrument `run_group_key` exists to group. The
// "current" headline for a day is DERIVED at read time from the latest row per
// edition (see latestObservationsFor) — never by mutating an older row.
//
// THE ROW IS A PROJECTION OF THE RESULT, NOT A SECOND SET OF FACTS. Every
// column that the scored result already determines (conflict, series, report
// date, edition key, evaluation kind, matcher rung/model/k, the five in-result
// version stamps, extractor versions, window-end source, run group key) is READ
// OFF THE RESULT here rather than accepted from the caller, so a row can never
// claim `keyword` while the result it stores says `llm-majority`. The caller
// supplies only what the result genuinely does not know: which durable edition
// row was scored, the cron run, the contributing digests, the C3 attribution
// map, the paid-rung dispatch identity, and the five out-of-result version
// stamps (C7 gazetteer, C13 unit flags, edition norm, daily-final policy,
// conflict registry).
//
// LEGAL (standing ruling 1): no reference prose may reach this table. Every
// write is audited BEFORE it is issued — every string in the serialized result,
// keys included, must be a bounded machine token, with exactly two documented
// exceptions (the fixed headline label and the two bounded raw time anchors the
// result contract already gates). Reads are audited the same way, so a row that
// somehow held prose is refused on the way out too rather than rendered.

import type { QueryFn } from "../isw/load";
import {
  CONFLICT_HEADLINE_LABEL,
  assertPersistableConflictResultV1,
  isPersistableRawAnchor,
  validateConflictResultIdentityV1,
  type ConflictResultV1,
  type ConflictScoredResultV1,
} from "./eval-profile";
import { ConflictDomainError } from "./errors";
import type { ConflictId, HeadlineCount, MatcherRung, ReferenceSeriesId } from "./vocabulary";

// ---------------------------------------------------------------------------
// The stored-string alphabet (ruling 1 at the persistence boundary)
// ---------------------------------------------------------------------------

/** Every string persisted inside `result` — object KEYS included — must be a
 *  bounded machine token: ids, enum members, version identifiers, edition keys,
 *  run-group keys, ISO instants, yyyy-mm-dd days, source domains and
 *  `host/handle` source labels. Deliberately excludes whitespace, quotes,
 *  brackets, backslashes and control characters, which is what makes a
 *  sentence of reference prose unrepresentable here. */
const STORED_TOKEN_RE = /^[A-Za-z0-9._:/|=+@-]*$/;

/** Bounded length for those tokens. The longest legitimate values are the
 *  snapshot artifact locator (<=200 by its own contract) and the run-group key
 *  (~100); 256 leaves headroom without admitting a paragraph. */
const STORED_TOKEN_MAX = 256;

/** The two result fields that legitimately carry a non-token string, each
 *  already gated by the result contract:
 *   - `headlineLabel` is the fixed public label constant (contract §3);
 *   - `window.cutoffAtRaw` / `window.publishedAtRaw` are RAW declared time
 *     anchors, bounded by isPersistableRawAnchor (an instant, or a short
 *     single-line time token such as "cutoff 1500 hrs local time").
 *  Every other path falls through to STORED_TOKEN_RE. */
const RAW_ANCHOR_PATHS = new Set(["window.cutoffAtRaw", "window.publishedAtRaw"]);

function refuse(message: string): never {
  throw new ConflictDomainError("unpersistable_result", message);
}

/** Walk a to-be-stored result and refuse anything that is not a bounded
 *  machine value. Structural too: only null, booleans, finite numbers, strings,
 *  arrays and plain objects may be stored, so a Date/BigInt/function cannot
 *  slip through JSON.stringify into the column with a shape nothing validates.
 *
 *  The refusal message names the PATH and never echoes the value — the value
 *  could be the very prose being refused (the same discipline
 *  assertPersistableConflictResultV1 uses for raw anchors). */
export function assertNoProseInStoredResult(value: unknown, path = ""): void {
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) refuse(`result${path}: non-finite number cannot be stored`);
    return;
  }
  if (typeof value === "string") {
    if (path === ".headlineLabel") {
      if (value !== CONFLICT_HEADLINE_LABEL) {
        refuse(`result${path}: is not the fixed headline label`);
      }
      return;
    }
    if (RAW_ANCHOR_PATHS.has(path.slice(1))) {
      if (!isPersistableRawAnchor(value)) {
        refuse(`result${path}: is not a bounded raw time anchor`);
      }
      return;
    }
    if (value.length > STORED_TOKEN_MAX) {
      refuse(`result${path}: string exceeds ${STORED_TOKEN_MAX} characters`);
    }
    if (!STORED_TOKEN_RE.test(value)) {
      refuse(`result${path}: is not a bounded machine token (ruling 1)`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoProseInStoredResult(v, `${path}[${i}]`));
    return;
  }
  if (typeof value === "object") {
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      refuse(`result${path}: only plain objects may be stored`);
    }
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k.length > STORED_TOKEN_MAX || !STORED_TOKEN_RE.test(k)) {
        refuse(`result${path}: object key is not a bounded machine token (ruling 1)`);
      }
      assertNoProseInStoredResult(v, `${path}.${k}`);
    }
    return;
  }
  refuse(`result${path}: ${typeof value} is not a storable value`);
}

// ---------------------------------------------------------------------------
// Write shape
// ---------------------------------------------------------------------------

/** A dispatch identity is a flat record of scalars (model, effort, registry
 *  version, approval, k) — never a nested provider payload. */
export type ConflictDispatchIdentity = Readonly<Record<string, string | number | boolean | null>>;

export interface ConflictObservationInput {
  /** `benchmark_report_editions.id` of the edition that was scored. The FK on
   *  this column is what makes an observation unambiguously about ONE durable
   *  edition row; the denormalized series/date/key columns are read-side
   *  conveniences derived from the result. */
  referenceEditionId: number;
  /** the scored, persistable result — the single source of every column it
   *  determines */
  result: ConflictResultV1;
  /** digests whose claims contributed to the evaluated population */
  contributingDigestIds?: readonly number[];
  /** memo C3: unitId -> contributor-theater attribution, RECORDED beside the
   *  result and never used as a filter. Values are bounded tokens; the exact
   *  enum belongs to the pipeline that fills it (PR 3.3b). */
  unitAttribution?: Readonly<Record<string, string>>;
  /** model/effort/registry/approval identity of the paid rung; null on keyword */
  dispatch?: ConflictDispatchIdentity | null;
  /** memo C7: `gazetteerFor(series).version` */
  gazetteerVersion: string;
  /** memo C13: the compound/negative derivation version (`unit-flags-v0` today) */
  unitFlagsVersion: string;
  /** the edition normalizer version that produced the edition identity */
  editionNormVersion: string;
  /** the daily-final selection policy (`designated-final-v1`) */
  dailyFinalPolicy: string;
  /** the conflict registry version this observation was produced under */
  registryVersion: string;
  /** ruling 10: the `cron_runs` row that produced this observation. Null for a
   *  non-cron caller; the partial unique key is inert for those rows. */
  cronRunId?: number | null;
}

const VERSION_TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

function assertVersionToken(field: string, value: unknown): string {
  if (typeof value !== "string" || !VERSION_TOKEN_RE.test(value)) {
    throw new ConflictDomainError(
      "invalid_observation_row",
      `${field}: must be a bounded version token (<=64 chars, [A-Za-z0-9._:-])`,
    );
  }
  return value;
}

function assertRowId(field: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new ConflictDomainError("invalid_observation_row", `${field}: must be a positive integer`);
  }
  return value;
}

const INSERT_COLUMNS = `conflict_id, reference_edition_id, series, report_date, edition_key,
   evaluation_kind, contributing_digest_ids, result, unit_attribution, matcher_rung,
   matcher_model, votes_k, dispatch, methodology_epoch, lane_taxonomy_version,
   evidence_policy_version, lane_classifier_version, actor_roster_version, scope_version,
   gazetteer_version, unit_flags_version, edition_norm_version, daily_final_policy,
   extractor_versions, registry_version, window_end_source, run_group_key, cron_run_id`;

/** The ONE write statement. No ON CONFLICT clause exists, so a duplicate
 *  (conflict, edition, cron run) is REFUSED by the partial unique index rather
 *  than silently overwriting an earlier observation. Exported so the
 *  integration test proves the deployed statement, not a copy of it.
 *
 *  IT IS AN `INSERT … SELECT`, NOT AN `INSERT … VALUES` (WS3-F04). Every
 *  column except `reference_edition_id` is read off the RESULT; that ONE
 *  caller-supplied value was checked only for positivity and by the foreign
 *  key, i.e. only that SOME edition row exists. A caller could therefore
 *  attach a result for `iran_update:D:evening` to the `morning` row's id, and
 *  the row's FK identity and its denormalized `edition_key` / `series` /
 *  `report_date` would disagree — which step 24's read model, keyed on
 *  `reference_edition_id`, would render as the wrong result under the right
 *  edition. The SELECT re-reads the named edition and inserts only where all
 *  four identity columns agree; zero rows back is a typed refusal.
 *
 *  Every parameter carries an explicit cast because a parameter in a SELECT
 *  list has no target column to take its type from, unlike a VALUES list. */
export const OBSERVATION_INSERT_SQL = `INSERT INTO conflict_validation_observations (${INSERT_COLUMNS})
   SELECT $1::text,$2::integer,$3::text,$4::date,$5::text,$6::text,$7::integer[],$8::jsonb,
          $9::jsonb,$10::text,$11::text,$12::integer,$13::jsonb,$14::text,$15::text,$16::text,
          $17::text,$18::text,$19::text,$20::text,$21::text,$22::text,$23::text,$24::text[],
          $25::text,$26::text,$27::text,$28::integer
     FROM benchmark_report_editions e
    WHERE e.id = $2::integer AND e.edition_key = $5::text
      AND e.series = $3::text AND e.report_date = $4::date
   RETURNING id`;

/** Persist ONE scored conflict observation and return its id.
 *
 *  Every refusal below happens BEFORE the statement is issued, so a rejected
 *  observation leaves no row and no partial write:
 *   1. an unscored (unavailable / publication-gap) result — it carries no
 *      matcher, no window-end source and no run-group key, so the NOT NULL
 *      projection is unrepresentable and a gap is recorded as a day status,
 *      never as an observation;
 *   2. `assertPersistableConflictResultV1` — the binding stamp gate, which also
 *      re-refuses a non-`retrospective` kind (register #5);
 *   3. the app-layer twin of that kind refusal, and the `fixture-oracle` rung,
 *      which the live path can never mint;
 *   4. the ruling-1 prose audit over the whole result;
 *   5. the caller-supplied row values.
 *
 *  The ONE thing that cannot be refused before the statement is the edition
 *  IDENTITY: proving that `referenceEditionId` names the edition the result
 *  describes needs the database. The statement does it in the same round trip
 *  (WS3-F04), so a disagreement still leaves no row. */
export async function persistObservation(
  query: QueryFn,
  input: ConflictObservationInput,
): Promise<number> {
  const { result } = input;
  if (result.state !== "scored") {
    throw new ConflictDomainError(
      "invalid_observation_row",
      `an ${result.state} conflict result is not an observation: a gap or unavailable evaluation is recorded as a day status, never as a scored row`,
    );
  }
  assertPersistableConflictResultV1(result);
  if (result.evaluationKind !== "retrospective") {
    throw new ConflictDomainError(
      "unpersistable_result",
      `evaluation kind ${result.evaluationKind} cannot be persisted as an observation (register #5)`,
    );
  }
  if (result.matcherRung === "fixture-oracle") {
    throw new ConflictDomainError(
      "unpersistable_result",
      "a fixture-oracle result is a deterministic test artifact and MUST NOT be persisted as a live observation",
    );
  }
  assertNoProseInStoredResult(result);

  const referenceEditionId = assertRowId("referenceEditionId", input.referenceEditionId);
  const cronRunId =
    input.cronRunId === undefined || input.cronRunId === null
      ? null
      : assertRowId("cronRunId", input.cronRunId);

  const digestIds = input.contributingDigestIds ?? [];
  for (const id of digestIds) assertRowId("contributingDigestIds[]", id);

  const attribution = input.unitAttribution ?? {};
  for (const [unitId, theater] of Object.entries(attribution)) {
    if (!STORED_TOKEN_RE.test(unitId) || unitId.length > STORED_TOKEN_MAX) {
      throw new ConflictDomainError("invalid_observation_row", "unitAttribution: key is not a bounded token");
    }
    if (typeof theater !== "string" || !STORED_TOKEN_RE.test(theater) || theater.length > STORED_TOKEN_MAX) {
      throw new ConflictDomainError(
        "invalid_observation_row",
        `unitAttribution[${unitId}]: value is not a bounded token`,
      );
    }
  }

  const dispatch = input.dispatch ?? null;
  if (dispatch !== null) {
    for (const [k, v] of Object.entries(dispatch)) {
      const scalar = v === null || typeof v === "number" || typeof v === "boolean" || typeof v === "string";
      const tokenish = typeof v !== "string" || (STORED_TOKEN_RE.test(v) && v.length <= STORED_TOKEN_MAX);
      if (!STORED_TOKEN_RE.test(k) || !scalar || !tokenish) {
        throw new ConflictDomainError(
          "invalid_observation_row",
          `dispatch[${STORED_TOKEN_RE.test(k) ? k : "?"}]: dispatch identity must be a flat record of bounded scalars`,
        );
      }
    }
  }

  // stamps the result does NOT carry, so they must be supplied and bounded
  const gazetteerVersion = assertVersionToken("gazetteerVersion", input.gazetteerVersion);
  const unitFlagsVersion = assertVersionToken("unitFlagsVersion", input.unitFlagsVersion);
  const editionNormVersion = assertVersionToken("editionNormVersion", input.editionNormVersion);
  const dailyFinalPolicy = assertVersionToken("dailyFinalPolicy", input.dailyFinalPolicy);
  const registryVersion = assertVersionToken("registryVersion", input.registryVersion);

  // every remaining column is READ OFF the result — never accepted from the
  // caller — so the row cannot disagree with the result it stores.
  // assertPersistableConflictResultV1 above refuses a scored result missing
  // either stamp, so both are present by the time execution reaches here.
  const matcher = result.matcher!;
  const versions = result.versions!;
  const rows = await query(OBSERVATION_INSERT_SQL, [
    result.conflictId,
    referenceEditionId,
    result.report.series,
    result.report.reportDate,
    result.report.editionKey,
    result.evaluationKind,
    digestIds,
    JSON.stringify(result),
    JSON.stringify(attribution),
    result.matcherRung,
    matcher.model,
    matcher.votesK,
    dispatch === null ? null : JSON.stringify(dispatch),
    result.methodologyEpoch,
    result.laneTaxonomyVersion,
    result.evidencePolicyVersion,
    versions.laneClassifierVersion,
    versions.actorRosterVersion,
    versions.scopeVersion,
    gazetteerVersion,
    unitFlagsVersion,
    editionNormVersion,
    dailyFinalPolicy,
    versions.extractorVersions,
    registryVersion,
    result.windowEndSource,
    result.runGroupKey,
    cronRunId,
  ]);
  const id = rows[0]?.id;
  if (typeof id !== "number" && typeof id !== "string") {
    // The statement's own identity guard is the only way to reach zero rows:
    // the named edition row does not exist, or it is not the edition this
    // result describes. Either way nothing was written.
    throw new ConflictDomainError(
      "invalid_observation_row",
      `referenceEditionId ${referenceEditionId} is not the ${JSON.stringify(result.report.editionKey)} ` +
        `edition of ${result.report.series} ${result.report.reportDate} — no observation was written`,
    );
  }
  return Number(id);
}

// ---------------------------------------------------------------------------
// Read model
// ---------------------------------------------------------------------------

export interface StoredConflictObservation {
  id: number;
  conflictId: ConflictId;
  referenceEditionId: number;
  series: ReferenceSeriesId;
  /** yyyy-mm-dd */
  reportDate: string;
  editionKey: string;
  matcherRung: MatcherRung;
  runGroupKey: string;
  /** memo C13: the view GROUPS by this — v0 rows are never comparable with
   *  compound-v1 ones and are labelled not soak-eligible */
  unitFlagsVersion: string;
  gazetteerVersion: string;
  cronRunId: number | null;
  /** canonical UTC instant */
  observedAt: string;
  /** DERIVED AT READ TIME from the stored result. There is deliberately no
   *  headline COLUMN: an append-only table has many observations per edition,
   *  and which one is "current" is a read-time question (C6 = (b)). */
  headline: { corpusRecall: HeadlineCount; publishedRetention: HeadlineCount };
  result: ConflictScoredResultV1;
}

const OBSERVATION_SELECT = `id, conflict_id, reference_edition_id, series,
   report_date::text AS report_date, edition_key, matcher_rung, run_group_key,
   unit_flags_version, gazetteer_version, cron_run_id, observed_at, result`;

/** The LATEST observation per edition. `DISTINCT ON (reference_edition_id)` with
 *  `observed_at DESC, id DESC` is the read-time "current" rule C6 = (b) asks
 *  for: nothing is overwritten, so the newest row per edition wins on read and
 *  the older rows stay available as the soak's variance sample. Exported so the
 *  integration test proves the deployed statement. */
export const LATEST_OBSERVATIONS_SQL = `SELECT DISTINCT ON (reference_edition_id) ${OBSERVATION_SELECT}
   FROM conflict_validation_observations
   WHERE conflict_id = $1 AND report_date >= $2
   ORDER BY reference_edition_id, observed_at DESC, id DESC`;

export interface LatestObservationsOptions {
  /** report-date window, inclusive of today (default 30) */
  days?: number;
  /** injected clock (tests) */
  now?: () => Date;
}

function utcDayMinus(now: Date, days: number): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function readInstant(field: string, v: unknown): string {
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) {
    throw new ConflictDomainError("invalid_observation_row", `${field}: unreadable timestamptz`);
  }
  return d.toISOString();
}

/** Read-side fail-closed parse: a stored row must still be a valid, persistable,
 *  prose-free scored result. A row that is not is REFUSED rather than rendered
 *  — the same discipline parseStoredAnchorJournal applies to the edition
 *  journal. One poisoned row therefore fails the read instead of reaching a
 *  view; that is the intended direction. */
function parseStoredResult(raw: unknown): ConflictScoredResultV1 {
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  const issues = validateConflictResultIdentityV1(value);
  if (issues.length > 0) {
    throw new ConflictDomainError(
      "invalid_observation_row",
      "stored result failed identity validation",
      issues,
    );
  }
  const result = value as ConflictResultV1;
  if (result.state !== "scored") {
    throw new ConflictDomainError("invalid_observation_row", "stored result is not a scored result");
  }
  assertPersistableConflictResultV1(result);
  assertNoProseInStoredResult(result);
  return result;
}

export async function latestObservationsFor(
  query: QueryFn,
  conflictId: ConflictId,
  opts: LatestObservationsOptions = {},
): Promise<readonly StoredConflictObservation[]> {
  const days = opts.days ?? 30;
  if (!Number.isSafeInteger(days) || days <= 0) {
    throw new ConflictDomainError("invalid_observation_row", "days: must be a positive integer");
  }
  const now = (opts.now ?? (() => new Date()))();
  const rows = await query(LATEST_OBSERVATIONS_SQL, [conflictId, utcDayMinus(now, days - 1)]);
  const observations = rows.map((row): StoredConflictObservation => {
    const result = parseStoredResult(row.result);
    return {
      id: Number(row.id),
      conflictId: result.conflictId,
      referenceEditionId: Number(row.reference_edition_id),
      series: result.report.series,
      reportDate: String(row.report_date).slice(0, 10),
      editionKey: String(row.edition_key),
      matcherRung: String(row.matcher_rung) as MatcherRung,
      runGroupKey: String(row.run_group_key),
      unitFlagsVersion: String(row.unit_flags_version),
      gazetteerVersion: String(row.gazetteer_version),
      cronRunId: row.cron_run_id === null ? null : Number(row.cron_run_id),
      observedAt: readInstant("observed_at", row.observed_at),
      headline: {
        corpusRecall: result.headline.corpusRecall,
        publishedRetention: result.headline.publishedRetention,
      },
      result,
    };
  });
  // newest report day first, then newest observation within the day — the
  // DISTINCT ON above forces its own ORDER BY, so the presentation order is
  // applied here
  return observations.sort(
    (a, b) =>
      b.reportDate.localeCompare(a.reportDate) ||
      b.observedAt.localeCompare(a.observedAt) ||
      b.id - a.id,
  );
}

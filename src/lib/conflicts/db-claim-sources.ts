// The REAL backends for the two Phase 3 evidence populations (PLAN-WS-3
// §3.3a): Postgres implementations of the `CorpusRecallClaimSource` and
// `PublishedRetentionClaimSource` contracts documented in
// evidence-assembler.ts:150-244.
//
// Until now the only implementations were the fixture corpus loaders. These two
// read the live tables, so every predicate the contract documents in prose is
// implemented HERE as a query predicate — and the assembler still re-excludes
// every one of them defensively, which is the point of the two-layer design.
//
// WHAT EACH POPULATION IS (contract §6.1 — NEVER conflated):
//   - corpus recall  = current-version MAPPED claims (`doc_claims`) from the
//     def's `mapped` contributor theaters. Legacy-engine claims and superseded
//     extractor versions cannot be members, and the record type's literals make
//     that a compile error rather than a review hope.
//   - published retention = claims that GENUINELY appeared in the DESIGNATED
//     user-facing digests (`claims` joined to `digests`), including the
//     `legacy_only` gulf/il contributors' military digests, LABELED legacy
//     (memo C8 keeps the shipped contract: legacy rows are excluded from corpus
//     recall and are MEMBERS of published retention).
//
// RULINGS IMPLEMENTED AT THE QUERY (each re-checked by the assembler):
//   - ruling 2  (traceability): a claim's documents are reached ONLY through a
//     real link — `doc_claims.raw_document_id` for corpus recall,
//     `claim_sources` for published retention. Nothing synthesizes a document.
//   - ruling 3  (truth-in-UI): stub-adapter documents are excluded AT THE
//     QUERY, in both directions — a corpus-recall claim whose owning document
//     is a stub is never selected, a published claim with ANY stub document is
//     never selected, and a stub-adapter MIRROR never joins a document list.
//   - ruling 13 (map versioning): the corpus-recall version predicate comes
//     from `map-versions.ts` — `versionFilterSql()`, the ONLY sanctioned
//     accessor — and is ANDed PER THEATER, because `mapExtractorVersion()`
//     takes the theater as part of its basis: a flat OR over the union of every
//     mapped theater's version pairs would let a `ru` document qualify on
//     `ua`'s version.
//   - ruling 14 (per-theater corpora): the theater predicate is an explicit
//     per-theater disjunction over the def's roster. The union of those
//     per-theater predicates is the CONFLICT's evidence set — the corpora are
//     never merged into one country's digest gather.
//
// ROW GRAIN (Gate-7 safety M-3, evidence-assembler.ts:194-215): each assembly
// runs TWO statements — a DISTINCT-CLAIM bounded query at
// `EVIDENCE_MAX_INTAKE + 1` (the +1 sentinel is what makes an over-limit day
// fail VISIBLY at the assembler's intake instead of silently narrowing), then
// an UNBOUNDED document query for exactly those claim ids. A claim therefore
// arrives with its COMPLETE document list or not at all.

import { versionFilterSql } from "../analysis/map-versions";
import { TRACKS, type Track } from "../analysis/tracks";
import type { QueryFn } from "../isw/load";
import {
  legacyContributorTheaters,
  mappedContributorTheaters,
  type ConflictDefinition,
} from "./definitions";
import { ConflictDomainError } from "./errors";
import { EVIDENCE_MAX_INTAKE, type CorpusRecallClaimSource, type PublishedRetentionClaimSource } from "./evidence-assembler";
import {
  STUB_ADAPTER_NAMES,
  isHedgingValue,
  type CandidateClaim,
  type CandidateDoc,
} from "./evidence-records";
import { LEGACY_CONTRIBUTOR_TRACKS } from "./eligibility";
import type { EvaluationWindow } from "./evaluation-window";
import { toIsoDay } from "./reference-repo-sql";

type Row = Record<string, unknown>;

/** The claim-id ceiling both sources apply. `+1` over the assembler's intake
 *  ceiling ON PURPOSE: at exactly the ceiling a genuinely over-limit day would
 *  be silently narrowed to its top claims with no refusal ever firing. */
export const CLAIM_INTAKE_LIMIT = EVIDENCE_MAX_INTAKE + 1;

/** Digest statuses whose claims count as "appeared in a user-facing digest".
 *  `digest-persist.ts:167-171` — the ONE persist path for both engines —
 *  writes `'generated'` on insert AND on the regeneration `DO UPDATE`, so
 *  `generated` is what production actually produces today; `published` is
 *  accepted because the enum (`schema.ts:52-57`) carries it and a future
 *  publication step would use it. `pending` and `failed` are NOT members. */
export const PUBLISHED_DIGEST_STATUSES = ["generated", "published"] as const;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Positional-parameter accumulator: every value goes through here, so no
 *  caller-derived string is ever interpolated into SQL. */
class Params {
  readonly values: unknown[] = [];
  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
  /** next placeholder index, 1-based — what `versionFilterSql` wants */
  get nextIndex(): number {
    return this.values.length + 1;
  }
  push(...values: unknown[]): void {
    this.values.push(...values);
  }
}

function asTrack(value: unknown, claimId: number): Track {
  const track = String(value);
  if (!Object.hasOwn(TRACKS, track)) {
    throw new ConflictDomainError(
      "invalid_candidate_claim",
      `claim ${claimId}: unknown track from the database`,
    );
  }
  return track as Track;
}

function asHedging(value: unknown, claimId: number) {
  if (!isHedgingValue(value)) {
    throw new ConflictDomainError(
      "invalid_candidate_claim",
      `claim ${claimId}: unknown hedging value from the database`,
    );
  }
  return value;
}

/** A claim with no `claim_date` is out of every window by construction (both
 *  bounded queries range-filter on it), so an unreadable value here means the
 *  row did not come from those queries — refuse rather than coin a day. */
function asIsoDay(value: unknown, claimId: number): string {
  if (value === null || value === undefined || value === "") {
    throw new ConflictDomainError(
      "invalid_candidate_claim",
      `claim ${claimId}: claim_date is missing — a dateless claim is never a window member`,
    );
  }
  return toIsoDay(value);
}

function asClaimId(value: unknown): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new ConflictDomainError("invalid_candidate_claim", "unreadable claim id from the database");
  }
  return id;
}

/** Raw instant strings, exactly as CandidateDoc wants them: the classification
 *  ladder in instants.ts treats a malformed anchor as missing, so an unreadable
 *  driver value becomes null here rather than a guessed instant. */
function rawInstant(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const s = String(value);
  return s.length === 0 ? null : s;
}

/** `sources.domain` when the document has a registry source row; otherwise the
 *  URL host. Never empty — `CandidateDoc.sourceDomain` is non-nullable and the
 *  selection layer keys diagnostics off it. */
export function sourceDomainOf(domain: unknown, url: unknown): string {
  if (typeof domain === "string" && domain.length > 0) return domain;
  if (typeof url === "string" && url.length > 0) {
    try {
      const host = new URL(url).hostname;
      if (host.length > 0) return host;
    } catch {
      /* unparseable url — fall through to the honest placeholder */
    }
  }
  return "unknown";
}

function docFromRow(row: Row): CandidateDoc {
  const mirrorOf = row.mirror_of_doc_id;
  return {
    docId: Number(row.doc_id),
    adapter: String(row.adapter),
    platform: row.platform === null || row.platform === undefined ? null : String(row.platform),
    sourceDomain: sourceDomainOf(row.domain, row.url),
    publishedAt: rawInstant(row.published_at),
    fetchedAt: rawInstant(row.fetched_at),
    mirrorOfDocId: mirrorOf === null || mirrorOf === undefined ? null : Number(mirrorOf),
    sourceLanguage: row.lang === null || row.lang === undefined ? null : String(row.lang),
  };
}

/** Group document rows by claim id. A document that is BOTH a direct source of
 *  the claim and a registered mirror of another of its documents keeps the
 *  MIRROR form: a mirror is breadth, never independent corroboration
 *  (`schema.ts` doc_dedup header), so the deflationary reading is the safe one. */
function docsByClaim(rows: readonly Row[]): Map<number, CandidateDoc[]> {
  const byClaim = new Map<number, Map<number, CandidateDoc>>();
  for (const row of rows) {
    const claimId = asClaimId(row.claim_id);
    const doc = docFromRow(row);
    let docs = byClaim.get(claimId);
    if (docs === undefined) {
      docs = new Map();
      byClaim.set(claimId, docs);
    }
    const existing = docs.get(doc.docId);
    if (existing === undefined || (existing.mirrorOfDocId === null && doc.mirrorOfDocId !== null)) {
      docs.set(doc.docId, doc);
    }
  }
  const out = new Map<number, CandidateDoc[]>();
  for (const [claimId, docs] of byClaim) {
    out.set(claimId, [...docs.values()].sort((a, b) => a.docId - b.docId));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Corpus recall (pipeline question 1)
// ---------------------------------------------------------------------------

/** Per-theater `(country_iso2 = x AND <x's current version pairs>)` disjunction.
 *  Ruling 13 + ruling 14 in one predicate: the version set is resolved PER
 *  THEATER through the sanctioned accessor and can never be applied to another
 *  theater's rows. A theater with no configured track yields `false` from
 *  `versionFilterSql`, so it contributes nothing rather than everything. */
function mappedTheaterVersionPredicate(
  def: ConflictDefinition,
  params: Params,
  alias = "dc",
  docAlias = "rd",
): string {
  const theaters = mappedContributorTheaters(def);
  if (theaters.length === 0) return "false";
  const terms = theaters.map((theater) => {
    const theaterParam = params.add(theater);
    const filter = versionFilterSql(theater, alias, params.nextIndex);
    params.push(...filter.params);
    return `(${docAlias}.country_iso2 = ${theaterParam} AND ${filter.sql})`;
  });
  return `(${terms.join(" OR ")})`;
}

/** The bounded DISTINCT-CLAIM query. One row per `doc_claims` row (which is
 *  already one row per claim), so the LIMIT cuts at a claim boundary. */
export function corpusRecallClaimSql(def: ConflictDefinition, window: EvaluationWindow): {
  sql: string;
  params: unknown[];
} {
  const p = new Params();
  const versionPredicate = mappedTheaterVersionPredicate(def, p);
  const tracks = p.add([...def.contributorTracks]);
  const start = p.add(window.startDate);
  const end = p.add(window.endDate);
  const stub = p.add([...STUB_ADAPTER_NAMES]);
  const limit = p.add(CLAIM_INTAKE_LIMIT);
  return {
    sql: `SELECT dc.id AS claim_id,
                 rd.country_iso2 AS theater,
                 dc.track AS track,
                 dc.text_en AS text,
                 dc.hedging AS hedging,
                 dc.claim_date::text AS claim_date,
                 dc.extractor_version AS extractor_version,
                 s.reliability_score AS reliability_score
            FROM doc_claims dc
            JOIN raw_documents rd ON rd.id = dc.raw_document_id
            LEFT JOIN sources s ON s.id = rd.source_id
           WHERE ${versionPredicate}
             AND dc.track = ANY(${tracks}::text[])
             AND dc.claim_date BETWEEN ${start}::date AND ${end}::date
             AND rd.adapter <> ALL(${stub}::text[])
           ORDER BY s.reliability_score DESC NULLS LAST, dc.id ASC
           LIMIT ${limit}`,
    params: p.values,
  };
}

/** The UNBOUNDED document query for exactly the selected claim ids: each
 *  claim's own document (ruling 2 — reached through `raw_document_id`, never
 *  synthesized) plus every registered mirror of it, carrying `mirrorOfDocId` so
 *  the independence diagnostics stay honest. */
export function corpusRecallDocSql(claimIds: readonly number[]): { sql: string; params: unknown[] } {
  const p = new Params();
  const ids = p.add([...claimIds]);
  const stub = p.add([...STUB_ADAPTER_NAMES]);
  return {
    sql: `SELECT dc.id AS claim_id, rd.id AS doc_id, rd.adapter AS adapter, rd.url AS url,
                 rd.published_at AS published_at, rd.fetched_at AS fetched_at, rd.lang AS lang,
                 s.platform AS platform, s.domain AS domain,
                 NULL::integer AS mirror_of_doc_id
            FROM doc_claims dc
            JOIN raw_documents rd ON rd.id = dc.raw_document_id
            LEFT JOIN sources s ON s.id = rd.source_id
           WHERE dc.id = ANY(${ids}::int[])
           UNION ALL
          SELECT dc.id AS claim_id, m.id AS doc_id, m.adapter AS adapter, m.url AS url,
                 m.published_at AS published_at, m.fetched_at AS fetched_at, m.lang AS lang,
                 ms.platform AS platform, ms.domain AS domain,
                 dd.canonical_doc_id AS mirror_of_doc_id
            FROM doc_claims dc
            JOIN doc_dedup dd ON dd.canonical_doc_id = dc.raw_document_id
            JOIN raw_documents m ON m.id = dd.raw_document_id
            LEFT JOIN sources ms ON ms.id = m.source_id
           WHERE dc.id = ANY(${ids}::int[])
             AND m.adapter <> ALL(${stub}::text[])
           ORDER BY claim_id ASC, doc_id ASC`,
    params: p.values,
  };
}

/**
 * The live corpus-recall population.
 *
 * The mapper SETS all four disposition-critical booleans explicitly
 * (`stub`, `published`, `engine`, `currentExtractorVersion`) — the assembler's
 * intake refuses a candidate that omits any of them, precisely so an untyped
 * mapper cannot let `undefined` read as "not a stub".
 *
 * `published: false` is a statement about THIS population, not about the world:
 * corpus recall asks whether the mapped claim corpus contained the development.
 * A claim that also appeared in a digest is a member of the OTHER population,
 * assembled separately from the `claims` table.
 */
export class DbCorpusRecallClaimSource implements CorpusRecallClaimSource {
  constructor(private readonly query: QueryFn) {}

  async corpusRecallCandidates(
    def: ConflictDefinition,
    window: EvaluationWindow,
  ): Promise<readonly CandidateClaim[]> {
    const claimQuery = corpusRecallClaimSql(def, window);
    const claimRows = await this.query(claimQuery.sql, claimQuery.params);
    if (claimRows.length === 0) return [];
    const ids = claimRows.map((r) => asClaimId(r.claim_id));
    const docQuery = corpusRecallDocSql(ids);
    const docs = docsByClaim(await this.query(docQuery.sql, docQuery.params));

    return claimRows.map((row): CandidateClaim => {
      const claimId = asClaimId(row.claim_id);
      return {
        claimId,
        theater: String(row.theater ?? ""),
        track: asTrack(row.track, claimId),
        text: String(row.text ?? ""),
        hedging: asHedging(row.hedging, claimId),
        claimDate: asIsoDay(row.claim_date, claimId),
        docs: docs.get(claimId) ?? [],
        // the version predicate already restricted the rows to the current
        // (track, extractor_version) pairs; SETTING both explicitly is what
        // keeps a superseded row from entering as `undefined`-falsy
        engine: "mapreduce",
        currentExtractorVersion: true,
        extractorVersion: row.extractor_version === null ? null : String(row.extractor_version),
        published: false,
        stub: false,
        sourceReliability:
          row.reliability_score === null || row.reliability_score === undefined
            ? null
            : Number(row.reliability_score),
      };
    });
  }
}

// ---------------------------------------------------------------------------
// Published retention (pipeline question 2)
// ---------------------------------------------------------------------------

/** The designated `(theater, track)` set for the retention population
 *  (register #4, memo C8): every MAPPED contributor theater across the def's
 *  own tracks, plus every `legacy_only` contributor theater across
 *  LEGACY_CONTRIBUTOR_TRACKS (`eligibility.ts:103` — the il/gulf digests are
 *  military-track products). Legacy rows are MEMBERS here and are labeled by
 *  the assembler; C8 explicitly did NOT adopt "excluded from the numerator". */
export function designatedRetentionPairs(def: ConflictDefinition): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const theater of mappedContributorTheaters(def)) {
    for (const track of def.contributorTracks) pairs.push([theater, track]);
  }
  for (const theater of legacyContributorTheaters(def)) {
    for (const track of LEGACY_CONTRIBUTOR_TRACKS) pairs.push([theater, track]);
  }
  return pairs;
}

export function publishedRetentionClaimSql(def: ConflictDefinition, window: EvaluationWindow): {
  sql: string;
  params: unknown[];
} {
  const p = new Params();
  const pairs = designatedRetentionPairs(def);
  const pairPredicate =
    pairs.length === 0
      ? "false"
      : `(c.iso2, d.track) IN (${pairs
          .map(([theater, track]) => `(${p.add(theater)}::text, ${p.add(track)}::text)`)
          .join(", ")})`;
  const statuses = p.add([...PUBLISHED_DIGEST_STATUSES]);
  const start = p.add(window.startDate);
  const end = p.add(window.endDate);
  const stub = p.add([...STUB_ADAPTER_NAMES]);
  const limit = p.add(CLAIM_INTAKE_LIMIT);
  return {
    sql: `SELECT cl.id AS claim_id,
                 c.iso2 AS theater,
                 d.track AS track,
                 d.id AS digest_id,
                 cl.text AS text,
                 cl.hedging AS hedging,
                 cl.claim_date::text AS claim_date,
                 CASE WHEN d.structured->'stats'->>'engine' = 'mapreduce'
                      THEN 'mapreduce' ELSE 'legacy' END AS engine,
                 rel.reliability_score AS reliability_score
            FROM claims cl
            JOIN digests d ON d.id = cl.digest_id
            JOIN countries c ON c.id = d.country_id
            LEFT JOIN LATERAL (
                   SELECT MAX(rs.reliability_score) AS reliability_score
                     FROM claim_sources cs
                     JOIN raw_documents rd ON rd.id = cs.raw_document_id
                     LEFT JOIN sources rs ON rs.id = rd.source_id
                    WHERE cs.claim_id = cl.id
                 ) rel ON TRUE
           WHERE ${pairPredicate}
             AND d.status::text = ANY(${statuses}::text[])
             AND cl.claim_date BETWEEN ${start}::date AND ${end}::date
             AND NOT EXISTS (
                   SELECT 1
                     FROM claim_sources cs2
                     JOIN raw_documents rd2 ON rd2.id = cs2.raw_document_id
                    WHERE cs2.claim_id = cl.id
                      AND rd2.adapter = ANY(${stub}::text[])
                 )
           ORDER BY rel.reliability_score DESC NULLS LAST, cl.id ASC
           LIMIT ${limit}`,
    params: p.values,
  };
}

export function publishedRetentionDocSql(claimIds: readonly number[]): {
  sql: string;
  params: unknown[];
} {
  const p = new Params();
  const ids = p.add([...claimIds]);
  const stub = p.add([...STUB_ADAPTER_NAMES]);
  return {
    sql: `SELECT cs.claim_id AS claim_id, rd.id AS doc_id, rd.adapter AS adapter, rd.url AS url,
                 rd.published_at AS published_at, rd.fetched_at AS fetched_at, rd.lang AS lang,
                 s.platform AS platform, s.domain AS domain,
                 NULL::integer AS mirror_of_doc_id
            FROM claim_sources cs
            JOIN raw_documents rd ON rd.id = cs.raw_document_id
            LEFT JOIN sources s ON s.id = rd.source_id
           WHERE cs.claim_id = ANY(${ids}::int[])
           UNION ALL
          SELECT cs.claim_id AS claim_id, m.id AS doc_id, m.adapter AS adapter, m.url AS url,
                 m.published_at AS published_at, m.fetched_at AS fetched_at, m.lang AS lang,
                 ms.platform AS platform, ms.domain AS domain,
                 dd.canonical_doc_id AS mirror_of_doc_id
            FROM claim_sources cs
            JOIN doc_dedup dd ON dd.canonical_doc_id = cs.raw_document_id
            JOIN raw_documents m ON m.id = dd.raw_document_id
            LEFT JOIN sources ms ON ms.id = m.source_id
           WHERE cs.claim_id = ANY(${ids}::int[])
             AND m.adapter <> ALL(${stub}::text[])
           ORDER BY claim_id ASC, doc_id ASC`,
    params: p.values,
  };
}

/**
 * The live published-retention population.
 *
 * Deliberate differences from corpus recall, both from the contract:
 *   - extractor version is NOT filtered and `extractorVersion` is null — the
 *     retention question is what the published output CONTAINED, not which map
 *     version produced it (`eligibility.ts:281-283`);
 *   - `engine` is read from the digest's own `structured.stats.engine` stamp
 *     (the sanctioned reader precedent, `quality-funnel.ts:466`, over the value
 *     `synthesize.ts:739` writes), so a legacy digest's claims are labeled
 *     legacy rather than silently counted as map-equivalent.
 *
 * `contributingDigestIds()` reports the distinct digests the LAST call read —
 * the observation row records which user-facing outputs were interrogated, and
 * that is not derivable from the candidate list.
 */
export class DbPublishedRetentionClaimSource implements PublishedRetentionClaimSource {
  private digestIds: readonly number[] = [];

  constructor(private readonly query: QueryFn) {}

  /** Distinct `digests.id` touched by the most recent candidate query, ascending.
   *  Empty before the first call. */
  contributingDigestIds(): readonly number[] {
    return this.digestIds;
  }

  async publishedRetentionCandidates(
    def: ConflictDefinition,
    window: EvaluationWindow,
  ): Promise<readonly CandidateClaim[]> {
    const claimQuery = publishedRetentionClaimSql(def, window);
    const claimRows = await this.query(claimQuery.sql, claimQuery.params);
    this.digestIds = [
      ...new Set(
        claimRows
          .map((r) => Number(r.digest_id))
          .filter((id) => Number.isSafeInteger(id) && id > 0),
      ),
    ].sort((a, b) => a - b);
    if (claimRows.length === 0) return [];
    const ids = claimRows.map((r) => asClaimId(r.claim_id));
    const docQuery = publishedRetentionDocSql(ids);
    const docs = docsByClaim(await this.query(docQuery.sql, docQuery.params));

    return claimRows.map((row): CandidateClaim => {
      const claimId = asClaimId(row.claim_id);
      const engine = String(row.engine) === "mapreduce" ? "mapreduce" : "legacy";
      return {
        claimId,
        theater: String(row.theater ?? ""),
        track: asTrack(row.track, claimId),
        text: String(row.text ?? ""),
        hedging: asHedging(row.hedging, claimId),
        claimDate: asIsoDay(row.claim_date, claimId),
        docs: docs.get(claimId) ?? [],
        engine,
        // retention never filters versions — a published claim from a
        // superseded version is still a member (eligibility.ts:281-283)
        currentExtractorVersion: true,
        extractorVersion: null,
        published: true,
        stub: false,
        sourceReliability:
          row.reliability_score === null || row.reliability_score === undefined
            ? null
            : Number(row.reliability_score),
      };
    });
  }
}

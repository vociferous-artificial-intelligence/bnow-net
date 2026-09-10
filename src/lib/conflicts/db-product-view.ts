// The DB-backed conflict product view (PLAN-WS-3 §3.5a) — the read model over
// `conflict_validation_observations` (migration 0030) that the /conflicts/**
// surfaces render instead of the frozen fixture corpus.
//
// RULING 3 BY MODULE GRAPH. This file imports NOTHING from `product-view.ts`,
// `fixture-corpus.ts` or `goldens.ts`, and `db-product-view.test.ts` asserts
// that in both directions. The fixture provider is not "excluded by a flag"
// here — it is unreachable from this module, so a synthetic scenario cannot
// reach a surface fed by this one even by mistake. Real rows or an empty
// state; there is no third source.
//
// C4 (`designated-final-v1`) IS A READ-TIME RULE, and it lives here. The
// observation store is append-only and deliberately knows nothing about which
// row is "current" (observation-store.ts:8-14): it returns the LATEST row per
// EDITION. A day may carry several editions, so this module asks the edition
// repository for the day's full set, runs `selectDailyFinal`, and renders the
// observation of THAT edition. A day whose final edition has not been observed
// is reported as PENDING — never satisfied by promoting a morning edition's
// observation into the day's headline, which is exactly the substitution the
// C5-m measurement found production's probe order making (1 of 8 multi-edition
// days in 2026-02-28 → 03-22).
//
// C13 IS A LABEL THIS MODULE COMPUTES, NOT A FILTER. Every row written in this
// window stamps `unit-flags-v0`, whose `compound` derivation is UNDETERMINED in
// the OVER-CREDIT direction, so the signed decision forbids such a number
// reaching a customer, `/scoreboard`, or a report figure. The view therefore
// carries `compoundUndetermined` per day and in aggregate, and the surfaces
// render it as a banner rather than a footnote. It is not filtered out: an
// internal view that silently dropped every row it has would be useless.
//
// WINDOW. The view is the last `DEFAULT_VIEW_DAYS` report days, and the detail
// and evidence routes resolve their key WITHIN that same window — a benchmark
// key outside it is not addressable through this view (404), rather than
// widening the observation read to the whole table for a hand-typed URL.

import { CONFLICT_REGISTRY, type ConflictDefinition } from "./definitions";
import {
  PUBLISHED_DIGEST_STATUSES,
  publishedRetentionDocSql,
  sourceDomainOf,
} from "./db-claim-sources";
import { benchmarkKeyForEdition, editionKeyOfBenchmarkKey } from "./benchmark-key";
import { selectDailyFinal } from "./editions";
import { ConflictDomainError } from "./errors";
import type { ConflictScoredResultV1 } from "./eval-profile";
import type { PublishedEvidenceRow } from "./evidence-row";
import { STUB_ADAPTER_NAMES, type CandidateDoc } from "./evidence-records";
import type { QueryFn } from "../isw/load";
import { latestObservationsFor, type StoredConflictObservation } from "./observation-store";
import { SqlReferenceReportRepository } from "./reference-repo-sql";
import type { ReferenceReportRepository } from "./reference-repo";
import { legacyOnlyMatchedCount, publishedUnionCountOf } from "./result-summary";
import { UNIT_FLAGS_VERSION } from "./unit-flags";
import type { ConflictId } from "./vocabulary";

/** The report-day window every conflict surface reads. */
export const DEFAULT_VIEW_DAYS = 30;

/** Why a report day has observations but no headline. Each is a state the view
 *  DISPLAYS; none is ever resolved by falling back to another edition's row. */
export type PendingDayReason =
  /** the day's daily-final edition has no observation yet (a non-final edition
   *  may well have one — it is not promoted) */
  | "final_edition_unobserved"
  /** `selectDailyFinal` refused the day's edition set (e.g. two editions both
   *  designated final) — the winner is undetermined, so no row is the day's */
  | "daily_final_undetermined"
  /** the edition rows for the day are gone (a repository/observation
   *  disagreement); nothing is rendered rather than guessing */
  | "editions_unavailable";

export interface DbConflictDay {
  /** yyyy-mm-dd */
  reportDate: string;
  /** the daily-final winner, whose observation this is */
  editionKey: string;
  /** URL key for the detail/evidence routes */
  benchmarkKey: string;
  /** every edition of the day, most-final first (the C4 audit trail) */
  orderedEditionKeys: readonly string[];
  /** true when the day carried more than one edition */
  multiEdition: boolean;
  observation: StoredConflictObservation;
  result: ConflictScoredResultV1;
  /** distinct claims in the published-retention union — 0 means the gated
   *  evidence view would be empty, so the surfaces do not link to it */
  publishedUnionCount: number;
  /** memo C8 companion: matched takeaways whose evidence is entirely legacy */
  legacyOnlyMatched: number;
  /** memo C13: this row's numbers are not soak-eligible */
  compoundUndetermined: boolean;
}

export interface DbPendingDay {
  reportDate: string;
  reason: PendingDayReason;
  /** the daily-final winner when one could be determined */
  finalEditionKey: string | null;
  /** editions of the day that DO carry an observation (never promoted) */
  observedEditionKeys: readonly string[];
}

export interface DbConflictProductView {
  conflictId: ConflictId;
  definition: ConflictDefinition;
  /** newest report day first; daily-final winners only */
  days: readonly DbConflictDay[];
  /** newest day carrying a daily-final observation */
  featured: DbConflictDay | null;
  /** days with observations but no renderable headline */
  pending: readonly DbPendingDay[];
  /** the read window, so a surface can say what "no records" covers */
  windowDays: number;
  /** memo C13: true when ANY rendered day is under an undetermined-compound
   *  flags version. The surfaces render this as a banner. */
  compoundUndetermined: boolean;
}

export interface DbViewOptions {
  /** report-day window (default DEFAULT_VIEW_DAYS) */
  days?: number;
  /** injected clock — a FUNCTION, matching latestObservationsFor's option */
  now?: () => Date;
  /** injected edition repository (tests); defaults to the SQL one */
  repo?: ReferenceReportRepository;
  /** stop resolving once this many days have a headline. The index surface
   *  needs only the featured day and each day costs one edition read, so it
   *  passes 1. `pending` then covers ONLY the days examined before the stop —
   *  it is a partial list by construction, which is why no surface renders
   *  both a stop and a pending list. */
  stopAfterResolvedDays?: number;
}

// ---------------------------------------------------------------------------
// Day resolution (C4 at read time)
// ---------------------------------------------------------------------------

function groupByDay(
  observations: readonly StoredConflictObservation[],
  def: ConflictDefinition,
): Map<string, StoredConflictObservation[]> {
  const byDay = new Map<string, StoredConflictObservation[]>();
  for (const obs of observations) {
    // defensive: a row whose result names another series cannot be this
    // conflict's benchmark. The insert reads the series off the result and the
    // read re-validates it, so this is unreachable — and skipping is the
    // deflationary answer if it ever is not.
    if (obs.series !== def.referenceSeries) continue;
    const list = byDay.get(obs.reportDate);
    if (list === undefined) byDay.set(obs.reportDate, [obs]);
    else list.push(obs);
  }
  return byDay;
}

function dayFrom(
  obs: StoredConflictObservation,
  orderedEditionKeys: readonly string[],
): DbConflictDay {
  return {
    reportDate: obs.reportDate,
    editionKey: obs.editionKey,
    benchmarkKey: benchmarkKeyForEdition(obs.editionKey),
    orderedEditionKeys,
    multiEdition: orderedEditionKeys.length > 1,
    observation: obs,
    result: obs.result,
    publishedUnionCount: publishedUnionCountOf(obs.result),
    legacyOnlyMatched: legacyOnlyMatchedCount(obs.result),
    compoundUndetermined: obs.unitFlagsVersion === UNIT_FLAGS_VERSION,
  };
}

/** Resolve ONE report day: read its editions, pick the daily final, and return
 *  the observation of that edition — or the reason there is none. */
async function resolveDay(
  repo: ReferenceReportRepository,
  def: ConflictDefinition,
  reportDate: string,
  dayObservations: readonly StoredConflictObservation[],
): Promise<DbConflictDay | DbPendingDay> {
  const observedEditionKeys = dayObservations.map((o) => o.editionKey);
  const editions = await repo.editionsForDay(def.referenceSeries, reportDate);
  if (editions.length === 0) {
    return { reportDate, reason: "editions_unavailable", finalEditionKey: null, observedEditionKeys };
  }
  let finalEditionKey: string;
  let orderedEditionKeys: readonly string[];
  try {
    const selection = selectDailyFinal(editions);
    finalEditionKey = selection.selected.identity.editionKey;
    orderedEditionKeys = selection.orderedKeys;
  } catch (err) {
    if (err instanceof ConflictDomainError) {
      return {
        reportDate,
        reason: "daily_final_undetermined",
        finalEditionKey: null,
        observedEditionKeys,
      };
    }
    throw err;
  }
  const winner = dayObservations.find((o) => o.editionKey === finalEditionKey);
  if (winner === undefined) {
    return {
      reportDate,
      reason: "final_edition_unobserved",
      finalEditionKey,
      observedEditionKeys,
    };
  }
  return dayFrom(winner, orderedEditionKeys);
}

function isPending(day: DbConflictDay | DbPendingDay): day is DbPendingDay {
  return "reason" in day;
}

/** The full view for one conflict: every resolved day in the window, newest
 *  first, plus the days that could not be resolved. */
export async function loadDbConflictProductView(
  query: QueryFn,
  conflictId: ConflictId,
  opts: DbViewOptions = {},
): Promise<DbConflictProductView> {
  const def = CONFLICT_REGISTRY[conflictId];
  const windowDays = opts.days ?? DEFAULT_VIEW_DAYS;
  const repo = opts.repo ?? new SqlReferenceReportRepository(query);
  const observations = await latestObservationsFor(query, conflictId, {
    days: windowDays,
    now: opts.now,
  });
  const byDay = groupByDay(observations, def);
  const days: DbConflictDay[] = [];
  const pending: DbPendingDay[] = [];
  // newest day first — latestObservationsFor already sorts that way, and Map
  // preserves insertion order
  const stopAfter = opts.stopAfterResolvedDays;
  for (const [reportDate, dayObservations] of byDay) {
    if (stopAfter !== undefined && days.length >= stopAfter) break;
    const resolved = await resolveDay(repo, def, reportDate, dayObservations);
    if (isPending(resolved)) pending.push(resolved);
    else days.push(resolved);
  }
  return {
    conflictId,
    definition: def,
    days,
    featured: days[0] ?? null,
    pending,
    windowDays,
    compoundUndetermined: days.some((d) => d.compoundUndetermined),
  };
}

/** One day, addressed by its benchmark URL key. Returns null for a key that is
 *  not decodable, names a day outside the view window, or has no daily-final
 *  observation — every one of which is a `notFound()` on the route. */
export async function loadDbBenchmarkDay(
  query: QueryFn,
  conflictId: ConflictId,
  benchmarkKey: string,
  opts: DbViewOptions = {},
): Promise<DbConflictDay | null> {
  const editionKey = editionKeyOfBenchmarkKey(benchmarkKey);
  if (editionKey === null) return null;
  // never inherit stopAfterResolvedDays here: the requested day is usually not
  // the newest one, and a stop would 404 a day that exists
  const view = await loadDbConflictProductView(query, conflictId, {
    ...opts,
    stopAfterResolvedDays: undefined,
  });
  return view.days.find((d) => d.editionKey === editionKey) ?? null;
}

// ---------------------------------------------------------------------------
// The gated evidence feed — the stored result joined LIVE to `claims`
// ---------------------------------------------------------------------------

/** Claim ids the published-retention union of a result names, ascending. */
export function publishedUnionClaimIds(result: ConflictScoredResultV1): number[] {
  const ids = new Set<number>();
  for (const agreement of result.agreements?.publishedRetention ?? []) {
    for (const claim of agreement.claims) ids.add(claim.claimId);
  }
  for (const item of result.bnowOnly?.publishedRetention.items ?? []) ids.add(item.claimId);
  return [...ids].sort((a, b) => a - b);
}

/** Claim TEXT for exactly the union's ids, with ruling 2 and ruling 3 enforced
 *  AT THE QUERY rather than trusted from the stored result:
 *   - the claim must still belong to a digest that genuinely published
 *     (`PUBLISHED_DIGEST_STATUSES`, the same member set the retention
 *     population used);
 *   - it must still have at least one `claim_sources` link (ruling 2);
 *   - it must carry NO stub-adapter document (ruling 3, the whole claim — not
 *     just the offending document — because dropping the document would
 *     quietly overstate independence).
 *  A claim that fails any of these is simply not returned, and the view reports
 *  it as withheld rather than rendering it. */
export function evidenceClaimSql(claimIds: readonly number[]): { sql: string; params: unknown[] } {
  return {
    sql: `SELECT cl.id AS claim_id, cl.text AS text, cl.claim_date::text AS claim_date
            FROM claims cl
            JOIN digests d ON d.id = cl.digest_id
           WHERE cl.id = ANY($1::int[])
             AND d.status::text = ANY($2::text[])
             AND EXISTS (SELECT 1 FROM claim_sources cs WHERE cs.claim_id = cl.id)
             AND NOT EXISTS (
                   SELECT 1 FROM claim_sources cs2
                     JOIN raw_documents rd2 ON rd2.id = cs2.raw_document_id
                    WHERE cs2.claim_id = cl.id AND rd2.adapter = ANY($3::text[])
                 )
           ORDER BY cl.id ASC`,
    params: [[...claimIds], [...PUBLISHED_DIGEST_STATUSES], [...STUB_ADAPTER_NAMES]],
  };
}

export interface DbEvidenceView {
  day: DbConflictDay;
  definition: ConflictDefinition;
  rows: readonly PublishedEvidenceRow[];
  /** union claim ids that no longer render — the digest was regenerated, the
   *  claim lost its sources, or a stub document appeared. Surfaced as a count
   *  and a list of ids; never fabricated back into a row. */
  withheldClaimIds: readonly number[];
}

function docsByClaimFromRows(rows: readonly Record<string, unknown>[]): Map<number, CandidateDoc[]> {
  const byClaim = new Map<number, Map<number, CandidateDoc>>();
  for (const row of rows) {
    const claimId = Number(row.claim_id);
    const docId = Number(row.doc_id);
    if (!Number.isSafeInteger(claimId) || !Number.isSafeInteger(docId)) continue;
    const mirrorOf = row.mirror_of_doc_id;
    const doc: CandidateDoc = {
      docId,
      adapter: String(row.adapter),
      platform: row.platform === null || row.platform === undefined ? null : String(row.platform),
      sourceDomain: sourceDomainOf(row.domain, row.url),
      publishedAt: instantOrNull(row.published_at),
      fetchedAt: instantOrNull(row.fetched_at),
      mirrorOfDocId: mirrorOf === null || mirrorOf === undefined ? null : Number(mirrorOf),
      sourceLanguage: row.lang === null || row.lang === undefined ? null : String(row.lang),
    };
    let docs = byClaim.get(claimId);
    if (docs === undefined) {
      docs = new Map();
      byClaim.set(claimId, docs);
    }
    const existing = docs.get(docId);
    // a document that is both a direct source and a registered mirror keeps the
    // MIRROR form — breadth is never independent corroboration
    if (existing === undefined || (existing.mirrorOfDocId === null && doc.mirrorOfDocId !== null)) {
      docs.set(docId, doc);
    }
  }
  const out = new Map<number, CandidateDoc[]>();
  for (const [claimId, docs] of byClaim) {
    out.set(claimId, [...docs.values()].sort((a, b) => a.docId - b.docId));
  }
  return out;
}

function instantOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const s = String(value);
  return s.length === 0 ? null : s;
}

/** Build the evidence rows for ONE resolved day.
 *
 *  The claim's ANALYTICAL fields — theater, track, hedge, legacy, confidence,
 *  ingest anchor, matched units — come from the stored RESULT, because they are
 *  what the evaluation actually saw and matching never restates them. Only the
 *  TEXT and the SOURCE TRAIL are joined live, because those are the two things
 *  the result deliberately does not carry (ruling 1 keeps prose out of the
 *  observation table; the trail belongs to the documents). */
export async function loadDbEvidenceRows(
  query: QueryFn,
  day: DbConflictDay,
): Promise<{ rows: PublishedEvidenceRow[]; withheldClaimIds: number[] }> {
  const claimIds = publishedUnionClaimIds(day.result);
  if (claimIds.length === 0) return { rows: [], withheldClaimIds: [] };

  const claimQuery = evidenceClaimSql(claimIds);
  const claimRows = await query(claimQuery.sql, claimQuery.params);
  const texts = new Map<number, { text: string; claimDate: string }>();
  for (const row of claimRows) {
    const id = Number(row.claim_id);
    if (!Number.isSafeInteger(id)) continue;
    texts.set(id, { text: String(row.text ?? ""), claimDate: String(row.claim_date ?? "") });
  }
  const renderable = claimIds.filter((id) => texts.has(id));
  const withheldClaimIds = claimIds.filter((id) => !texts.has(id));

  const docs =
    renderable.length === 0
      ? new Map<number, CandidateDoc[]>()
      : await (async () => {
          const docQuery = publishedRetentionDocSql(renderable);
          return docsByClaimFromRows(await query(docQuery.sql, docQuery.params));
        })();

  const byClaim = new Map<number, PublishedEvidenceRow>();
  for (const agreement of day.result.agreements?.publishedRetention ?? []) {
    for (const claim of agreement.claims) {
      const joined = texts.get(claim.claimId);
      if (joined === undefined) continue;
      const unit = { unitId: agreement.unitId, lane: agreement.lane, coverage: claim.coverage };
      const existing = byClaim.get(claim.claimId);
      if (existing !== undefined) {
        byClaim.set(claim.claimId, {
          ...existing,
          matchedUnits: [...existing.matchedUnits, unit],
        });
        continue;
      }
      byClaim.set(claim.claimId, {
        claimId: claim.claimId,
        text: joined.text,
        theater: claim.theater,
        track: claim.track,
        hedge: claim.hedge,
        legacy: claim.legacy,
        claimDate: joined.claimDate,
        confidence: claim.confidence,
        earliestIngestAt: claim.earliestIngestAt,
        matchedUnits: [unit],
        bnowOnlyLane: null,
        docs: docs.get(claim.claimId) ?? [],
      });
    }
  }
  for (const item of day.result.bnowOnly?.publishedRetention.items ?? []) {
    if (byClaim.has(item.claimId)) continue; // matched rows already carry it
    const joined = texts.get(item.claimId);
    if (joined === undefined) continue;
    byClaim.set(item.claimId, {
      claimId: item.claimId,
      text: joined.text,
      theater: item.theater,
      track: item.track,
      hedge: item.hedge,
      legacy: item.legacy,
      claimDate: joined.claimDate,
      confidence: null,
      earliestIngestAt: null,
      matchedUnits: [],
      bnowOnlyLane: item.lane,
      docs: docs.get(item.claimId) ?? [],
    });
  }
  const rows = [...byClaim.values()].sort(
    (a, b) => a.claimDate.localeCompare(b.claimDate) || a.claimId - b.claimId,
  );
  return { rows, withheldClaimIds };
}

/** The gated evidence view's full load. Null for an unknown/out-of-window key —
 *  the route's `notFound()`. */
export async function loadDbEvidenceView(
  query: QueryFn,
  conflictId: ConflictId,
  benchmarkKey: string,
  opts: DbViewOptions = {},
): Promise<DbEvidenceView | null> {
  const day = await loadDbBenchmarkDay(query, conflictId, benchmarkKey, opts);
  if (day === null) return null;
  const { rows, withheldClaimIds } = await loadDbEvidenceRows(query, day);
  return { day, definition: CONFLICT_REGISTRY[conflictId], rows, withheldClaimIds };
}

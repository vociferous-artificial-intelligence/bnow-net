// Source-to-publication quality funnel (quality foundation, 2026-08-17): for
// one (theater, track, date), how the day's eligible corpus converts into a
// published digest — eligible docs -> dedup mirrors -> map dispositions ->
// per-doc claims -> reduce/vote stages -> publication guard -> persisted
// events/claims/citations — with per-adapter/platform/language splits so an
// operator can see WHERE a source class falls out (e.g. the IR X-dependency
// question: does RSS/Telegram material die at map yield or at final citation
// attachment?).
//
// INTERNAL and UNCALIBRATED observability. Read-only: parameterized SQL
// builders return ROW-LEVEL facts and every aggregation is pure TS over those
// rows, unit-testable through an injected query(sql, params) function (the
// map-health.ts QueryFn pattern). Superseded extractor versions and dedup
// mirrors flow IN as rows and are excluded by the aggregator — provably, in
// quality-funnel.test.ts — so they can never inflate a stage.
//
// Units are explicit on every count: documents, claims (doc_claims rows or
// digest claims rows), groups (gids), events, or links (claim_sources rows).
// Fan-out is real and documented — one doc can back many claims and one group
// can feed many events — so the funnel asserts only the invariants that
// actually hold and emits reconciliation WARNINGS when they break.

import { STUB_CONTENT_PREFIX } from "../adapters/stubs";
import { currentVersion } from "./map-versions";
import { MAP_EPOCH } from "./map-worker";
import type { Track } from "./tracks";

export const FUNNEL_VERSION = 1;

export type QueryFn = (sql: string, params: unknown[]) => Promise<Array<Record<string, unknown>>>;

export interface SqlQuery {
  sql: string;
  params: unknown[];
}

// ---- SQL builders (row-level facts; aggregation happens in TS) ---------------

/** Eligible corpus for one (theater, day): the map worker's own selection
 *  predicate — day-bucketed on COALESCE(published_at, fetched_at)::date like
 *  the worker's candidate query, >= MAP_EPOCH, non-stub, length >= 40. One row
 *  per DOCUMENT, with its dedup verdict joined (canonical_doc_id non-null =
 *  mirror; mirrors are never mapped — their content lives on canonicals) and
 *  its `processed` disposition flag: the worker's lexicon gate runs AFTER this
 *  predicate, so a lexicon-failing doc ends processed=true with NO
 *  doc_map_state row — the flag is what separates "this track never applied"
 *  from genuinely-unmapped backlog (see aggregateCorpus). */
export function eligibleDocsSql(theater: string, date: string): SqlQuery {
  return {
    sql: `SELECT rd.id, rd.adapter, rd.lang, rd.processed, s.platform,
                 dd.canonical_doc_id, dd.method AS mirror_method
          FROM raw_documents rd
          LEFT JOIN sources s ON s.id = rd.source_id
          LEFT JOIN doc_dedup dd ON dd.raw_document_id = rd.id
          WHERE rd.country_iso2 = $1
            AND COALESCE(rd.published_at, rd.fetched_at)::date = $2::date
            AND COALESCE(rd.published_at, rd.fetched_at)::date >= $3::date
            AND length(rd.content) >= 40
            AND rd.content NOT LIKE $4`,
    params: [theater, date, MAP_EPOCH, `${STUB_CONTENT_PREFIX}%`],
  };
}

/** ALL doc_map_state rows for these docs and track — every extractor version.
 *  The aggregator splits current vs superseded; superseded rows are reported
 *  as an EXCLUDED count, never as coverage. One row per (doc, version). */
export function mapStateSql(docIds: number[], track: Track): SqlQuery {
  return {
    sql: `SELECT raw_document_id, extractor_version, claim_count::int AS claim_count
          FROM doc_map_state
          WHERE raw_document_id = ANY($1) AND track = $2`,
    params: [docIds, track],
  };
}

/** doc_claims row counts per (doc, version) for these docs and track — every
 *  extractor version; the aggregator filters to current. Counts CLAIMS. */
export function docClaimCountsSql(docIds: number[], track: Track): SqlQuery {
  return {
    sql: `SELECT raw_document_id, extractor_version, count(*)::int AS claims
          FROM doc_claims
          WHERE raw_document_id = ANY($1) AND track = $2
          GROUP BY raw_document_id, extractor_version`,
    params: [docIds, track],
  };
}

/** The digest row for one (theater, track, date), or no rows. */
export function digestRowSql(theater: string, track: Track, date: string): SqlQuery {
  return {
    sql: `SELECT d.id, d.provider, d.structured
          FROM digests d JOIN countries c ON c.id = d.country_id
          WHERE c.iso2 = $1 AND d.track = $2 AND d.digest_date = $3`,
    params: [theater, track, date],
  };
}

/** Relational persisted counts for one digest: CLAIMS rows and distinct EVENTS. */
export function persistedCountsSql(digestId: number): SqlQuery {
  return {
    sql: `SELECT count(*)::int AS claims, count(DISTINCT event_id)::int AS events
          FROM claims WHERE digest_id = $1`,
    params: [digestId],
  };
}

/** Every citation LINK (claim_sources row) of one digest with its document's
 *  adapter/platform and UTC day — the final-attachment side of the funnel.
 *  Stub docs are excluded like every other population read (ruling 3;
 *  symmetric with eligibleDocsSql and the persist-time recency read). */
export function citationLinksSql(digestId: number): SqlQuery {
  return {
    sql: `SELECT cs.raw_document_id, rd.adapter, s.platform,
                 COALESCE(rd.published_at, rd.fetched_at)::date::text AS day
          FROM claim_sources cs
          JOIN claims cl ON cl.id = cs.claim_id
          JOIN raw_documents rd ON rd.id = cs.raw_document_id
          LEFT JOIN sources s ON s.id = rd.source_id
          WHERE cl.digest_id = $1
            AND rd.content NOT LIKE $2`,
    params: [digestId, `${STUB_CONTENT_PREFIX}%`],
  };
}

// ---- row shapes (post-Number() folds; the Neon driver returns bigints as strings)

export interface EligibleDocRow {
  id: number;
  adapter: string;
  lang: string | null;
  platform: string | null;
  /** raw_documents.processed: the map worker reached a FINAL disposition for
   *  this doc (mapped under every applicable track, filed as a mirror, or no
   *  track lexicon matched) — the discriminator between lexicon skips and
   *  genuine backlog for docs without doc_map_state rows */
  processed: boolean;
  /** non-null = this doc is a dedup MIRROR of that canonical */
  canonicalDocId: number | null;
  mirrorMethod: string | null;
}

export interface MapStateRow {
  rawDocumentId: number;
  extractorVersion: string;
  claimCount: number;
}

export interface DocClaimCountRow {
  rawDocumentId: number;
  extractorVersion: string;
  claims: number;
}

export interface CitationLinkRow {
  rawDocumentId: number;
  adapter: string;
  platform: string | null;
  day: string;
}

// ---- report contract ---------------------------------------------------------

/** Mirror dedup methods are a bounded enum; anything else lands in `unknown`
 *  with its raw label preserved in unknownReasons — never dropped. */
export const MIRROR_METHODS = ["exact", "minhash"] as const;

export interface CorpusStages {
  /** DOCUMENTS eligible for mapping (worker predicate) */
  rawEligibleDocs: number;
  byAdapter: Record<string, number>;
  byPlatform: Record<string, number>;
  byLang: Record<string, number>;
  /** DOCUMENTS with a doc_dedup row — never mapped; content lives on canonicals */
  mirrorDocs: number;
  mirrorMethods: Record<string, number>;
  /** DOCUMENTS: rawEligibleDocs - mirrorDocs */
  canonicalDocs: number;
  /** DOCUMENTS with a doc_map_state disposition at the CURRENT (track, version) */
  mapDispositions: number;
  docsWithClaims: number; // DOCUMENTS (claim_count > 0)
  docsNoClaims: number; // DOCUMENTS (claim_count = 0)
  /** DOCUMENTS: canonical, processed=false, NO doc_map_state row at any
   *  version for this track — genuinely-unmapped backlog the hourly cron will
   *  still drain */
  pendingDocs: number;
  /** DOCUMENTS: canonical, processed=true, NO doc_map_state row at ANY
   *  version for this track — the track never applied (the worker's lexicon
   *  gate runs AFTER the eligibility predicate, so these will NEVER map under
   *  this track; without this split they would read as extraction loss) */
  notApplicableDocs: number;
  /** CLAIMS: doc_claims rows at the current (track, version) */
  mapClaims: number;
  /** EXCLUDED doc_map_state rows under NON-current versions (per (doc, version)) */
  supersededDispositions: number;
  /** EXCLUDED doc_claims rows under NON-current versions */
  supersededClaims: number;
  /** the day has dispositions ONLY under superseded versions — a version bump,
   *  not a coverage gap */
  supersededOnly: boolean;
}

/** One adapter's path through the funnel. citedDocs may exceed or fall outside
 *  eligibleDocs for rolling-window digests (their evidence spans [date-1,
 *  date+1)); docConversionPct is computed against the REPORT-DATE eligible
 *  corpus and labeled as such. */
export interface AdapterConversion {
  eligibleDocs: number; // DOCUMENTS in this day's eligible corpus
  pendingDocs: number; // DOCUMENTS: genuine unmapped backlog (processed=false, no state row for this track)
  notApplicableDocs: number; // DOCUMENTS: this track never applied (processed=true, no state row — lexicon skip)
  docsWithClaims: number; // DOCUMENTS with >=1 current-version map claim
  mapClaims: number; // CLAIMS (doc_claims rows, current version)
  citedDocs: number; // distinct DOCUMENTS cited by the persisted digest
  citationLinks: number; // LINKS (claim_sources rows)
  linkSharePct: number | null; // citationLinks / all links * 100; null when no links
  docConversionPct: number | null; // citedDocs / eligibleDocs * 100; null when none eligible
}

export interface DigestStages {
  digestId: number;
  engine: "mapreduce" | "legacy";
  provider: string | null;
  /** verbatim dispatch identity (stats.reduce.dispatch / stats.llmDispatch);
   *  rows persisted before the 2026-08-17 hardening lack it — reported as the
   *  literal "pre-hardening baseline" (gpt-4o-mini, no effort, by construction) */
  dispatch: unknown;
  /** mapreduce only: structured.stats.reduce passthrough (window, claims,
   *  groupsTotal/groupsFed = GROUPS, votes, survivingEvents = EVENTS,
   *  droppedGidRefs, gidsCitedAnyVote/gidsMajority = GROUPS when present) */
  reduce: Record<string, unknown> | null;
  /** legacy only: its own honest stages — never coerced into map stages */
  legacyStages: {
    docsRaw: number | null;
    trackRows: number | null;
    docsAnalyzed: number | null;
    droppedClaims: number | null;
  } | null;
  /** publication-guard removals/rewrites passthrough */
  publicationGuard: Record<string, unknown> | null;
  /** evidence-recency v1 passthrough (evidence-recency.ts) when present */
  evidenceRecency: Record<string, unknown> | null;
  persisted: {
    events: number; // EVENTS (distinct event_id over the digest's claims)
    claims: number; // CLAIMS (relational rows, the post-guard survivors)
    citationLinks: number; // LINKS (claim_sources rows)
    citedDocs: number; // distinct DOCUMENTS across those links
  };
  byPlatformLinks: Record<string, { links: number; docs: number }>;
}

export interface QualityFunnelReport {
  funnelVersion: typeof FUNNEL_VERSION;
  theater: string;
  track: Track;
  date: string;
  /** exact current extractor version filtered to; null = track not configured
   *  for this theater (no map coverage possible) */
  currentExtractorVersion: string | null;
  corpus: CorpusStages;
  /** null = no digest row exists for this (theater, track, date) */
  digest: DigestStages | null;
  /** corpus ∪ digest view per adapter — the "where does a source class fall
   *  out" answer (map yield vs final citation attachment; the reduce stage
   *  between them is global-only because fed-group membership is not persisted) */
  adapters: Record<string, AdapterConversion>;
  warnings: string[];
  unknownReasons: string[];
}

// ---- pure aggregation --------------------------------------------------------

const bump = (rec: Record<string, number>, key: string) => {
  rec[key] = (rec[key] ?? 0) + 1;
};

const num = (v: unknown): number => Number(v ?? 0);

/** Aggregate the corpus-side stages. Mirrors are excluded from every map stage
 *  and superseded versions from every current stage — rows for either still
 *  arrive here (the queries fetch ALL versions for ALL eligible docs) and are
 *  provably filtered out, so "0 mapped" after a version bump reads as
 *  superseded-only, never as a gap. */
export function aggregateCorpus(
  docs: EligibleDocRow[],
  states: MapStateRow[],
  claimCounts: DocClaimCountRow[],
  version: string | null,
  warnings: string[],
  unknownReasons: string[],
): CorpusStages {
  const byAdapter: Record<string, number> = {};
  const byPlatform: Record<string, number> = {};
  const byLang: Record<string, number> = {};
  const mirrorMethods: Record<string, number> = {};
  const eligibleIds = new Set<number>();
  const canonicalIds = new Set<number>();
  const processedOf = new Map<number, boolean>(); // canonical docs only
  let mirrorDocs = 0;
  for (const d of docs) {
    if (eligibleIds.has(d.id)) continue; // defensive: one row per doc
    eligibleIds.add(d.id);
    bump(byAdapter, d.adapter);
    bump(byPlatform, d.platform ?? "unknown");
    bump(byLang, d.lang ?? "unknown");
    if (d.canonicalDocId !== null) {
      mirrorDocs++;
      const method = (MIRROR_METHODS as readonly string[]).includes(d.mirrorMethod ?? "")
        ? (d.mirrorMethod as string)
        : "unknown";
      bump(mirrorMethods, method);
      if (method === "unknown") {
        unknownReasons.push(`doc_dedup.method=${String(d.mirrorMethod)}`);
      }
    } else {
      canonicalIds.add(d.id);
      processedOf.set(d.id, d.processed);
    }
  }

  let mapDispositions = 0;
  let docsWithClaims = 0;
  let supersededDispositions = 0;
  let mirrorStateRows = 0;
  // canonical docs with ≥1 doc_map_state row for this track at ANY version —
  // the complement (split by `processed` below) separates lexicon skips from
  // genuine backlog; a doc whose only rows are superseded stays OUT of both
  // (it is a remap target, counted in supersededDispositions)
  const docsWithAnyStateRow = new Set<number>();
  for (const s of states) {
    if (!eligibleIds.has(s.rawDocumentId)) continue; // outside this corpus
    if (!canonicalIds.has(s.rawDocumentId)) {
      mirrorStateRows++; // mirrors are never mapped — any row here is anomalous
      continue;
    }
    docsWithAnyStateRow.add(s.rawDocumentId);
    if (version !== null && s.extractorVersion === version) {
      mapDispositions++;
      if (s.claimCount > 0) docsWithClaims++;
    } else {
      supersededDispositions++;
    }
  }

  // Un-dispositioned canonical docs: the worker's per-track lexicon gate runs
  // AFTER the eligibility predicate (map-worker.ts applicableTracks), so a
  // lexicon-failing doc ends processed=true with NO doc_map_state row. Without
  // this split, an ir/military per-adapter "eligible -> withClaims" gap reads
  // as extraction loss when much of it is Iran-lexicon non-matches that will
  // never map.
  let pendingDocs = 0;
  let notApplicableDocs = 0;
  for (const [id, processed] of processedOf) {
    if (docsWithAnyStateRow.has(id)) continue;
    if (processed) notApplicableDocs++;
    else pendingDocs++;
  }
  if (mirrorStateRows > 0) {
    warnings.push(
      `${mirrorStateRows} doc_map_state row(s) on MIRROR docs excluded — mirrors are never mapped`,
    );
  }

  let mapClaims = 0;
  let supersededClaims = 0;
  const docsWithClaimRows = new Set<number>();
  for (const c of claimCounts) {
    if (!canonicalIds.has(c.rawDocumentId)) continue; // mirror or out-of-corpus
    if (version !== null && c.extractorVersion === version) {
      mapClaims += c.claims;
      if (c.claims > 0) docsWithClaimRows.add(c.rawDocumentId);
    } else {
      supersededClaims += c.claims;
    }
  }

  const supersededOnly = mapDispositions === 0 && supersededDispositions > 0;
  if (supersededOnly) {
    warnings.push(
      `superseded-only coverage: ${supersededDispositions} disposition(s) exist under ` +
        `non-current versions — "0 mapped" is a version bump awaiting remap ` +
        `(OPEN-TASKS #33), not an ingestion gap (current version: ${version ?? "n/a"})`,
    );
  }
  if (version === null) {
    warnings.push("track not configured for this theater — no current extractor version");
  }
  // Deliberate dead defense: unreachable by construction (docsWithClaims only
  // increments alongside mapDispositions above), kept so a future refactor of
  // that loop cannot silently break the spec'd invariant without a warning.
  if (docsWithClaims > mapDispositions) {
    warnings.push(`invariant violated: docsWithClaims ${docsWithClaims} > mapDispositions ${mapDispositions}`);
  }
  if (mapClaims < docsWithClaims) {
    warnings.push(`invariant violated: mapClaims ${mapClaims} < docsWithClaims ${docsWithClaims}`);
  }
  if (docsWithClaimRows.size !== docsWithClaims) {
    warnings.push(
      `reconciliation: ${docsWithClaims} disposition(s) declare claims but ` +
        `${docsWithClaimRows.size} doc(s) hold current-version doc_claims rows`,
    );
  }

  return {
    rawEligibleDocs: eligibleIds.size,
    byAdapter,
    byPlatform,
    byLang,
    mirrorDocs,
    mirrorMethods,
    canonicalDocs: canonicalIds.size,
    mapDispositions,
    docsWithClaims,
    docsNoClaims: mapDispositions - docsWithClaims,
    pendingDocs,
    notApplicableDocs,
    mapClaims,
    supersededDispositions,
    supersededClaims,
    supersededOnly,
  };
}

const rec = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const numOrNull = (v: unknown): number | null => (typeof v === "number" ? v : null);

const round2 = (n: number) => Math.round(n * 100) / 100;

export const PRE_HARDENING_DISPATCH = "pre-hardening baseline";

/** Bounded window modes; anything else is preserved in unknownReasons. */
const WINDOW_MODES = ["day", "rolling"] as const;

/** Aggregate the digest-side stages from the digests row + relational counts +
 *  citation links. A digest is mapreduce ONLY when structured.stats.engine says
 *  so; anything else reports its own honest legacy stages and is never coerced
 *  into map stages. */
export function aggregateDigest(
  row: { id: number; provider: string | null; structured: unknown },
  counts: { events: number; claims: number },
  links: CitationLinkRow[],
  warnings: string[],
  unknownReasons: string[],
): DigestStages {
  const stats = rec(rec(row.structured)?.stats) ?? {};
  const engine: DigestStages["engine"] = stats.engine === "mapreduce" ? "mapreduce" : "legacy";
  const reduce = engine === "mapreduce" ? rec(stats.reduce) : null;
  const publicationGuard = rec(stats.publicationGuard);
  const evidenceRecency = rec(stats.evidenceRecency);

  const dispatch =
    (engine === "mapreduce" ? reduce?.dispatch : stats.llmDispatch) ?? PRE_HARDENING_DISPATCH;

  const legacyStages =
    engine === "legacy"
      ? {
          docsRaw: numOrNull(stats.docsRaw),
          trackRows: numOrNull(stats.trackRows),
          docsAnalyzed: numOrNull(stats.docsAnalyzed),
          droppedClaims: numOrNull(stats.droppedClaims),
        }
      : null;

  const citedDocs = new Set<number>();
  const byPlatformLinks: Record<string, { links: number; docs: number }> = {};
  const platformDocs = new Map<string, Set<number>>();
  for (const l of links) {
    citedDocs.add(l.rawDocumentId);
    const platform = l.platform ?? "unknown";
    const slot = (byPlatformLinks[platform] ??= { links: 0, docs: 0 });
    slot.links++;
    let docSet = platformDocs.get(platform);
    if (!docSet) platformDocs.set(platform, (docSet = new Set()));
    docSet.add(l.rawDocumentId);
  }
  for (const [platform, docSet] of platformDocs) byPlatformLinks[platform].docs = docSet.size;

  // reconciliation between structured accounting and the relational truth
  const erClaims = numOrNull(evidenceRecency?.claimCount);
  if (erClaims !== null && erClaims !== counts.claims) {
    warnings.push(
      `reconciliation: evidenceRecency.claimCount ${erClaims} != relational claims ${counts.claims}`,
    );
  }
  if (reduce) {
    const windowRec = rec(reduce.window);
    const mode = windowRec?.mode;
    if (typeof mode === "string" && !(WINDOW_MODES as readonly string[]).includes(mode)) {
      unknownReasons.push(`reduce.window.mode=${mode}`);
    }
    const groupsTotal = numOrNull(reduce.groupsTotal);
    const groupsFed = numOrNull(reduce.groupsFed);
    if (groupsTotal !== null && groupsFed !== null && groupsFed > groupsTotal) {
      warnings.push(`invariant violated: groupsFed ${groupsFed} > groupsTotal ${groupsTotal}`);
    }
    const cited = numOrNull(reduce.gidsCitedAnyVote);
    const majority = numOrNull(reduce.gidsMajority);
    if (cited !== null && majority !== null && majority > cited) {
      warnings.push(`invariant violated: gidsMajority ${majority} > gidsCitedAnyVote ${cited}`);
    }
    if (cited !== null && groupsFed !== null && cited > groupsFed) {
      warnings.push(`invariant violated: gidsCitedAnyVote ${cited} > groupsFed ${groupsFed}`);
    }
    const surviving = numOrNull(reduce.survivingEvents);
    if (surviving !== null && counts.events > surviving) {
      warnings.push(
        `reconciliation: ${counts.events} persisted events exceed ${surviving} surviving merged events`,
      );
    }
    // the digest's evidence must come from its own reduce window (the rolling
    // window spans [date-1, date+1), so a single-day corpus is NOT the bound)
    const from = windowRec?.from;
    const to = windowRec?.to;
    if (typeof from === "string" && typeof to === "string") {
      const outside = new Set(
        links.filter((l) => l.day < from || l.day >= to).map((l) => l.rawDocumentId),
      ).size;
      if (outside > 0) {
        warnings.push(
          `reconciliation: ${outside} cited doc(s) fall outside the reduce window [${from}, ${to})`,
        );
      }
    }
  }

  return {
    digestId: row.id,
    engine,
    provider: row.provider,
    dispatch,
    reduce,
    legacyStages,
    publicationGuard,
    evidenceRecency,
    persisted: {
      events: counts.events,
      claims: counts.claims,
      citationLinks: links.length,
      citedDocs: citedDocs.size,
    },
    byPlatformLinks,
  };
}

/** Per-adapter conversion view spanning both sides of the funnel. Adapters
 *  appearing only in the citations (a rolling-window doc from a neighboring
 *  day) get eligibleDocs 0 and a null docConversionPct rather than a fake
 *  rate. The pending/notApplicable split matters MOST here: without it, an
 *  adapter whose material fails the track lexicon reads as extraction loss. */
export function buildAdapterConversions(
  docs: EligibleDocRow[],
  states: MapStateRow[],
  claimCounts: DocClaimCountRow[],
  links: CitationLinkRow[],
  version: string | null,
): Record<string, AdapterConversion> {
  const adapterOf = new Map<number, string>();
  const canonicalIds = new Set<number>();
  for (const d of docs) {
    adapterOf.set(d.id, d.adapter);
    if (d.canonicalDocId === null) canonicalIds.add(d.id);
  }
  const out: Record<string, AdapterConversion> = {};
  const slot = (adapter: string) =>
    (out[adapter] ??= {
      eligibleDocs: 0,
      pendingDocs: 0,
      notApplicableDocs: 0,
      docsWithClaims: 0,
      mapClaims: 0,
      citedDocs: 0,
      citationLinks: 0,
      linkSharePct: null,
      docConversionPct: null,
    });
  for (const d of docs) slot(d.adapter).eligibleDocs++;
  const docsWithAnyStateRow = new Set<number>();
  for (const s of states) {
    if (!canonicalIds.has(s.rawDocumentId)) continue;
    docsWithAnyStateRow.add(s.rawDocumentId);
    if (version !== null && s.extractorVersion === version && s.claimCount > 0) {
      slot(adapterOf.get(s.rawDocumentId)!).docsWithClaims++;
    }
  }
  // same split as aggregateCorpus, per adapter: no state row at any version
  // for this track -> lexicon skip (processed) vs genuine backlog (pending)
  for (const d of docs) {
    if (!canonicalIds.has(d.id) || docsWithAnyStateRow.has(d.id)) continue;
    if (d.processed) slot(d.adapter).notApplicableDocs++;
    else slot(d.adapter).pendingDocs++;
  }
  for (const c of claimCounts) {
    if (!canonicalIds.has(c.rawDocumentId)) continue;
    if (version !== null && c.extractorVersion === version) {
      slot(adapterOf.get(c.rawDocumentId)!).mapClaims += c.claims;
    }
  }
  const citedByAdapter = new Map<string, Set<number>>();
  for (const l of links) {
    const s = slot(l.adapter);
    s.citationLinks++;
    let docSet = citedByAdapter.get(l.adapter);
    if (!docSet) citedByAdapter.set(l.adapter, (docSet = new Set()));
    docSet.add(l.rawDocumentId);
  }
  const totalLinks = links.length;
  for (const [adapter, docSet] of citedByAdapter) out[adapter].citedDocs = docSet.size;
  for (const s of Object.values(out)) {
    s.linkSharePct = totalLinks > 0 ? round2((s.citationLinks / totalLinks) * 100) : null;
    s.docConversionPct = s.eligibleDocs > 0 ? round2((s.citedDocs / s.eligibleDocs) * 100) : null;
  }
  return out;
}

// ---- loader ------------------------------------------------------------------

/** Load and assemble the funnel for one (theater, track, date). Read-only:
 *  every statement is a SELECT built above. */
export async function loadQualityFunnel(
  query: QueryFn,
  key: { theater: string; track: Track; date: string },
): Promise<QualityFunnelReport> {
  const warnings: string[] = [];
  const unknownReasons: string[] = [];
  const version = currentVersion(key.track, key.theater);

  const docsQ = eligibleDocsSql(key.theater, key.date);
  const docs: EligibleDocRow[] = (await query(docsQ.sql, docsQ.params)).map((r) => ({
    id: num(r.id),
    adapter: String(r.adapter),
    lang: (r.lang as string | null) ?? null,
    platform: (r.platform as string | null) ?? null,
    processed: r.processed === true,
    canonicalDocId: r.canonical_doc_id == null ? null : num(r.canonical_doc_id),
    mirrorMethod: (r.mirror_method as string | null) ?? null,
  }));
  const docIds = docs.map((d) => d.id);

  let states: MapStateRow[] = [];
  let claimCounts: DocClaimCountRow[] = [];
  if (docIds.length > 0) {
    const statesQ = mapStateSql(docIds, key.track);
    states = (await query(statesQ.sql, statesQ.params)).map((r) => ({
      rawDocumentId: num(r.raw_document_id),
      extractorVersion: String(r.extractor_version),
      claimCount: num(r.claim_count),
    }));
    const claimsQ = docClaimCountsSql(docIds, key.track);
    claimCounts = (await query(claimsQ.sql, claimsQ.params)).map((r) => ({
      rawDocumentId: num(r.raw_document_id),
      extractorVersion: String(r.extractor_version),
      claims: num(r.claims),
    }));
  }

  const corpus = aggregateCorpus(docs, states, claimCounts, version, warnings, unknownReasons);

  const digestQ = digestRowSql(key.theater, key.track, key.date);
  const digestRows = await query(digestQ.sql, digestQ.params);
  let digest: DigestStages | null = null;
  let links: CitationLinkRow[] = [];
  if (digestRows.length > 0) {
    const row = digestRows[0];
    const digestId = num(row.id);
    const countsQ = persistedCountsSql(digestId);
    const countRows = await query(countsQ.sql, countsQ.params);
    const counts = {
      events: num(countRows[0]?.events),
      claims: num(countRows[0]?.claims),
    };
    const linksQ = citationLinksSql(digestId);
    links = (await query(linksQ.sql, linksQ.params)).map((r) => ({
      rawDocumentId: num(r.raw_document_id),
      adapter: String(r.adapter),
      platform: (r.platform as string | null) ?? null,
      day: String(r.day),
    }));
    digest = aggregateDigest(
      { id: digestId, provider: (row.provider as string | null) ?? null, structured: row.structured },
      counts,
      links,
      warnings,
      unknownReasons,
    );
  }

  return {
    funnelVersion: FUNNEL_VERSION,
    theater: key.theater,
    track: key.track,
    date: key.date,
    currentExtractorVersion: version,
    corpus,
    digest,
    adapters: buildAdapterConversions(docs, states, claimCounts, links, version),
    warnings,
    unknownReasons,
  };
}

import { Pool } from "@neondatabase/serverless";
import type OpenAI from "openai";
import { STUB_CONTENT_PREFIX } from "../adapters/stubs";
import {
  acquireMapLease,
  mapLeaseTtlMs,
  pgMapLeaseDriver,
  type MapLeaseDriver,
  type MapLeaseHandle,
} from "./map-lease";
import { analysisOpenAiClient } from "./openai-client";
import {
  analysisChatParams,
  dispatchIdentity,
  resolveWorkloadModel,
  workloadDispatchConfig,
  type AnalysisDispatchConfig,
} from "../llm/model-config";
import { estimateCostUsd } from "../llm/pricing";
import { LlmBudgetError, assertLlmEnabled, mapGuardFromEnv } from "../usage/llm-guard";
import { markDegraded } from "../usage/cron-run";
import { stopCategoryOfCode, type SpendGuard } from "../usage/spend-guard";
import { dedupGate, type DedupDoc } from "./map-dedup";
import { verifyQuote } from "./quote-verify";
import {
  mapContentChars,
  mapDocLine,
  mapExtractorVersion,
  mapResponseSchema,
  mapSystemPrompt,
  mapUserMessage,
} from "./map-prompts";
import { TRACKS, type Track } from "./tracks";

// Map worker (SHADOW): extract every eligible canonical document's claims ONCE
// per (track, extractor_version) into doc_claims. The digest pipeline is
// untouched — nothing here writes to digests/events/claims.
//
// Cycle: select unmapped docs (processed=false, indexed) -> persistent dedup
// gate (doc_dedup; mirrors never reach the LLM) -> per-doc track applicability
// -> same-(theater,track) micro-batches of 10-25 docs -> gpt-4o-mini strict
// JSON keyed by docId -> doc_claims + doc_map_state. Idempotent and resumable:
// a crashed run leaves processed=false and re-selects; unique keys make replays
// no-ops; already-mapped (doc, track) pairs are skipped by anti-join.
//
// Concurrency: ONE map cycle at a time across the hourly cron, the backfill
// driver, and the remap operator, serialized by the durable provider_state
// lease in map-lease.ts (the former session advisory lock stranded on the Neon
// pooler — OPEN-TASKS #77). The lease is acquired BEFORE any reservation or
// dispatch, renewed at every physical provider attempt, and re-verified
// immediately before every map write; a lost lease discards parsed results
// (their billed usage is already metered) and makes no further writes. The
// pre-write re-check is a check-then-act, not a statement fence — map-lease.ts
// states the accepted renew-to-COMMIT residual exactly.
//
// Remap mode (OPEN-TASKS #33, scripts/map-remap.ts): eligibility ignores
// raw_documents.processed and instead anti-joins doc_map_state against the
// CURRENT extractor versions, so a prompt/version bump can re-extract already-
// dispositioned documents. Remap never resets processed, never deletes old
// doc_claims, and never mutates historical extractor versions — superseded
// rows stay as append-only history/rollback.

/** Docs published/fetched before this UTC day are out of map scope (sprint 2
 *  backfills 2026-07-04 forward; earlier corpus was cold-start telegram-only). */
export const MAP_EPOCH = "2026-07-04";

/** Thrown by the extractBatch keepalive when the lease is lost mid-batch:
 *  stops the batch BEFORE its next reservation/dispatch. Never leaves this
 *  module — runWorker catches it (the lost latch is already set). */
export class MapLeaseLostError extends Error {
  constructor() {
    super("map-worker: lease lost mid-batch");
    this.name = "MapLeaseLostError";
  }
}

export function mapTheaters(): string[] {
  const raw = process.env.MAP_THEATERS ?? "ru,ua,ir";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Micro-batch size: 10-25 amortizes the system prompt (~430 tok) while staying
 *  far below the output ceiling at ~200 out-tokens/doc (design decision). */
export function mapBatchSize(): number {
  const v = Number(process.env.MAP_BATCH_SIZE);
  const n = Number.isFinite(v) ? Math.floor(v) : 20;
  return Math.min(25, Math.max(5, n));
}

function mapRunDocCap(): number {
  const v = Number(process.env.MAP_RUN_DOC_CAP);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 500;
}

// -- steady-mode flood bounds (2026-08-31 incident) -------------------------
// A single MTProto long-park catch-up inserted 447 documents whose
// published_at reached back eight weeks. The oldest-first steady selection
// then spanned 58 days, the dedup reference window [minDay-1, maxDay+1]
// materialized 419K rows (~each with a 2,000-char text2k), and the function
// was killed for memory (confirmed "instance was killed because it ran out of
// available memory") after lease acquisition and before any dispatch — every
// hour, because nothing was ever dispositioned. These bounds make one
// invocation's dedup work finite regardless of how old the backlog is, while
// the fresh-window reservation keeps current input flowing as it drains.

/** Max distinct candidate DAYS one steady (hourly) selection may span. Healthy
 *  steady selections span 1–2 days; a wider span engages the old/fresh split
 *  below instead of widening the reference window. Backlog days drain
 *  oldest-first, at most this many days per run. */
export const MAP_STEADY_SPAN_DAYS = 3;

/** Steady runs reserve up to half the doc cap for documents from the last N
 *  UTC days (today and yesterday, DB clock), so a historical flood can never
 *  starve fresh input while it drains — the crash must not be replaced by
 *  days of freshness loss. */
export const MAP_FRESH_WINDOW_DAYS = 2;

/** Hard ceiling on dedup reference rows materialized per cycle. Calibrated to
 *  the INSTANCE, not the incident: measured ~7.6KB live per reference at gate
 *  time (~4.2KB row with its two-byte 2,000-char text2k + ~3.4KB retained LSH
 *  state), so 75K ≈ ~0.6GB live set ≈ ~1.0–1.1GB peak RSS with driver buffers
 *  and GC churn — comfortable on the default ~1.7–2GB function (the incident's
 *  419K refs ≈ 3.2GB, which is exactly why it OOM-killed). Still ~2.6× the
 *  largest observed realistic 3-day window (~28.6K rows). Exceeding it turns a
 *  silent memory death into an explicit ok=false cron_runs error; nothing is
 *  marked processed on that path. */
export const MAP_REF_ROW_CAP = 75_000;

/** yyyy-mm-dd shifted by n UTC days — pure day arithmetic, no clock read. */
export function shiftDay(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** The exact set of reference DAYS the ±1-day dedup rule can match against
 *  the given candidate days. Replaces the min..max BETWEEN: with sparse
 *  candidate days (07-05 and 08-29, say) min..max materializes the whole
 *  two-month window even though every row further than one day from a
 *  candidate is unmatchable dead weight, while this set is bounded by the
 *  selection's day-span caps. For any candidate set the MATCHABLE reference
 *  rows fetched are identical to the BETWEEN's — only never-matchable rows
 *  are excluded. */
export function dedupRefDays(candidateDays: string[]): string[] {
  const out = new Set<string>();
  for (const d of candidateDays) {
    out.add(shiftDay(d, -1));
    out.add(d);
    out.add(shiftDay(d, 1));
  }
  return [...out].sort();
}

/** Concurrent micro-batch calls. 3 workers ≈ 140K tok/min at measured batch
 *  sizes — inside the 200K Tier-1 TPM (audit §7b) with margin for the digest
 *  crons; a 429 still sleeps out the window per worker. */
function mapConcurrency(): number {
  const v = Number(process.env.MAP_CONCURRENCY);
  return Number.isFinite(v) && v >= 1 ? Math.min(8, Math.floor(v)) : 3;
}

/** Per-doc output-token budget (MAP_OUT_TOKENS_PER_DOC, default 200 — audit
 *  §11's assumption with headroom). Exported so the analysis-eval control
 *  plane can record the knob a run executed under; the arithmetic is
 *  unchanged. */
export function mapOutTokensPerDoc(): number {
  const per = Number(process.env.MAP_OUT_TOKENS_PER_DOC);
  return Number.isFinite(per) && per >= 60 ? Math.floor(per) : 200;
}

/** Output budget: ~200 tokens/doc (a doc yields 0-3 claims at ~90-180 tok,
 *  audit §11), floored so a single dense doc can still answer. */
export function mapBatchMaxTokens(docCount: number): number {
  return Math.min(16_384, Math.max(1_000, docCount * mapOutTokensPerDoc()));
}

/** Tracks that should map this doc: track configured for the doc's theater AND
 *  (military everywhere except ir's lexicon variant; elite/nuclear only on
 *  lexicon match) — the digest's stage-D gate, applied per doc so we never pay
 *  3x to map every doc under every track. */
export function applicableTracks(doc: {
  countryIso2: string;
  title: string | null;
  content: string;
}): Track[] {
  const probe = `${doc.title ?? ""} ${doc.content}`.slice(0, 1500);
  const out: Track[] = [];
  for (const track of Object.keys(TRACKS) as Track[]) {
    const cfg = TRACKS[track];
    if (!cfg.countries.includes(doc.countryIso2)) continue;
    const lexicon = cfg.lexiconByCountry?.[doc.countryIso2] ?? cfg.lexicon;
    if (lexicon && !lexicon.test(probe)) continue;
    out.push(track);
  }
  return out;
}

export interface MapClaim {
  textEn: string;
  quoteOrig: string | null;
  claimType: "factual" | "assessment";
  hedging: "confirmed" | "claimed" | "unverified" | "assessed" | "unknown";
  entities: Array<{ name: string; kind: string; role: string }>;
  eventHint: string | null;
}

export interface ParsedMapResults {
  /** docId -> claims (empty array = mapped, nothing relevant). Only docs the
   *  model answered for; omitted docs stay unmapped and are retried next run. */
  perDoc: Map<number, MapClaim[]>;
  /** entries citing a docId not in the batch — dropped (anti-hallucination) */
  wrongDocIds: number;
  /** repeated docId entries — first wins, rest dropped */
  duplicateEntries: number;
}

/** Parse + validate one map response against the batch actually sent. Mirrors
 *  the digest path's docId containment gate (digest.ts stage 4): a claim keyed
 *  to an id the model was never given must not enter the store. */
export function parseMapResults(raw: string, batchIds: number[]): ParsedMapResults {
  let parsed: { results?: unknown };
  try {
    parsed = JSON.parse(raw) as { results?: unknown };
  } catch {
    throw new Error("map-worker: unparseable response JSON");
  }
  const results = Array.isArray(parsed.results) ? parsed.results : [];
  const valid = new Set(batchIds);
  const perDoc = new Map<number, MapClaim[]>();
  let wrongDocIds = 0;
  let duplicateEntries = 0;
  for (const entry of results as Array<{ docId?: unknown; claims?: unknown }>) {
    const docId = typeof entry?.docId === "number" ? entry.docId : NaN;
    if (!valid.has(docId)) {
      wrongDocIds++;
      continue;
    }
    if (perDoc.has(docId)) {
      duplicateEntries++;
      continue;
    }
    const rawClaims = Array.isArray(entry.claims) ? entry.claims : [];
    const claims: MapClaim[] = [];
    for (const c of rawClaims as Array<Record<string, unknown>>) {
      if (claims.length === 3) break; // prompt asks for 0-3; cap counts valid claims only
      const textEn = typeof c.text_en === "string" ? c.text_en.trim().slice(0, 250) : "";
      if (!textEn) continue;
      const quote = typeof c.quote_orig === "string" ? c.quote_orig.trim().slice(0, 300) : "";
      const hint = typeof c.event_hint === "string" ? c.event_hint.trim().slice(0, 160) : "";
      claims.push({
        textEn,
        quoteOrig: quote || null,
        claimType: c.claim_type === "assessment" ? "assessment" : "factual",
        hedging: (["confirmed", "claimed", "unverified", "assessed", "unknown"] as const).includes(
          c.hedging as never,
        )
          ? (c.hedging as MapClaim["hedging"])
          : "unknown",
        entities: (Array.isArray(c.entities) ? c.entities : [])
          .filter(
            (e): e is { name: string; kind?: unknown; role?: unknown } =>
              typeof (e as { name?: unknown })?.name === "string" &&
              (e as { name: string }).name.trim().length > 0,
          )
          .map((e) => ({
            name: e.name.trim().slice(0, 200),
            kind: typeof e.kind === "string" ? e.kind.slice(0, 20) : "org",
            role: typeof e.role === "string" && e.role ? e.role.slice(0, 40) : "other",
          })),
        eventHint: hint || null,
      });
    }
    perDoc.set(docId, claims);
  }
  return { perDoc, wrongDocIds, duplicateEntries };
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

interface CandidateDoc extends DedupDoc {
  title: string | null;
  content: string;
  adapter: string;
  sourceKey: string | null;
  reliability: number | null;
}

/** Raw candidate row exactly as the selection SQL returns it. */
interface CandRowRaw {
  id: number;
  title: string | null;
  content: string;
  adapter: string;
  theater: string;
  day: string;
  source_key: string | null;
  reliability: string | number | null;
  content_md5: string;
  text2k: string;
}

/** Steady/backfill candidate selection under the flood bounds.
 *
 *  Ordinary path — the eligible backlog spans at most MAP_STEADY_SPAN_DAYS
 *  distinct days (every healthy hourly run, and every date-scoped backfill run
 *  by construction since ${dateOp}='=' admits one day): ONE query, byte-identical
 *  to the historical selection.
 *
 *  Flood path — more distinct days than that: fresh-first allocation. Up to
 *  ceil(docCap/2) documents from the last MAP_FRESH_WINDOW_DAYS UTC days (DB
 *  clock) keep current input flowing; the remaining capacity drains the OLDEST
 *  MAP_STEADY_SPAN_DAYS backlog days. Segments are concatenated old-first, so
 *  global candidate ordering — and therefore dedup first-seen precedence — is
 *  unchanged, and both segments pass through ONE dedupGate call, so
 *  candidate-to-candidate matching across the partition boundary is intact.
 *  Documents outside both windows are simply NOT selected this run: no
 *  verdict, no processed mark, nothing fabricated — the next run's oldest
 *  window has moved forward past whatever this run dispositioned. */
async function selectSteadyCandidateRows(
  pool: Pool,
  theaters: string[],
  dateOp: string,
  dateParam: string,
  docCap: number,
  counts: Record<string, unknown>,
): Promise<CandRowRaw[]> {
  const stub = `${STUB_CONTENT_PREFIX}%`;
  // The historical selection, verbatim; `extra` narrows a flood segment.
  const selectSql = (extra: string) =>
    `SELECT rd.id, rd.title, rd.content, rd.adapter, rd.country_iso2 AS theater,
                COALESCE(rd.published_at, rd.fetched_at)::date::text AS day,
                s.canonical_url AS source_key, s.reliability_score AS reliability,
                md5(trim(regexp_replace(rd.content, '\\s+', ' ', 'g'))) AS content_md5,
                left(coalesce(rd.title, '') || ' ' || rd.content, 2000) AS text2k
         FROM raw_documents rd
         LEFT JOIN sources s ON s.id = rd.source_id
         WHERE rd.processed = false
           AND rd.country_iso2 = ANY($1)
           AND length(rd.content) >= 40
           AND rd.content NOT LIKE $2
           AND COALESCE(rd.published_at, rd.fetched_at)::date ${dateOp} $3::date${extra}
         ORDER BY COALESCE(rd.published_at, rd.fetched_at) ASC, rd.id ASC
         LIMIT $4`;

  // Cheap span probe: the first SPAN+1 distinct eligible days, oldest first.
  const { rows: dayRows } = await pool.query(
    `SELECT DISTINCT COALESCE(rd.published_at, rd.fetched_at)::date::text AS day
       FROM raw_documents rd
       WHERE rd.processed = false
         AND rd.country_iso2 = ANY($1)
         AND length(rd.content) >= 40
         AND rd.content NOT LIKE $2
         AND COALESCE(rd.published_at, rd.fetched_at)::date ${dateOp} $3::date
       ORDER BY day ASC
       LIMIT ${MAP_STEADY_SPAN_DAYS + 1}`,
    [theaters, stub, dateParam],
  );
  const probeDays = dayRows.map((r) => String(r.day));
  if (probeDays.length <= MAP_STEADY_SPAN_DAYS) {
    const { rows } = await pool.query(selectSql(""), [theaters, stub, dateParam, docCap]);
    return rows as CandRowRaw[];
  }

  // Flood path. Fresh cutoff from the DB clock (not the function's).
  const { rows: cutoffRows } = await pool.query(
    `SELECT ((now() at time zone 'utc')::date - ${MAP_FRESH_WINDOW_DAYS - 1})::text AS d`,
    [],
  );
  // A missing cutoff (defensive; cannot happen against a real DB) fails toward
  // the BOUNDED old-days-only path, never toward the unbounded historical one.
  const freshCutoff = cutoffRows[0]?.d ? String(cutoffRows[0].d) : "9999-12-31";
  const oldDays = probeDays.filter((d) => d < freshCutoff).slice(0, MAP_STEADY_SPAN_DAYS);
  if (oldDays.length === 0) {
    // >SPAN distinct days but none older than the fresh window (future-dated
    // stragglers): the plain selection is day-bounded enough — the reference
    // fetch is independently bounded by dedupRefDays either way.
    const { rows } = await pool.query(selectSql(""), [theaters, stub, dateParam, docCap]);
    return rows as CandRowRaw[];
  }
  const freshCap = Math.ceil(docCap / 2);
  const { rows: freshRows } = await pool.query(
    selectSql(`
           AND COALESCE(rd.published_at, rd.fetched_at)::date >= $5::date`),
    [theaters, stub, dateParam, freshCap, freshCutoff],
  );
  const oldCap = docCap - freshRows.length;
  const oldRows =
    oldCap > 0
      ? (
          await pool.query(
            selectSql(`
           AND COALESCE(rd.published_at, rd.fetched_at)::date = ANY($5::date[])`),
            [theaters, stub, dateParam, oldCap, oldDays],
          )
        ).rows
      : [];
  counts.floodGuard = {
    oldDays: oldDays.length,
    selectedOld: oldRows.length,
    selectedFresh: freshRows.length,
  };
  // old (strictly pre-cutoff) days sort before fresh ones: global oldest-first
  // ordering is preserved by construction.
  return [...oldRows, ...freshRows] as CandRowRaw[];
}

export interface MapCycleOptions {
  /** theater filter; default env MAP_THEATERS (ru,ua,ir) */
  theaters?: string[];
  /** restrict selection to one UTC day (backfill driver) */
  date?: string | null;
  /** max docs selected this run; default env MAP_RUN_DOC_CAP (500) */
  docCap?: number;
  /** select + dedup + batch + cost model only — no LLM call, no writes (a dry
   *  run also skips the lease: it must make ZERO writes, provider_state
   *  included, and its reads race nothing) */
  dryRun?: boolean;
  /** remap mode (OPEN-TASKS #33): eligibility ignores `processed`; selects
   *  canonical, already-dispositioned docs missing a CURRENT-version
   *  doc_map_state row for an applicable track. See remap notes above. */
  remap?: boolean;
  /** remap pagination cursor: only docs with id > afterId are selected; the
   *  run reports maxSelectedId so the driver can advance without rescanning
   *  docs that yield no work (e.g. lexicon-mismatch docs) */
  afterId?: number;
  /** remap: restrict to one track (applicability is intersected with it) */
  track?: Track;
  /** injectable lease driver (tests); default = the pg provider_state driver */
  leaseDriver?: MapLeaseDriver;
}

interface MapRunStats {
  llmCalls: number;
  promptTokens: number;
  completionTokens: number;
  claims: number;
  emptyDocs: number;
  wrongDocIds: number;
  duplicateEntries: number;
  omittedDocs: number;
  truncationSplits: number;
  truncatedSingles: number;
  quoteMisses: number;
  batchErrors: number;
  /** parsed batches discarded because the lease was lost before persistence
   *  (their billed usage was already metered — ruling 8) */
  leaseLostDiscards: number;
  /** successful full-TTL renewals during this cycle */
  leaseRenewals: number;
}

export async function runMapCycle(
  opts: MapCycleOptions = {},
  counts: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const theaters = opts.theaters ?? mapTheaters();
  const docCap = opts.docCap ?? mapRunDocCap();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    if (opts.dryRun) {
      // read-only: no lease (zero writes of any kind), no cron_runs row (route)
      return await cycle(pool, theaters, docCap, opts, counts, null);
    }
    const owner = opts.remap ? "map:remap" : opts.date ? "map:backfill" : "map";
    const lease = await acquireMapLease(owner, mapLeaseTtlMs(), opts.leaseDriver ?? pgMapLeaseDriver);
    if (!lease.handle) {
      // busy AND driver-error both fail safe: no paid call, no map write
      counts.skipped = lease.reason ?? "another map cycle holds the lease";
      counts.lease = { outcome: lease.outcome };
      return counts;
    }
    counts.lease = {
      outcome: lease.handle.outcome,
      fence: lease.handle.fence,
      renewals: 0,
      lost: 0,
      released: 0,
    };
    try {
      return await cycle(pool, theaters, docCap, opts, counts, lease.handle);
    } finally {
      // released reflects the ACTUAL outcome: a lost/stale token's release is
      // a refused no-op and must not read as a clean handover
      (counts.lease as Record<string, unknown>).released = (await lease.handle.release()) ? 1 : 0;
    }
  } finally {
    await pool.end();
  }
}

async function cycle(
  pool: Pool,
  theaters: string[],
  docCap: number,
  opts: MapCycleOptions,
  counts: Record<string, unknown>,
  lease: MapLeaseHandle | null,
): Promise<Record<string, unknown>> {
  const stats: MapRunStats = {
    llmCalls: 0,
    promptTokens: 0,
    completionTokens: 0,
    claims: 0,
    emptyDocs: 0,
    wrongDocIds: 0,
    duplicateEntries: 0,
    omittedDocs: 0,
    truncationSplits: 0,
    truncatedSingles: 0,
    quoteMisses: 0,
    batchErrors: 0,
    leaseLostDiscards: 0,
    leaseRenewals: 0,
  };
  // Per-class tally of batch failures (#87): kept OUTSIDE MapRunStats (that
  // interface is all-number and is flattened wholesale into counts) and
  // recorded as a fixed content-safe vocabulary, never raw provider messages —
  // a provider 400 can echo the rejected payload, and counts render into
  // operator artifacts (x-gap-rescore result.md; map-health email bodies stay
  // numeric-only by contract).
  const batchErrorClasses = new Map<string, number>();
  // Lost-lease latch: set the moment a renew fails. Checked before every write
  // and every new dispatch; parsed-but-unpersisted results are discarded (their
  // billed usage is already in provider_usage — metering precedes discarding).
  const leaseLost = { current: false };
  /** Re-verify ownership (full-TTL renew) immediately before a write, so the
   *  write starts with a fresh full TTL ahead of it and a competing takeover —
   *  which requires PROVEN expiry — ordinarily cannot begin before the short
   *  transaction commits. This is a CHECK-THEN-ACT, not a statement fence: the
   *  unprotected window is the whole renew-to-COMMIT span (for a 25-doc
   *  persistBatch, a multi-statement transaction of ~100 round-trips). A stall
   *  of that entire span past the full TTL can admit a second committer, whose
   *  bounded consequence is a first-writer-wins mixed-generation claim set for
   *  one (doc, track, version) — see the accepted residual in map-lease.ts and
   *  the deferred fence-column fix (OPEN-TASKS #85). Dry runs (lease === null)
   *  never reach any write. */
  const stillOwner = async (): Promise<boolean> => {
    if (lease === null) return true;
    if (leaseLost.current) return false;
    let ok = false;
    try {
      ok = await lease.renew();
    } catch {
      ok = false; // a DB failure mid-renew fails safe: stop writing
    }
    const leaseCounts = counts.lease as Record<string, unknown> | undefined;
    if (ok) {
      stats.leaseRenewals++;
      if (leaseCounts) leaseCounts.renewals = stats.leaseRenewals;
    } else {
      leaseLost.current = true;
      if (leaseCounts) leaseCounts.lost = 1;
      console.warn("map-worker: lease lost — discarding unpersisted work, no further writes");
    }
    return ok;
  };

  // one UTC day (backfill/remap driver) vs everything since the map epoch (hourly)
  const dateOp = opts.date ? "=" : ">=";
  const dateParam = opts.date ?? MAP_EPOCH;

  // 1. select candidates.
  //    Steady/backfill: unmapped docs (processed=false), oldest first (drains
  //    backlog before news).
  //    Remap: `processed` is NOT an eligibility gate — select canonical docs
  //    (no doc_dedup row: mirror verdicts are permanent and mirrors are never
  //    mapped) that the map has already dispositioned (processed=true or any
  //    doc_map_state row); the current-version anti-join in step 3 then keeps
  //    only docs actually missing current-version work. Never-touched
  //    processed=false docs stay the hourly worker's job — remap must not race
  //    the dedup gate for documents that have no mirror verdict yet. Cursor
  //    (afterId, id order) lets the driver advance past docs that yield no
  //    work (e.g. lexicon mismatches) without rescanning them forever.
  const { rows: candRows } = opts.remap
    ? await pool.query(
        `SELECT rd.id, rd.title, rd.content, rd.adapter, rd.country_iso2 AS theater,
                COALESCE(rd.published_at, rd.fetched_at)::date::text AS day,
                s.canonical_url AS source_key, s.reliability_score AS reliability,
                md5(trim(regexp_replace(rd.content, '\\s+', ' ', 'g'))) AS content_md5,
                left(coalesce(rd.title, '') || ' ' || rd.content, 2000) AS text2k
         FROM raw_documents rd
         LEFT JOIN sources s ON s.id = rd.source_id
         WHERE rd.country_iso2 = ANY($1)
           AND length(rd.content) >= 40
           AND rd.content NOT LIKE $2
           AND COALESCE(rd.published_at, rd.fetched_at)::date ${dateOp} $3::date
           AND rd.id > $4
           AND NOT EXISTS (SELECT 1 FROM doc_dedup dd WHERE dd.raw_document_id = rd.id)
           AND (rd.processed = true
                OR EXISTS (SELECT 1 FROM doc_map_state dms WHERE dms.raw_document_id = rd.id))
         ORDER BY rd.id ASC
         LIMIT $5`,
        [theaters, `${STUB_CONTENT_PREFIX}%`, dateParam, opts.afterId ?? 0, docCap],
      )
    : { rows: await selectSteadyCandidateRows(pool, theaters, dateOp, dateParam, docCap, counts) };
  const candidates: CandidateDoc[] = candRows.map((r) => ({
    id: r.id,
    theater: r.theater,
    day: r.day,
    contentMd5: r.content_md5,
    text2k: r.text2k,
    title: r.title,
    content: r.content,
    adapter: r.adapter,
    sourceKey: r.source_key,
    reliability: r.reliability !== null ? Number(r.reliability) : null,
  }));
  counts.selected = candidates.length;
  if (opts.remap) {
    // driver cursor: everything selected this call is "seen" whether or not it
    // yielded work — the next call starts past it
    counts.maxSelectedId = candidates.length ? candidates[candidates.length - 1].id : (opts.afterId ?? 0);
  }

  if (candidates.length === 0) return counts;

  // 2. persistent dedup gate against the rolling canonical window. Remap skips
  //    it entirely: remap candidates are canonical BY SELECTION (no doc_dedup
  //    row, already dispositioned), their mirror verdicts are permanent, and
  //    re-running the gate against a reference set that can contain the
  //    candidates themselves would self-mirror.
  let mirrors: ReturnType<typeof dedupGate>["mirrors"] = [];
  let canonical: number[];
  if (opts.remap) {
    canonical = candidates.map((c) => c.id);
    counts.mirrors = 0;
    counts.canonical = canonical.length;
  } else {
    // Reference fetch by exact ±1-day IN-list (dedupRefDays), never min..max
    // BETWEEN: sparse candidate days must not widen the window to every day in
    // between (the 2026-08-31 incident materialized 419K rows that way and the
    // instance was OOM-killed). The excluded rows are exactly the ones the
    // gate's ±1-day rule could never match, so no matchable pair is lost.
    const refDays = dedupRefDays([...new Set(candidates.map((c) => c.day))]);
    // ONE shared predicate for the count-guard and the fetch — the guard is
    // only honest while both queries select the same set.
    const refWhere = `FROM raw_documents rd
       WHERE rd.processed = true
         AND rd.country_iso2 = ANY($1)
         AND COALESCE(rd.published_at, rd.fetched_at)::date = ANY($2::date[])
         AND NOT EXISTS (SELECT 1 FROM doc_dedup dd WHERE dd.raw_document_id = rd.id)`;
    const { rows: refCountRows } = await pool.query(
      `SELECT count(*)::int AS n
       ${refWhere}`,
      [theaters, refDays],
    );
    const refCount = Number(refCountRows[0]?.n ?? 0);
    counts.refRows = refCount;
    if (refCount > MAP_REF_ROW_CAP) {
      // explicit ok=false failure instead of a silent memory kill; nothing was
      // marked processed and no verdict was fabricated for the unexamined set
      throw new Error(
        `map dedup reference window overflow: ${refCount} reference rows over ${refDays.length} days exceed the ${MAP_REF_ROW_CAP}-row cap — refusing before materialization`,
      );
    }
    // The md5 column is aliased to the DedupDoc field name: the historical
    // snake_case alias left contentMd5 undefined on every reference row, so
    // the gate's exact-md5 arm silently never fired against references. This
    // is a deliberate BEHAVIOR repair, not a pure relabeling: identical-text2k
    // dupes were already caught by the minhash arm (jaccard ~1, mis-labeled
    // "minhash"), but a pair with identical whitespace-normalized CONTENT
    // under a strongly differing TITLE can sit below the 0.7 minhash threshold
    // (text2k includes the title; the md5 does not) and previously stayed
    // canonical against a reference — it now exact-mirrors, which is the
    // gate's own declared contract and matches what the candidate-to-candidate
    // arm always did.
    const { rows: refRows } = await pool.query(
      `SELECT rd.id, rd.country_iso2 AS theater,
              COALESCE(rd.published_at, rd.fetched_at)::date::text AS day,
              md5(trim(regexp_replace(rd.content, '\\s+', ' ', 'g'))) AS "contentMd5",
              left(coalesce(rd.title, '') || ' ' || rd.content, 2000) AS text2k
       ${refWhere}`,
      [theaters, refDays],
    );
    const gate = dedupGate(candidates, refRows as unknown as DedupDoc[]);
    mirrors = gate.mirrors;
    canonical = gate.canonical;
    counts.mirrors = mirrors.length;
    counts.mirrorsExact = mirrors.filter((m) => m.method === "exact").length;
    counts.mirrorsMinhash = mirrors.filter((m) => m.method === "minhash").length;
    counts.canonical = canonical.length;
  }

  if (!opts.dryRun && mirrors.length > 0) {
    if (!(await stillOwner())) return counts; // lost lease — no writes
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const m of mirrors) {
        await client.query(
          `INSERT INTO doc_dedup (raw_document_id, canonical_doc_id, method, score)
           VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [m.docId, m.canonicalDocId, m.method, m.score],
        );
      }
      await client.query(`UPDATE raw_documents SET processed = true WHERE id = ANY($1)`, [
        mirrors.map((m) => m.docId),
      ]);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  // 3. per-doc track applicability, minus already-mapped pairs (crash recovery)
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const canonicalDocs = canonical.map((id) => byId.get(id)!);
  const versionOf = new Map<string, string>(); // `${track}:${theater}` -> version
  const pending = new Map<number, Set<Track>>();
  for (const doc of canonicalDocs) {
    let tracks = applicableTracks({
      countryIso2: doc.theater,
      title: doc.title,
      content: doc.content,
    });
    // remap --track: only the requested track's missing versions are work
    if (opts.track) tracks = tracks.filter((t) => t === opts.track);
    if (tracks.length > 0) pending.set(doc.id, new Set(tracks));
    for (const t of tracks) {
      const k = `${t}:${doc.theater}`;
      if (!versionOf.has(k)) versionOf.set(k, mapExtractorVersion(t, doc.theater));
    }
  }
  const zeroTrackIds = canonicalDocs.filter((d) => !pending.has(d.id)).map((d) => d.id);
  counts.noApplicableTrack = zeroTrackIds.length;

  if (pending.size > 0) {
    const { rows: stateRows } = await pool.query(
      `SELECT raw_document_id, track, extractor_version FROM doc_map_state
       WHERE raw_document_id = ANY($1)`,
      [[...pending.keys()]],
    );
    let preMapped = 0;
    for (const r of stateRows) {
      const doc = byId.get(r.raw_document_id);
      if (!doc) continue;
      if (versionOf.get(`${r.track}:${doc.theater}`) === r.extractor_version) {
        pending.get(r.raw_document_id)?.delete(r.track as Track);
        preMapped++;
      }
    }
    counts.alreadyMapped = preMapped;
  }

  // 4. micro-batches per (theater, track)
  const groups = new Map<string, CandidateDoc[]>();
  for (const [docId, tracks] of pending) {
    const doc = byId.get(docId)!;
    for (const t of tracks) {
      const k = `${doc.theater}\u0000${t}`;
      const list = groups.get(k);
      if (list) list.push(doc);
      else groups.set(k, [doc]);
    }
  }
  const batchSize = mapBatchSize();
  const batches: Array<{ theater: string; track: Track; docs: CandidateDoc[] }> = [];
  for (const [k, docs] of groups) {
    const [theater, track] = k.split("\u0000") as [string, Track];
    for (const part of chunk(docs, batchSize)) batches.push({ theater, track, docs: part });
  }
  const pairCount = [...groups.values()].reduce((s, d) => s + d.length, 0);
  counts.docTrackPairs = pairCount;
  counts.batches = batches.length;

  if (opts.dryRun) {
    // cost model, chars-based (audit §9d: 0.25-0.38 tok/char by language — 0.32 blend)
    let inTok = 0;
    for (const b of batches) {
      inTok += 650; // system prompt + framing, roughly, per call
      for (const d of b.docs) {
        const lineChars = Math.min(
          `${d.title ?? ""} ${d.content}`.length,
          mapContentChars() + 60,
        );
        inTok += Math.ceil(lineChars * 0.32);
      }
    }
    const outTok = pairCount * 135; // audit §11 per-doc output assumption
    counts.estPromptTokens = inTok;
    counts.estCompletionTokens = outTok;
    // model-aware estimate: non-throwing resolve (a dry run may model an
    // unpriced candidate; pricing falls back to its conservative ceiling)
    const resolved = resolveWorkloadModel("map");
    counts.estUsd = Number(estimateCostUsd(resolved.model, inTok, outTok).toFixed(4));
    // remap dry runs feed the operator's pre-execution printout: the exact
    // target model/effort and the extractor versions the work would write
    // (dry responses are route-body only — never persisted to cron_runs)
    counts.estModel = resolved.model;
    counts.estEffort = resolved.reasoningEffort ?? "";
    // ...and, when that configuration would be REFUSED at execution (unpriced,
    // unapproved, or map-activation-locked), say so here rather than letting
    // the pre-execution printout promise a dispatch that cannot happen
    // (independent spend review 2026-08-21, NOTE-6). Fail-safe either way — the
    // live run refuses with zero spend — but the dry run is the operator's
    // decision surface.
    if (resolved.dispatchBlocked !== null) counts.estDispatchBlocked = resolved.dispatchBlocked;
    if (opts.remap) counts.remapVersions = Object.fromEntries(versionOf);
    return counts;
  }
  if (batches.length > 0) assertLlmEnabled("map extract");
  // Fail closed BEFORE any reservation, client construction, or billed call:
  // an unpriced/unapproved model, an invalid MAP_REASONING_EFFORT, or the map
  // activation lock throws typed here, the route records ok=false, and nothing
  // dispatches under a configuration that cannot be metered or was never
  // approved/authorized.
  const dispatch = batches.length > 0 ? workloadDispatchConfig("map") : null;
  // durable dispatch identity into cron_runs.counts: the AUTHORIZED config for
  // this run, stamped up front so even a later budget-stopped run records what
  // it was configured to dispatch (alongside budgetStop*); per-row extractor
  // versions live on doc_claims/doc_map_state (release hardening 2026-08-17)
  if (dispatch) counts.dispatch = dispatchIdentity(dispatch);

  // 5. extract + persist, one guard for the whole run. The lease was acquired
  //    BEFORE this point (before any reservation or client construction).
  const guard = mapGuardFromEnv();
  await guard.init();
  const openai = analysisOpenAiClient();
  // holder object: TS control-flow narrowing cannot see closure writes to a
  // plain let, but property reads re-widen after the await below
  const budgetStop: { current: LlmBudgetError | null } = { current: null };

  // small worker pool over independent batches; a budget refusal OR a lost
  // lease stops every worker (daily/total caps are checked before each billed
  // call regardless — concurrent in-flight calls can overshoot by at most
  // concurrency-1 batches)
  let nextBatch = 0;
  const runWorker = async () => {
    while (!budgetStop.current && !leaseLost.current) {
      const i = nextBatch++;
      if (i >= batches.length) return;
      const b = batches[i];
      try {
        // keepalive renews the lease at EVERY physical provider attempt (a
        // 429's 65s sleep or a deep truncation split could otherwise outlive
        // the TTL with no renewal); a lost lease stops the batch BEFORE its
        // next reservation/dispatch
        const keepalive = async () => {
          if (!(await stillOwner())) throw new MapLeaseLostError();
        };
        const perDoc = await extractBatch(openai, guard, dispatch!, b.track, b.theater, b.docs, stats, keepalive);
        // the response is billed and metered above; ownership is re-verified
        // (full-TTL renew) before its results may touch map state — a lost
        // lease discards them and the docs stay eligible for the new holder
        if (!(await stillOwner())) {
          stats.leaseLostDiscards += perDoc.size;
          return;
        }
        const version = versionOf.get(`${b.track}:${b.theater}`)!;
        await persistBatch(pool, b.track, version, b.docs, perDoc, stats);
        for (const docId of perDoc.keys()) pending.get(docId)?.delete(b.track);
        stats.omittedDocs += b.docs.length - perDoc.size;
      } catch (e) {
        if (e instanceof LlmBudgetError) {
          budgetStop.current = e;
          return;
        }
        if (e instanceof MapLeaseLostError) return; // latch is set; stop quietly
        stats.batchErrors++;
        const cls = classifyBatchError(e instanceof Error ? e.message : String(e));
        batchErrorClasses.set(cls, (batchErrorClasses.get(cls) ?? 0) + 1);
        console.warn(
          `map ${b.theater}/${b.track} batch of ${b.docs.length}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(mapConcurrency(), batches.length) }, runWorker),
  );

  // 6. final disposition: mapped for all applicable tracks, or nothing
  //    applicable. Gated on ownership like every other map write. REMAP NEVER
  //    WRITES processed: its candidates are either already processed=true
  //    (idempotent no-op) or partially-dispositioned processed=false leftovers
  //    whose REMAINING tracks still belong to the hourly worker — and a
  //    --track-restricted run sees only the filtered track set, so marking
  //    from it would falsely finalize docs with other applicable tracks
  //    unmapped (spend/versioning review 1, MAJOR-1).
  const doneIds = [
    ...zeroTrackIds,
    ...[...pending.entries()].filter(([, t]) => t.size === 0).map(([id]) => id),
  ];
  let markedHere = 0;
  if (!opts.remap && doneIds.length > 0 && (await stillOwner())) {
    await pool.query(`UPDATE raw_documents SET processed = true WHERE id = ANY($1)`, [doneIds]);
    markedHere = doneIds.length;
  }
  // mirrors were marked in their own gated transaction above (reaching this
  // point means that write committed, or there were none)
  counts.processedMarked = markedHere + mirrors.length;
  Object.assign(counts, stats, guardCounts(guard));
  finalizeBatchErrors(counts, stats.batchErrors, batchErrorClasses);
  const stop = budgetStop.current;
  if (stop) {
    // message + machine-readable classification: "run_cap" is the benign
    // per-invocation ceiling (the next run resumes); "daily_cap" pauses until
    // the next UTC day; "total_cap"/"cap_unset" need operator intervention.
    counts.budgetStop = stop.message;
    if (stop.reserveCode) {
      counts.budgetStopCode = stop.reserveCode;
      counts.budgetStopCategory = stopCategoryOfCode(stop.reserveCode) ?? undefined;
    }
  }
  return counts;
}

function guardCounts(guard: SpendGuard) {
  const s = guard.runStats;
  return { estUsd: Number(s.usd.toFixed(4)), llmRequests: s.requests };
}

/** Fixed vocabulary for batch-failure classes (#87). Deliberately NEVER the
 *  raw message: a provider 400 can echo the rejected request payload (source
 *  text), and cron counts must stay content-safe. "invalid_body" is the
 *  #86/#97 rejection signature; the rest split transport-vs-server-vs-persist
 *  well enough to triage a run from the durable row alone. */
export function classifyBatchError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid body")) return "invalid_body";
  if (m.includes("rate limit") || m.includes("429")) return "rate_limit";
  if (/\b50[0-9]\b/.test(m) || m.includes("server error") || m.includes("bad gateway")) {
    return "server_error";
  }
  if (
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("econn") ||
    m.includes("fetch failed") ||
    m.includes("socket") ||
    m.includes("network")
  ) {
    return "transport";
  }
  if (m.includes("duplicate key") || m.includes("constraint") || m.includes("deadlock")) {
    return "persist";
  }
  return "other";
}

/** Records the per-class tally and marks the run degraded when any micro-batch
 *  failed (#87: `batchErrors` was a bare counter on an ok=true row and the
 *  discriminating message lived only in the runtime log). Exported pure for
 *  unit tests. NOTE: the degraded category must never be surfaced through
 *  `budgetStopCategory` — the map:remap/backfill drivers abort on unknown stop
 *  categories; `counts.degraded` is a separate key they ignore. */
export function finalizeBatchErrors(
  counts: Record<string, unknown>,
  batchErrors: number,
  classes: Map<string, number>,
): void {
  if (batchErrors <= 0) return;
  counts.batchErrorClasses = Object.fromEntries([...classes.entries()].sort());
  markDegraded(counts, "batch_errors", { batchErrors });
}

/** One micro-batch -> validated per-doc claims. Truncation splits the batch in
 *  half and retries each side (every billed call is metered first, including the
 *  discarded truncated one); a single doc that still truncates is skipped and
 *  stays unmapped. 429 sleeps out the TPM window once, like the digest provider.
 *  `keepalive` (the lease renewal) runs before EVERY physical attempt —
 *  initial, 429 retry, and each truncation-split recursion level — so a long
 *  batch tree cannot silently outlive the lease TTL between renewals.
 *  Exported for the reservation/metering-cardinality unit tests only. */
export async function extractBatch(
  openai: OpenAI,
  guard: SpendGuard,
  dispatch: AnalysisDispatchConfig,
  track: Track,
  theater: string,
  docs: CandidateDoc[],
  stats: MapRunStats,
  keepalive?: () => Promise<void>,
): Promise<Map<number, MapClaim[]>> {
  const reserve = async () => {
    await keepalive?.();
    const r = guard.tryReserve();
    if (!r.ok) throw new LlmBudgetError(r.reason, r.code);
  };
  const request = () =>
    openai.chat.completions.create({
      model: dispatch.model,
      messages: [
        { role: "system", content: mapSystemPrompt(track, theater) },
        {
          role: "user",
          content: mapUserMessage(
            track,
            theater,
            docs.map((d) => d.id),
            docs.map(mapDocLine),
          ),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "doc_claims",
          schema: mapResponseSchema(docs.length) as never,
          strict: true,
        },
      },
      // default (non-reasoning) params are byte-identical to the historical
      // `temperature: 0.2, max_completion_tokens: …` pair; a reasoning model
      // drops temperature and may add reasoning_effort (model-config.ts)
      ...analysisChatParams(dispatch, {
        temperature: 0.2,
        maxCompletionTokens: mapBatchMaxTokens(docs.length),
      }),
    });

  await reserve();
  let completion;
  try {
    completion = await request();
  } catch (e) {
    if ((e as { status?: number }).status === 429) {
      await new Promise((r) => setTimeout(r, 65_000));
      await reserve();
      completion = await request();
    } else throw e;
  }

  const choice = completion.choices[0];
  const promptTokens = completion.usage?.prompt_tokens ?? 0;
  const completionTokens = completion.usage?.completion_tokens ?? 0;
  await guard.record(
    1,
    promptTokens + completionTokens,
    estimateCostUsd(dispatch.model, promptTokens, completionTokens),
  );
  stats.llmCalls++;
  stats.promptTokens += promptTokens;
  stats.completionTokens += completionTokens;

  if (choice?.finish_reason === "length") {
    if (docs.length === 1) {
      stats.truncatedSingles++;
      console.warn(`map ${theater}/${track}: single doc ${docs[0].id} truncated — left unmapped`);
      return new Map();
    }
    stats.truncationSplits++;
    const mid = Math.ceil(docs.length / 2);
    const left = await extractBatch(openai, guard, dispatch, track, theater, docs.slice(0, mid), stats, keepalive);
    const right = await extractBatch(openai, guard, dispatch, track, theater, docs.slice(mid), stats, keepalive);
    return new Map([...left, ...right]);
  }
  const raw = choice?.message?.content;
  if (!raw) {
    throw new Error(
      `map-worker: empty content (finish=${choice?.finish_reason}, refusal=${choice?.message?.refusal ?? "n/a"})`,
    );
  }
  const parsed = parseMapResults(raw, docs.map((d) => d.id));
  stats.wrongDocIds += parsed.wrongDocIds;
  stats.duplicateEntries += parsed.duplicateEntries;
  return parsed.perDoc;
}

/** Persist one batch's verdicts in one transaction. Unique keys + ON CONFLICT
 *  DO NOTHING make replays of a crashed/raced run no-ops. Every answered doc
 *  gets a doc_map_state row — zero claims included; that row is what "mapped,
 *  nothing relevant" means. */
async function persistBatch(
  pool: Pool,
  track: Track,
  version: string,
  docs: CandidateDoc[],
  perDoc: Map<number, MapClaim[]>,
  stats: MapRunStats,
): Promise<void> {
  if (perDoc.size === 0) return;
  const byId = new Map(docs.map((d) => [d.id, d]));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const [docId, claims] of perDoc) {
      const doc = byId.get(docId)!;
      for (let i = 0; i < claims.length; i++) {
        const c = claims[i];
        // quote_orig is best-effort: the claim is kept either way, but only a
        // verified quote may render as traceability evidence (quote-verify.ts)
        const verified = verifyQuote(`${doc.title ?? ""} ${doc.content}`, c.quoteOrig);
        if (c.quoteOrig && !verified) stats.quoteMisses++;
        await client.query(
          `INSERT INTO doc_claims
             (raw_document_id, track, extractor_version, ordinal, text_en, quote_orig,
              claim_type, hedging, entities, event_hint, claim_date, quote_verified)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT DO NOTHING`,
          [
            docId,
            track,
            version,
            i,
            c.textEn,
            c.quoteOrig,
            c.claimType,
            c.hedging,
            JSON.stringify(c.entities),
            c.eventHint,
            doc.day,
            verified,
          ],
        );
      }
      await client.query(
        `INSERT INTO doc_map_state (raw_document_id, track, extractor_version, claim_count)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [docId, track, version, claims.length],
      );
      stats.claims += claims.length;
      if (claims.length === 0) stats.emptyDocs++;
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

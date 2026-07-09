import { Pool } from "@neondatabase/serverless";
import OpenAI from "openai";
import { STUB_CONTENT_PREFIX } from "../adapters/stubs";
import { LlmBudgetError, assertLlmEnabled, estimateUsd, mapGuardFromEnv } from "../usage/llm-guard";
import type { SpendGuard } from "../usage/spend-guard";
import { dedupGate, type DedupDoc } from "./map-dedup";
import { verifyQuote } from "./quote-verify";
import {
  MAP_MODEL,
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

/** Docs published/fetched before this UTC day are out of map scope (sprint 2
 *  backfills 2026-07-04 forward; earlier corpus was cold-start telegram-only). */
export const MAP_EPOCH = "2026-07-04";

const ADVISORY_LOCK_KEY = 0x6d61_7031; // "map1" — one map cycle at a time

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

/** Concurrent micro-batch calls. 3 workers ≈ 140K tok/min at measured batch
 *  sizes — inside the 200K Tier-1 TPM (audit §7b) with margin for the digest
 *  crons; a 429 still sleeps out the window per worker. */
function mapConcurrency(): number {
  const v = Number(process.env.MAP_CONCURRENCY);
  return Number.isFinite(v) && v >= 1 ? Math.min(8, Math.floor(v)) : 3;
}

/** Output budget: ~200 tokens/doc (a doc yields 0-3 claims at ~90-180 tok,
 *  audit §11), floored so a single dense doc can still answer. */
export function mapBatchMaxTokens(docCount: number): number {
  const per = Number(process.env.MAP_OUT_TOKENS_PER_DOC);
  const perDoc = Number.isFinite(per) && per >= 60 ? Math.floor(per) : 200;
  return Math.min(16_384, Math.max(1_000, docCount * perDoc));
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

export interface MapCycleOptions {
  /** theater filter; default env MAP_THEATERS (ru,ua,ir) */
  theaters?: string[];
  /** restrict selection to one UTC day (backfill driver) */
  date?: string | null;
  /** max docs selected this run; default env MAP_RUN_DOC_CAP (500) */
  docCap?: number;
  /** select + dedup + batch + cost model only — no LLM call, no writes */
  dryRun?: boolean;
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
}

export async function runMapCycle(
  opts: MapCycleOptions = {},
  counts: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const theaters = opts.theaters ?? mapTheaters();
  const docCap = opts.docCap ?? mapRunDocCap();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const lockClient = await pool.connect();
  try {
    const { rows: lockRows } = await lockClient.query(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [ADVISORY_LOCK_KEY],
    );
    if (!lockRows[0]?.locked) {
      counts.skipped = "another map cycle holds the lock";
      return counts;
    }
    try {
      return await cycle(pool, theaters, docCap, opts, counts);
    } finally {
      await lockClient.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]);
    }
  } finally {
    lockClient.release();
    await pool.end();
  }
}

async function cycle(
  pool: Pool,
  theaters: string[],
  docCap: number,
  opts: MapCycleOptions,
  counts: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  // one UTC day (backfill driver) vs everything since the map epoch (hourly)
  const dateOp = opts.date ? "=" : ">=";
  const dateParam = opts.date ?? MAP_EPOCH;

  // 1. select unmapped candidates, oldest first (drains backlog before news)
  const { rows: candRows } = await pool.query(
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
       AND COALESCE(rd.published_at, rd.fetched_at)::date ${dateOp} $3::date
     ORDER BY COALESCE(rd.published_at, rd.fetched_at) ASC, rd.id ASC
     LIMIT $4`,
    [theaters, `${STUB_CONTENT_PREFIX}%`, dateParam, docCap],
  );
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

  if (candidates.length === 0) return counts;

  // 2. persistent dedup gate against the rolling canonical window
  const days = candidates.map((c) => c.day).sort();
  const { rows: refRows } = await pool.query(
    `SELECT rd.id, rd.country_iso2 AS theater,
            COALESCE(rd.published_at, rd.fetched_at)::date::text AS day,
            md5(trim(regexp_replace(rd.content, '\\s+', ' ', 'g'))) AS content_md5,
            left(coalesce(rd.title, '') || ' ' || rd.content, 2000) AS text2k
     FROM raw_documents rd
     WHERE rd.processed = true
       AND rd.country_iso2 = ANY($1)
       AND COALESCE(rd.published_at, rd.fetched_at)::date
             BETWEEN $2::date - 1 AND $3::date + 1
       AND NOT EXISTS (SELECT 1 FROM doc_dedup dd WHERE dd.raw_document_id = rd.id)`,
    [theaters, days[0], days[days.length - 1]],
  );
  const { mirrors, canonical } = dedupGate(candidates, refRows as DedupDoc[]);
  counts.mirrors = mirrors.length;
  counts.mirrorsExact = mirrors.filter((m) => m.method === "exact").length;
  counts.mirrorsMinhash = mirrors.filter((m) => m.method === "minhash").length;
  counts.canonical = canonical.length;

  if (!opts.dryRun && mirrors.length > 0) {
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
    const tracks = applicableTracks({
      countryIso2: doc.theater,
      title: doc.title,
      content: doc.content,
    });
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
      const k = `${doc.theater} ${t}`;
      const list = groups.get(k);
      if (list) list.push(doc);
      else groups.set(k, [doc]);
    }
  }
  const batchSize = mapBatchSize();
  const batches: Array<{ theater: string; track: Track; docs: CandidateDoc[] }> = [];
  for (const [k, docs] of groups) {
    const [theater, track] = k.split(" ") as [string, Track];
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
    counts.estUsd = Number(estimateUsd(inTok, outTok).toFixed(4));
    return counts;
  }
  if (batches.length > 0) assertLlmEnabled("map extract");

  // 5. extract + persist, one guard for the whole run
  const guard = mapGuardFromEnv();
  await guard.init();
  const openai = new OpenAI();
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
  };
  let budgetStop: string | null = null;

  // small worker pool over independent batches; a budget refusal stops every
  // worker (daily/total caps are checked before each billed call regardless —
  // concurrent in-flight calls can overshoot by at most concurrency-1 batches)
  let nextBatch = 0;
  const runWorker = async () => {
    while (!budgetStop) {
      const i = nextBatch++;
      if (i >= batches.length) return;
      const b = batches[i];
      try {
        const perDoc = await extractBatch(openai, guard, b.track, b.theater, b.docs, stats);
        const version = versionOf.get(`${b.track}:${b.theater}`)!;
        await persistBatch(pool, b.track, version, b.docs, perDoc, stats);
        for (const docId of perDoc.keys()) pending.get(docId)?.delete(b.track);
        stats.omittedDocs += b.docs.length - perDoc.size;
      } catch (e) {
        if (e instanceof LlmBudgetError) {
          budgetStop = e.message;
          return;
        }
        stats.batchErrors++;
        console.warn(
          `map ${b.theater}/${b.track} batch of ${b.docs.length}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(mapConcurrency(), batches.length) }, runWorker),
  );

  // 6. final disposition: mapped for all applicable tracks, or nothing applicable
  const doneIds = [
    ...zeroTrackIds,
    ...[...pending.entries()].filter(([, t]) => t.size === 0).map(([id]) => id),
  ];
  if (doneIds.length > 0) {
    await pool.query(`UPDATE raw_documents SET processed = true WHERE id = ANY($1)`, [doneIds]);
  }
  counts.processedMarked = doneIds.length + mirrors.length;
  Object.assign(counts, stats, guardCounts(guard));
  if (budgetStop) counts.budgetStop = budgetStop;
  return counts;
}

function guardCounts(guard: SpendGuard) {
  const s = guard.runStats;
  return { estUsd: Number(s.usd.toFixed(4)), llmRequests: s.requests };
}

/** One micro-batch -> validated per-doc claims. Truncation splits the batch in
 *  half and retries each side (every billed call is metered first, including the
 *  discarded truncated one); a single doc that still truncates is skipped and
 *  stays unmapped. 429 sleeps out the TPM window once, like the digest provider. */
async function extractBatch(
  openai: OpenAI,
  guard: SpendGuard,
  track: Track,
  theater: string,
  docs: CandidateDoc[],
  stats: MapRunStats,
): Promise<Map<number, MapClaim[]>> {
  const reserve = () => {
    const r = guard.tryReserve();
    if (!r.ok) throw new LlmBudgetError(r.reason);
  };
  const request = () =>
    openai.chat.completions.create({
      model: MAP_MODEL,
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
      temperature: 0.2,
      max_completion_tokens: mapBatchMaxTokens(docs.length),
    });

  reserve();
  let completion;
  try {
    completion = await request();
  } catch (e) {
    if ((e as { status?: number }).status === 429) {
      await new Promise((r) => setTimeout(r, 65_000));
      reserve();
      completion = await request();
    } else throw e;
  }

  const choice = completion.choices[0];
  const promptTokens = completion.usage?.prompt_tokens ?? 0;
  const completionTokens = completion.usage?.completion_tokens ?? 0;
  await guard.record(1, promptTokens + completionTokens, estimateUsd(promptTokens, completionTokens));
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
    const left = await extractBatch(openai, guard, track, theater, docs.slice(0, mid), stats);
    const right = await extractBatch(openai, guard, track, theater, docs.slice(mid), stats);
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

import { Pool } from "@neondatabase/serverless";
import { STUB_CONTENT_PREFIX } from "../adapters/stubs";
import { isSkipped, persistDigest, type DigestSkipped } from "./digest-persist";
import { detectLang } from "./lang";
import { findNearDuplicates } from "./minhash";
import { getProvider, type AnalysisInputDoc, type LlmUsage } from "./provider";
import { MIX_CAP_FRACTION, selectSourceMix, sourceMixStats } from "./source-mix";
import { TRACKS, type Track } from "./tracks";

// Daily digest generation: gather -> dedupe -> analyze -> validate -> persist.
// Persistence runs in ONE transaction so the claim_must_have_source constraint
// trigger (deferred) verifies traceability at COMMIT.

// Batch size sent to the model. The original "Cyrillic is ~1 token/char, so 100
// docs keeps us under a 60K TPM entry tier" rationale is wrong twice over
// (audit §7b): Cyrillic measures ~0.29 tok/char under o200k_base, a full RU batch
// is ~7.7-12K prompt tokens, and gpt-4o-mini's Tier-1 TPM is 200,000. Input is
// never the binding constraint — the OUTPUT ceiling is (§4d). MAX_DOCS stays at
// 100 because raising it makes truncation more frequent, not because of TPM.
const MAX_DOCS = 100;

// Truncation retry rungs, tried in order after the full batch. Each rung must be
// strictly smaller than the one before, or the "retry" re-sends an identical
// batch and pays for it twice: with a flat [docs.length, 50, 25] any docs.length
// in 26..50 sliced to 50 yields the same docs (audit §2 O2).
const LADDER_RUNGS = [50, 25] as const;

/** Rungs actually worth trying for a batch of `docCount` docs: the full batch,
 *  then each smaller rung. A batch of <= 25 docs has no smaller rung and so is
 *  never retried — a truncation there is a hard failure, by design. */
export function ladderSizes(docCount: number, rungs: readonly number[] = LADDER_RUNGS): number[] {
  const sizes = [docCount];
  for (const rung of rungs) {
    if (rung < sizes[sizes.length - 1]) sizes.push(rung);
  }
  return sizes;
}

// Day-corpus gather window. Also capped per adapter (MIX_CAP_FRACTION share):
// on heavy X days a purely reliability-ordered window is 100% x_api (ir
// 2026-07-07: 600/600), which would starve the batch-level source-mix quota
// of alternatives before it even runs.
const GATHER_LIMIT = 600;

// Experiment override: MIX_CAP_FRACTION=1 in the environment disables the
// quota entirely (gather AND batch revert to pure reliability order) — used
// for quota-on/off A/B runs against a Neon branch. Unset = shipped default.
function capFraction(): number {
  const v = Number(process.env.MIX_CAP_FRACTION);
  return Number.isFinite(v) && v > 0 ? v : MIX_CAP_FRACTION;
}

export interface DigestResult {
  digestId: number;
  countryIso2: string;
  date: string;
  track: Track;
  events: number;
  claims: number;
  droppedClaims: number;
  provider: string;
  docsAnalyzed: number;
}

export async function generateDigest(
  countryIso2: string,
  date: string, // yyyy-mm-dd (UTC day to cover)
  track: Track = "military",
): Promise<DigestResult | DigestSkipped | null> {
  const trackCfg = TRACKS[track];
  if (!trackCfg.countries.includes(countryIso2)) return null;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows: countryRows } = await pool.query(
      "SELECT id FROM countries WHERE iso2 = $1",
      [countryIso2],
    );
    if (countryRows.length === 0) throw new Error(`unknown country ${countryIso2}`);
    const countryId: number = countryRows[0].id;

    // 1. gather the day's documents (published or fetched that day), joined to reliability
    const { rows: docRows } = await pool.query(
      `SELECT id, title, content, lang, url, published_at, adapter, source_key, reliability, platform
       FROM (
         SELECT rd.id, rd.title, rd.content, rd.lang, rd.url, rd.published_at, rd.adapter,
                s.canonical_url AS source_key, s.reliability_score AS reliability, s.platform,
                row_number() OVER (
                  PARTITION BY rd.adapter
                  ORDER BY COALESCE(s.reliability_score, 0.3) DESC, rd.published_at DESC NULLS LAST
                ) AS adapter_rank
         FROM raw_documents rd
         LEFT JOIN sources s ON s.id = rd.source_id
         WHERE rd.country_iso2 = $1
           AND COALESCE(rd.published_at, rd.fetched_at) >= $2::date
           AND COALESCE(rd.published_at, rd.fetched_at) < $2::date + interval '1 day'
           AND length(rd.content) >= 40
           AND rd.content NOT LIKE $3
       ) ranked
       WHERE adapter_rank <= $4
       ORDER BY COALESCE(reliability, 0.3) DESC, published_at DESC NULLS LAST
       LIMIT ${GATHER_LIMIT}`,
      [countryIso2, date, `${STUB_CONTENT_PREFIX}%`, Math.ceil(GATHER_LIMIT * capFraction())],
    );
    if (docRows.length === 0) {
      console.warn(`digest ${countryIso2} ${date}: no documents`);
      return null;
    }

    // 1b. track lexicon prefilter (elite politics: courts/siloviki/elite-churn
    // terms; theater variants override — e.g. Iran military's proxy/maritime set)
    const lexicon = trackCfg.lexiconByCountry?.[countryIso2] ?? trackCfg.lexicon;
    const trackRows = lexicon
      ? docRows.filter((d) => lexicon.test(`${d.title ?? ""} ${d.content}`.slice(0, 1500)))
      : docRows;
    if (trackRows.length === 0) {
      console.warn(`digest ${countryIso2} ${date} ${track}: no track-relevant documents`);
      return null;
    }

    // 2. near-dupe collapse, keep canonical docs (first-seen = most reliable)
    const texts = trackRows.map((d) => `${d.title ?? ""} ${d.content}`.slice(0, 2000));
    const { canonicalOf } = findNearDuplicates(texts, 0.7);
    const canonicalIdx = [...new Set(canonicalOf.values())];

    // 2b. source-mix quota (OPEN-TASKS #16): cap any single adapter/platform
    // at ~40% of the batch so top-reliability x_api docs can't monopolize it
    const selectedRows = selectSourceMix(
      canonicalIdx.map((i) => trackRows[i]),
      MAX_DOCS,
      capFraction(),
    );

    const docs: AnalysisInputDoc[] = selectedRows.map((d) => {
      return {
        id: d.id,
        title: d.title,
        content: d.content,
        lang: d.lang ?? detectLang(d.content),
        sourceKey: d.source_key,
        reliability: d.reliability !== null ? Number(d.reliability) : null,
        url: d.url,
        publishedAt: d.published_at ? new Date(d.published_at).toISOString() : null,
      };
    });

    // 3. analyze — dense corpora (e.g. uk-language X days) can push the model
    // to its output-token ceiling; on truncation retry with a smaller batch
    // (the batch is interleaved by adapter, so the cut keeps the source mix)
    const provider = await getProvider();
    let analysis: Awaited<ReturnType<typeof provider.analyze>> | null = null;
    let batch = docs;
    // every billed request lands here, truncated-and-discarded ones included
    const llmCalls: LlmUsage[] = [];
    const ladder = ladderSizes(docs.length);
    let rungsTried = 0;
    for (const size of ladder) {
      rungsTried++;
      batch = docs.slice(0, size);
      try {
        analysis = await provider.analyze(countryIso2, date, batch, {
          systemPrompt: trackCfg.systemPromptByCountry?.[countryIso2] ?? trackCfg.systemPrompt,
          track,
          onUsage: (u) => llmCalls.push(u),
        });
        break;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Only truncation is retryable, and only while a smaller rung remains.
        // A budget stop or a kill-switch refusal carries no "truncated" and so
        // rethrows here rather than burning the rest of the ladder.
        if (msg.includes("truncated") && rungsTried < ladder.length) {
          console.warn(`digest ${countryIso2} ${date} ${track}: ${msg} at ${size} docs — retrying smaller`);
          continue;
        }
        throw e;
      }
    }
    if (!analysis) throw new Error("digest: analysis unavailable after retries");
    const docsSent = batch;

    // 4. validate claim docIds against the batch actually sent (anti-hallucination gate)
    const validIds = new Set(docsSent.map((d) => d.id));
    let dropped = 0;
    const events = analysis.events
      .map((ev) => ({
        ...ev,
        claims: ev.claims.filter((c) => {
          c.docIds = [...new Set(c.docIds)].filter((id) => validIds.has(id));
          if (c.docIds.length === 0) dropped++;
          return c.docIds.length > 0;
        }),
      }))
      .filter((ev) => ev.claims.length > 0);

    // 5. persist through the shared invariant-preserving path (single
    // transaction, deferred trigger, empty-/thin-regen overwrite guards)
    const structured = {
      stats: {
        docsAnalyzed: docsSent.length,
        docsRaw: docRows.length,
        trackRows: trackRows.length,
        sourceMix: {
          docsRaw: sourceMixStats(docRows),
          trackRows: sourceMixStats(trackRows),
          docsAnalyzed: sourceMixStats(selectedRows.slice(0, docsSent.length)),
        },
        // claims the anti-hallucination gate stripped (audit §12 #1)
        droppedClaims: dropped,
        // which rungs existed, how many were spent, what finally landed (§12 #8)
        ladder: { rungs: ladder, rungsTried, finalSize: docsSent.length },
        // exactly which docs the model saw (<=100 ints). Without this the true
        // re-extraction redundancy across a digest-day's ~8 regenerations is
        // unmeasurable — the audit could only model it at ~10.2x (§11, §12 #9).
        sentDocIds: docsSent.map((d) => d.id),
        ...(llmCalls.length ? { llm: summarizeLlmCalls(llmCalls) } : {}),
      },
    };
    const outcome = await persistDigest({
      pool,
      countryId,
      countryIso2,
      date,
      track,
      provider: analysis.provider,
      structured,
      events,
    });
    if (isSkipped(outcome)) return outcome;

    return {
      digestId: outcome.digestId,
      countryIso2,
      date,
      track,
      events: events.length,
      claims: outcome.claimCount,
      droppedClaims: dropped,
      provider: analysis.provider,
      docsAnalyzed: docsSent.length,
    };
  } finally {
    await pool.end();
  }
}

/** Per-digest LLM accounting, persisted to structured.stats.llm. `estUsd` is the
 *  WHOLE ladder's bill — truncated rungs cost real money even though their output
 *  is discarded, so a digest whose `truncationRetries > 0` is a digest that
 *  overpaid (audit §4d: one such digest burned 94.8% of its cost on two throwaways). */
export function summarizeLlmCalls(calls: LlmUsage[]) {
  return {
    calls: calls.length,
    promptTokens: calls.reduce((s, u) => s + u.promptTokens, 0),
    completionTokens: calls.reduce((s, u) => s + u.completionTokens, 0),
    estUsd: calls.reduce((s, u) => s + u.estUsd, 0),
    truncationRetries: calls.filter((u) => u.truncated).length,
  };
}

// renderMarkdown lives in digest-persist.ts (shared with the mapreduce engine)

// AI Search Phase 4: the per-user EXACT answer cache (§9.2 row 1). DEFAULT OFF
// (ASK_EXACT_CACHE). A hit serves a user's own previously-paid answer for the
// byte-normalized same question at $0 with zero provider calls, showing the
// ORIGINAL answer's currency as the honest "as of". Every key input that could
// change the answer participates in the key: normalized question, parsed
// window, route-policy version + the K/candidate caps, the SYSTEM_V2 prompt
// hash, the retrieval version, and the CORPUS VERSION — digest regeneration
// replaces claim rows wholesale (F11), so the cache entry carries the frozen
// EvidenceSnapshot and cited evidence hydrates from IT, never from live claim
// ids.
//
// Isolation: strictly per-user (unique (user_email, cache_key)); cross-user/
// org pooling is an explicit operator decision that has NOT been made (§13.2).
// Store policy: only completed ANSWERED, non-replayed, provider-billed runs
// WITH a frozen snapshot (progressive runs persist one; snapshotless answers
// are not cacheable F11-safely — registered bound). All writes fail-soft: a
// cache problem must never cost an answer.

import { createHash } from "node:crypto";
import { Pool } from "@neondatabase/serverless";
import type { AskAnswerV2, TimeWindow } from "./types";
import type { EvidenceSnapshot } from "./events";
import {
  askLexicalTop,
  askNoCoverageShortcircuit,
  askPipeline,
  askRelevanceBoundaryEnabled,
  askRelevantEvidenceFloor,
  askVectorTop,
} from "./config";
import { route, type RoutePolicy } from "./router";
import { fidelityFallbackEnabled } from "./validator";
import { SYSTEM_V2 } from "./answer";

/** Bump when retrieval semantics change in a way env knobs don't capture. */
export const RETRIEVAL_VERSION = "retr-v2";

/** The SYSTEM_V2 prompt participates in the key via a stable hash — a prompt
 *  edit silently invalidates every entry. */
export function promptVersion(): string {
  return createHash("sha256").update(SYSTEM_V2).digest("hex").slice(0, 12);
}

/** Whitespace/case/punctuation-normalized question — the EXACT-match key
 *  input. Deliberately conservative: no stemming, no synonym folding (that is
 *  the suggestion-only semantic-cache class, NOT built). */
export function normalizeQuestion(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ").replace(/[?.!\s]+$/g, "");
}

/** Cheap read-only corpus version: max(claims.id) + count. Digest
 *  regeneration deletes + re-inserts claims (fresh serial ids), so the marker
 *  moves on every regeneration AND on any ingest-driven insert — conservative
 *  over-invalidation, never staleness. */
export async function corpusVersion(pool?: Pool): Promise<string> {
  const own = pool ?? new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await own.query(
      `SELECT coalesce(max(id), 0)::text AS max_id, count(*)::text AS n FROM claims`,
    );
    const r = rows[0] as { max_id: string; n: string };
    return `${r.max_id}:${r.n}`;
  } finally {
    if (!pool) await own.end();
  }
}

export interface CacheKeyInputs {
  question: string;
  window: TimeWindow | null;
  corpusVersion: string;
}

/** Deterministic key over every answer-shaping input (Gate 4 fix: the RESOLVED
 *  auto policy — model, rerank model, K, caps, output ceiling — plus every
 *  pipeline/validation toggle participate, so a config change or the
 *  documented ASK_PIPELINE=legacy rollback can never re-serve entries produced
 *  under the configuration the operator just rolled back). Only the window's
 *  RESOLVED dates matter — matchedPhrase's original casing must not split
 *  otherwise-identical entries. */
export function cacheKey(inputs: CacheKeyInputs): string {
  const policy = route({ mode: "auto" }) as RoutePolicy;
  const material = JSON.stringify([
    normalizeQuestion(inputs.question),
    inputs.window ? { from: inputs.window.from, to: inputs.window.to } : null,
    policy.policyVersion,
    policy.answerModel,
    policy.rerankModel,
    policy.evidenceK,
    policy.candidatesCap,
    policy.maxOutputTokens,
    policy.reasoningEffort,
    askPipeline(),
    askVectorTop(),
    askLexicalTop(),
    askRelevantEvidenceFloor(),
    askRelevanceBoundaryEnabled(),
    askNoCoverageShortcircuit(),
    fidelityFallbackEnabled(),
    promptVersion(),
    RETRIEVAL_VERSION,
    inputs.corpusVersion,
  ]);
  return createHash("sha256").update(material).digest("hex");
}

export interface CacheHit {
  result: AskAnswerV2;
  snapshot: EvidenceSnapshot;
  createdAt: string;
}

/** Read a cache entry (exact key). Fail-soft to null — a cache outage must
 *  never fail a question. Updates hit accounting best-effort. */
export async function cacheLookup(userEmail: string, key: string): Promise<CacheHit | null> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(
      `UPDATE ask_answer_cache
       SET hit_count = hit_count + 1, last_hit_at = now()
       WHERE user_email = $1 AND cache_key = $2
       RETURNING result, snapshot, created_at::text AS created_at`,
      [userEmail, key],
    );
    const row = rows[0] as
      | { result: AskAnswerV2; snapshot: EvidenceSnapshot; created_at: string }
      | undefined;
    if (!row || !row.result || !row.snapshot) return null;
    return { result: row.result, snapshot: row.snapshot, createdAt: row.created_at };
  } catch (e) {
    console.warn(`ask cache lookup failed (treated as miss): ${e instanceof Error ? e.message : e}`);
    return null;
  } finally {
    await pool.end();
  }
}

/** Store a completed answered result + its frozen snapshot. Upsert on the
 *  per-user key (a re-answer under the same key refreshes the entry).
 *  Fail-soft: the answer was already returned. */
export async function cacheStore(opts: {
  userEmail: string;
  key: string;
  corpusVersion: string;
  question: string;
  result: AskAnswerV2;
  snapshot: EvidenceSnapshot;
}): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // the stored payload must not carry per-gesture fields
    const stored: Record<string, unknown> = { ...opts.result };
    delete stored.runId;
    delete stored.replayed;
    delete stored.cacheStatus;
    await pool.query(
      `INSERT INTO ask_answer_cache (user_email, cache_key, corpus_version, question, result, snapshot)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
       ON CONFLICT (user_email, cache_key)
       DO UPDATE SET corpus_version = EXCLUDED.corpus_version, result = EXCLUDED.result,
                     snapshot = EXCLUDED.snapshot, created_at = now()`,
      [
        opts.userEmail,
        opts.key,
        opts.corpusVersion,
        opts.question.slice(0, 400),
        JSON.stringify(stored),
        JSON.stringify(opts.snapshot),
      ],
    );
    // Lazy retention sweep (Gate 4): every corpus move permanently orphans
    // prior entries (their key can never be recomputed), so old rows are pure
    // dead weight. Piggybacked on store — no new cron; the created_at index
    // covers it; §9.2 prescribes TTL ≤ corpus cadence, 7 days is generous.
    await pool.query(`DELETE FROM ask_answer_cache WHERE created_at < now() - interval '7 days'`);
  } catch (e) {
    console.warn(`ask cache store failed (ignored): ${e instanceof Error ? e.message : e}`);
  } finally {
    await pool.end();
  }
}

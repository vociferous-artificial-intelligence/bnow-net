// Embed a set of claims and store the vectors in claim_embeddings. Called by the
// digest persist hook (after COMMIT) and by scripts/backfill-embeddings.ts.
//
// Two guardrails live here, not by convention:
//   - STUB vectors are NEVER written (truth-in-UI analog, standing ruling 3): a
//     hash-seeded pseudo-vector must not be queried as if it were a real
//     embedding. The client returns provider "stub" on the offline path; we skip
//     the write and report skipped: "stub".
//   - Metering is the client's job (reserve/record through the SpendGuard); this
//     helper only wires the guard in and does the idempotent insert.

import type { Pool } from "@neondatabase/serverless";
import type { SpendGuard } from "../usage/spend-guard";
import { EMBED_STUB_PROVIDER, embedModel, embedTexts } from "./client";
import { embedGuardFromEnv } from "./guard";

export interface EmbedStoreResult {
  /** vectors computed (0 on stub/empty short-circuit means none written) */
  embedded: number;
  /** rows actually inserted (ON CONFLICT (claim_id, model) DO NOTHING) */
  inserted: number;
  costUsd: number;
  tokens: number;
  provider: string;
  /** why nothing was written, when applicable */
  skipped?: "stub" | "empty";
}

/** Postgres vector literal for a numeric array, e.g. [0.1,0.2,...]. Bound as a
 *  text param and cast ::vector in SQL — passing a JS array would be read as a
 *  Postgres array, not a pgvector value. */
function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

/** Embed `claims` and upsert their vectors under the active model. Refuses to
 *  persist stub vectors. If `opts.guard` is passed it MUST already be init()'d;
 *  otherwise a guard is created and initialised here. */
export async function embedAndStoreClaims(
  pool: Pool,
  claims: { id: number; text: string }[],
  opts?: { guard?: SpendGuard; model?: string },
): Promise<EmbedStoreResult> {
  const model = opts?.model ?? embedModel();
  if (claims.length === 0) {
    return { embedded: 0, inserted: 0, costUsd: 0, tokens: 0, provider: "none", skipped: "empty" };
  }

  let guard = opts?.guard;
  if (!guard) {
    guard = embedGuardFromEnv();
    await guard.init();
  }

  const { vectors, tokens, costUsd, provider } = await embedTexts(
    claims.map((c) => c.text),
    { guard },
  );

  // Truth-in-UI analog: stub vectors are in-memory only — never persisted.
  if (provider === EMBED_STUB_PROVIDER) {
    return { embedded: vectors.length, inserted: 0, costUsd, tokens, provider, skipped: "stub" };
  }

  let inserted = 0;
  for (let i = 0; i < claims.length; i++) {
    const vec = vectors[i];
    if (!vec) continue;
    const res = await pool.query(
      `INSERT INTO claim_embeddings (claim_id, model, dims, embedding)
       VALUES ($1, $2, $3, $4::vector)
       ON CONFLICT (claim_id, model) DO NOTHING`,
      [claims[i].id, model, vec.length, toVectorLiteral(vec)],
    );
    inserted += res.rowCount ?? 0;
  }

  return { embedded: vectors.length, inserted, costUsd, tokens, provider };
}

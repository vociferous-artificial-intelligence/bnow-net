// Pure, side-effect-free helpers for scripts/backfill-embeddings.ts. Kept out of
// the script itself so they are unit-testable: importing the script runs its
// top-level main().
//
// The backfill selects claims MISSING a claim_embeddings row for the current
// model, ascending by id, and resumes by remembering the highest claim id it has
// finished. Resume is a SQL-level floor (WHERE cl.id > lastClaimId), never an
// in-memory skip — a killed run costs at most one batch.

export interface EmbedCheckpoint {
  /** highest claim id already embedded+stored (exclusive floor for the next run) */
  lastClaimId: number;
  /** running totals, for a resumed run's progress line */
  processed: number;
  tokens: number;
  costUsd: number;
}

export function emptyCheckpoint(): EmbedCheckpoint {
  return { lastClaimId: 0, processed: 0, tokens: 0, costUsd: 0 };
}

/** Tolerant parse of a checkpoint file's contents. Anything missing/invalid
 *  falls back to the empty checkpoint's field, so a truncated or hand-edited file
 *  never crashes the run — worst case it re-scans from the start (the
 *  ON CONFLICT DO NOTHING insert makes re-embedding idempotent anyway). */
export function parseCheckpoint(raw: string | null | undefined): EmbedCheckpoint {
  const base = emptyCheckpoint();
  if (!raw) return base;
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return base;
  }
  if (!obj || typeof obj !== "object") return base;
  const o = obj as Record<string, unknown>;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return {
    lastClaimId: Math.max(0, Math.floor(num(o.lastClaimId, base.lastClaimId))),
    processed: num(o.processed, base.processed),
    tokens: num(o.tokens, base.tokens),
    costUsd: num(o.costUsd, base.costUsd),
  };
}

export function serializeCheckpoint(cp: EmbedCheckpoint): string {
  return JSON.stringify(cp, null, 2);
}

/** Fold one processed batch into the checkpoint. `lastId` is the max claim id in
 *  the batch; it only ever moves the floor forward (monotonic — a stray smaller
 *  id can never rewind resume). */
export function advanceCheckpoint(
  cp: EmbedCheckpoint,
  batch: { lastId: number; count: number; tokens: number; costUsd: number },
): EmbedCheckpoint {
  return {
    lastClaimId: Math.max(cp.lastClaimId, batch.lastId),
    processed: cp.processed + batch.count,
    tokens: cp.tokens + batch.tokens,
    costUsd: cp.costUsd + batch.costUsd,
  };
}

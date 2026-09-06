// Per-model attribution over ask_usage (WS-2.1, PR-2.1-1). PURE — no I/O, no DB,
// no env. `scripts/ask-model-attribution.ts` is the only caller and it is
// SELECT-only.
//
// Why a report and not a column: provider_usage is UNIQUE on (provider, day) and
// SpendGuard.record() upserts one row per provider-day, so a model column THERE
// could only ever stamp the LAST model of the day — misleading, not attribution
// (PLAN-WS-2 §4.4). ask_usage already carries the per-stage model and cost
// columns, so the attribution exists in the data; it only needed reading.
//
// Retention: src/lib/ask/retention.ts:81 redacts ask_usage.question ONLY — every
// cost/token/timing column survives the sweep (:13). The attribution window is
// therefore UNBOUNDED: rows older than ASK_CONTENT_RETENTION_DAYS still attribute
// fully, they just no longer carry the question text.
//
// Known gaps, by construction (both surfaced by attributionCoverage):
//   - embed has NO model column on ask_usage, so embed rows attribute to
//     model=null. Fixing that is a schema decision (R1), not a report change.
//   - legacy pre-v2 rows carry only the whole-pipeline cost_usd, with every
//     per-stage column NULL; their cost is reported as unattributed.

/** The ask_usage columns this report reads. `day` is the UTC day, computed in
 *  Postgres (`created_at AT TIME ZONE 'UTC'`) so no driver timestamp rendering
 *  is trusted — the Neon serverless driver has a known naive-timestamp hazard
 *  (AGENTS.md 2026-08-24: compare epochs, never driver clock strings). */
export interface AskUsageRowSlice {
  day: string;
  costUsd: number | null;
  rerankModel: string | null;
  rerankPromptTokens: number | null;
  rerankCompletionTokens: number | null;
  rerankCostUsd: number | null;
  answerModel: string | null;
  answerPromptTokens: number | null;
  answerCompletionTokens: number | null;
  answerCostUsd: number | null;
  embedTokens: number | null;
  embedCostUsd: number | null;
}

export type AskStage = "embed" | "rerank" | "answer";

export interface AskUsageAttributionRow {
  day: string;
  stage: AskStage;
  /** null = unattributed: a stage that recorded spend under no model name
   *  (embed always; a degraded or legacy rerank/answer row). */
  model: string | null;
  runs: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

export interface AskAttributionCoverage {
  rows: number;
  totalCostUsd: number;
  /** Sum of the per-stage cost columns. */
  attributedCostUsd: number;
  /** cost_usd minus the per-stage sum: legacy rows and any stage whose cost was
   *  never broken out. Reported as measured. */
  unattributedCostUsd: number;
}

/** UTC day (YYYY-MM-DD) of an instant. Exported for callers that hold a
 *  timestamptz value rather than a Postgres-computed day string. */
export function utcDay(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}

const STAGE_ORDER: Record<AskStage, number> = { embed: 0, rerank: 1, answer: 2 };

function n(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** True when the stage left ANY signal on the row (model, tokens or cost). A row
 *  whose stage never ran — a refused answer, an unused rerank — contributes to
 *  no bucket rather than inflating a null-model bucket with empty runs. */
function touched(...values: Array<number | string | null | undefined>): boolean {
  return values.some((v) => v !== null && v !== undefined);
}

/** Aggregate ask_usage rows into per (UTC day, stage, model) totals. Rows are
 *  returned sorted by day, then pipeline stage order, then model (null last). */
export function attributeAskUsage(rows: AskUsageRowSlice[]): AskUsageAttributionRow[] {
  const acc = new Map<string, AskUsageAttributionRow>();

  const add = (
    day: string,
    stage: AskStage,
    model: string | null,
    promptTokens: number,
    completionTokens: number,
    costUsd: number,
  ) => {
    const key = `${day} ${stage} ${model ?? " null"}`;
    const cur = acc.get(key);
    if (cur) {
      cur.runs += 1;
      cur.promptTokens += promptTokens;
      cur.completionTokens += completionTokens;
      cur.costUsd += costUsd;
      return;
    }
    acc.set(key, { day, stage, model, runs: 1, promptTokens, completionTokens, costUsd });
  };

  for (const r of rows) {
    if (touched(r.embedTokens, r.embedCostUsd)) {
      // ask_usage has no embed_model column — embed always attributes to null.
      add(r.day, "embed", null, n(r.embedTokens), 0, n(r.embedCostUsd));
    }
    if (touched(r.rerankModel, r.rerankPromptTokens, r.rerankCompletionTokens, r.rerankCostUsd)) {
      add(
        r.day,
        "rerank",
        r.rerankModel ?? null,
        n(r.rerankPromptTokens),
        n(r.rerankCompletionTokens),
        n(r.rerankCostUsd),
      );
    }
    if (touched(r.answerModel, r.answerPromptTokens, r.answerCompletionTokens, r.answerCostUsd)) {
      add(
        r.day,
        "answer",
        r.answerModel ?? null,
        n(r.answerPromptTokens),
        n(r.answerCompletionTokens),
        n(r.answerCostUsd),
      );
    }
  }

  return [...acc.values()].sort(
    (a, b) =>
      a.day.localeCompare(b.day) ||
      STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage] ||
      (a.model === null ? 1 : b.model === null ? -1 : a.model.localeCompare(b.model)),
  );
}

/** How much of the whole-pipeline cost the per-stage columns actually explain. */
export function attributionCoverage(rows: AskUsageRowSlice[]): AskAttributionCoverage {
  let totalCostUsd = 0;
  let attributedCostUsd = 0;
  for (const r of rows) {
    totalCostUsd += n(r.costUsd);
    attributedCostUsd += n(r.embedCostUsd) + n(r.rerankCostUsd) + n(r.answerCostUsd);
  }
  return {
    rows: rows.length,
    totalCostUsd,
    attributedCostUsd,
    unattributedCostUsd: totalCostUsd - attributedCostUsd,
  };
}

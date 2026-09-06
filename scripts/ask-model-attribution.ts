// Per-model Ask spend attribution (WS-2.1, PR-2.1-1). READ-ONLY: one SELECT over
// ask_usage, no writes of any kind, no provider contact, $0.
//
//   npx tsx scripts/ask-model-attribution.ts [--since YYYY-MM-DD] [--json]
//
// Default window: the last 30 days. The window is otherwise UNBOUNDED —
// src/lib/ask/retention.ts:81 redacts ask_usage.question only (:13 "every
// cost/token/timing column stays"), so rows past ASK_CONTENT_RETENTION_DAYS
// still attribute their spend; only the question text is gone.
//
// Why this and not a provider_usage.model column: provider_usage is UNIQUE on
// (provider, day) and record() upserts one row per provider-day, so a model
// column there stamps only the LAST model of the day (PLAN-WS-2 section 4.4).
// Per-model provider ROWS would split ASK_USD_CAP_DAILY and need new cap envs in
// every Vercel environment first (standing ruling 4) — not done here.
//
// Uses DATABASE_URL from .env.local, which IS production. Read-only by
// construction; the query prints no question text and no credentials.
import "./env";
import { Pool } from "@neondatabase/serverless";
import {
  attributeAskUsage,
  attributionCoverage,
  type AskUsageRowSlice,
} from "../src/lib/ask/attribution";

const DEFAULT_WINDOW_DAYS = 30;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function sinceDay(): string {
  const raw = arg("--since");
  if (raw !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      console.error(`--since must be YYYY-MM-DD (got ${JSON.stringify(raw)})`);
      process.exit(2);
    }
    return raw;
  }
  const d = new Date(Date.now() - DEFAULT_WINDOW_DAYS * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function usd(v: number): string {
  return `$${v.toFixed(6)}`;
}

async function main() {
  const since = sinceDay();
  const asJson = process.argv.includes("--json");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // The UTC day is computed in Postgres so no driver timestamp rendering is
    // trusted (AGENTS.md 2026-08-24: the serverless driver renders naive
    // timestamps in local time with a bogus Z).
    const { rows } = await pool.query(
      `SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
              cost_usd,
              rerank_model, rerank_prompt_tokens, rerank_completion_tokens, rerank_cost_usd,
              answer_model, answer_prompt_tokens, answer_completion_tokens, answer_cost_usd,
              embed_tokens, embed_cost_usd
         FROM ask_usage
        WHERE created_at >= ($1::date AT TIME ZONE 'UTC')
        ORDER BY created_at`,
      [since],
    );

    const slices: AskUsageRowSlice[] = rows.map((r: Record<string, unknown>) => ({
      day: String(r.day),
      costUsd: r.cost_usd === null ? null : Number(r.cost_usd),
      rerankModel: (r.rerank_model as string | null) ?? null,
      rerankPromptTokens: r.rerank_prompt_tokens === null ? null : Number(r.rerank_prompt_tokens),
      rerankCompletionTokens:
        r.rerank_completion_tokens === null ? null : Number(r.rerank_completion_tokens),
      rerankCostUsd: r.rerank_cost_usd === null ? null : Number(r.rerank_cost_usd),
      answerModel: (r.answer_model as string | null) ?? null,
      answerPromptTokens: r.answer_prompt_tokens === null ? null : Number(r.answer_prompt_tokens),
      answerCompletionTokens:
        r.answer_completion_tokens === null ? null : Number(r.answer_completion_tokens),
      answerCostUsd: r.answer_cost_usd === null ? null : Number(r.answer_cost_usd),
      embedTokens: r.embed_tokens === null ? null : Number(r.embed_tokens),
      embedCostUsd: r.embed_cost_usd === null ? null : Number(r.embed_cost_usd),
    }));

    const attribution = attributeAskUsage(slices);
    const coverage = attributionCoverage(slices);

    if (asJson) {
      console.log(JSON.stringify({ since, coverage, attribution }, null, 2));
      return;
    }

    console.log(`ask_usage per-model attribution since ${since} (UTC days)`);
    console.log(
      `rows: ${coverage.rows}  total ${usd(coverage.totalCostUsd)}  ` +
        `attributed ${usd(coverage.attributedCostUsd)}  ` +
        `unattributed ${usd(coverage.unattributedCostUsd)} (legacy pre-v2 rows carry only cost_usd)`,
    );
    console.log("");
    console.log(
      ["day", "stage", "model", "runs", "prompt_tok", "completion_tok", "cost_usd"].join("\t"),
    );
    for (const r of attribution) {
      const model =
        r.model ??
        (r.stage === "embed"
          ? "(embed: no model column on ask_usage)"
          : "(unattributed: no model recorded)");
      console.log(
        [r.day, r.stage, model, r.runs, r.promptTokens, r.completionTokens, r.costUsd.toFixed(6)].join(
          "\t",
        ),
      );
    }
    if (attribution.length === 0) console.log("(no ask_usage rows in the window)");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

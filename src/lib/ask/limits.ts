import { Pool } from "@neondatabase/serverless";
import { ask, type AskAnswer } from "./answer";

// /ask spend control: an authenticated user could otherwise run up LLM cost with
// unlimited questions. Two independent caps, both env-tunable:
//   ASK_USER_DAILY_LIMIT       questions per user per UTC day (default 20)
//   ASK_GLOBAL_DAILY_BUDGET_USD  LLM spend across all users per UTC day (default $1)
// Every question is logged to ask_usage (per-user rows double as billing data).

export interface Allowance {
  allowed: boolean;
  reason: "ok" | "user_limit" | "global_budget";
  userCountToday: number;
  globalCostToday: number;
}

export function userDailyLimit(): number {
  const n = Number(process.env.ASK_USER_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

export function globalDailyBudgetUsd(): number {
  const n = Number(process.env.ASK_GLOBAL_DAILY_BUDGET_USD);
  return Number.isFinite(n) && n > 0 ? n : 1.0;
}

/** Pure decision given today's usage. Exported for tests. */
export function evaluateAllowance(
  userCountToday: number,
  globalCostToday: number,
  limit: number,
  budgetUsd: number,
): Allowance {
  if (userCountToday >= limit)
    return { allowed: false, reason: "user_limit", userCountToday, globalCostToday };
  if (globalCostToday >= budgetUsd)
    return { allowed: false, reason: "global_budget", userCountToday, globalCostToday };
  return { allowed: true, reason: "ok", userCountToday, globalCostToday };
}

// gpt-4o-mini list price; other models fall back to a conservative over-estimate
const PRICES_PER_MTOK: Record<string, { in: number; out: number }> = {
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-4o": { in: 2.5, out: 10 },
};

export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const p = PRICES_PER_MTOK[model] ?? { in: 5, out: 15 };
  return (promptTokens * p.in + completionTokens * p.out) / 1_000_000;
}

export function limitMessage(a: Allowance, limit: number): string {
  return a.reason === "user_limit"
    ? `Daily question limit reached (${limit}/day). Your allowance resets at midnight UTC — or contact us to raise it.`
    : "The shared daily analysis budget is exhausted. It resets at midnight UTC; please try again tomorrow.";
}

async function todayUsage(pool: Pool, email: string): Promise<{ count: number; cost: number }> {
  const { rows } = await pool.query(
    `SELECT
       count(*) FILTER (WHERE user_email = $1)::int AS user_count,
       coalesce(sum(cost_usd), 0)::float AS global_cost
     FROM ask_usage
     WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc'`,
    [email],
  );
  return { count: rows[0].user_count, cost: rows[0].global_cost };
}

/** Gate + run + log. Both the /ask page and the API route go through here. */
export async function askWithLimits(question: string, userEmail: string | null): Promise<AskAnswer> {
  const email = userEmail ?? "anonymous";
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const usage = await todayUsage(pool, email);
    const limit = userDailyLimit();
    const allowance = evaluateAllowance(usage.count, usage.cost, limit, globalDailyBudgetUsd());
    if (!allowance.allowed) {
      return {
        answer: limitMessage(allowance, limit),
        citedClaimIds: [], evidenceCount: 0, terms: [], provider: "limit",
      };
    }

    const result = await ask(question);

    await pool.query(
      `INSERT INTO ask_usage (user_email, question, provider, prompt_tokens, completion_tokens, cost_usd)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        email,
        question.slice(0, 400),
        result.provider,
        result.usage?.promptTokens ?? null,
        result.usage?.completionTokens ?? null,
        result.usage?.costUsd ?? 0,
      ],
    );
    return result;
  } finally {
    await pool.end();
  }
}

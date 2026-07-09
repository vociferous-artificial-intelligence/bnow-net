import OpenAI from "openai";
import {
  USD_PER_COMPLETION_TOKEN,
  USD_PER_PROMPT_TOKEN,
  isLlmDisabled,
} from "../usage/llm-guard";
import { SpendGuard, envCap, envNum, pgUsageStore } from "../usage/spend-guard";
import type { ClaimForValidation } from "./score";

// LLM-assisted semantic matching between ISW takeaways and our claims.
// ISW text is used TRANSIENTLY in the prompt (internal analysis, §8.6);
// only match verdicts are returned/persisted. Falls back to keyword
// matching upstream when no key is available.
//
// gpt-4o-mini at temperature 0 is still nondeterministic run-to-run (±30pts
// coverage on unchanged digests — OPEN-TASKS #15), so the default mode runs
// the match k times and a takeaway↔claim match only counts when a MAJORITY of
// votes agree on the same claim. Per-vote detail is returned for persistence
// in validation_runs.details (auditability). MATCHER_MODE=single restores the
// one-shot behavior; majority voting requires LLM_SPRINT_USD_CAP (the extra
// call volume is new paid usage — fail-closed to single-shot without it).

export interface LlmMatch {
  takeawayIndex: number;
  claimId: number | null;
  confidence: number; // 0-1
}

export interface TakeawayVotes {
  i: number; // takeaway index
  v: Array<number | null>; // claimId voted per round
  final: number | null;
}

export interface MatchOutcome {
  matches: LlmMatch[];
  matcher: "llm-majority" | "llm";
  votes?: TakeawayVotes[];
  voteRounds?: number;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          takeawayIndex: { type: "integer" },
          claimId: { type: ["integer", "null"] },
          confidence: { type: "number" },
        },
        required: ["takeawayIndex", "claimId", "confidence"],
      },
    },
  },
  required: ["matches"],
} as const;

const SYSTEM = `You compare an expert analyst's daily takeaways against automated digest claims covering the same day and theater.
For EACH takeaway, decide whether any claim reports substantially the same event or development.
Rules:
- A match requires the same underlying event/development, not just the same topic.
- Villages belong to their front/oblast: a claim naming a specific village matches a takeaway about advances in that oblast/direction if consistent.
- "No confirmed advances" style takeaways match claims explicitly reporting absence/stalling, NOT claims asserting advances.
- claimId must come from the provided claim list. If nothing matches, claimId = null.
- confidence: 0.9+ same event, 0.7 same development described differently, below 0.6 do not match (return null).`;

function buildUserPrompt(takeawayTexts: string[], claims: ClaimForValidation[]): string {
  return (
    "TAKEAWAYS:\n" +
    takeawayTexts.map((t, i) => `[${i}] ${t.replace(/\s+/g, " ").slice(0, 400)}`).join("\n") +
    "\n\nCLAIMS:\n" +
    claims.map((c) => `(${c.claimId}) ${c.text.replace(/\s+/g, " ").slice(0, 300)}`).join("\n")
  );
}

/** One matching call. Returns sanitized matches + actual USD cost, or throws. */
async function llmMatchOnce(
  client: OpenAI,
  model: string,
  takeawayTexts: string[],
  claims: ClaimForValidation[],
): Promise<{ matches: LlmMatch[]; usd: number }> {
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: buildUserPrompt(takeawayTexts, claims) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "matches", schema: SCHEMA as never, strict: true },
    },
    temperature: 0,
  });
  const usd =
    (completion.usage?.prompt_tokens ?? 0) * USD_PER_PROMPT_TOKEN +
    (completion.usage?.completion_tokens ?? 0) * USD_PER_COMPLETION_TOKEN;
  const raw = completion.choices[0]?.message?.content ?? '{"matches":[]}';
  const parsed = (JSON.parse(raw) as { matches: LlmMatch[] }).matches ?? [];
  const validClaims = new Set(claims.map((c) => c.claimId));
  const matches = parsed
    .filter((m) => m.takeawayIndex >= 0 && m.takeawayIndex < takeawayTexts.length)
    .map((m) => ({
      ...m,
      claimId:
        m.claimId !== null && validClaims.has(m.claimId) && m.confidence >= 0.6
          ? m.claimId
          : null,
    }));
  return { matches, usd };
}

/** Majority aggregation over k vote rounds (pure, unit-tested). A takeaway
 *  matches a claim only when MORE THAN HALF of the rounds vote for that same
 *  claimId; anything else (splits, null-majorities) resolves to no-match. */
export function majorityFromVotes(
  voteRounds: LlmMatch[][],
  nTakeaways: number,
): { matches: LlmMatch[]; votes: TakeawayVotes[] } {
  const k = voteRounds.length;
  const threshold = Math.floor(k / 2) + 1;
  const matches: LlmMatch[] = [];
  const votes: TakeawayVotes[] = [];
  for (let i = 0; i < nTakeaways; i++) {
    const perRound = voteRounds.map((round) => {
      const m = round.find((x) => x.takeawayIndex === i);
      return m ? { claimId: m.claimId, confidence: m.confidence } : { claimId: null, confidence: 0 };
    });
    const tally = new Map<number, number>();
    for (const v of perRound) {
      if (v.claimId !== null) tally.set(v.claimId, (tally.get(v.claimId) ?? 0) + 1);
    }
    let winner: number | null = null;
    for (const [claimId, n] of tally) {
      if (n >= threshold) {
        winner = claimId;
        break;
      }
    }
    const agreeing = perRound.filter((v) => v.claimId === winner && winner !== null);
    matches.push({
      takeawayIndex: i,
      claimId: winner,
      confidence: agreeing.length
        ? agreeing.reduce((s, v) => s + v.confidence, 0) / agreeing.length
        : 0,
    });
    votes.push({ i, v: perRound.map((x) => x.claimId), final: winner });
  }
  return { matches, votes };
}

function llmGuardFromEnv(): SpendGuard {
  return new SpendGuard(
    {
      provider: "llm_match",
      totalCapUsd: envCap("LLM_SPRINT_USD_CAP"),
      dailyUsdCap: envNum("LLM_MATCH_DAILY_USD_CAP", 3),
      dailyRequestCap: envNum("LLM_MATCH_DAILY_REQUEST_CAP", 2000),
      runRequestCap: envNum("LLM_MATCH_RUN_REQUEST_CAP", 400),
    },
    pgUsageStore,
  );
}

/** Match takeaways to claims. Majority voting (k calls) by default; single-shot
 *  when MATCHER_MODE=single or when LLM_SPRINT_USD_CAP is unset (the multiplied
 *  call volume is new paid usage — without its cap we stay on the old path).
 *  Returns null when no LLM is available (caller falls back to keywords). */
export async function llmMatchTakeaways(
  takeawayTexts: string[],
  claims: ClaimForValidation[],
): Promise<MatchOutcome | null> {
  if (!process.env.OPENAI_API_KEY || process.env.ANALYSIS_PROVIDER === "stub") return null;
  // Kill-switch: refuse the call. Unlike the digest path this degrades rather
  // than throws — the keyword matcher upstream still scores the day, and losing
  // validation entirely would be a worse outcome than losing its LLM assist.
  if (isLlmDisabled()) {
    console.warn("llm-match: LLM_DISABLE=1 — refusing LLM calls, falling back to keyword matcher");
    return null;
  }
  const client = new OpenAI();
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const k = Math.max(1, envNum("MATCH_VOTES", 5));

  const singleShot = process.env.MATCHER_MODE === "single" || k === 1;
  if (!singleShot) {
    const guard = llmGuardFromEnv();
    if (guard.cfg.totalCapUsd !== null) {
      await guard.init();
      const rounds: LlmMatch[][] = [];
      const attempts = Array.from({ length: k }, () => {
        const r = guard.tryReserve();
        if (!r.ok) {
          console.warn(`llm-match: budget stop — ${r.reason}`);
          return null;
        }
        return llmMatchOnce(client, model, takeawayTexts, claims)
          .then(async (res) => {
            await guard.record(1, 1, res.usd);
            return res.matches;
          })
          .catch((e) => {
            console.warn(`llm-match vote failed: ${e instanceof Error ? e.message : e}`);
            return null;
          });
      }).filter((p): p is Promise<LlmMatch[] | null> => p !== null);
      for (const settled of await Promise.all(attempts)) {
        if (settled) rounds.push(settled);
      }
      // majority needs at least 3 usable rounds; below that, degrade to the
      // best we have (1-2 rounds -> effectively single-shot, honestly labeled)
      if (rounds.length >= 3) {
        const { matches, votes } = majorityFromVotes(rounds, takeawayTexts.length);
        return { matches, matcher: "llm-majority", votes, voteRounds: rounds.length };
      }
      if (rounds.length >= 1) {
        return { matches: rounds[0], matcher: "llm", voteRounds: rounds.length };
      }
      return null;
    }
    console.warn("llm-match: LLM_SPRINT_USD_CAP unset — majority voting disabled, using single-shot");
  }

  try {
    const { matches } = await llmMatchOnce(client, model, takeawayTexts, claims);
    return { matches, matcher: "llm" };
  } catch (e) {
    console.warn(`llm-match failed, falling back to keywords: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

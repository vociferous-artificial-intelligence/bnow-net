// AI Search Phase 1: enforce-mode stage guards for one /ask run — atomic
// reservations behind the SpendGuard call-site surface, with per-stage spend
// ceilings derived from each stage's output-token limit + a bounded input
// estimate against the price table (contract §2: never one whole-run
// multiplier). Built ONLY when ASK_RUNS_ENFORCE=1; the legacy SpendGuard path
// stays byte-identical otherwise.

import { envCap, envNum } from "../usage/spend-guard";
import { askDailyUsdCap, ASK_PROVIDER } from "../usage/llm-guard";
import { embedDailyUsdCap, EMBED_PROVIDER } from "../embeddings/guard";
import { embedModel } from "../embeddings/client";
import {
  AtomicReservationGuard,
  type ReservationCaps,
  type StageGuard,
} from "../usage/reservations";
import { estimateEmbedCostUsd } from "../llm/pricing";
import { estimateCostUsd } from "./limits";
import { askAnswerModel, askRerankModel } from "./config";
import { ANSWER_MAX_OUTPUT_TOKENS } from "./answer";
import { RERANK_MAX_OUTPUT_TOKENS } from "./rerank";

/** Guards one run threads into its pipeline stages (ask() opts.guards). */
export interface AskStageGuards {
  embed: StageGuard;
  rerank: StageGuard;
  answer: StageGuard;
}

// Bounded INPUT-token estimates for the ceiling math. Deliberately generous —
// a ceiling that is too tight starves legitimate calls near a cap; too loose
// merely reserves headroom for the seconds until settlement. Measured prompt
// sizes (eval artifacts): answer input at K=60 is ~15-20K tokens; rerank input
// at 300 candidates x ~60 tokens is ~20K; the embed input is the <=400-char
// question (~100 tokens).
export const ANSWER_INPUT_EST_TOKENS = 30_000;
export const RERANK_INPUT_EST_TOKENS = 25_000;
export const EMBED_INPUT_EST_TOKENS = 2_000;

export function answerCeilingUsd(): number {
  const maxOut = envNum("ASK_ANSWER_MAX_OUTPUT_TOKENS", ANSWER_MAX_OUTPUT_TOKENS);
  return estimateCostUsd(askAnswerModel(), ANSWER_INPUT_EST_TOKENS, maxOut);
}

export function rerankCeilingUsd(): number {
  return estimateCostUsd(askRerankModel(), RERANK_INPUT_EST_TOKENS, RERANK_MAX_OUTPUT_TOKENS);
}

/** Model-aware since 2026-09-06: an unpriced model resolves to the conservative
 *  EMBED_UNKNOWN_PRICE_PER_MTOK fallback, so the ceiling can only ever be too
 *  generous, never too tight. (Such a model is refused at dispatch anyway.) The
 *  default model's value is unchanged. */
export function embedCeilingUsd(): number {
  return estimateEmbedCostUsd(embedModel(), EMBED_INPUT_EST_TOKENS);
}

/** Same cap envs the legacy askGuardFromEnv reads — the atomic guard changes
 *  HOW the caps are enforced (ceiling-aware fit under an advisory lock), never
 *  WHICH caps apply. */
function askCaps(): ReservationCaps {
  return {
    totalCapUsd: envCap("LLM_SPRINT_USD_CAP"),
    dailyUsdCap: askDailyUsdCap(),
    dailyRequestCap: envNum("ASK_DAILY_REQUEST_CAP", 500),
    runRequestCap: envNum("ASK_RUN_REQUEST_CAP", 10),
  };
}

function embedCaps(): ReservationCaps {
  return {
    totalCapUsd: envCap("LLM_SPRINT_USD_CAP"),
    dailyUsdCap: embedDailyUsdCap(),
    dailyRequestCap: envNum("EMBED_DAILY_REQUEST_CAP", 2000),
    runRequestCap: envNum("EMBED_RUN_REQUEST_CAP", 500),
  };
}

/** Build the three per-stage atomic guards for one run. rerank and answer hold
 *  SEPARATE reservations against openai_ask (their ceilings differ and settle
 *  independently); embed reserves against openai_embed — envelope isolation
 *  preserved structurally (distinct advisory-lock keys). */
export function buildAskRunGuards(runId: string): AskStageGuards {
  return {
    embed: new AtomicReservationGuard({
      runId,
      stage: "embed",
      provider: EMBED_PROVIDER,
      caps: embedCaps(),
      ceilingUsd: embedCeilingUsd(),
    }),
    rerank: new AtomicReservationGuard({
      runId,
      stage: "rerank",
      provider: ASK_PROVIDER,
      caps: askCaps(),
      ceilingUsd: rerankCeilingUsd(),
    }),
    answer: new AtomicReservationGuard({
      runId,
      stage: "answer",
      provider: ASK_PROVIDER,
      caps: askCaps(),
      ceilingUsd: answerCeilingUsd(),
    }),
  };
}

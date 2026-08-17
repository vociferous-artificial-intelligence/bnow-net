// The ONE OpenAI client constructor for the ANALYSIS workloads (map, reduce,
// legacy digest, validation, entity audit) — release hardening 2026-08-17.
//
// SDK auto-retries are DISABLED here for the same reason the Ask gateway
// disables them (src/lib/llm/openai.ts): the SDK default (maxRetries: 2)
// re-dispatches 429/5xx/connection failures invisibly, so one successful
// SpendGuard.tryReserve() could cover up to three physical billed attempts —
// a structural breach of the one-reservation-per-physical-dispatch rule
// (ruling 4/8). The analysis sites' ONLY retries are their explicit 65s 429
// loops, each of which takes a FRESH reservation before the second attempt.
//
// The analysis-clients source-scan test (openai-client.test.ts) pins that every analysis dispatch
// module constructs its client through this factory and never via a bare
// `new OpenAI(...)`.

import OpenAI from "openai";

export function analysisOpenAiClient(): OpenAI {
  return new OpenAI({ maxRetries: 0 });
}

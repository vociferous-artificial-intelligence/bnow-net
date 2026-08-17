// Analysis-eval control plane, C3: the LIVE candidate dispatch path.
//
// THIS MODULE IS THE ONLY PLACE THE EVAL LIBRARY CAN TOUCH A PAID PROVIDER.
// It is loaded exclusively by scripts/analysis-eval.ts via dynamic import, and
// only after assertLivePreflight() has passed EVERY guard: the explicit
// --execute-live flag, the EVAL_DATABASE_URL + --db-ack host acknowledgement,
// a real OPENAI_API_KEY, and both spend caps (LLM_SPRINT_USD_CAP +
// EVAL_USD_CAP_DAILY — the openai_eval guard fails closed without them).
// Estimate/offline/report/validate modes never import this module.
//
// Client discipline: constructed ONLY through analysisOpenAiClient()
// (maxRetries: 0 — one SpendGuard reservation per physical dispatch, absolute;
// this module is enumerated in openai-client.test.ts's source scan). The only
// retry is the explicit 65s 429 loop below, and it takes a FRESH reservation.
// Every RECEIVED response is metered via guard.record BEFORE parsing (ruling
// 8); an attempt that errors before any response is unbilled and counts in
// erroredAttempts instead.
//
// evalDispatchConfig() below is the ONE deliberate registry bypass in the
// repo: it validates pricing and reasoning effort exactly like production
// model-config, but skips the analysis-registry approval check and the map
// activation lock so a NON-approved candidate can be measured OUTSIDE the
// production routes. It is private to the eval library — a source-scan test
// (isolation.test.ts) proves no src/app/ file and no production analysis
// dispatch module imports anything from src/lib/evals. A passing scorecard
// only ever yields a PROPOSED registry entry in report text; nothing here
// edits analysis-registry.ts.

import type OpenAI from "openai";
import { analysisOpenAiClient } from "../analysis/openai-client";
import { mapBatchMaxTokens } from "../analysis/map-worker";
import { mapResponseSchema } from "../analysis/map-prompts";
import { reduceVotes, synthesisResponseSchema } from "../analysis/synthesize";
import type { Track } from "../analysis/tracks";
import {
  REASONING_EFFORT_VALUES,
  analysisChatParams,
  type AnalysisReasoningEffort,
} from "../llm/model-config";
import { ANALYSIS_ROUTING_REGISTRY_VERSION } from "../llm/analysis-registry";
import { PRICES_PER_MTOK, estimateCostUsd } from "../llm/pricing";
import { LlmBudgetError, reduceMaxOutputTokens } from "../usage/llm-guard";
import type { SpendGuard } from "../usage/spend-guard";
import { MATCH_RESPONSE_SCHEMA, sanitizeMatches, type LlmMatch } from "../validation/llm-match";
import {
  type AnalysisEvalCase,
  type AnalysisEvalDataset,
  type CandidateDispatchIdentity,
  type DigestEvalCase,
  type EvalCaseResult,
  type MapEvalCase,
  type ValidationEvalCase,
} from "./contracts";
import { evalGuardFromEnv } from "./eval-guard";
import {
  buildCandidatePrompt,
  datasetExtractorVersions,
  datasetPromptHash,
  liveConfigKey,
  sha256,
  workloadSchemaVersion,
  type MeterDelta,
} from "./runner";
import { scoreMapCase } from "./score-map";
import { scoreDigestCase } from "./score-reduce";
import { scoreValidationCase } from "./score-validation";

// ============================================================================
// evalDispatchConfig — candidate resolution with the registry bypass
// ============================================================================

export type LiveEvalWorkload = "map" | "digest" | "validation";

export class EvalDispatchError extends Error {
  readonly code = "EVAL_DISPATCH";
  constructor(reason: string) {
    super(`analysis-eval: ${reason}`);
    this.name = "EvalDispatchError";
  }
}

export interface EvalCandidateDispatchConfig {
  workload: LiveEvalWorkload;
  model: string;
  reasoningCapable: boolean;
  reasoningEffort: AnalysisReasoningEffort | null;
  approval: "evaluation_candidate";
}

const REASONING_MODEL = /^(gpt-5|o\d)/; // mirror of model-config's split

/** Resolve a CANDIDATE for evaluation dispatch. Validates pricing (an unpriced
 *  model still refuses — its spend could only be guessed, ruling 4's spirit)
 *  and reasoning effort (allowlist; effort on a non-reasoning model refuses),
 *  but deliberately BYPASSES the analysis-registry approval and the map
 *  activation lock, stamping approval "evaluation_candidate" into every
 *  artifact so no output can masquerade as production-approved. */
export function evalDispatchConfig(
  workload: string,
  model: string,
  effort: string | null,
): EvalCandidateDispatchConfig {
  if (workload === "reduce") {
    throw new EvalDispatchError("reduce is a deterministic pipeline — there is nothing to dispatch");
  }
  if (workload !== "map" && workload !== "digest" && workload !== "validation") {
    throw new EvalDispatchError(`unknown workload "${workload}"`);
  }
  if (!Object.prototype.hasOwnProperty.call(PRICES_PER_MTOK, model)) {
    throw new EvalDispatchError(
      `model "${model}" has no entry in the metering price table (src/lib/llm/pricing.ts) — refusing to dispatch unpriced, even for evaluation`,
    );
  }
  const reasoningCapable = REASONING_MODEL.test(model);
  let reasoningEffort: AnalysisReasoningEffort | null = null;
  if (effort !== null) {
    const lower = effort.trim().toLowerCase();
    if (!(REASONING_EFFORT_VALUES as readonly string[]).includes(lower)) {
      throw new EvalDispatchError(
        `invalid reasoning effort "${effort}" (allowed: ${REASONING_EFFORT_VALUES.join("|")})`,
      );
    }
    if (!reasoningCapable) {
      throw new EvalDispatchError(`reasoning effort set for non-reasoning model "${model}"`);
    }
    reasoningEffort = lower as AnalysisReasoningEffort;
  }
  return { workload, model, reasoningCapable, reasoningEffort, approval: "evaluation_candidate" };
}

// ============================================================================
// Live preflight — every guard BEFORE any client construction or DB use
// ============================================================================

export interface LivePreflightArgs {
  executeLive: boolean;
  workload: string;
  model: string | null;
  effort: string | null;
  dbAck: string | null;
}

export interface LivePreflightOk {
  cfg: EvalCandidateDispatchConfig;
  dbHost: string;
  evalDatabaseUrl: string;
}

/** Throws EvalDispatchError on ANY missing guard. Pure of side effects: no
 *  client, no DB, no env mutation. */
export function assertLivePreflight(
  args: LivePreflightArgs,
  env: NodeJS.ProcessEnv = process.env,
): LivePreflightOk {
  if (!args.executeLive) {
    throw new EvalDispatchError("live mode requires the explicit --execute-live flag");
  }
  if (env.LLM_DISABLE === "1") {
    throw new EvalDispatchError("LLM_DISABLE=1 — kill-switch active, refusing live eval");
  }
  if (env.ANALYSIS_PROVIDER === "stub") {
    throw new EvalDispatchError("ANALYSIS_PROVIDER=stub — a stub run would be scored as if live; refusing");
  }
  if (args.model === null || args.model === "") {
    throw new EvalDispatchError("live mode requires --model");
  }
  const url = env.EVAL_DATABASE_URL;
  if (!url) {
    throw new EvalDispatchError(
      "EVAL_DATABASE_URL is not set — live mode never reads DATABASE_URL; point EVAL_DATABASE_URL at a disposable eval branch",
    );
  }
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    throw new EvalDispatchError("EVAL_DATABASE_URL is not a parseable URL");
  }
  if (args.dbAck === null || args.dbAck !== host) {
    throw new EvalDispatchError(
      `DB host not acknowledged: pass --db-ack ${host} (exact match) to confirm the spend ledger writes to that host`,
    );
  }
  if (!env.OPENAI_API_KEY) {
    throw new EvalDispatchError("OPENAI_API_KEY is not set");
  }
  for (const cap of ["LLM_SPRINT_USD_CAP", "EVAL_USD_CAP_DAILY"]) {
    const v = env[cap];
    if (v === undefined || v === "" || !Number.isFinite(Number(v)) || Number(v) <= 0) {
      throw new EvalDispatchError(`${cap} is not set to a positive number — the openai_eval guard fails closed`);
    }
  }
  const cfg = evalDispatchConfig(args.workload, args.model, args.effort);
  return { cfg, dbHost: host, evalDatabaseUrl: url };
}

export function liveIdentity(
  dataset: AnalysisEvalDataset,
  cfg: EvalCandidateDispatchConfig,
): CandidateDispatchIdentity {
  return {
    provider: "openai",
    model: cfg.model,
    reasoningEffort: cfg.reasoningEffort,
    registryVersion: ANALYSIS_ROUTING_REGISTRY_VERSION,
    approval: cfg.approval,
    promptHash: datasetPromptHash(dataset),
    schemaVersion: workloadSchemaVersion(dataset),
    ...(dataset.workload === "map" ? { extractorVersion: datasetExtractorVersions(dataset) } : {}),
  };
}

// ============================================================================
// Dispatch — fresh reservation per physical attempt, metering before parse
// ============================================================================

export interface LiveDeps {
  client: OpenAI;
  guard: SpendGuard;
  meter: MeterDelta;
  /** injectable for tests; live default sleeps out the 429 TPM window */
  sleep: (ms: number) => Promise<void>;
}

export interface DispatchOutcome {
  raw: string | null;
  truncated: boolean;
  promptTokens: number;
  completionTokens: number;
  estUsd: number;
}

interface JsonSchemaSpec {
  name: string;
  schema: unknown;
}

export const RETRY_429_DELAY_MS = 65_000;

/** One logical dispatch = at most two physical attempts (the explicit 429
 *  retry), each behind its OWN tryReserve. Metering happens immediately after
 *  the response, BEFORE parsing/discarding (ruling 8). */
export async function dispatchOnce(
  deps: LiveDeps,
  cfg: EvalCandidateDispatchConfig,
  prompt: { system: string; user: string },
  schema: JsonSchemaSpec,
  opts: { temperature: number; maxCompletionTokens?: number },
): Promise<DispatchOutcome> {
  const reserve = () => {
    const r = deps.guard.tryReserve();
    if (!r.ok) throw new LlmBudgetError(r.reason, r.code);
    deps.meter.reservations++;
  };
  const request = () =>
    deps.client.chat.completions.create({
      model: cfg.model,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: schema.name, schema: schema.schema as never, strict: true },
      },
      ...analysisChatParams(cfg, opts),
    });

  reserve();
  deps.meter.attempts++;
  let completion;
  try {
    completion = await request();
  } catch (e) {
    if ((e as { status?: number }).status === 429) {
      deps.meter.erroredAttempts++; // the 429 attempt received no billable response
      await deps.sleep(RETRY_429_DELAY_MS);
      reserve(); // FRESH reservation for the second physical attempt
      deps.meter.attempts++;
      try {
        completion = await request();
      } catch (e2) {
        deps.meter.erroredAttempts++;
        throw e2;
      }
    } else {
      deps.meter.erroredAttempts++;
      throw e;
    }
  }

  const choice = completion.choices[0];
  const promptTokens = completion.usage?.prompt_tokens ?? 0;
  const completionTokens = completion.usage?.completion_tokens ?? 0;
  const estUsd = estimateCostUsd(cfg.model, promptTokens, completionTokens);
  // ruling 8: record the billed usage BEFORE any parse/discard decision —
  // truncated and unparseable responses are billed in full by the provider
  await deps.guard.record(1, promptTokens + completionTokens, estUsd);
  deps.meter.meterings++;

  return {
    raw: choice?.message?.content ?? null,
    truncated: choice?.finish_reason === "length",
    promptTokens,
    completionTokens,
    estUsd,
  };
}

// ============================================================================
// Per-case live execution
// ============================================================================

export async function runLiveCase(
  deps: LiveDeps,
  cfg: EvalCandidateDispatchConfig,
  evalCase: AnalysisEvalCase,
  datasetVersion: string,
  runId: string,
  repetition: number,
): Promise<EvalCaseResult> {
  const t0 = Date.now();
  const meterBefore = deps.meter.attempts;
  let checks: EvalCaseResult["checks"];
  let status: EvalCaseResult["status"] = "scored";
  let rawOutputDigest = sha256("");
  let promptTokens = 0;
  let completionTokens = 0;
  let estUsd = 0;

  const prompt = buildCandidatePrompt(evalCase);
  switch (evalCase.workload) {
    case "map": {
      const c = evalCase as MapEvalCase;
      const out = await dispatchOnce(deps, cfg, prompt, { name: "doc_claims", schema: mapResponseSchema(c.input.docs.length) }, {
        temperature: 0.2,
        maxCompletionTokens: mapBatchMaxTokens(c.input.docs.length),
      });
      promptTokens = out.promptTokens;
      completionTokens = out.completionTokens;
      estUsd = out.estUsd;
      // NOTE: production splits a truncated batch and retries; the eval does
      // not — truncation on an eval-sized batch is itself a finding.
      const mc = scoreMapCase(c, out.raw ?? "", out.truncated);
      checks = mc;
      if (!out.truncated && !mc.schemaValid) status = "schema_invalid";
      rawOutputDigest = sha256(out.raw ?? "");
      break;
    }
    case "digest": {
      const c = evalCase as DigestEvalCase;
      const k = reduceVotes(); // ruling 18: the shipped K, never lowered here
      const votes: string[] = [];
      for (let v = 0; v < k; v++) {
        const out = await dispatchOnce(deps, cfg, prompt, { name: "digest_synthesis", schema: synthesisResponseSchema(c.input.track as Track) }, {
          temperature: 0.2,
          maxCompletionTokens: reduceMaxOutputTokens(),
        });
        promptTokens += out.promptTokens;
        completionTokens += out.completionTokens;
        estUsd += out.estUsd;
        // a truncated vote is discarded content in production; recording it as
        // an unparseable vote makes scoreDigestCase count it failed
        votes.push(out.truncated ? "" : (out.raw ?? ""));
      }
      const scored = scoreDigestCase(c, votes, { candidateInvariantOnly: true });
      checks = scored.checks;
      rawOutputDigest = sha256(votes.join("\n---\n"));
      break;
    }
    case "validation": {
      const c = evalCase as ValidationEvalCase;
      const out = await dispatchOnce(deps, cfg, prompt, { name: "matches", schema: MATCH_RESPONSE_SCHEMA }, {
        temperature: 0, // the production match call's exact temperature
      });
      promptTokens = out.promptTokens;
      completionTokens = out.completionTokens;
      estUsd = out.estUsd;
      rawOutputDigest = sha256(out.raw ?? "");
      let matches: LlmMatch[] | null = null;
      if (out.raw !== null && !out.truncated) {
        try {
          const parsed = (JSON.parse(out.raw) as { matches?: LlmMatch[] }).matches ?? [];
          matches = sanitizeMatches(
            parsed,
            c.input.takeaways.length,
            new Set(c.input.claims.map((cl) => cl.claimId)),
          );
        } catch {
          matches = null;
        }
      }
      if (matches === null) {
        status = "schema_invalid";
        checks = { pass: false, failures: ["match response unparseable or truncated"] };
      } else {
        checks = scoreValidationCase(c, matches).checks;
      }
      break;
    }
    case "reduce":
      throw new EvalDispatchError("reduce cases never dispatch");
  }

  return {
    caseId: evalCase.id,
    datasetVersion,
    runId,
    configKey: liveConfigKey(cfg.model, cfg.reasoningEffort),
    repetition,
    attempt: deps.meter.attempts - meterBefore,
    status,
    latencyMs: Date.now() - t0,
    promptTokens,
    completionTokens,
    estUsd,
    checks,
    humanLabels: null,
    graderJudgments: null,
    rawOutputDigest,
  };
}

/** Build the live deps for a REAL run: the shared factory client (maxRetries:
 *  0) + the fail-closed openai_eval guard. Only the script's authorized
 *  --execute-live path calls this. */
export async function buildLiveDeps(): Promise<LiveDeps> {
  const guard = evalGuardFromEnv();
  await guard.init();
  return {
    client: analysisOpenAiClient(),
    guard,
    meter: { attempts: 0, reservations: 0, meterings: 0, erroredAttempts: 0 },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}

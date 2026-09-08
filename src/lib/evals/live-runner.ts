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
// evalDispatchConfig() below resolves the dispatch identity two ways. A
// (workload, model, effort) combination the analysis approval registry holds
// as status "baseline" — the registered production configuration — resolves
// THROUGH the registry and is stamped approval "baseline". Every other priced
// combination takes the ONE deliberate registry bypass in the repo: pricing
// and reasoning effort are validated exactly like production model-config,
// but the analysis-registry approval check and the map activation lock are
// skipped so a NON-approved candidate can be measured OUTSIDE the production
// routes, stamped approval "evaluation_candidate". The module is private to
// the eval library — a source-scan test (isolation.test.ts) proves no
// src/app/ file and no production analysis dispatch module imports anything
// from src/lib/evals, so production routes gain no bypass either way. A
// passing candidate scorecard only ever yields a PROPOSED registry entry in
// report text; nothing here edits analysis-registry.ts.

import type OpenAI from "openai";
import { analysisOpenAiClient } from "../analysis/openai-client";
import { mapBatchMaxTokens } from "../analysis/map-worker";
import { mapResponseSchema } from "../analysis/map-prompts";
import { buildMessagesRequest, parseMessagesResponse } from "../analysis/anthropic-dispatch";
import { reduceVotes, synthesisResponseSchema } from "../analysis/synthesize";
import type { Track } from "../analysis/tracks";
import {
  REASONING_EFFORT_VALUES,
  analysisChatParams,
  type AnalysisReasoningEffort,
} from "../llm/model-config";
import { ANALYSIS_ROUTING_REGISTRY_VERSION, analysisApproval } from "../llm/analysis-registry";
import { estimateCostUsd, pricedFor } from "../llm/pricing";
import {
  ANALYSIS_DEFAULT_PROVIDER,
  ANALYSIS_PROVIDER_IDS,
  analysisReasoningCapable,
  isAnalysisProviderId,
  type AnalysisProviderId,
} from "../llm/providers";
import { LlmBudgetError, reduceMaxOutputTokens } from "../usage/llm-guard";
import type { SpendGuard } from "../usage/spend-guard";
import { MATCH_RESPONSE_SCHEMA, MATCH_VOTES_DEFAULT, resolveVoteRounds, sanitizeMatches, type LlmMatch } from "../validation/llm-match";
import {
  type AbandonedAttemptRecord,
  type AnalysisEvalCase,
  type AnalysisEvalDataset,
  type CandidateDispatchIdentity,
  type CaptureRunRecord,
  type DigestEvalCase,
  type EvalCaseResult,
  type EvalEnvKnobs,
  type EvalResultsFile,
  type MapEvalCase,
  type ValidationEvalCase,
} from "./contracts";
import { CAPTURE_LINE_VERSION, CaptureWriteError, sanitizeMessage, type CaptureSink, type DispatchContext } from "./capture";
import { evalGuardFromEnv } from "./eval-guard";
import {
  VALIDATION_VOTES_DIAGNOSTIC,
  VALIDATION_VOTES_PRODUCTION,
  ZERO_METER,
  buildCandidatePrompt,
  classifyCaseApplicability,
  datasetExtractorVersions,
  datasetPromptHash,
  emptyEvalResultsFile,
  evalValidationVotes,
  inapplicableResult,
  liveConfigKey,
  mergeEvalResults,
  sha256,
  workloadSchemaVersion,
  type MeterDelta,
  type PendingWorkItem,
  type ResultsFileHeader,
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
  /** the vendor this candidate dispatches through. Validated against
   *  EVAL_DISPATCHABLE_PROVIDERS in the preflight, BEFORE this config is
   *  built and long before any client or DB exists. */
  provider: AnalysisProviderId;
  model: string;
  reasoningCapable: boolean;
  reasoningEffort: AnalysisReasoningEffort | null;
  /** "baseline" ONLY when the analysis approval registry holds this exact
   *  (workload, model, effort) as a status-"baseline" entry — the registered
   *  production configuration, registry-resolved. Everything else is
   *  "evaluation_candidate" (the isolated bypass). */
  approval: "baseline" | "evaluation_candidate";
  /** How the response schema is imposed (decision R13). OpenAI dispatches
   *  `json_schema` with `strict: true` — the model CANNOT emit a
   *  non-conforming body. Anthropic Messages has no equivalent, so the schema
   *  goes in the prompt and conformance becomes a model behaviour rather than
   *  a decoding constraint. That is a different experiment, not a different
   *  model on the same one, so it is stamped into the identity and the cell is
   *  its own comparability class. */
  schemaMode: EvalSchemaMode;
}

/** See EvalCandidateDispatchConfig.schemaMode. ABSENT on every results file
 *  written before 2026-09-06 and read as `json_schema_strict` — which is what
 *  those runs did. */
export type EvalSchemaMode = "json_schema_strict" | "prompt_embedded_json";

/** The schema mode a vendor's dispatch path can offer. Not a preference: it
 *  is what the API supports. */
export function evalSchemaModeFor(provider: AnalysisProviderId): EvalSchemaMode {
  return provider === "openai" ? "json_schema_strict" : "prompt_embedded_json";
}

/** Which WORKLOADS this build can evaluate on each vendor.
 *
 *  Naming a provider (providers.ts ANALYSIS_PROVIDER_IDS) is not permission to
 *  evaluate on it: an id needs a request/parse path in dispatchOnce, a
 *  metering row, and a price table entry for its models. Anthropic has all
 *  three for `digest` only (PR-2.2-B3) — deliberately not for map or
 *  validation, whose eval cells compare against production dispatches that are
 *  hard-locked or allowlisted to OpenAI, so a cross-vendor result there would
 *  measure something no production path can run. `openai_compatible` has no
 *  request path at all, so its list is empty and it is not dispatchable.
 *
 *  Two gates read this. `assertLivePreflight` refuses a provider with an EMPTY
 *  list before any client, guard or DB exists; `evalDispatchConfig` refuses a
 *  (provider, workload) pair once the workload itself has been validated. */
export const EVAL_DISPATCHABLE_WORKLOADS: Record<AnalysisProviderId, readonly LiveEvalWorkload[]> = {
  openai: ["map", "digest", "validation"],
  anthropic: ["digest"],
  openai_compatible: [],
};

/** The credential each vendor's dispatch path reads. */
export const EVAL_PROVIDER_KEY_ENV: Record<AnalysisProviderId, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openai_compatible: "OPENAI_COMPATIBLE_API_KEY",
};

/** Providers this build can dispatch an evaluation through at all. */
export const EVAL_DISPATCHABLE_PROVIDERS: readonly AnalysisProviderId[] = (
  Object.keys(EVAL_DISPATCHABLE_WORKLOADS) as AnalysisProviderId[]
).filter((p) => EVAL_DISPATCHABLE_WORKLOADS[p].length > 0);

/** Resolve a (provider, model, effort) for evaluation dispatch. Validates
 *  pricing FOR THAT PROVIDER (an unpriced model still refuses — its spend
 *  could only be guessed, ruling 4's spirit) and reasoning effort (allowlist;
 *  effort on a model whose provider/name cannot take one refuses).
 *  A combination the analysis approval registry records as status "baseline"
 *  (the registered production configuration, e.g. gpt-4o-mini/effort-absent)
 *  is resolved THROUGH the registry and stamped approval "baseline". Any
 *  other priced combination deliberately BYPASSES the analysis-registry
 *  approval and the map activation lock, stamping approval
 *  "evaluation_candidate" into every artifact so no candidate output can
 *  masquerade as production-approved.
 *
 *  The provider is an INPUT, not an assumption: the price lookup and the
 *  reasoning-capability probe are both provider-relative, so a model priced
 *  for OpenAI can never be metered as another vendor's and vice versa. The
 *  eval-dispatchability allowlist is enforced by the preflight, not here —
 *  this function stays pure and callable from a unit test for any provider. */
export function evalDispatchConfig(
  workload: string,
  provider: string,
  model: string,
  effort: string | null,
): EvalCandidateDispatchConfig {
  if (workload === "reduce") {
    throw new EvalDispatchError("reduce is a deterministic pipeline — there is nothing to dispatch");
  }
  if (workload !== "map" && workload !== "digest" && workload !== "validation") {
    throw new EvalDispatchError(`unknown workload "${workload}"`);
  }
  if (!isAnalysisProviderId(provider)) {
    throw new EvalDispatchError(
      `provider "${provider}" is not a known provider (known: ${ANALYSIS_PROVIDER_IDS.join("|")})`,
    );
  }
  if (!EVAL_DISPATCHABLE_WORKLOADS[provider].includes(workload)) {
    throw new EvalDispatchError(
      `provider "${provider}" has no eval dispatch path for workload "${workload}" in this build (it can evaluate: ${EVAL_DISPATCHABLE_WORKLOADS[provider].join("|") || "nothing"})`,
    );
  }
  if (!pricedFor(provider, model)) {
    // same two-message split as the production seam (model-config.ts): the
    // OpenAI wording is unchanged from before the provider dimension, so the
    // overwhelmingly common refusal reads exactly as operators know it
    throw new EvalDispatchError(
      provider === "openai"
        ? `model "${model}" has no entry in the metering price table (src/lib/llm/pricing.ts) — refusing to dispatch unpriced, even for evaluation`
        : `model "${model}" is not priced for provider "${provider}" in the metering price table (src/lib/llm/pricing.ts) — refusing to dispatch unpriced, even for evaluation`,
    );
  }
  const reasoningCapable = analysisReasoningCapable(provider, model);
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
  // Registry-backed baseline identity: the registered production baseline
  // must never be stamped as an evaluation candidate (its results ARE the
  // production configuration's). Only a status-"baseline" registry verdict
  // resolves here; a future "evaluated_candidate" registry entry still takes
  // the bypass stamp — its eval artifacts describe candidate dispatches.
  // The provider is passed through rather than assumed: a registry approval
  // is keyed on (workload, provider, model, effort), so a Claude model can
  // never inherit an OpenAI baseline's status by sharing its name.
  const verdict = analysisApproval(workload, provider, model, reasoningEffort);
  const approval: EvalCandidateDispatchConfig["approval"] =
    verdict.approved && verdict.status === "baseline" ? "baseline" : "evaluation_candidate";
  return {
    workload,
    provider,
    model,
    reasoningCapable,
    reasoningEffort,
    approval,
    schemaMode: evalSchemaModeFor(provider),
  };
}

// ============================================================================
// Live preflight — every guard BEFORE any client construction or DB use
// ============================================================================

export interface LivePreflightArgs {
  executeLive: boolean;
  workload: string;
  /** --provider; null = the CLI default (openai). Refused before the DB, the
   *  key and the caps are even looked at — an unevaluable vendor is not a
   *  configuration to be completed, it is a build capability that is absent. */
  provider: string | null;
  model: string | null;
  effort: string | null;
  dbAck: string | null;
  /** the explicit --single-round-diagnostic flag: the ONLY way a validation
   *  eval may dispatch one vote round (EVAL_VALIDATION_VOTES=1) — and it is
   *  labelled as non-production-equivalent everywhere it appears */
  singleRoundDiagnostic?: boolean;
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
  // PROVIDER before everything environmental. An id this build cannot
  // dispatch is refused here — before EVAL_DATABASE_URL, before the API key,
  // before the caps, before evalDispatchConfig, and (this function being pure)
  // before any client, guard or DB connection exists at all. Unknown ids and
  // known-but-not-wired ids fail identically: the operator's question is
  // "can this build evaluate on that vendor", and the answer is no either way.
  const provider = args.provider ?? ANALYSIS_DEFAULT_PROVIDER;
  if (!(EVAL_DISPATCHABLE_PROVIDERS as readonly string[]).includes(provider)) {
    throw new EvalDispatchError(
      `provider "${provider}" is not eval-dispatchable in this build (allowed: ${EVAL_DISPATCHABLE_PROVIDERS.join("|")}) — refusing before any client construction`,
    );
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
  // SAF-m3: a copy-paste slip that points EVAL_DATABASE_URL at the production
  // DATABASE_URL sitting in the same env would write openai_eval ledger rows
  // to production. Refuse host equality outright (ab-mapreduce precedent).
  // Neon pooled/unpooled hosts differ only by "-pooler." (backfill-at-publish
  // precedent) — normalize it away so the production UNPOOLED URL cannot slip
  // past an equality check against the pooled DATABASE_URL.
  const prodUrl = env.DATABASE_URL;
  if (prodUrl) {
    const normalizeHost = (h: string) =>
      h.toLowerCase().replace(/:5432$/, "").replace(/-pooler\./, ".");
    let prodHost: string;
    try {
      prodHost = normalizeHost(new URL(prodUrl).host);
    } catch {
      // fail CLOSED: an unparseable production URL means the equality check
      // cannot run, and a paid run must not proceed on an unverifiable guard
      throw new EvalDispatchError(
        "DATABASE_URL is set but not URL-parseable — cannot verify it differs from EVAL_DATABASE_URL; fix or unset it before a live run",
      );
    }
    if (prodHost === normalizeHost(host)) {
      throw new EvalDispatchError(
        `EVAL_DATABASE_URL host ${host} EQUALS the production DATABASE_URL host — live evals must run against a disposable eval branch, never production`,
      );
    }
  }
  // provider-relative: an Anthropic cell that refused on a missing
  // OPENAI_API_KEY would be telling the operator to fix the wrong thing
  const keyEnv = EVAL_PROVIDER_KEY_ENV[provider as AnalysisProviderId];
  if (!env[keyEnv]) {
    throw new EvalDispatchError(`${keyEnv} is not set`);
  }
  for (const cap of ["LLM_SPRINT_USD_CAP", "EVAL_USD_CAP_DAILY"]) {
    const v = env[cap];
    if (v === undefined || v === "" || !Number.isFinite(Number(v)) || Number(v) <= 0) {
      throw new EvalDispatchError(`${cap} is not set to a positive number — the openai_eval guard fails closed`);
    }
  }
  const cfg = evalDispatchConfig(args.workload, provider, args.model, args.effort);
  // ruling 18: K=5 synthesis votes is the SHIPPED digest configuration — a
  // live digest eval at any other K would measure a non-shipped pipeline and
  // its scorecard would be meaningless for activation. Refuse rather than
  // record it (review remediation, safety MINOR-2).
  if (cfg.workload === "digest" && reduceVotes() !== 5) {
    throw new EvalDispatchError(
      `REDUCE_VOTES resolves to ${reduceVotes()} — a live digest eval must run the shipped K=5 (ruling 18); unset REDUCE_VOTES`,
    );
  }
  // 2026-09-04 parity: a live validation eval measures the production
  // five-vote majority matcher. The eval's vote count comes ONLY from
  // EVAL_VALIDATION_VOTES (set by the CLI from --validation-votes); a
  // production MATCH_VOTES/MATCHER_MODE override in the shell would not
  // change the eval's dispatch, but it signals a non-shipped configuration
  // is being assumed — refuse rather than record an ambiguous identity.
  if (cfg.workload !== "validation" && args.singleRoundDiagnostic) {
    throw new EvalDispatchError("--single-round-diagnostic applies to the validation workload only — refusing an acknowledgement that authorizes nothing");
  }
  if (cfg.workload === "validation") {
    const mv = env.MATCH_VOTES;
    if (env.MATCHER_MODE === "single" || (mv !== undefined && mv !== "" && Number(mv) !== MATCH_VOTES_DEFAULT)) {
      throw new EvalDispatchError(
        `MATCHER_MODE/MATCH_VOTES alter the production matcher's vote count (shipped default ${MATCH_VOTES_DEFAULT}); unset them — a live validation eval's vote count comes from --validation-votes only`,
      );
    }
    let votes: number;
    try {
      votes = evalValidationVotes(env);
    } catch (e) {
      throw new EvalDispatchError(e instanceof Error ? e.message : String(e));
    }
    if (votes === VALIDATION_VOTES_DIAGNOSTIC && !args.singleRoundDiagnostic) {
      throw new EvalDispatchError(
        `--validation-votes ${VALIDATION_VOTES_DIAGNOSTIC} is the single-round DIAGNOSTIC mode, not a production-equivalent evaluation — pass --single-round-diagnostic explicitly to acknowledge (results carry the +votes1 key and are labelled non-production-equivalent)`,
      );
    }
    if (votes === VALIDATION_VOTES_PRODUCTION && args.singleRoundDiagnostic) {
      throw new EvalDispatchError("--single-round-diagnostic given but --validation-votes resolves to the production 5 — refusing an acknowledgement that authorizes nothing");
    }
  }
  return { cfg, dbHost: host, evalDatabaseUrl: url };
}

export function liveIdentity(
  dataset: AnalysisEvalDataset,
  cfg: EvalCandidateDispatchConfig,
): CandidateDispatchIdentity {
  return {
    provider: cfg.provider,
    model: cfg.model,
    reasoningEffort: cfg.reasoningEffort,
    registryVersion: ANALYSIS_ROUTING_REGISTRY_VERSION,
    approval: cfg.approval,
    schemaMode: cfg.schemaMode,
    promptHash: datasetPromptHash(dataset),
    schemaVersion: workloadSchemaVersion(dataset),
    ...(dataset.workload === "map" ? { extractorVersion: datasetExtractorVersions(dataset) } : {}),
  };
}

// ============================================================================
// Dispatch — fresh reservation per physical attempt, metering before parse
// ============================================================================

export interface LiveDeps {
  /** the OpenAI SDK client, or null for a run whose provider does not use it.
   *  The openai dispatch branch refuses a null client rather than construct
   *  one behind the factory's back (the maxRetries:0 discipline lives there). */
  client: OpenAI | null;
  /** injectable for tests; the anthropic branch's transport. The openai branch
   *  goes through the SDK client above and never reads this. */
  fetch?: typeof globalThis.fetch;
  guard: SpendGuard;
  meter: MeterDelta;
  /** in-memory metered usage totals (tokens/USD of RECEIVED responses) —
   *  the per-case deltas account interrupted and errored cases whose
   *  result row carries no usage (2026-09-04 accounting) */
  usage: UsageTotals;
  /** injectable for tests; live default sleeps out the 429 TPM window */
  sleep: (ms: number) => Promise<void>;
  /** opt-in per-attempt capture (capture.ts); null = byte-identical dispatch
   *  with zero filesystem access */
  capture: CaptureSink | null;
}

export interface UsageTotals {
  promptTokens: number;
  completionTokens: number;
  estUsd: number;
}

export const ZERO_USAGE: UsageTotals = { promptTokens: 0, completionTokens: 0, estUsd: 0 };

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
 *  the response, BEFORE parsing/discarding (ruling 8).
 *
 *  Capture ordering per physical attempt (when deps.capture is set):
 *    tryReserve → [budget_stop line on refusal, then throw]
 *    attempt_start line   (a write failure here aborts BEFORE any dispatch —
 *                          nothing reserved-counted, nothing billed)
 *    provider request
 *    on response: guard.record (ruling 8, FIRST) → attempt_end(response)
 *    on error:    attempt_end(error) → 429 retry loop / rethrow
 *  A capture write failure after a response surfaces as CaptureWriteError
 *  with `responseMetered: true` — the ledger holds the attempt, the file
 *  does not, and the caller must stop dispatching. */
export async function dispatchOnce(
  deps: LiveDeps,
  cfg: EvalCandidateDispatchConfig,
  prompt: { system: string; user: string },
  schema: JsonSchemaSpec,
  opts: { temperature: number; maxCompletionTokens?: number },
  ctx: DispatchContext | null = null,
): Promise<DispatchOutcome> {
  const capture = deps.capture;
  if (capture !== null && ctx === null) {
    // never write an unattributed capture line — refuse before any reservation
    throw new EvalDispatchError("capture is enabled but this dispatch carries no case context");
  }
  const base = (attemptIndex: number) =>
    ctx === null
      ? null
      : {
          v: CAPTURE_LINE_VERSION,
          ts: new Date().toISOString(),
          runId: ctx.runId,
          caseId: ctx.caseId,
          split: ctx.split,
          repetition: ctx.repetition,
          voteIndex: ctx.voteIndex,
          voteCount: ctx.voteCount,
          attemptIndex,
        };

  const reserve = (attemptIndex: number) => {
    const r = deps.guard.tryReserve();
    if (!r.ok) {
      if (capture !== null) {
        capture.write({ ...base(attemptIndex)!, kind: "budget_stop", code: r.code, reason: capture.redact(r.reason) });
      }
      throw new LlmBudgetError(r.reason, r.code);
    }
  };
  /** One vendor's response, reduced to what the meter, the capture line and
   *  the scorer need. Both branches produce this, so everything after the
   *  request — reservation accounting, ruling-8 metering, capture, the 429
   *  retry — is written once and cannot diverge per vendor. */
  interface NormalizedResponse {
    raw: string | null;
    truncated: boolean;
    promptTokens: number;
    completionTokens: number;
    returnedModel: string | null;
    responseId: string | null;
    systemFingerprint: string | null;
    finishReason: string | null;
    refused: boolean;
    refusalText: string | null;
  }

  const requestOpenAi = async (): Promise<NormalizedResponse> => {
    const client = deps.client;
    if (client === null) {
      throw new EvalDispatchError("openai dispatch requires a client — none was built for this run");
    }
    const completion = await client.chat.completions.create({
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
    const choice = completion.choices[0];
    const msg = choice?.message as { refusal?: string | null } | undefined;
    return {
      raw: choice?.message?.content ?? null,
      truncated: choice?.finish_reason === "length",
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
      returnedModel: typeof completion.model === "string" ? completion.model : null,
      responseId: typeof completion.id === "string" ? completion.id : null,
      systemFingerprint:
        typeof completion.system_fingerprint === "string" ? completion.system_fingerprint : null,
      finishReason: choice?.finish_reason ?? null,
      refused: typeof msg?.refusal === "string" && msg.refusal.length > 0,
      refusalText: typeof msg?.refusal === "string" ? msg.refusal : null,
    };
  };

  const requestAnthropic = async (): Promise<NormalizedResponse> => {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    // the preflight already required this; refusing again keeps the key out of
    // a header as `undefined` if this function is ever reached another way
    if (!apiKey) throw new EvalDispatchError("ANTHROPIC_API_KEY is not set");
    // R13: Messages has no strict json_schema, so the schema travels in the
    // prompt and conformance becomes a model behaviour. cfg.schemaMode records
    // that, and the results file is its own comparability class because of it.
    const { url, init } = buildMessagesRequest({
      model: cfg.model,
      system: `${prompt.system}\n\nRespond with ONLY a JSON object, no prose, conforming exactly to this JSON Schema:\n${JSON.stringify(schema.schema)}`,
      user: prompt.user,
      maxTokens: opts.maxCompletionTokens ?? reduceMaxOutputTokens(),
      temperature: opts.temperature,
      apiKey,
    });
    const res = await (deps.fetch ?? globalThis.fetch)(url, init);
    if (!res.ok) {
      // shaped like the SDK's error so the 429 retry below is one code path
      throw Object.assign(new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`), {
        status: res.status,
      });
    }
    const parsed = parseMessagesResponse(await res.json());
    return {
      raw: parsed.text === "" ? null : parsed.text,
      truncated: parsed.stopReason === "max_tokens",
      promptTokens: parsed.inputTokens,
      completionTokens: parsed.outputTokens,
      returnedModel: parsed.model,
      responseId: parsed.id,
      // Messages has no system_fingerprint and no refusal field: recorded as
      // absent rather than invented, so a capture line never implies evidence
      // the vendor did not give
      systemFingerprint: null,
      finishReason: parsed.stopReason,
      refused: false,
      refusalText: null,
    };
  };

  const request = cfg.provider === "anthropic" ? requestAnthropic : requestOpenAi;

  const errorLine = (attemptIndex: number, seq: number | null, e: unknown) => {
    if (capture === null || seq === null) return;
    const err = e as { name?: string; status?: number; message?: string };
    capture.write({
      ...base(attemptIndex)!,
      kind: "attempt_end",
      attemptSeq: seq,
      outcome: "error",
      requestedModel: cfg.model,
      requestedProvider: cfg.provider,
      returnedModel: null,
      responseId: null,
      systemFingerprint: null,
      finishReason: null,
      refused: false,
      refusal: null,
      truncated: false,
      usage: null,
      estUsd: null,
      metered: false,
      rawSha256: null,
      rawBytes: null,
      raw: null,
      error: {
        name: typeof err?.name === "string" ? err.name : "Error",
        status: typeof err?.status === "number" ? err.status : null,
        message: capture.redact(typeof err?.message === "string" ? err.message : String(e)),
      },
    });
  };

  /** reserve + start line + attempt counters, in that order */
  const begin = (attemptIndex: number): number | null => {
    reserve(attemptIndex);
    let seq: number | null = null;
    if (capture !== null) {
      seq = capture.nextAttemptSeq();
      capture.write({ ...base(attemptIndex)!, kind: "attempt_start", attemptSeq: seq, requestedModel: cfg.model, requestedProvider: cfg.provider });
    }
    deps.meter.reservations++;
    deps.meter.attempts++;
    return seq;
  };

  let attemptIndex = 0;
  let seq = begin(attemptIndex);
  let completion;
  try {
    completion = await request();
  } catch (e) {
    if ((e as { status?: number }).status === 429) {
      deps.meter.erroredAttempts++; // the 429 attempt received no billable response
      errorLine(attemptIndex, seq, e);
      await deps.sleep(RETRY_429_DELAY_MS);
      attemptIndex = 1;
      seq = begin(attemptIndex); // FRESH reservation for the second physical attempt
      try {
        completion = await request();
      } catch (e2) {
        deps.meter.erroredAttempts++;
        errorLine(attemptIndex, seq, e2);
        throw e2;
      }
    } else {
      deps.meter.erroredAttempts++;
      errorLine(attemptIndex, seq, e);
      throw e;
    }
  }

  const { promptTokens, completionTokens, raw, truncated } = completion;
  const estUsd = estimateCostUsd(cfg.model, promptTokens, completionTokens);
  // ruling 8: record the billed usage BEFORE any parse/discard decision —
  // truncated and unparseable responses are billed in full by the provider
  await deps.guard.record(1, promptTokens + completionTokens, estUsd);
  deps.meter.meterings++;
  deps.usage.promptTokens += promptTokens;
  deps.usage.completionTokens += completionTokens;
  deps.usage.estUsd += estUsd;

  if (capture !== null && seq !== null) {
    capture.write({
      ...base(attemptIndex)!,
      kind: "attempt_end",
      attemptSeq: seq,
      outcome: "response",
      requestedModel: cfg.model,
      requestedProvider: cfg.provider,
      returnedModel: completion.returnedModel,
      responseId: completion.responseId,
      systemFingerprint: completion.systemFingerprint,
      finishReason: completion.finishReason,
      refused: completion.refused,
      // refusal TEXT is model output: only where raw capture is authorized
      refusal:
        completion.refusalText !== null && capture.rawAllowed(ctx!.split)
          ? completion.refusalText
          : null,
      truncated,
      usage: { promptTokens, completionTokens },
      estUsd,
      metered: true,
      rawSha256: raw === null ? null : sha256(raw),
      rawBytes: raw === null ? null : Buffer.byteLength(raw, "utf8"),
      raw: raw !== null && capture.rawAllowed(ctx!.split) ? raw : null,
      error: null,
    });
  }

  return { raw, truncated, promptTokens, completionTokens, estUsd };
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
  let votes: EvalCaseResult["votes"] | undefined;
  const ctxFor = (voteIndex: number | null, voteCount: number | null): DispatchContext => ({
    runId,
    caseId: evalCase.id,
    split: evalCase.split,
    repetition,
    voteIndex,
    voteCount,
  });

  const prompt = buildCandidatePrompt(evalCase);
  switch (evalCase.workload) {
    case "map": {
      const c = evalCase as MapEvalCase;
      const out = await dispatchOnce(deps, cfg, prompt, { name: "doc_claims", schema: mapResponseSchema(c.input.docs.length) }, {
        temperature: 0.2,
        maxCompletionTokens: mapBatchMaxTokens(c.input.docs.length),
      }, ctxFor(null, 1));
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
        }, ctxFor(v, k));
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
      // 2026-09-04 parity: production dispatches K=MATCH_VOTES_DEFAULT (5)
      // rounds at temperature 0 and resolves them through resolveVoteRounds
      // (>=3 usable -> strict majority; 1-2 -> first round; 0 -> none). The
      // eval dispatches the same K rounds — sequentially, one reservation
      // per physical attempt (production fires them concurrently; the
      // resolution rule is identical) — parses/sanitizes each exactly as
      // production does, and applies the SAME resolution function. K=1 is
      // the explicitly labelled single-round diagnostic (preflight-gated).
      const k = evalValidationVotes();
      const claimIds = new Set(c.input.claims.map((cl) => cl.claimId));
      const rounds: LlmMatch[][] = [];
      const rawParts: string[] = [];
      for (let v = 0; v < k; v++) {
        const out = await dispatchOnce(deps, cfg, prompt, { name: "matches", schema: MATCH_RESPONSE_SCHEMA }, {
          temperature: 0, // the production match call's exact temperature
        }, ctxFor(k === 1 ? null : v, k));
        promptTokens += out.promptTokens;
        completionTokens += out.completionTokens;
        estUsd += out.estUsd;
        rawParts.push(out.raw ?? "");
        // KNOWN DIFFERENCE (stated, not hidden): production never inspects
        // finish_reason — a truncated vote is dropped there only because its
        // JSON fails to parse; under strict JSON output a truncated-but-
        // parseable body is practically unreachable, and the eval drops every
        // truncated vote outright (truncation is itself a finding).
        if (out.truncated) continue;
        // PRODUCTION PARITY (llmMatchOnce: `content ?? '{"matches":[]}'`): a
        // null-content response — the shape a strict-schema REFUSAL takes —
        // is an EMPTY, USABLE round in production (all-null votes that still
        // count in the majority denominator). Mirror it exactly.
        const body = out.raw ?? '{"matches":[]}';
        try {
          const parsed = (JSON.parse(body) as { matches?: LlmMatch[] }).matches ?? [];
          rounds.push(sanitizeMatches(parsed, c.input.takeaways.length, claimIds));
        } catch {
          // unparseable vote: dropped (production: the vote promise rejects and is skipped)
        }
      }
      // K=1 keeps the historical single-response digest byte-for-byte
      rawOutputDigest = sha256(rawParts.join("\n---\n"));
      const resolved = resolveVoteRounds(rounds, c.input.takeaways.length);
      const mode: NonNullable<EvalCaseResult["votes"]>["mode"] = k === VALIDATION_VOTES_PRODUCTION ? "production-equivalent" : "single-round-diagnostic";
      if (resolved === null) {
        status = "schema_invalid";
        checks = { pass: false, failures: [`match response unparseable or truncated (0 of ${k} vote round(s) usable)`] };
        votes = { requested: k, usable: 0, mode, matcher: "llm", perTakeaway: null };
      } else {
        checks = scoreValidationCase(c, resolved.matches).checks;
        votes = {
          requested: k,
          usable: resolved.voteRounds,
          mode,
          matcher: resolved.matcher,
          perTakeaway: resolved.votes ? resolved.votes.map((t) => ({ i: t.i, v: t.v, final: t.final })) : null,
        };
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
    configKey: liveConfigKey(cfg.model, cfg.reasoningEffort, cfg.provider),
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
    ...(votes !== undefined ? { votes } : {}),
  };
}

/** Physical vote/dispatch count a case will make — the denominator an
 *  abandoned-attempt record reports against. */
export function liveVoteCount(evalCase: AnalysisEvalCase): number | null {
  if (evalCase.workload === "digest") return reduceVotes();
  if (evalCase.workload === "validation") return evalValidationVotes();
  if (evalCase.workload === "reduce") return null;
  return 1;
}

// ============================================================================
// The live sweep — durable per-case persistence, abort accounting, capture
// ============================================================================

export interface LiveSweepArgs {
  deps: LiveDeps;
  cfg: EvalCandidateDispatchConfig;
  dataset: AnalysisEvalDataset;
  header: ResultsFileHeader;
  /** the file to resume into (null = start empty from `header`) */
  existing: EvalResultsFile | null;
  work: PendingWorkItem[];
  runId: string;
  knobs: EvalEnvKnobs;
  /** durable write after EVERY state change (result row, abandoned record,
   *  capture-run record) — the ONLY side effect besides dispatch and capture */
  persist: (rf: EvalResultsFile) => void;
  log: (line: string) => void;
  logError: (line: string) => void;
  now?: () => Date;
}

export interface LiveSweepAbort {
  kind: "budget_stop" | "capture_write_failure";
  caseId: string;
  repetition: number;
  message: string;
  /** what the abandoned case had already done (all metered before the abort) */
  responsesReceived: number;
  estUsd: number;
}

export interface LiveSweepOutcome {
  rf: EvalResultsFile;
  status: "complete" | "aborted";
  abort: LiveSweepAbort | null;
  captureRun: CaptureRunRecord | null;
}

function snapshotMeter(m: MeterDelta): MeterDelta {
  return { attempts: m.attempts, reservations: m.reservations, meterings: m.meterings, erroredAttempts: m.erroredAttempts };
}

function meterDeltaSince(before: MeterDelta, now: MeterDelta): MeterDelta {
  return {
    attempts: now.attempts - before.attempts,
    reservations: now.reservations - before.reservations,
    meterings: now.meterings - before.meterings,
    erroredAttempts: now.erroredAttempts - before.erroredAttempts,
  };
}

function usageDeltaSince(before: UsageTotals, now: UsageTotals): UsageTotals {
  return {
    promptTokens: now.promptTokens - before.promptTokens,
    completionTokens: now.completionTokens - before.completionTokens,
    estUsd: now.estUsd - before.estUsd,
  };
}

/** The whole live loop, moved out of the CLI so its accounting is unit-
 *  testable. Semantics (each pinned in live-runner.test.ts):
 *  - inapplicable cases are recorded durably, never dispatched;
 *  - a completed case is merged + persisted immediately (resume-safe);
 *  - a provider error records a provider_error row (gates fail on it) with
 *    the case's PARTIAL metered usage in `partialUsage`;
 *  - a budget stop or a capture write failure ABORTS the sweep: the
 *    interrupted case gets NO result key (it is pending again on resume) but
 *    its physical attempts, meterings, tokens and USD are folded into the
 *    file's meter and recorded as an `abandonedAttempts` entry — so the
 *    ledger reconciles and nothing is fabricated; completed keys are never
 *    rerun;
 *  - with capture on, the capture-run record is stamped "incomplete" BEFORE
 *    the first dispatch and upgraded to "complete" (with file hashes) only
 *    when every work item finished. */
export async function runLiveSweep(args: LiveSweepArgs): Promise<LiveSweepOutcome> {
  const { deps, cfg, dataset, header, work, runId, knobs, persist, log, logError } = args;
  const now = args.now ?? (() => new Date());
  const configKey = header.configKey;
  let rf = args.existing ?? emptyEvalResultsFile(header);
  const capture = deps.capture;
  if (capture !== null) {
    rf = mergeEvalResults(rf, header, [], ZERO_METER, now(), { captureRun: capture.initialRecord() });
    persist(rf);
  }

  const finishCapture = (outcome: "complete" | "aborted", reason: string | null): CaptureRunRecord | null => {
    if (capture === null) return null;
    const record = capture.finish(outcome, reason);
    rf = mergeEvalResults(rf, header, [], ZERO_METER, now(), { captureRun: record });
    persist(rf);
    return record;
  };

  for (const item of work) {
    // corpus-v2: classify applicability BEFORE any dispatch — an inapplicable
    // case is recorded durably (zero meter, nothing dispatched, nothing
    // billed), one row per requested repetition, so completeness holds
    const applicability = classifyCaseApplicability(item.evalCase, knobs);
    if (!applicability.applicable && applicability.requirement !== null) {
      const req = applicability.requirement;
      const row = inapplicableResult(item.evalCase, dataset.datasetVersion, runId, configKey, item.repetition, {
        required: { [req.kind]: req.required },
        actual: { [req.knob]: req.actual },
        reason: applicability.reason ?? "structurally inapplicable",
      });
      rf = mergeEvalResults(rf, header, [row], ZERO_METER, now());
      persist(rf);
      log(`  ${item.evalCase.id}#r${item.repetition} status=inapplicable (${applicability.reason}) — not dispatched`);
      continue;
    }
    const meterBefore = snapshotMeter(deps.meter);
    const usageBefore = { ...deps.usage };
    let result: EvalCaseResult;
    try {
      result = await runLiveCase(deps, cfg, item.evalCase, dataset.datasetVersion, runId, item.repetition);
    } catch (e) {
      const meterDelta = meterDeltaSince(meterBefore, deps.meter);
      const usageDelta = usageDeltaSince(usageBefore, deps.usage);
      if (e instanceof LlmBudgetError || e instanceof CaptureWriteError) {
        const kind: LiveSweepAbort["kind"] = e instanceof LlmBudgetError ? "budget_stop" : "capture_write_failure";
        const message = capture ? capture.redact(e.message) : sanitizeMessage(e.message);
        const abandoned: AbandonedAttemptRecord = {
          runId,
          caseId: item.evalCase.id,
          repetition: item.repetition,
          split: item.evalCase.split,
          reason: kind,
          code: e instanceof LlmBudgetError ? (e.reserveCode ?? null) : null,
          message,
          at: now().toISOString(),
          responsesReceived: meterDelta.meterings,
          voteCount: liveVoteCount(item.evalCase),
          meter: meterDelta,
          promptTokens: usageDelta.promptTokens,
          completionTokens: usageDelta.completionTokens,
          estUsd: usageDelta.estUsd,
        };
        // the interrupted case's physical attempts ARE in the ledger — fold
        // them into the file meter and keep the history; NO result key
        rf = mergeEvalResults(rf, header, [], meterDelta, now(), { abandoned: [abandoned] });
        persist(rf);
        const captureRun = finishCapture("aborted", `${kind}: ${message}`);
        logError(
          `\nABORT — INVALID RUN: ${kind === "budget_stop" ? "budget-degraded" : "capture write failed"} (${message}). ` +
            `${item.evalCase.id}#r${item.repetition} abandoned after ${meterDelta.attempts} physical attempt(s) / ${meterDelta.meterings} metered response(s) / $${usageDelta.estUsd.toFixed(4)} — recorded in abandonedAttempts, NOT as a result. ` +
            `${Object.keys(rf.results).length} completed result(s) stay durable; a rerun resumes from the abandoned case. This partial run must NOT be read as a scorecard.`,
        );
        return {
          rf,
          status: "aborted",
          abort: { kind, caseId: item.evalCase.id, repetition: item.repetition, message, responsesReceived: meterDelta.meterings, estUsd: usageDelta.estUsd },
          captureRun,
        };
      }
      // provider error: record it durably (the gates fail on providerError>0)
      const msg = capture ? capture.redact(e instanceof Error ? e.message : String(e)) : sanitizeMessage(e instanceof Error ? e.message : String(e));
      result = {
        caseId: item.evalCase.id,
        datasetVersion: dataset.datasetVersion,
        runId,
        configKey,
        repetition: item.repetition,
        attempt: meterDelta.attempts,
        status: "provider_error",
        latencyMs: null,
        promptTokens: null,
        completionTokens: null,
        estUsd: null,
        checks: { pass: false, failures: [`provider error: ${msg}`] },
        humanLabels: null,
        graderJudgments: null,
        rawOutputDigest: "",
        partialUsage: {
          responsesReceived: meterDelta.meterings,
          promptTokens: usageDelta.promptTokens,
          completionTokens: usageDelta.completionTokens,
          estUsd: usageDelta.estUsd,
        },
      };
      logError(`  ${item.evalCase.id} PROVIDER ERROR: ${msg}`);
    }
    const meterDelta = meterDeltaSince(meterBefore, deps.meter);
    rf = mergeEvalResults(rf, header, [result], meterDelta, now());
    persist(rf); // durable after EVERY completed case
    log(
      `  ${item.evalCase.id}#r${item.repetition} status=${result.status} pass=${result.checks.pass} ` +
        `$${(result.estUsd ?? result.partialUsage?.estUsd ?? 0).toFixed(4)} ${result.latencyMs ?? "—"}ms`,
    );
  }
  const captureRun = finishCapture("complete", null);
  return { rf, status: "complete", abort: null, captureRun };
}

/** Build the live deps for a REAL run: for OpenAI the shared factory client
 *  (maxRetries: 0), for every other vendor plain fetch through its own pure
 *  request module; plus the fail-closed eval guard on THAT vendor's ledger
 *  row. Only the script's authorized --execute-live path calls this. Capture
 *  is attached by the CLI afterwards (it needs the results header identity the
 *  CLI assembles).
 *
 *  The OpenAI client is built ONLY for an OpenAI run: constructing it for an
 *  Anthropic cell would read OPENAI_API_KEY the preflight never required. */
export async function buildLiveDeps(
  provider: AnalysisProviderId = ANALYSIS_DEFAULT_PROVIDER,
): Promise<LiveDeps> {
  const guard = evalGuardFromEnv(provider);
  await guard.init();
  return {
    client: provider === "openai" ? analysisOpenAiClient() : null,
    guard,
    meter: { attempts: 0, reservations: 0, meterings: 0, erroredAttempts: 0 },
    usage: { ...ZERO_USAGE },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    capture: null,
  };
}

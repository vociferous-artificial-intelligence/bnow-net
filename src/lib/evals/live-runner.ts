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
import { reduceVotes, synthesisResponseSchema } from "../analysis/synthesize";
import type { Track } from "../analysis/tracks";
import {
  REASONING_EFFORT_VALUES,
  analysisChatParams,
  type AnalysisReasoningEffort,
} from "../llm/model-config";
import { ANALYSIS_ROUTING_REGISTRY_VERSION, analysisApproval } from "../llm/analysis-registry";
import { PRICES_PER_MTOK, estimateCostUsd } from "../llm/pricing";
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
  model: string;
  reasoningCapable: boolean;
  reasoningEffort: AnalysisReasoningEffort | null;
  /** "baseline" ONLY when the analysis approval registry holds this exact
   *  (workload, model, effort) as a status-"baseline" entry — the registered
   *  production configuration, registry-resolved. Everything else is
   *  "evaluation_candidate" (the isolated bypass). */
  approval: "baseline" | "evaluation_candidate";
}

const REASONING_MODEL = /^(gpt-5|o\d)/; // mirror of model-config's split

/** Resolve a model for evaluation dispatch. Validates pricing (an unpriced
 *  model still refuses — its spend could only be guessed, ruling 4's spirit)
 *  and reasoning effort (allowlist; effort on a non-reasoning model refuses).
 *  A combination the analysis approval registry records as status "baseline"
 *  (the registered production configuration, e.g. gpt-4o-mini/effort-absent)
 *  is resolved THROUGH the registry and stamped approval "baseline". Any
 *  other priced combination deliberately BYPASSES the analysis-registry
 *  approval and the map activation lock, stamping approval
 *  "evaluation_candidate" into every artifact so no candidate output can
 *  masquerade as production-approved. */
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
  // Registry-backed baseline identity: the registered production baseline
  // must never be stamped as an evaluation candidate (its results ARE the
  // production configuration's). Only a status-"baseline" registry verdict
  // resolves here; a future "evaluated_candidate" registry entry still takes
  // the bypass stamp — its eval artifacts describe candidate dispatches.
  const verdict = analysisApproval(workload, model, reasoningEffort);
  const approval: EvalCandidateDispatchConfig["approval"] =
    verdict.approved && verdict.status === "baseline" ? "baseline" : "evaluation_candidate";
  return { workload, model, reasoningCapable, reasoningEffort, approval };
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

  const errorLine = (attemptIndex: number, seq: number | null, e: unknown) => {
    if (capture === null || seq === null) return;
    const err = e as { name?: string; status?: number; message?: string };
    capture.write({
      ...base(attemptIndex)!,
      kind: "attempt_end",
      attemptSeq: seq,
      outcome: "error",
      requestedModel: cfg.model,
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
      capture.write({ ...base(attemptIndex)!, kind: "attempt_start", attemptSeq: seq, requestedModel: cfg.model });
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

  const choice = completion.choices[0];
  const promptTokens = completion.usage?.prompt_tokens ?? 0;
  const completionTokens = completion.usage?.completion_tokens ?? 0;
  const estUsd = estimateCostUsd(cfg.model, promptTokens, completionTokens);
  // ruling 8: record the billed usage BEFORE any parse/discard decision —
  // truncated and unparseable responses are billed in full by the provider
  await deps.guard.record(1, promptTokens + completionTokens, estUsd);
  deps.meter.meterings++;
  deps.usage.promptTokens += promptTokens;
  deps.usage.completionTokens += completionTokens;
  deps.usage.estUsd += estUsd;

  const raw = choice?.message?.content ?? null;
  const truncated = choice?.finish_reason === "length";
  if (capture !== null && seq !== null) {
    const msg = choice?.message as { refusal?: string | null } | undefined;
    capture.write({
      ...base(attemptIndex)!,
      kind: "attempt_end",
      attemptSeq: seq,
      outcome: "response",
      requestedModel: cfg.model,
      returnedModel: typeof completion.model === "string" ? completion.model : null,
      responseId: typeof completion.id === "string" ? completion.id : null,
      systemFingerprint: typeof completion.system_fingerprint === "string" ? completion.system_fingerprint : null,
      finishReason: choice?.finish_reason ?? null,
      refused: typeof msg?.refusal === "string" && msg.refusal.length > 0,
      // refusal TEXT is model output: only where raw capture is authorized
      refusal: typeof msg?.refusal === "string" && capture.rawAllowed(ctx!.split) ? msg.refusal : null,
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
        if (out.raw === null || out.truncated) continue; // an unusable vote is dropped, as production drops a failed vote
        try {
          const parsed = (JSON.parse(out.raw) as { matches?: LlmMatch[] }).matches ?? [];
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

/** Build the live deps for a REAL run: the shared factory client (maxRetries:
 *  0) + the fail-closed openai_eval guard. Only the script's authorized
 *  --execute-live path calls this. Capture is attached by the CLI afterwards
 *  (it needs the results header identity the CLI assembles). */
export async function buildLiveDeps(): Promise<LiveDeps> {
  const guard = evalGuardFromEnv();
  await guard.init();
  return {
    client: analysisOpenAiClient(),
    guard,
    meter: { attempts: 0, reservations: 0, meterings: 0, erroredAttempts: 0 },
    usage: { ...ZERO_USAGE },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    capture: null,
  };
}

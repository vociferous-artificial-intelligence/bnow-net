// Workload-scoped cloud-model routing for the ANALYSIS pipelines: map, reduce
// (mapreduce digest synthesis), legacy digest extraction, ISW validation
// matching, and the entity audit. This module is the ONE authority for "which
// PROVIDER and model does this workload dispatch, at what reasoning effort" —
// call sites must not read OPENAI_MODEL / *_MODEL / *_REASONING_EFFORT /
// *_PROVIDER directly.
//
// The ASK pipeline is deliberately NOT routed here: ASK_ANSWER_MODEL /
// ASK_RERANK_MODEL stay in src/lib/ask/config.ts and Ask's per-model parameter
// shaping stays in src/lib/ask/llm-params.ts, because Ask's models are gated by
// the scorecard registry (src/lib/ask/registry.ts) and its cache identity —
// contracts this module must not silently re-home.
//
// Contracts (all test-pinned in model-config.test.ts):
// - Resolution happens at CALL time. Nothing here snapshots the environment at
//   module import (the pre-existing `MAP_MODEL = process.env… ?? …` const did,
//   which froze test/config changes and hid the reduce stage's coupling).
// - Provider per workload: <WORKLOAD>_PROVIDER, default openai, validated
//   against the per-workload allowlist in providers.ts BEFORE anything else is
//   interpreted (every allowlist is {openai} today, so this is a refusal
//   surface, not a routing surface). ANALYSIS_PROVIDER is NOT read here — it
//   keeps its own stub/anthropic meaning in src/lib/analysis/provider.ts.
// - Precedence per workload: <WORKLOAD>_MODEL → OPENAI_MODEL → gpt-4o-mini,
//   for provider openai ONLY; any other provider requires an explicit
//   <WORKLOAD>_MODEL. Values are trimmed; blank/whitespace-only are ABSENT.
// - Reasoning effort per workload: <WORKLOAD>_REASONING_EFFORT, validated
//   against the documented allowlist (minimal|low|medium|high). Absent = no
//   reasoning_effort parameter is ever added — existing payloads are preserved
//   exactly. Invalid values FAIL CLOSED at workloadDispatchConfig(), before any
//   provider dispatch.
// - Unpriced models FAIL CLOSED: a model with no entry in the metering price
//   table (src/lib/llm/pricing.ts PRICES_PER_MTOK) FOR THE RESOLVED PROVIDER
//   must not dispatch, because
//   its spend could only be estimated by the conservative unknown-model
//   ceiling — good enough as defense-in-depth, not good enough to knowingly
//   run a pipeline on (standing ruling 4's fail-closed spirit). Activating a
//   new model therefore requires adding its verified price to pricing.ts
//   first; pricing.ts stays the single price authority (the Ask registry
//   parity-pins it).
// - analysisChatParams() is the analysis-side compatibility shim: reasoning
//   models (gpt-5 family, o-series) never receive `temperature` (they reject
//   non-default values); non-reasoning models keep today's exact
//   `temperature` (+ optional `max_completion_tokens`) payload shape.

import {
  ANALYSIS_ROUTING_REGISTRY_VERSION,
  analysisApproval,
  type AnalysisApprovalStatus,
} from "./analysis-registry";
import { pricedFor } from "./pricing";
import {
  ANALYSIS_DEFAULT_PROVIDER,
  ANALYSIS_PROVIDER_IDS,
  WORKLOAD_PROVIDER_ALLOWLIST,
  analysisReasoningCapable,
  isAnalysisProviderId,
  type AnalysisProviderId,
  type AnalysisWorkload,
} from "./providers";

// AnalysisWorkload moved to providers.ts (the leaf module the price table, the
// approval registry and this file can all import without a cycle). Re-exported
// here so every historical `from "./model-config"` import keeps working.
export type { AnalysisWorkload, AnalysisProviderId };

export const ANALYSIS_DEFAULT_MODEL = "gpt-4o-mini";

/** Documented reasoning_effort allowlist (Chat Completions, gpt-5 family). */
export const REASONING_EFFORT_VALUES = ["minimal", "low", "medium", "high"] as const;
export type AnalysisReasoningEffort = (typeof REASONING_EFFORT_VALUES)[number];

const WORKLOAD_ENV: Record<
  AnalysisWorkload,
  { model: string; effort: string; provider: string }
> = {
  map: { model: "MAP_MODEL", effort: "MAP_REASONING_EFFORT", provider: "MAP_PROVIDER" },
  reduce: { model: "REDUCE_MODEL", effort: "REDUCE_REASONING_EFFORT", provider: "REDUCE_PROVIDER" },
  digest: { model: "DIGEST_MODEL", effort: "DIGEST_REASONING_EFFORT", provider: "DIGEST_PROVIDER" },
  validation: { model: "VALIDATION_MODEL", effort: "VALIDATION_REASONING_EFFORT", provider: "VALIDATION_PROVIDER" },
  entity_audit: { model: "ENTITY_AUDIT_MODEL", effort: "ENTITY_AUDIT_REASONING_EFFORT", provider: "ENTITY_AUDIT_PROVIDER" },
};

export const ANALYSIS_WORKLOADS = Object.keys(WORKLOAD_ENV) as AnalysisWorkload[];

/** HARD MAP ACTIVATION LOCK (release hardening 2026-08-17). The map production
 *  route may dispatch ONLY this baseline: changing MAP_MODEL or a validated
 *  MAP_REASONING_EFFORT changes mapExtractorVersion(), but it does NOT remap
 *  historical documents — map-worker selects `processed = false` docs only, so
 *  a version bump silently starves every consumer of current-version claims
 *  until the version-aware remap path (OPEN-TASKS #33) exists. Pricing or
 *  quality-registry approval alone must NOT bypass this lock; a dedicated
 *  remap PR (version-aware candidate selection, corpus-remap cost estimate,
 *  resume/checkpoint behavior, consumer-filter validation, explicit operator
 *  authorization) deliberately relaxes it. There is NO env override. Reduce
 *  model changes are independent and never trip this lock. */
export const MAP_BASELINE = { model: ANALYSIS_DEFAULT_MODEL, reasoningEffort: null } as const;

/** Trimmed env value; unset / blank / whitespace-only → null (absent). */
function envStr(name: string): string | null {
  const v = process.env[name];
  if (v === undefined) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export interface WorkloadModelConfig {
  workload: AnalysisWorkload;
  /** the vendor that WOULD dispatch for this workload */
  provider: AnalysisProviderId;
  providerSource: "workload" | "default";
  providerEnvVar: string;
  /** trimmed raw provider env value (null when absent) — kept for diagnostics */
  providerRaw: string | null;
  /** the model that WOULD dispatch for this workload */
  model: string;
  modelSource: "workload" | "openai_model" | "default";
  modelEnvVar: string;
  /** model has an exact entry in the metering price table (pricing.ts) FOR
   *  the resolved provider */
  priced: boolean;
  /** model accepts reasoning_effort / rejects temperature */
  reasoningCapable: boolean;
  /** validated effort, or null when the env is absent or invalid */
  reasoningEffort: AnalysisReasoningEffort | null;
  /** trimmed raw effort env value (null when absent) — kept for diagnostics */
  effortRaw: string | null;
  effortEnvVar: string;
  /** (workload, provider, model, effort) has an analysis-registry approval */
  approved: boolean;
  /** approval status when approved; null otherwise */
  approvalStatus: AnalysisApprovalStatus | null;
  /** the registry version this resolution was judged against */
  registryVersion: string;
  /** null = dispatchable; otherwise the human-readable fail-closed reason */
  dispatchBlocked: string | null;
}

/** Thrown by workloadDispatchConfig() when the resolved configuration must not
 *  dispatch. Typed so callers can distinguish a config refusal from provider
 *  errors; every site surfaces it BEFORE any reservation or billed call. */
export class ModelConfigError extends Error {
  readonly code = "MODEL_CONFIG";
  constructor(
    readonly workload: AnalysisWorkload,
    reason: string,
  ) {
    super(`model-config: ${workload} — ${reason}`);
    this.name = "ModelConfigError";
  }
}

/** Resolve one workload's provider + model + effort. NEVER throws — safe for
 *  read-side consumers (extractor versioning, provider tags, the dry-run
 *  inspector). Dispatch paths must go through workloadDispatchConfig() instead.
 *
 *  `allowlist` is injectable for TESTS ONLY, on the same footing as
 *  analysisApproval()'s `registry` parameter: it lets the post-widening
 *  refusal branches (which the shipped {openai}-everywhere allowlist makes
 *  unreachable) be exercised before a widening PR relies on them. It is
 *  deliberately NOT threaded through workloadDispatchConfig(), so no dispatch
 *  site can widen its own allowlist — pinned in model-config.test.ts. */
export function resolveWorkloadModel(
  workload: AnalysisWorkload,
  allowlist: Record<
    AnalysisWorkload,
    ReadonlySet<AnalysisProviderId>
  > = WORKLOAD_PROVIDER_ALLOWLIST,
): WorkloadModelConfig {
  const env = WORKLOAD_ENV[workload];

  // PROVIDER first. Everything downstream — which price table row applies,
  // whether a reasoning effort is even a thing, which registry row can approve
  // the dispatch — is provider-relative, so an unknown or disallowed vendor is
  // refused before any of it is interpreted.
  const providerRaw = envStr(env.provider);
  const providerKnown = providerRaw === null || isAnalysisProviderId(providerRaw);
  const provider: AnalysisProviderId = providerKnown
    ? ((providerRaw ?? ANALYSIS_DEFAULT_PROVIDER) as AnalysisProviderId)
    : ANALYSIS_DEFAULT_PROVIDER; // placeholder only: dispatchBlocked is set below
  const providerAllowed = providerKnown && allowlist[workload].has(provider);
  const providerSource: WorkloadModelConfig["providerSource"] =
    providerRaw !== null ? "workload" : "default";

  const workloadModel = envStr(env.model);
  const globalModel = envStr("OPENAI_MODEL");
  // OPENAI_MODEL and the gpt-4o-mini default are OPENAI defaults and must not
  // silently name a model on another vendor; a non-OpenAI provider therefore
  // requires its own explicit <WORKLOAD>_MODEL (refused below when absent).
  //
  // Scoped to an ALLOWED provider on purpose (ruling 13). This function never
  // throws and read-side consumers use it — above all mapExtractorVersion(),
  // whose basis is `cfg.model`. If a REFUSED provider blanked the model, then
  // `MAP_PROVIDER=anthropic` — which cannot dispatch anything — would still
  // shift every map extractor version, and every doc_claims consumer would
  // silently see zero current-version rows. A refused configuration therefore
  // keeps the historical OpenAI-shaped resolution; it is dispatchBlocked below
  // regardless, so nothing can act on it.
  const model =
    provider === "openai" || !providerAllowed
      ? (workloadModel ?? globalModel ?? ANALYSIS_DEFAULT_MODEL)
      : (workloadModel ?? "");
  const modelSource: WorkloadModelConfig["modelSource"] =
    workloadModel !== null ? "workload" : globalModel !== null ? "openai_model" : "default";

  const priced = model !== "" && pricedFor(provider, model);
  const reasoningCapable = analysisReasoningCapable(provider, model);

  const effortRaw = envStr(env.effort);
  const effortValid =
    effortRaw !== null &&
    (REASONING_EFFORT_VALUES as readonly string[]).includes(effortRaw.toLowerCase());
  const reasoningEffort = effortValid
    ? (effortRaw!.toLowerCase() as AnalysisReasoningEffort)
    : null;

  const approval = analysisApproval(workload, provider, model, reasoningEffort);

  let dispatchBlocked: string | null = null;
  if (providerRaw === "stub") {
    dispatchBlocked = `${env.provider}=stub is not a dispatch provider (ANALYSIS_PROVIDER=stub is the offline switch) — failing closed`;
  } else if (!providerKnown) {
    dispatchBlocked = `${env.provider}="${providerRaw}" is not a known provider (known: ${ANALYSIS_PROVIDER_IDS.join("|")}) — failing closed`;
  } else if (!providerAllowed) {
    dispatchBlocked = `provider "${provider}" is not allowed for workload "${workload}" (allowed: ${[...allowlist[workload]].join("|")}) — failing closed`;
  } else if (provider !== "openai" && workloadModel === null) {
    dispatchBlocked = `${env.provider}=${provider} requires an explicit ${env.model} (OPENAI_MODEL and the default model apply to provider openai only) — failing closed`;
  } else if (effortRaw !== null && !effortValid) {
    dispatchBlocked = `invalid ${env.effort}="${effortRaw}" (allowed: ${REASONING_EFFORT_VALUES.join("|")}) — failing closed`;
  } else if (reasoningEffort !== null && !reasoningCapable) {
    dispatchBlocked =
      provider === "openai"
        ? `${env.effort}=${reasoningEffort} set for non-reasoning model "${model}" — failing closed`
        : `${env.effort}=${reasoningEffort} set for provider "${provider}", which accepts no reasoning effort in this release — failing closed`;
  } else if (
    workload === "map" &&
    (model !== MAP_BASELINE.model || reasoningEffort !== MAP_BASELINE.reasoningEffort)
  ) {
    // the hard activation lock outranks pricing/approval messaging: even a
    // priced AND registry-approved map candidate must not dispatch until the
    // version-aware remap path exists and activation is explicitly authorized
    dispatchBlocked = `MAP ACTIVATION BLOCKED: map may dispatch only the baseline (${MAP_BASELINE.model}, no reasoning effort). A non-baseline map model/effort changes mapExtractorVersion() WITHOUT remapping historical documents (map-worker selects processed=false only) — a version-aware remap implementation (OPEN-TASKS #33) and explicit operator activation authorization are required first; pricing or scorecard approval alone does not unlock this`;
  } else if (!priced) {
    dispatchBlocked =
      provider === "openai"
        ? `model "${model}" has no entry in the metering price table (src/lib/llm/pricing.ts) — refusing to dispatch unpriced`
        : `model "${model}" is not priced for provider "${provider}" in the metering price table (src/lib/llm/pricing.ts) — refusing to dispatch unpriced`;
  } else if (!approval.approved) {
    dispatchBlocked = approval.reason;
  }

  return {
    workload,
    provider,
    providerSource,
    providerEnvVar: env.provider,
    providerRaw,
    model,
    modelSource,
    modelEnvVar: env.model,
    priced,
    reasoningCapable,
    reasoningEffort,
    effortRaw,
    effortEnvVar: env.effort,
    approved: approval.approved,
    approvalStatus: approval.approved ? approval.status : null,
    registryVersion: ANALYSIS_ROUTING_REGISTRY_VERSION,
    dispatchBlocked,
  };
}

/** What a dispatch site needs: the model, effort, and the approval identity
 *  that authorized it (persisted with every output — see dispatchIdentity). */
export interface AnalysisDispatchConfig {
  workload: AnalysisWorkload;
  provider: AnalysisProviderId;
  model: string;
  reasoningCapable: boolean;
  reasoningEffort: AnalysisReasoningEffort | null;
  approvalStatus: AnalysisApprovalStatus;
  registryVersion: string;
}

/** Resolve for DISPATCH: throws ModelConfigError (fail closed, BEFORE any
 *  reservation and BEFORE any provider client construction) when the provider
 *  is unknown or outside this workload's allowlist, the configuration is
 *  invalid, the model is unpriced FOR THAT PROVIDER, the exact (workload,
 *  provider, model, effort) is quality-unapproved, or the map activation lock
 *  applies. Call this before building any provider request. */
export function workloadDispatchConfig(workload: AnalysisWorkload): AnalysisDispatchConfig {
  const cfg = resolveWorkloadModel(workload);
  if (cfg.dispatchBlocked !== null) throw new ModelConfigError(workload, cfg.dispatchBlocked);
  return {
    workload,
    provider: cfg.provider,
    model: cfg.model,
    reasoningCapable: cfg.reasoningCapable,
    reasoningEffort: cfg.reasoningEffort,
    // dispatchBlocked === null implies approval passed, so status is set
    approvalStatus: cfg.approvalStatus as AnalysisApprovalStatus,
    registryVersion: cfg.registryVersion,
  };
}

/** The durable identity persisted alongside every analysis output (digest
 *  structured.stats, validation details, map/entity-audit cron counts): enough
 *  to reconstruct which model configuration produced the output WITHOUT
 *  consulting the current environment. Built from the SAME dispatch config
 *  object the billed call used — never re-read from env after the fact.
 *  reasoningEffort is explicit `null` for "absent" so the record always
 *  answers the effort question. Contains no secret and no prompt content. */
export interface AnalysisDispatchIdentity {
  workload: AnalysisWorkload;
  provider: AnalysisProviderId;
  model: string;
  reasoningEffort: AnalysisReasoningEffort | null;
  registryVersion: string;
  approval: AnalysisApprovalStatus;
}

export function dispatchIdentity(cfg: AnalysisDispatchConfig): AnalysisDispatchIdentity {
  return {
    workload: cfg.workload,
    provider: cfg.provider,
    model: cfg.model,
    reasoningEffort: cfg.reasoningEffort,
    registryVersion: cfg.registryVersion,
    approval: cfg.approvalStatus,
  };
}

/** Analysis-side chat.completions parameter shim.
 *
 *  Non-reasoning models keep the EXACT historical payload shape:
 *  `{ temperature }` (+ `max_completion_tokens` when the site sets a ceiling) —
 *  key order preserved, so default requests are byte-identical to main.
 *
 *  Reasoning models (gpt-5 family / o-series) NEVER receive `temperature`
 *  (they reject non-default values); they keep `max_completion_tokens`
 *  (reasoning tokens bill inside it) and add `reasoning_effort` only when the
 *  workload's effort env is set and validated. */
export function analysisChatParams(
  cfg: Pick<AnalysisDispatchConfig, "reasoningCapable" | "reasoningEffort">,
  opts: { temperature: number; maxCompletionTokens?: number },
): Record<string, unknown> {
  if (cfg.reasoningCapable) {
    return {
      ...(opts.maxCompletionTokens !== undefined
        ? { max_completion_tokens: opts.maxCompletionTokens }
        : {}),
      ...(cfg.reasoningEffort !== null ? { reasoning_effort: cfg.reasoningEffort } : {}),
    };
  }
  return {
    temperature: opts.temperature,
    ...(opts.maxCompletionTokens !== undefined
      ? { max_completion_tokens: opts.maxCompletionTokens }
      : {}),
  };
}

/** The full resolved matrix — the dry-run inspector's data source
 *  (scripts/model-routing-inspect.ts). Read-only; no provider contact. */
export function workloadModelMatrix(): WorkloadModelConfig[] {
  // explicit arity: Array.map passes (value, index, array), and
  // resolveWorkloadModel's second parameter is the test-only allowlist
  return ANALYSIS_WORKLOADS.map((w) => resolveWorkloadModel(w));
}

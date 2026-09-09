// AnalysisProvider: the single LLM seam. Implementations must never invent
// sources — every claim carries docIds drawn from the input batch, validated
// downstream before insert (and again by the DB constraint trigger).

export interface AnalysisInputDoc {
  id: number;
  title: string | null;
  content: string;
  lang: string | null;
  sourceKey: string | null;
  reliability: number | null;
  url: string | null;
  publishedAt: string | null;
}

export interface ClaimEntity {
  name: string; // canonical English
  kind: "person" | "agency" | "company" | "faction" | "org";
  role: string; // defendant|prosecutor|target|beneficiary|appointee|dismissed|patron|other
}

export interface ExtractedClaim {
  text: string; // English, concise, one assertion
  claimType: "factual" | "assessment";
  hedging: "confirmed" | "claimed" | "unverified" | "assessed" | "unknown";
  docIds: number[]; // MUST be non-empty, MUST reference input docs
  entities?: ClaimEntity[]; // elite-politics track: involved actors
}

export interface ExtractedEvent {
  title: string; // English, short
  type: string; // strike|advance|air_defense|political|economic|other
  summary: string;
  claims: ExtractedClaim[];
}

export interface DigestAnalysis {
  events: ExtractedEvent[];
  provider: string;
  /** Durable model-dispatch identity (release hardening 2026-08-17), set by
   *  the OpenAI and Anthropic providers from the exact config their billed
   *  call used; the stub spends nothing, so it alone omits it. digest.ts
   *  persists it into structured.stats. */
  dispatch?: import("../llm/model-config").AnalysisDispatchIdentity;
}

/** Token/cost accounting for ONE billed LLM request. */
export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  estUsd: number;
  /** the response hit the output ceiling: billed in full, then discarded */
  truncated: boolean;
}

export interface AnalyzeOptions {
  /** override system prompt (elite-politics track); null/undefined = default military */
  systemPrompt?: string | null;
  track?: string;
  /** Called once per BILLED request, truncated ones included — the caller
   *  accumulates across the truncation ladder into digests.structured.stats.llm.
   *  Providers that spend nothing (stub) never call it. */
  onUsage?: (usage: LlmUsage) => void;
}

export interface AnalysisProvider {
  readonly name: string;
  analyze(
    countryIso2: string,
    date: string,
    docs: AnalysisInputDoc[],
    opts?: AnalyzeOptions,
  ): Promise<DigestAnalysis>;
}

/** The refusal `ANALYSIS_PROVIDER=anthropic` raises. Rewritten by the #83
 *  wiring (2026-09-06, step 20b): the seam is now routed, guarded and metered,
 *  so the objection is no longer "this provider is unsafe" but "this env is
 *  the wrong switch". `ANALYSIS_PROVIDER` names a legacy binary choice with no
 *  model, no effort and no allowlist behind it; the routing seam decides the
 *  digest vendor per workload, through gates that can refuse. Honouring the
 *  legacy env would put a second, gate-free selection path next to the one the
 *  rulings are enforced on — so it stays refused, and the message says which
 *  switch to use instead. */
export const ANTHROPIC_NOT_REGISTERED =
  "provider anthropic is selected by DIGEST_PROVIDER=anthropic plus an approved " +
  "DIGEST_MODEL, never by ANALYSIS_PROVIDER — see OPEN-TASKS #83. ANALYSIS_PROVIDER " +
  "carries no model, no reasoning effort and no per-workload allowlist, so honouring " +
  "it here would be a second selection path around the routing seam's gates";

/** Thrown when ANALYSIS_PROVIDER names a provider that exists in the tree but is
 *  not admissible. Typed and fail-closed in the same class as ModelConfigError:
 *  raised BEFORE the provider module is imported, before its key is read, and
 *  before any reservation or provider client exists. Carries no "truncated", so
 *  digest.ts's ladder rethrows it immediately instead of burning smaller rungs. */
export class AnalysisProviderError extends Error {
  readonly code = "ANALYSIS_PROVIDER";
  constructor(
    readonly provider: string,
    reason: string,
  ) {
    super(`analysis-provider: ${provider} — ${reason}`);
    this.name = "AnalysisProviderError";
  }
}

/** Select the analysis provider.
 *
 *  Selection order, and what it deliberately does NOT do:
 *  - `ANALYSIS_PROVIDER=stub` always wins — the deterministic extractive path.
 *  - `ANALYSIS_PROVIDER=anthropic` is REFUSED, key or no key. The seam is
 *    wired and metered now (step 20b), so the refusal is no longer about
 *    safety: this env is simply the wrong switch, and keeping a second,
 *    gate-free selection path beside the routing seam is how the gates get
 *    bypassed later. See ANTHROPIC_NOT_REGISTERED.
 *  - The digest VENDOR comes from the routing seam:
 *    `resolveWorkloadModel("digest").provider`. Read deliberately from the
 *    RESOLVED provider rather than a dispatchable one — a `DIGEST_PROVIDER=
 *    anthropic` that is blocked (unpriced, unapproved, or off the allowlist)
 *    still selects the Anthropic provider, whose `analyze()` then throws typed
 *    and loud. Falling back to OpenAI there would silently bill the wrong
 *    vendor's budget for a configuration the operator did not ask for.
 *  - There is NO "only an Anthropic key exists" branch. It used to select an
 *    unmetered seam silently, which made a single environment variable — one
 *    present in the operator's `.env.local` — enough to route production
 *    analysis around rulings 4 and 8. Key presence never selects a provider.
 *  Absent all of the above, an OpenAI key selects OpenAI and nothing selects
 *  the stub, which spends nothing and invents nothing. */
export async function getProvider(): Promise<AnalysisProvider> {
  const forced = process.env.ANALYSIS_PROVIDER;
  if (forced === "stub") {
    const { StubProvider } = await import("./stub-provider");
    return new StubProvider();
  }
  if (forced === "anthropic") {
    throw new AnalysisProviderError("anthropic", ANTHROPIC_NOT_REGISTERED);
  }
  // resolveWorkloadModel never throws — safe here, where the caller has not
  // yet decided to dispatch anything
  const { resolveWorkloadModel } = await import("../llm/model-config");
  if (resolveWorkloadModel("digest").provider === "anthropic") {
    const { AnthropicProvider } = await import("./anthropic-provider");
    return new AnthropicProvider();
  }
  if (process.env.OPENAI_API_KEY) {
    const { OpenAiProvider } = await import("./openai-provider");
    return new OpenAiProvider();
  }
  const { StubProvider } = await import("./stub-provider");
  return new StubProvider();
}

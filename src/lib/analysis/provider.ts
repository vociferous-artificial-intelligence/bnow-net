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
   *  the OpenAI provider from the exact config its billed call used; the stub
   *  spends nothing and the Anthropic seam is a separately-blocked follow-up,
   *  so both omit it. digest.ts persists it into structured.stats. */
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

/** The one refusal message the Anthropic seam raises today, exported so the
 *  eventual wiring (OPEN-TASKS #83) has to REPLACE this constant rather than
 *  route around it, and so tests pin the exact operator-facing wording. */
export const ANTHROPIC_NOT_REGISTERED =
  "provider anthropic is not registered/metered — see OPEN-TASKS #83: it passes no " +
  "workloadDispatchConfig() gate (no priced model, no analysis-registry approval) and " +
  "no SpendGuard reservation, so selecting it would bypass standing rulings 4 and 8";

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
 *  Selection order and what it deliberately does NOT do (2026-09-06, step 09):
 *  - `ANALYSIS_PROVIDER=stub` always wins — the deterministic extractive path.
 *  - `ANALYSIS_PROVIDER=anthropic` is REFUSED, key or no key. The seam is
 *    implemented but unmetered and unregistered, so honouring it would have
 *    dispatched a billed call with no `workloadDispatchConfig()` gate, no
 *    `SpendGuard.tryReserve()` and no dispatch identity.
 *  - There is NO "only an Anthropic key exists" branch any more. It used to
 *    select the same unmetered seam silently, which made a single environment
 *    variable — one now present in the operator's `.env.local` — enough to route
 *    production analysis around both rulings. Absent an OpenAI key the stub is
 *    the correct fallback: it spends nothing and invents nothing.
 *  Restoring Anthropic means wiring it through `src/lib/llm/model-config.ts`, the
 *  analysis registry and `pricing.ts` with its own metered `anthropic_digest`
 *  provider row — i.e. replacing the refusal, not removing it. */
export async function getProvider(): Promise<AnalysisProvider> {
  const forced = process.env.ANALYSIS_PROVIDER;
  if (forced === "stub") {
    const { StubProvider } = await import("./stub-provider");
    return new StubProvider();
  }
  if (forced === "anthropic") {
    throw new AnalysisProviderError("anthropic", ANTHROPIC_NOT_REGISTERED);
  }
  if (process.env.OPENAI_API_KEY) {
    const { OpenAiProvider } = await import("./openai-provider");
    return new OpenAiProvider();
  }
  const { StubProvider } = await import("./stub-provider");
  return new StubProvider();
}

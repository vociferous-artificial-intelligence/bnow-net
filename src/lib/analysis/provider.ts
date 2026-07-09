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

export async function getProvider(): Promise<AnalysisProvider> {
  const forced = process.env.ANALYSIS_PROVIDER;
  if (forced === "stub") {
    const { StubProvider } = await import("./stub-provider");
    return new StubProvider();
  }
  if (forced === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    const { AnthropicProvider } = await import("./anthropic-provider");
    return new AnthropicProvider();
  }
  if (process.env.OPENAI_API_KEY) {
    const { OpenAiProvider } = await import("./openai-provider");
    return new OpenAiProvider();
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const { AnthropicProvider } = await import("./anthropic-provider");
    return new AnthropicProvider();
  }
  const { StubProvider } = await import("./stub-provider");
  return new StubProvider();
}

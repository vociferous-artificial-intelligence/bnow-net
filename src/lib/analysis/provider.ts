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

export interface ExtractedClaim {
  text: string; // English, concise, one assertion
  claimType: "factual" | "assessment";
  hedging: "confirmed" | "claimed" | "unverified" | "assessed" | "unknown";
  docIds: number[]; // MUST be non-empty, MUST reference input docs
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

export interface AnalysisProvider {
  readonly name: string;
  analyze(countryIso2: string, date: string, docs: AnalysisInputDoc[]): Promise<DigestAnalysis>;
}

export async function getProvider(): Promise<AnalysisProvider> {
  const forced = process.env.ANALYSIS_PROVIDER;
  if (forced === "stub") {
    const { StubProvider } = await import("./stub-provider");
    return new StubProvider();
  }
  if (process.env.OPENAI_API_KEY) {
    const { OpenAiProvider } = await import("./openai-provider");
    return new OpenAiProvider();
  }
  const { StubProvider } = await import("./stub-provider");
  return new StubProvider();
}

// The Anthropic Messages request/parse pair, as a pure module.
//
// No fetch, no env, no client, no guard — it turns arguments into a
// `{url, init}` and a response body into typed usage. The provider composes it
// with the guard and the routing gate; the eval seam (PLAN-WS-2 §5.4,
// PR-2.2-B3) reuses the same two functions, so an evaluation and production
// cannot drift into sending different requests to the same vendor.
//
// Raw fetch, deliberately: adding an SDK for one dormant workload would grow
// the production dependency surface and `import-graph.test.ts`'s allowed list
// for no capability the two functions below do not already provide.

/** Anthropic's dated API contract header. Bumping it is a request change and
 *  needs its own re-observation, so it is a named constant, not a literal. */
export const ANTHROPIC_API_VERSION = "2023-06-01";

export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

/** Wall-clock ceiling for one Messages call — the same 120 s the seam has
 *  always used, and the same order of magnitude as the route's maxDuration. */
export const ANTHROPIC_TIMEOUT_MS = 120_000;

export interface AnthropicRequestArgs {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
  apiKey: string;
}

export interface AnthropicHttpRequest {
  url: string;
  init: RequestInit;
}

export function buildMessagesRequest(args: AnthropicRequestArgs): AnthropicHttpRequest {
  return {
    url: ANTHROPIC_MESSAGES_URL,
    init: {
      method: "POST",
      headers: {
        "x-api-key": args.apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: args.model,
        max_tokens: args.maxTokens,
        temperature: args.temperature,
        system: args.system,
        messages: [{ role: "user", content: args.user }],
      }),
      signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
    },
  };
}

export interface AnthropicParsedResponse {
  /** concatenation of every text block, "" when the response carried none */
  text: string;
  /** end_turn | max_tokens | stop_sequence | tool_use | null */
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
  /** the model the vendor says answered; null when absent */
  model: string | null;
}

/** Read usage and content out of a Messages response body.
 *
 *  Total function: every field degrades rather than throwing, because the
 *  caller meters BEFORE it parses (ruling 8) and a parse that threw would
 *  strand a billed response outside the ledger. A body that carries nothing
 *  recognisable returns zero tokens and empty text, and the caller's own
 *  emptiness handling decides what that means. */
export function parseMessagesResponse(json: unknown): AnthropicParsedResponse {
  const body = (json ?? {}) as {
    content?: unknown;
    stop_reason?: unknown;
    model?: unknown;
    usage?: { input_tokens?: unknown; output_tokens?: unknown };
  };
  const blocks = Array.isArray(body.content) ? body.content : [];
  const text = blocks
    .filter(
      (b): b is { type: string; text: string } =>
        typeof b === "object" &&
        b !== null &&
        (b as { type?: unknown }).type === "text" &&
        typeof (b as { text?: unknown }).text === "string",
    )
    .map((b) => b.text)
    .join("");
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    text,
    stopReason: typeof body.stop_reason === "string" ? body.stop_reason : null,
    inputTokens: num(body.usage?.input_tokens),
    outputTokens: num(body.usage?.output_tokens),
    model: typeof body.model === "string" ? body.model : null,
  };
}

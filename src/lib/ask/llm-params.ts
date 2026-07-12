// Per-model chat-completion parameter mapping for the ASK v2 pipeline (Tier-2+
// sprint, 2026-07-11). The gpt-5 family (/^gpt-5/) REJECTS a non-default
// `temperature` and takes `max_completion_tokens` (reasoning tokens bill as output)
// plus an optional `reasoning_effort`; every other model keeps the classic
// `max_tokens` + `temperature` pair. Both the rerank stage (workstream C) and the
// answer stage (workstream D) build their chat.completions params through here, so
// the gpt-5-vs-gpt-4o-mini split lives in exactly one place (WORKLOG DL-1).

/** gpt-5-family id test — the reasoning models that reject `temperature` and meter
 *  reasoning tokens inside `max_completion_tokens`. */
const GPT5_FAMILY = /^gpt-5/;

export interface ChatParamOpts {
  /** gpt-5 reasoning-budget hint; emitted only for gpt-5 models, ignored otherwise. */
  reasoningEffort?: "minimal" | "low";
  /** sampling temperature for non-gpt-5 models (default 0.1); dropped for gpt-5,
   *  which rejects any non-default temperature. */
  temperature?: number;
}

/** Map (model, output-token ceiling, opts) to the chat.completions params for that
 *  model:
 *   - gpt-5*: `{ max_completion_tokens }` (+ `reasoning_effort` when supplied) —
 *     never a `temperature`, even if one is passed in opts.
 *   - else:  `{ max_tokens, temperature }` with temperature defaulting to 0.1 and no
 *     `reasoning_effort`.
 *  Returns a plain Record so both stages can spread it straight into create(). */
export function chatParamsForModel(
  model: string,
  maxCompletionTokens: number,
  opts?: { reasoningEffort?: "minimal" | "low"; temperature?: number },
): Record<string, unknown> {
  if (GPT5_FAMILY.test(model)) {
    const params: Record<string, unknown> = { max_completion_tokens: maxCompletionTokens };
    if (opts?.reasoningEffort !== undefined) params.reasoning_effort = opts.reasoningEffort;
    return params;
  }
  return { max_tokens: maxCompletionTokens, temperature: opts?.temperature ?? 0.1 };
}

import {
  LlmBudgetError,
  anthropicDigestGuardFromEnv,
  assertLlmEnabled,
  digestMaxOutputTokens,
} from "../usage/llm-guard";
import {
  ModelConfigError,
  dispatchIdentity,
  resolveWorkloadModel,
  workloadDispatchConfig,
} from "../llm/model-config";
import { estimateCostUsd } from "../llm/pricing";
import { buildMessagesRequest, parseMessagesResponse } from "./anthropic-dispatch";
import { dropIsolatedSurrogates, wellFormedSlice } from "../text/well-formed-slice";
import {
  AnalysisProviderError,
  type AnalysisInputDoc,
  type AnalysisProvider,
  type AnalyzeOptions,
  type DigestAnalysis,
  type ExtractedEvent,
} from "./provider";
import { ENTITY_RULES } from "./tracks";

// Anthropic (Claude) analysis provider — same contract as the OpenAI provider.
// Plain fetch (no SDK dependency); requests strict JSON in the prompt and parses
// defensively. Downstream guards (docId validation, uncited-claim dropping) apply
// regardless of provider, so a malformed response degrades to an empty digest,
// never to fabricated citations.
//
// WIRED, METERED, AND STILL DORMANT (2026-09-06, step 20b / OPEN-TASKS #83).
// What step 09 refused outright is now routed instead: this provider resolves
// its model through `workloadDispatchConfig("digest")` — so it fails closed on
// an unpriced or quality-unapproved model before anything is reserved — passes
// `SpendGuard.tryReserve()` on its OWN `anthropic_digest` ledger row, records
// every received response BEFORE parsing it (ruling 8, truncated ones
// included), and returns the durable dispatch identity `digest.ts` persists.
// `getProvider()` selects it ONLY from `DIGEST_PROVIDER=anthropic`, never from
// the presence of a key.
//
// It still dispatches nothing, and that is a property of the GATES, not of a
// missing branch: no Anthropic model holds an `analysis-reg-v1` approval, so
// every resolution is `dispatchBlocked` and `analyze()` throws typed and loud.
// Widening the digest allowlist was not an approval. Activating this path needs
// a paid representative evaluation, a reviewed registry entry and explicit
// operator authorization — in that order.
//
// Repaired earlier and unchanged here (OPEN-TASKS #97(a)): the provider-bound
// document line no longer truncates with a bare UTF-16 code-unit `.slice`, and
// a missing key throws a typed error instead of asserting non-null into a
// request header.

/** One provider-bound document line. Same 400-code-unit budget and same
 *  whitespace normalization as before — and byte-identical output for every
 *  input the old `.slice(0, 400)` handled correctly (all-BMP text, which is all
 *  Cyrillic/Ukrainian/Persian/Arabic source text). The only change is at the
 *  truncation point: `wellFormedSlice` cannot leave the high half of an astral
 *  pair stranded at the ceiling, and `dropIsolatedSurrogates` sweeps the composed
 *  line. An orphaned half survives `JSON.stringify` as the literal escape
 *  `\udXXX`, which the receiving strict parser refuses — the whole request dies,
 *  the identical mechanism as map's #86 and the reduce/digest/embeddings sites
 *  already repaired under #97. Deliberately the same shape as
 *  `openai-provider.ts`'s `digestDocLine`; the equality is test-pinned. */
export function anthropicDocLine(d: AnalysisInputDoc): string {
  return dropIsolatedSurrogates(
    `[${d.id}] (${d.sourceKey ?? "unknown"}, rel=${d.reliability?.toFixed(2) ?? "?"}) ${wellFormedSlice(
      ((d.title ? d.title + ". " : "") + d.content).replace(/\s+/g, " "),
      400,
    )}`,
  );
}

const SYSTEM = `You are an OSINT analyst producing a daily conflict digest.
Input: numbered source documents (id, source, reliability 0-1, text; Russian/Ukrainian/English).
Output: significant events of the day with specific claims, as JSON only.

HARD RULES:
1. Every claim MUST cite docIds — only ids that appear in the input. Never invent ids.
2. A claim is ONE atomic assertion in English (translate as needed), <= 200 chars.
3. hedging: 'confirmed' only for visually/geolocation-corroborated facts;
   'claimed' for single-party assertions; 'unverified' for uncorroborated reports;
   'assessed' for analytic judgments (mark those claimType='assessment').
4. Prefer events corroborated by multiple independent sources.
5. Weigh source reliability: low-reliability sources need corroboration before their
   claims lead an event.
6. 5-12 events, most significant first. Do not editorialize beyond the evidence.

${ENTITY_RULES}

Respond with ONLY a JSON object, no prose, matching:
{"events":[{"title":str,"type":"strike|advance|air_defense|political|economic|other","summary":str,"claims":[{"text":str,"claimType":"factual|assessment","hedging":"confirmed|claimed|unverified|assessed|unknown","docIds":[int],"entities":[{"name":str,"kind":"person|agency|company|faction|org","role":str}]}]}]}`;

/** Extract the first JSON object from a model response (tolerates code fences). */
export function parseEventsJson(raw: string): ExtractedEvent[] {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
      events?: ExtractedEvent[];
    };
    return Array.isArray(parsed.events) ? parsed.events : [];
  } catch {
    return [];
  }
}

export class AnthropicProvider implements AnalysisProvider {
  /** A getter, not a field: the model is resolved when read, exactly as the
   *  dispatch resolves it.
   *
   *  Guarded by `providerAllowed` for the same reason the mapreduce tag is
   *  (ruling 13): a REFUSED provider keeps the historical OpenAI-shaped model,
   *  so `anthropic:${cfg.model}` on a refused resolution would name an OpenAI
   *  model as a Claude one. `digests.provider` is a durable field, and a false
   *  vendor attribution written there is the defect decision T4-b exists to
   *  prevent. A refused configuration cannot dispatch anyway — `analyze()`
   *  throws before any request — so this string is only ever read from a log. */
  get name(): string {
    const cfg = resolveWorkloadModel("digest");
    return cfg.provider === "anthropic" && cfg.providerAllowed
      ? `anthropic:${cfg.model}`
      : "anthropic:unresolved";
  }

  /** Dispatch order, pinned in anthropic-provider.test.ts because every step
   *  is a ruling:
   *    assertLlmEnabled            ruling 9 — the digest sites throw typed
   *    workloadDispatchConfig      ruling 4 — config refused before any spend
   *    key presence                typed, never a `!` into a header
   *    guard.init + tryReserve     ruling 4 — reserve BEFORE the request
   *    fetch  (429: sleep, RESERVE AGAIN, one retry)
   *    guard.record                ruling 8 — meter BEFORE parse/discard
   *    truncation throw            recorded first, then discarded
   *    parse + dispatch identity */
  async analyze(
    countryIso2: string,
    date: string,
    docs: AnalysisInputDoc[],
    opts?: AnalyzeOptions,
  ): Promise<DigestAnalysis> {
    assertLlmEnabled("anthropic digest extract");
    // Fail closed BEFORE the key is read, before the guard exists and before
    // any request is built. The message carries no "truncated", so digest.ts's
    // ladder rethrows it immediately instead of burning the smaller rungs.
    const dispatch = workloadDispatchConfig("digest");
    if (dispatch.provider !== "anthropic") {
      // unreachable through getProvider(), which selects this class only on a
      // resolved anthropic digest provider — but a direct construction must
      // not be able to bill Claude against an OpenAI-approved model
      throw new ModelConfigError(
        "digest",
        `anthropic-provider constructed for a digest workload that resolves to provider "${dispatch.provider}" — refusing to dispatch`,
      );
    }
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey)
      throw new AnalysisProviderError(
        "anthropic",
        "ANTHROPIC_API_KEY is not set — refusing to dispatch",
      );
    const docLines = docs.map(anthropicDocLine).join("\n");

    const system = opts?.systemPrompt
      ? `${opts.systemPrompt}\n\nRespond with ONLY the JSON object described for the default digest format.`
      : SYSTEM;

    // built per attempt, not once: `init.signal` is an AbortSignal.timeout,
    // and reusing an already-started one would abort the retry immediately
    const request = () =>
      buildMessagesRequest({
        model: dispatch.model,
        system,
        user: `Theater: ${countryIso2.toUpperCase()} · Date: ${date}\n\nDocuments:\n${docLines}`,
        maxTokens: digestMaxOutputTokens(),
        temperature: 0.2,
        apiKey,
      });

    const guard = anthropicDigestGuardFromEnv();
    await guard.init();
    const reserve = () => {
      const r = guard.tryReserve();
      if (!r.ok) throw new LlmBudgetError(r.reason, r.code);
    };

    const send = async () => {
      const { url, init } = request();
      return fetch(url, init);
    };

    reserve();
    let res = await send();
    if (res.status === 429) {
      // the 429 itself was never billed; the retry takes its OWN reservation
      await new Promise((r) => setTimeout(r, 65_000));
      reserve();
      res = await send();
    }
    if (!res.ok)
      throw new Error(
        `anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`,
      );

    const parsed = parseMessagesResponse(await res.json());
    // ruling 8: meter the RECEIVED response before any parse or discard
    // decision — a truncated response is billed for every token it emitted
    const estUsd = estimateCostUsd(dispatch.model, parsed.inputTokens, parsed.outputTokens);
    const truncated = parsed.stopReason === "max_tokens";
    await guard.record(1, parsed.inputTokens + parsed.outputTokens, estUsd);
    opts?.onUsage?.({
      promptTokens: parsed.inputTokens,
      completionTokens: parsed.outputTokens,
      estUsd,
      truncated,
    });
    // the word "truncated" is load-bearing: digest.ts's ladder keys off it to
    // retry with fewer documents rather than rethrowing
    if (truncated)
      throw new Error("anthropic-provider: response truncated (stop_reason=max_tokens)");

    const events = parseEventsJson(parsed.text);
    if (events.length === 0 && parsed.text.length > 0 && !parsed.text.includes('"events"'))
      console.error("anthropic-provider: response carried no events JSON");
    // durable dispatch identity, built from the SAME config the billed call
    // used — digest.ts persists it into structured.stats
    return { events, provider: this.name, dispatch: dispatchIdentity(dispatch) };
  }
}

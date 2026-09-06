import { assertLlmEnabled } from "../usage/llm-guard";
import { dropIsolatedSurrogates, wellFormedSlice } from "../text/well-formed-slice";
import {
  AnalysisProviderError,
  type AnalysisInputDoc,
  type AnalysisProvider,
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
// DORMANT AND UNSELECTABLE (2026-09-06, step 09 — OPEN-TASKS #83). `getProvider()`
// refuses `ANALYSIS_PROVIDER=anthropic` outright and no longer auto-selects this
// class when an Anthropic key is the only key present, so nothing in the tree can
// reach `analyze()` in production. That is deliberate: this provider passes NO
// `workloadDispatchConfig()` gate (its model is neither priced in
// `src/lib/llm/pricing.ts` nor approved in `src/lib/llm/analysis-registry.ts`),
// takes NO `SpendGuard.tryReserve()`, records NO `provider_usage` row, and returns
// NO dispatch identity — standing rulings 4 and 8 in three places.
//
// Before this provider may be selected again it needs, in one reviewed change:
// routing through `src/lib/llm/model-config.ts` (so a Claude model resolves per
// workload and fails closed when unpriced/unapproved), an `analysis-reg-v1` entry
// carrying its promotion scorecard, prices in `pricing.ts`, and a metered
// `anthropic_digest` provider row guarded and recorded exactly as
// `openai-provider.ts` does — replacing `getProvider()`'s refusal, never bypassing
// it. Metering is deliberately NOT added here.
//
// What IS repaired here (OPEN-TASKS #97(a)): the provider-bound document line no
// longer truncates with a bare UTF-16 code-unit `.slice`, the model is resolved at
// call time rather than snapshotted at module import, and a missing key throws a
// typed error instead of asserting non-null into a request header.

/** Resolved at CALL time, never snapshotted at module import — a module-load
 *  const froze the value for every later config or test change (the same defect
 *  the routing seam removed from the map stage). Deliberately NOT routed through
 *  `model-config.ts`: doing so is the #83 wiring, not this repair. */
export function anthropicModel(): string {
  const raw = process.env.ANTHROPIC_MODEL?.trim();
  return raw && raw.length > 0 ? raw : "claude-sonnet-5";
}

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
  // a getter, not a field: the model is resolved when read, like the model itself
  get name(): string {
    return `anthropic:${anthropicModel()}`;
  }

  async analyze(
    countryIso2: string,
    date: string,
    docs: AnalysisInputDoc[],
    opts?: { systemPrompt?: string | null; track?: string },
  ): Promise<DigestAnalysis> {
    // Kill-switch first (ruling 9: the digest sites throw typed), then the key.
    // Both precede any request construction, so neither can reach the network.
    assertLlmEnabled("anthropic digest extract");
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey)
      throw new AnalysisProviderError(
        "anthropic",
        "ANTHROPIC_API_KEY is not set — refusing to dispatch",
      );
    const model = anthropicModel();
    const docLines = docs.map(anthropicDocLine).join("\n");

    const system = opts?.systemPrompt
      ? `${opts.systemPrompt}\n\nRespond with ONLY the JSON object described for the default digest format.`
      : SYSTEM;

    const request = () =>
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          temperature: 0.2,
          system,
          messages: [
            {
              role: "user",
              content: `Theater: ${countryIso2.toUpperCase()} · Date: ${date}\n\nDocuments:\n${docLines}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(120_000),
      });

    let res = await request();
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 65_000));
      res = await request();
    }
    if (!res.ok)
      throw new Error(
        `anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`,
      );

    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const raw = json.content?.find((b) => b.type === "text")?.text ?? "";
    const events = parseEventsJson(raw);
    if (events.length === 0 && raw.length > 0 && !raw.includes('"events"'))
      console.error("anthropic-provider: response carried no events JSON");
    return { events, provider: this.name };
  }
}

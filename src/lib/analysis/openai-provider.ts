import OpenAI from "openai";
import {
  LlmBudgetError,
  assertLlmEnabled,
  digestGuardFromEnv,
  digestMaxOutputTokens,
  estimateUsd,
} from "../usage/llm-guard";
import type {
  AnalysisInputDoc,
  AnalysisProvider,
  AnalyzeOptions,
  DigestAnalysis,
  ExtractedEvent,
} from "./provider";
import { ENTITY_RULES } from "./tracks";

// OpenAI structured-output extraction. Hard rules enforced downstream too:
// claims may only cite docIds present in the input batch; uncited claims are dropped.
//
// Every request passes the digest SpendGuard first and is recorded to
// provider_usage afterwards — INCLUDING responses the truncation ladder throws
// away, which OpenAI bills in full (PIPELINE-AUDIT-2026-07 §4d, §7c).

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    events: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          type: {
            type: "string",
            enum: ["strike", "advance", "air_defense", "political", "economic", "other"],
          },
          summary: { type: "string" },
          claims: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                text: { type: "string" },
                claimType: { type: "string", enum: ["factual", "assessment"] },
                hedging: {
                  type: "string",
                  enum: ["confirmed", "claimed", "unverified", "assessed", "unknown"],
                },
                docIds: { type: "array", items: { type: "integer" } },
                entities: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      name: { type: "string" },
                      kind: {
                        type: "string",
                        enum: ["person", "agency", "company", "faction", "org"],
                      },
                      role: { type: "string" },
                    },
                    required: ["name", "kind", "role"],
                  },
                },
              },
              required: ["text", "claimType", "hedging", "docIds", "entities"],
            },
          },
        },
        required: ["title", "type", "summary", "claims"],
      },
    },
  },
  required: ["events"],
} as const;

const SYSTEM = `You are an OSINT analyst producing a daily conflict digest.
Input: numbered source documents (id, source, reliability 0-1, text; Russian/Ukrainian/English).
Output: significant events of the day with specific claims.

HARD RULES:
1. Every claim MUST cite docIds — only ids that appear in the input. Never invent ids.
2. A claim is ONE atomic assertion in English (translate as needed), <= 200 chars.
3. hedging: 'confirmed' only for visually/geolocation-corroborated facts;
   'claimed' for single-party assertions; 'unverified' for uncorroborated reports;
   'assessed' for analytic judgments (mark those claimType='assessment').
4. Prefer events corroborated by multiple independent sources; note single-source items as such.
5. Weigh source reliability: low-reliability sources need corroboration before their
   claims lead an event.
6. 5-12 events, most significant first. Do not editorialize beyond the evidence.

${ENTITY_RULES}`;

export class OpenAiProvider implements AnalysisProvider {
  readonly name = `openai:${MODEL}`;
  private client = new OpenAI();

  async analyze(
    countryIso2: string,
    date: string,
    docs: AnalysisInputDoc[],
    opts?: AnalyzeOptions,
  ): Promise<DigestAnalysis> {
    assertLlmEnabled("digest extract");
    const docLines = docs
      .map(
        (d) =>
          `[${d.id}] (${d.sourceKey ?? "unknown"}, rel=${d.reliability?.toFixed(2) ?? "?"}) ${(
            (d.title ? d.title + ". " : "") + d.content
          )
            .replace(/\s+/g, " ")
            .slice(0, 400)}`,
      )
      .join("\n");

    const request = () =>
      this.client.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: opts?.systemPrompt ?? SYSTEM },
          {
            role: "user",
            content: `Theater: ${countryIso2.toUpperCase()} · Date: ${date}\n\nDocuments:\n${docLines}`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "digest", schema: RESPONSE_SCHEMA as never, strict: true },
        },
        temperature: 0.2,
        // Without this the model runs to its own 16,384-token ceiling before
        // truncating, and we are billed for every one of those tokens before the
        // ladder discards the response: UA 07-02 spent 94.8% of its digest cost on
        // two such throwaways (audit §4d). Measured real outputs are <= 1,448
        // pretty-JSON tokens (§4c), so 4096 is ~3x headroom and quarters the
        // worst-case waste.
        max_completion_tokens: digestMaxOutputTokens(),
      });

    // Caps are checked BEFORE each billed request; a refusal throws a typed
    // LlmBudgetError, whose message carries no "truncated" — so the caller's
    // ladder rethrows it immediately instead of burning the smaller rungs.
    const guard = digestGuardFromEnv();
    await guard.init();
    const reserve = () => {
      const r = guard.tryReserve();
      if (!r.ok) throw new LlmBudgetError(r.reason);
    };

    let completion;
    reserve();
    try {
      completion = await request();
    } catch (e) {
      // TPM window 429: one retry after the minute resets. The 429 itself was
      // never billed, so the retry needs its own reservation.
      if ((e as { status?: number }).status === 429) {
        await new Promise((r) => setTimeout(r, 65_000));
        reserve();
        completion = await request();
      } else throw e;
    }

    // Meter before interpreting: a truncated response is billed for every output
    // token it emitted and then discarded by the ladder. Recording it is the only
    // way that waste ever becomes visible.
    const choice = completion.choices[0];
    const promptTokens = completion.usage?.prompt_tokens ?? 0;
    const completionTokens = completion.usage?.completion_tokens ?? 0;
    const truncated = choice?.finish_reason === "length";
    const estUsd = estimateUsd(promptTokens, completionTokens);
    await guard.record(1, promptTokens + completionTokens, estUsd);
    opts?.onUsage?.({ promptTokens, completionTokens, estUsd, truncated });

    // Distinguish "analyzed fine, genuinely quiet day" from extraction failure:
    // refusals (null content) and truncated/unparseable JSON must THROW so the
    // caller never persists an empty digest over a previously good one.
    // Truncation is checked first: a response cut off at the ceiling can also
    // come back with empty content, and the ladder keys off the word "truncated".
    if (truncated) {
      throw new Error("openai-provider: response truncated (finish_reason=length)");
    }
    const raw = choice?.message?.content;
    if (!raw) {
      throw new Error(
        `openai-provider: empty content (finish=${choice?.finish_reason}, refusal=${choice?.message?.refusal ?? "n/a"})`,
      );
    }
    let events: ExtractedEvent[];
    try {
      events = (JSON.parse(raw) as { events: ExtractedEvent[] }).events ?? [];
    } catch {
      throw new Error("openai-provider: unparseable response JSON");
    }
    return { events, provider: this.name };
  }
}

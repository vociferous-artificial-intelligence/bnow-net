import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import type { SpendGuard } from "../usage/spend-guard";
import type { AnalysisDispatchConfig } from "../llm/model-config";
import { mapContentChars, mapDocLine, mapResponseSchema, mapSystemPrompt, mapUserMessage } from "./map-prompts";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const { extractBatch } = await import("./map-worker");

// OPEN-TASKS #86 — the provider-request boundary.
//
// The defect: `mapDocLine` truncated with a UTF-16 code-unit slice, so a cut
// landing between an astral character's high and low half left an UNPAIRED
// surrogate in the user message. `JSON.stringify` (well-formed since ES2019)
// emits that half as the literal escape `\udXXX`, which is legal JSON syntax
// but decodes to nothing valid — the provider answers
// `400 Invalid body: failed to parse JSON value` and the WHOLE micro-batch dies.
//
// These tests never touch the network and never make a paid call: the OpenAI
// client is a stub, and the "provider" is the strict JSON boundary below.

/** Independent oracle. Deliberately NOT the production helper — a test that
 *  reused `dropIsolatedSurrogates` could only prove the code agrees with
 *  itself. Lookaround-based, a different implementation strategy entirely. */
const ISOLATED_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** The deterministic fake request boundary. It serializes exactly as the SDK
 *  does, parses the JSON text back (which is where `\udXXX` escapes resurface
 *  as lone surrogates), and refuses any string that is not well-formed — the
 *  behaviour of the strict server-side parser that produces the observed 400. */
class InvalidBodyError extends Error {
  readonly status = 400;
  constructor(where: string) {
    super(`400 Invalid body: failed to parse JSON value (${where})`);
    this.name = "InvalidBodyError";
  }
}
function assertRequestParsable(params: unknown): void {
  const roundTripped: unknown = JSON.parse(JSON.stringify(params));
  const walk = (v: unknown, path: string): void => {
    if (typeof v === "string") {
      if (ISOLATED_SURROGATE.test(v)) throw new InvalidBodyError(path);
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${path}[${i}]`));
      return;
    }
    if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    }
  };
  walk(roundTripped, "$");
}

/** The truncation `mapDocLine` used BEFORE this repair, reproduced verbatim so
 *  the regression is differential: same inputs, old code vs new code. */
function legacyMapDocLine(d: {
  id: number;
  sourceKey: string | null;
  reliability: number | null;
  day: string;
  title: string | null;
  content: string;
}): string {
  const body = ((d.title ? d.title + ". " : "") + d.content).replace(/\s+/g, " ");
  return `[${d.id}] (${d.sourceKey ?? "unknown"}, rel=${d.reliability?.toFixed(2) ?? "?"}, ${d.day}) ${body.slice(0, mapContentChars())}`;
}

const ROCKET_HI = "\uD83D";
const ROCKET_LO = "\uDE80"; // U+1F680 ROCKET, as its two UTF-16 halves

const DISPATCH: AnalysisDispatchConfig = {
  workload: "map",
  model: "gpt-4o-mini",
  reasoningCapable: false,
  reasoningEffort: null,
  approvalStatus: "baseline",
  registryVersion: "analysis-reg-v1",
};

const emptyStats = () => ({
  llmCalls: 0, promptTokens: 0, completionTokens: 0, claims: 0, emptyDocs: 0,
  wrongDocIds: 0, duplicateEntries: 0, omittedDocs: 0, truncationSplits: 0,
  truncatedSingles: 0, quoteMisses: 0, batchErrors: 0, leaseLostDiscards: 0,
  leaseRenewals: 0,
});

function fakeGuard() {
  const tryReserve = vi.fn(() => ({ ok: true }) as const);
  const record = vi.fn(async () => {});
  return { guard: { tryReserve, record } as unknown as SpendGuard, tryReserve, record };
}

/** OpenAI stub that enforces the strict JSON boundary on the outgoing params
 *  and records them, so a test can assert on the exact request bytes. */
function boundaryClient(ids: number[]) {
  const seen: unknown[] = [];
  const create = vi.fn(async (params: unknown) => {
    assertRequestParsable(params); // throws 400 exactly like the provider
    seen.push(params);
    return {
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: JSON.stringify({
              results: ids.map((id) => ({ docId: id, claims: [] })),
            }),
          },
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    };
  });
  return { client: { chat: { completions: { create } } } as unknown as OpenAI, create, seen };
}

/** A doc whose composed body puts the ROCKET pair exactly across the content
 *  ceiling: high half at `limit - 1`, low half at `limit`. */
function poisonedDoc(id: number, title: string | null = null) {
  const limit = mapContentChars();
  const prefix = title ? title.length + 2 : 0; // `${title}. `
  const filler = "a".repeat(limit - 1 - prefix);
  return {
    id, theater: "ru", day: "2026-07-16", contentMd5: `md5-${id}`, text2k: `t${id}`,
    title, adapter: "telegram_web", sourceKey: "t.me/example", reliability: 0.5,
    content: `${filler}${ROCKET_HI}${ROCKET_LO} tail text after the boundary`,
  };
}

/** An ordinary doc: BMP text plus a COMPLETE astral pair well inside the limit. */
function cleanDoc(id: number) {
  return {
    id, theater: "ru", day: "2026-07-16", contentMd5: `md5-${id}`, text2k: `t${id}`,
    title: `Сводка ${id}`, adapter: "rss", sourceKey: "example.com", reliability: 0.42,
    content: `Удар по порту ${ROCKET_HI}${ROCKET_LO} — گزارش شده است — تم الإبلاغ عن ذلك. doc ${id}`,
  };
}

describe("#86 provider-request well-formedness", () => {
  it("the OLD truncation produces a request the strict boundary REJECTS", () => {
    const docs = [poisonedDoc(1)];
    const msg = mapUserMessage("military", "ru", [1], docs.map(legacyMapDocLine));
    expect(ISOLATED_SURROGATE.test(msg)).toBe(true);
    expect(() =>
      assertRequestParsable({ messages: [{ role: "user", content: msg }] }),
    ).toThrow(/400 Invalid body/);
    // and the mechanism is exactly the escape, not a raw byte
    expect(JSON.stringify(msg)).toContain("\\ud83d");
  });

  it("the NEW truncation produces a request the same boundary ACCEPTS", () => {
    const docs = [poisonedDoc(1)];
    const msg = mapUserMessage("military", "ru", [1], docs.map(mapDocLine));
    expect(ISOLATED_SURROGATE.test(msg)).toBe(false);
    expect(() =>
      assertRequestParsable({ messages: [{ role: "user", content: msg }] }),
    ).not.toThrow();
  });

  it("one poisoned doc no longer kills its 20-doc batch, and the schema stays pinned at 20", async () => {
    const docs = [poisonedDoc(1), ...Array.from({ length: 19 }, (_, i) => cleanDoc(i + 2))];
    const ids = docs.map((d) => d.id);
    expect(docs).toHaveLength(20);

    // OLD behaviour: the whole batch is rejected — one doc, twenty documents lost
    const legacyMsg = mapUserMessage("military", "ru", ids, docs.map(legacyMapDocLine));
    expect(() =>
      assertRequestParsable({ messages: [{ role: "user", content: legacyMsg }] }),
    ).toThrow(/400 Invalid body/);

    // NEW behaviour: the real dispatch path completes
    const { guard, tryReserve, record } = fakeGuard();
    const { client, create, seen } = boundaryClient(ids);
    const stats = emptyStats();
    const out = await extractBatch(client, guard, DISPATCH, "military", "ru", docs, stats);

    expect(out.size).toBe(20);
    expect(stats.batchErrors).toBe(0);
    expect(create).toHaveBeenCalledTimes(1); // no retry, no truncation split
    expect(tryReserve).toHaveBeenCalledTimes(1); // one reservation per physical dispatch
    expect(record).toHaveBeenCalledTimes(1); // metered exactly once
    expect(stats.llmCalls).toBe(1);

    const params = seen[0] as {
      messages: Array<{ role: string; content: string }>;
      response_format: { json_schema: { schema: { properties: { results: { minItems: number; maxItems: number } } } } };
    };
    // exact schema cardinality is untouched by this repair (ruling 7)
    expect(params.response_format.json_schema.schema.properties.results.minItems).toBe(20);
    expect(params.response_format.json_schema.schema.properties.results.maxItems).toBe(20);
    // no isolated surrogate anywhere in the FULL provider-bound request
    for (const m of params.messages) expect(ISOLATED_SURROGATE.test(m.content)).toBe(false);
    // NOT `ISOLATED_SURROGATE.test(JSON.stringify(params))` — that is vacuous:
    // JSON.stringify escapes a lone surrogate to ASCII `\udXXX`, so the serialized
    // TEXT can never contain an isolated surrogate code unit. The round trip is
    // what restores it, and that is exactly what the provider's parser does.
    expect(ISOLATED_SURROGATE.test(JSON.stringify(JSON.parse(JSON.stringify(params))))).toBe(false);
  });

  it("unaffected batches: the provider request is byte-identical to the old implementation", async () => {
    const docs = Array.from({ length: 20 }, (_, i) => cleanDoc(i + 1));
    const ids = docs.map((d) => d.id);
    const { guard } = fakeGuard();
    const { client, seen } = boundaryClient(ids);
    await extractBatch(client, guard, DISPATCH, "military", "ru", docs, emptyStats());

    const sent = seen[0] as { messages: Array<{ role: string; content: string }> };
    const legacyUser = mapUserMessage("military", "ru", ids, docs.map(legacyMapDocLine));
    expect(sent.messages[0].content).toBe(mapSystemPrompt("military", "ru"));
    expect(sent.messages[1].content).toBe(legacyUser); // byte-for-byte, not merely equivalent
    expect(JSON.stringify(sent.messages[1].content)).toBe(JSON.stringify(legacyUser));
    // and the schema object is the same shape the old code built
    expect(JSON.stringify(mapResponseSchema(20))).toBe(
      JSON.stringify(
        (sent as unknown as { response_format: { json_schema: { schema: unknown } } })
          .response_format.json_schema.schema,
      ),
    );
  });

  it("every resolved system prompt is well-formed too (the other half of the request)", () => {
    for (const [track, theater] of [
      ["military", "ru"],
      ["military", "ir"],
      ["elite_politics", "ru"],
      ["nuclear", "ir"],
    ] as const) {
      expect(ISOLATED_SURROGATE.test(mapSystemPrompt(track, theater))).toBe(false);
    }
  });

  // Weak by construction and labelled as such: the client is injected, so the spy
  // can only ever be uncalled. It pins that the dispatch path reaches for nothing
  // but its injected client; it is NOT evidence about a real provider.
  it("dispatches only through the injected stub client — no fetch, no paid request", async () => {
    const docs = [poisonedDoc(1), cleanDoc(2)];
    const { guard, record } = fakeGuard();
    const { client, create } = boundaryClient([1, 2]);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await extractBatch(client, guard, DISPATCH, "military", "ru", docs, emptyStats());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });
});

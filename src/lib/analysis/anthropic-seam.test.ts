import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { SpendGuard } from "../usage/spend-guard";
import { LlmDisabledError } from "../usage/llm-guard";
import { digestDocLine } from "./openai-provider";
import {
  AnalysisProviderError,
  ANTHROPIC_NOT_REGISTERED,
  getProvider,
} from "./provider";
import {
  AnthropicProvider,
  anthropicDocLine,
  anthropicModel,
} from "./anthropic-provider";
import type { AnalysisInputDoc } from "./provider";

// Step 09 (2026-09-06) — the Anthropic seam's activation bypass and #97(a).
//
// The bypass: `getProvider()` selected the unmetered, unregistered
// `AnthropicProvider` whenever `ANALYSIS_PROVIDER=anthropic` and a key existed, OR
// whenever an Anthropic key existed and an OpenAI key did not. That second branch
// meant ONE environment variable — now present in the operator's `.env.local` —
// routed every digest dispatch around `workloadDispatchConfig()` (ruling 4's
// configuration gate), around `SpendGuard.tryReserve()` (ruling 4's spend gate) and
// around the dispatch identity that ruling 8's metering persists.
//
// Nothing here touches the network or spends: `fetch` is stubbed in the one test
// that reaches a request, and the refusal tests assert `fetch` was never reached.

const DOC: AnalysisInputDoc = {
  id: 7,
  title: "Порт",
  content: "Удар по порту — гزارش شده است. doc 7",
  lang: "ru",
  sourceKey: "example.com",
  reliability: 0.42,
  url: null,
  publishedAt: null,
};

/** Independent oracle, deliberately NOT `dropIsolatedSurrogates` — a test reusing
 *  the production helper could only prove the code agrees with itself. Same
 *  lookaround strategy as `map-request-wellformed.test.ts`. */
const ISOLATED_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** The truncation this provider used BEFORE the repair, reproduced verbatim so the
 *  clip tests are differential: same inputs, old code vs new code. */
function legacyAnthropicDocLine(d: AnalysisInputDoc): string {
  return `[${d.id}] (${d.sourceKey ?? "unknown"}, rel=${d.reliability?.toFixed(2) ?? "?"}) ${(
    (d.title ? d.title + ". " : "") + d.content
  )
    .replace(/\s+/g, " ")
    .slice(0, 400)}`;
}

const ROCKET_HI = "\uD83D";
const ROCKET_LO = "\uDE80"; // U+1F680 ROCKET, as its two UTF-16 halves

/** A doc whose composed body puts the ROCKET pair exactly across the 400-code-unit
 *  ceiling: high half at index 399, low half at index 400. */
function poisonedDoc(id: number): AnalysisInputDoc {
  return {
    ...DOC,
    id,
    title: null,
    content: `${"a".repeat(399)}${ROCKET_HI}${ROCKET_LO} tail text after the boundary`,
  };
}

const ENV_KEYS = [
  "ANALYSIS_PROVIDER",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "DIGEST_MODEL",
  "LLM_DISABLE",
] as const;
const SAVED = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

let fetchSpy: MockInstance<typeof globalThis.fetch>;
let reserveSpy: MockInstance<SpendGuard["tryReserve"]>;

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  // any call here would be a real network request and a real bill — fail loudly
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
    throw new Error("test: unexpected network call");
  });
  reserveSpy = vi.spyOn(SpendGuard.prototype, "tryReserve");
});
afterEach(() => {
  fetchSpy.mockRestore();
  reserveSpy.mockRestore();
  for (const k of ENV_KEYS) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
});

describe("getProvider(): the Anthropic activation bypass is closed (#83)", () => {
  it("ANALYSIS_PROVIDER=anthropic + a key is REFUSED, before any fetch and before any reservation", async () => {
    process.env.ANALYSIS_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";

    await expect(getProvider()).rejects.toThrowError(AnalysisProviderError);
    await expect(getProvider()).rejects.toThrowError(/not registered\/metered/);
    await expect(getProvider()).rejects.toThrowError(/OPEN-TASKS #83/);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(reserveSpy).not.toHaveBeenCalled();
  });

  it("carries the typed refusal identity the wiring must replace, not route around", async () => {
    process.env.ANALYSIS_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    const err = await getProvider().then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(AnalysisProviderError);
    const e = err as AnalysisProviderError;
    expect(e.code).toBe("ANALYSIS_PROVIDER");
    expect(e.name).toBe("AnalysisProviderError");
    expect(e.provider).toBe("anthropic");
    expect(e.message).toBe(
      `analysis-provider: anthropic — ${ANTHROPIC_NOT_REGISTERED}`,
    );
    // no "truncated" anywhere: digest.ts's ladder must rethrow, not retry smaller
    expect(e.message).not.toContain("truncated");
  });

  it("refuses identically with NO key set — the key is never consulted", async () => {
    process.env.ANALYSIS_PROVIDER = "anthropic";
    await expect(getProvider()).rejects.toThrowError(AnalysisProviderError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("an Anthropic key ALONE (no OpenAI key) now selects the stub, never Anthropic", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    const p = await getProvider();
    // this is the branch that made one env var enough to bypass rulings 4 and 8
    expect(p.name).toBe("stub");
    expect(p).not.toBeInstanceOf(AnthropicProvider);
    expect(reserveSpy).not.toHaveBeenCalled();
  });

  it("an Anthropic key does not displace OpenAI when both are present", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    process.env.OPENAI_API_KEY = "sk-test-key";
    const p = await getProvider();
    expect(p.name).toBe("openai:gpt-4o-mini");
  });

  it("ANALYSIS_PROVIDER=stub still wins outright, key or no key", async () => {
    process.env.ANALYSIS_PROVIDER = "stub";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    process.env.OPENAI_API_KEY = "sk-test-key";
    expect((await getProvider()).name).toBe("stub");
  });

  it("no key at all is still the stub", async () => {
    expect((await getProvider()).name).toBe("stub");
  });
});

describe("AnthropicProvider.analyze(): refuses before any request (dormant seam)", () => {
  it("LLM_DISABLE=1 throws the same typed LlmDisabledError the OpenAI digest path throws", async () => {
    process.env.LLM_DISABLE = "1";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    const err = await new AnthropicProvider()
      .analyze("ru", "2026-09-06", [DOC])
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(err).toBeInstanceOf(LlmDisabledError);
    expect((err as LlmDisabledError).code).toBe("LLM_DISABLED");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a missing key throws typed BEFORE any fetch (no non-null assertion into the header)", async () => {
    const err = await new AnthropicProvider()
      .analyze("ru", "2026-09-06", [DOC])
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(err).toBeInstanceOf(AnalysisProviderError);
    expect((err as AnalysisProviderError).message).toMatch(
      /ANTHROPIC_API_KEY is not set/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a whitespace-only key is treated as absent", async () => {
    process.env.ANTHROPIC_API_KEY = "   ";
    await expect(
      new AnthropicProvider().analyze("ru", "2026-09-06", [DOC]),
    ).rejects.toThrowError(AnalysisProviderError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("the kill-switch outranks the missing key", async () => {
    process.env.LLM_DISABLE = "1";
    await expect(
      new AnthropicProvider().analyze("ru", "2026-09-06", [DOC]),
    ).rejects.toThrowError(LlmDisabledError);
  });
});

describe("anthropicModel(): resolved at call time", () => {
  it("defaults, then follows ANTHROPIC_MODEL set AFTER module import", () => {
    expect(anthropicModel()).toBe("claude-sonnet-5");
    expect(new AnthropicProvider().name).toBe("anthropic:claude-sonnet-5");
    process.env.ANTHROPIC_MODEL = "claude-opus-5";
    // the module-load `const MODEL = process.env.ANTHROPIC_MODEL ?? …` could not see this
    expect(anthropicModel()).toBe("claude-opus-5");
    expect(new AnthropicProvider().name).toBe("anthropic:claude-opus-5");
  });

  it("a blank ANTHROPIC_MODEL is ABSENT, not an empty model name", () => {
    process.env.ANTHROPIC_MODEL = "   ";
    expect(anthropicModel()).toBe("claude-sonnet-5");
  });
});

describe("#97(a): the Anthropic doc line is well-formed at the 400-code-unit ceiling", () => {
  it("the OLD clip strands a lone surrogate; the NEW clip does not", () => {
    const d = poisonedDoc(1);
    const legacy = legacyAnthropicDocLine(d);
    expect(ISOLATED_SURROGATE.test(legacy)).toBe(true);
    // and the mechanism is the escape the strict parser refuses, not a raw byte
    expect(JSON.stringify(legacy)).toContain("\\ud83d");

    const repaired = anthropicDocLine(d);
    expect(ISOLATED_SURROGATE.test(repaired)).toBe(false);
    expect(JSON.stringify(repaired)).not.toContain("\\ud83d");
  });

  it("a straddling pair loses only its orphaned half — 399 body units, not 400", () => {
    const body = anthropicDocLine(poisonedDoc(1)).split(") ")[1];
    expect(body).toBe("a".repeat(399));
    expect(body.length).toBe(399);
  });

  it("a pair that fits inside the ceiling is preserved intact", () => {
    const d: AnalysisInputDoc = {
      ...DOC,
      title: null,
      content: `hit ${ROCKET_HI}${ROCKET_LO} port`,
    };
    const line = anthropicDocLine(d);
    expect(line).toContain(`${ROCKET_HI}${ROCKET_LO}`);
    expect(ISOLATED_SURROGATE.test(line)).toBe(false);
  });

  it("ASCII and BMP lines are byte-identical to the old implementation", () => {
    const docs: AnalysisInputDoc[] = [
      DOC,
      { ...DOC, id: 8, title: null, sourceKey: null, reliability: null },
      { ...DOC, id: 9, content: "plain ascii   with\n\twhitespace runs" },
      { ...DOC, id: 10, content: "x".repeat(1200) }, // truncated, no astral scalars
    ];
    for (const d of docs)
      expect(anthropicDocLine(d)).toBe(legacyAnthropicDocLine(d));
  });

  it("is the same shape as the OpenAI digest doc line (one audited clip, two providers)", () => {
    for (const d of [
      DOC,
      poisonedDoc(2),
      { ...DOC, id: 11, content: "y".repeat(900) },
    ])
      expect(anthropicDocLine(d)).toBe(digestDocLine(d));
  });

  it("the whole provider-bound request body survives a strict JSON round trip", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    let body = "";
    fetchSpy.mockImplementation((_url, init) => {
      body = (init as { body: string }).body;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ type: "text", text: '{"events":[]}' }],
        }),
      } as unknown as Response);
    });

    const res = await new AnthropicProvider().analyze("ru", "2026-09-06", [
      poisonedDoc(1),
      DOC,
    ]);
    expect(res.events).toEqual([]);
    expect(res.provider).toBe("anthropic:claude-sonnet-5");

    // walk the round-tripped OBJECT's strings: a lone surrogate resurfaces there,
    // whereas any check ending in JSON.stringify re-escapes it back to ASCII and
    // can never fail (the round-2 hole recorded in map-request-wellformed.test.ts)
    const walk = (v: unknown, path: string): void => {
      if (typeof v === "string") {
        expect(
          ISOLATED_SURROGATE.test(v),
          `isolated surrogate at ${path}`,
        ).toBe(false);
        return;
      }
      if (Array.isArray(v))
        return v.forEach((x, i) => walk(x, `${path}[${i}]`));
      if (v && typeof v === "object")
        for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    };
    walk(JSON.parse(body), "$");

    // and the request is unmetered by construction — that is exactly why the seam
    // is unselectable; step 12/20b must add the reservation, not remove the refusal
    expect(reserveSpy).not.toHaveBeenCalled();
    const parsed = JSON.parse(body) as { model: string };
    expect(parsed.model).toBe("claude-sonnet-5");
  });
});

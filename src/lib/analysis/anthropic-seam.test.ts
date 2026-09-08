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
import { AnthropicProvider, anthropicDocLine } from "./anthropic-provider";
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
  "DIGEST_PROVIDER",
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
    await expect(getProvider()).rejects.toThrowError(/never by ANALYSIS_PROVIDER/);
    await expect(getProvider()).rejects.toThrowError(/OPEN-TASKS #83/);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(reserveSpy).not.toHaveBeenCalled();
  });

  it("carries the typed refusal identity the wiring REPLACED rather than routed around", async () => {
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

  // The key-presence and dispatch-order cases moved to
  // anthropic-provider.test.ts when the wiring landed: they need a model-config
  // that RESOLVES to a dispatchable Anthropic configuration, and this file
  // deliberately runs against the real one — which, correctly, resolves to
  // nothing. What is pinned here instead is that dormancy itself.
  it("with no Anthropic model approved, analyze() refuses on the CONFIG before the key is read", async () => {
    process.env.DIGEST_PROVIDER = "anthropic";
    process.env.DIGEST_MODEL = "claude-not-priced";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    const err = await new AnthropicProvider()
      .analyze("ru", "2026-09-06", [DOC])
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect((err as Error).name).toBe("ModelConfigError");
    // unpriced first, and the registry would refuse next — no Anthropic model
    // is priced or approved, which is the whole of the dormancy claim
    expect((err as Error).message).toMatch(/is not priced for provider "anthropic"/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(reserveSpy).not.toHaveBeenCalled();
  });

  it("the same refusal with no DIGEST_PROVIDER at all: the digest resolves to openai", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    await expect(
      new AnthropicProvider().analyze("ru", "2026-09-06", [DOC]),
    ).rejects.toThrowError(/resolves to provider "openai" — refusing to dispatch/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(reserveSpy).not.toHaveBeenCalled();
  });

  it("the kill-switch outranks even the config gate", async () => {
    process.env.LLM_DISABLE = "1";
    process.env.DIGEST_PROVIDER = "anthropic";
    process.env.DIGEST_MODEL = "claude-not-priced";
    await expect(
      new AnthropicProvider().analyze("ru", "2026-09-06", [DOC]),
    ).rejects.toThrowError(LlmDisabledError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// Step 09 gave this provider its own `anthropicModel()` — call-time
// resolution of ANTHROPIC_MODEL with a hard-coded default — because routing it
// through model-config was the #83 wiring, not that repair. The wiring is here
// now, and the function is DELETED rather than kept: a second model authority
// beside the routing seam is how the two silently disagree, and the hard-coded
// default would look priced the moment a price row is keyed to the same id.
// The call-time property it protected is not lost; it belongs to
// resolveWorkloadModel and is asserted below through the provider's name.
describe("the model comes from the routing seam, not a second authority", () => {
  it("the name follows DIGEST_MODEL at call time, and ANTHROPIC_MODEL means nothing", () => {
    process.env.DIGEST_PROVIDER = "anthropic";
    process.env.DIGEST_MODEL = "claude-test-a";
    expect(new AnthropicProvider().name).toBe("anthropic:claude-test-a");
    // set AFTER construction: a module-load snapshot could not see this
    const p = new AnthropicProvider();
    process.env.DIGEST_MODEL = "claude-test-b";
    expect(p.name).toBe("anthropic:claude-test-b");
    // the retired env is inert
    process.env.ANTHROPIC_MODEL = "claude-from-the-old-env";
    expect(p.name).toBe("anthropic:claude-test-b");
  });

  it("the name never attributes an OpenAI-shaped model to Anthropic", () => {
    // no DIGEST_PROVIDER at all: the digest resolves to openai/gpt-4o-mini, and
    // naming that model `anthropic:gpt-4o-mini` would be exactly the false
    // durable attribution decision T4-b exists to prevent
    expect(new AnthropicProvider().name).toBe("anthropic:unresolved");
    // and the same for a provider the allowlist refuses (ruling-13 scoping:
    // a refused vendor keeps the historical OpenAI-shaped model)
    process.env.DIGEST_PROVIDER = "openai_compatible";
    expect(new AnthropicProvider().name).toBe("anthropic:unresolved");
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

  // The end-to-end "the request body survives a strict JSON round trip" case
  // moved to anthropic-provider.test.ts with the wiring: reaching a request now
  // requires a resolvable Anthropic dispatch, which this file has no business
  // manufacturing. The clip's own properties stay pinned above.
});

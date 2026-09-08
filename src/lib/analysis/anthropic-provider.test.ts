import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

// The Anthropic digest provider WITH a resolvable dispatch (step 20b / #83).
//
// anthropic-seam.test.ts runs against the real model-config and proves the
// dormancy: no Anthropic model is priced or approved, so every resolution is
// refused and nothing can reach a request. That is the shipped state, and it
// is also why the dispatch ORDER — the part every ruling actually lives in —
// cannot be exercised there. Here model-config is mocked to hand back one
// approved Anthropic configuration, so the reserve/fetch/record/parse sequence
// is observable. Mocking the gate is not weakening it: the gate is pinned in
// the other file, and the two together say "when the gate opens, this is what
// happens", which is the claim a later activation PR has to be able to trust.
//
// No network exists here: `fetch` is a spy that fails loudly unless a case
// stubs it, and no case stubs a real endpoint.

const { dispatchSpy, resolveSpy } = vi.hoisted(() => ({
  dispatchSpy: vi.fn(),
  resolveSpy: vi.fn(),
}));

vi.mock("../llm/model-config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../llm/model-config")>();
  return { ...actual, workloadDispatchConfig: dispatchSpy, resolveWorkloadModel: resolveSpy };
});

type ReserveResult = { ok: true } | { ok: false; code: string; reason: string };

const { guardInit, guardReserve, guardRecord } = vi.hoisted(() => ({
  guardInit: vi.fn(async () => {}),
  guardReserve: vi.fn((): { ok: true } | { ok: false; code: string; reason: string } => ({ ok: true })),
  guardRecord: vi.fn(async () => {}),
}));

vi.mock("../usage/llm-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../usage/llm-guard")>();
  return {
    ...actual,
    anthropicDigestGuardFromEnv: () => ({
      init: guardInit,
      tryReserve: guardReserve,
      record: guardRecord,
    }),
  };
});

import { ANTHROPIC_API_VERSION, ANTHROPIC_MESSAGES_URL } from "./anthropic-dispatch";
import { AnthropicProvider } from "./anthropic-provider";
import { AnalysisProviderError, type AnalysisInputDoc } from "./provider";
import { LlmBudgetError, LlmDisabledError } from "../usage/llm-guard";
import type { AnalysisDispatchConfig, WorkloadModelConfig } from "../llm/model-config";

/** The injected approved-candidate dispatch. `claude-test` is deliberately not
 *  a real model id: no price row and no registry approval can accidentally
 *  make these cases pass for the wrong reason. */
const ANTHROPIC_DISPATCH: AnalysisDispatchConfig = {
  workload: "digest",
  provider: "anthropic",
  model: "claude-test",
  reasoningCapable: false,
  reasoningEffort: null,
  approvalStatus: "evaluated_candidate",
  registryVersion: "analysis-reg-v1",
};

const DOC: AnalysisInputDoc = {
  id: 7,
  title: "Порт",
  content: "Удар по порту",
  lang: "ru",
  sourceKey: "example.com",
  reliability: 0.42,
  url: null,
  publishedAt: null,
};

/** Isolated-surrogate oracle, independently written (not the production
 *  helper) — the map-request-wellformed.test.ts strategy. */
const ISOLATED_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const ROCKET_HI = "\uD83D";
const ROCKET_LO = "\uDE80";

/** Every observable side effect, in the order it happened. The order IS the
 *  contract — rulings 4 and 8 are both statements about sequence. */
let log: string[] = [];
let fetchSpy: MockInstance<typeof globalThis.fetch>;

function anthropicResponse(over: Record<string, unknown> = {}): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      model: "claude-test",
      stop_reason: "end_turn",
      usage: { input_tokens: 1000, output_tokens: 200 },
      content: [{ type: "text", text: '{"events":[{"title":"t","type":"strike","summary":"s","claims":[]}]}' }],
      ...over,
    }),
  } as unknown as Response;
}

beforeEach(() => {
  log = [];
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
  delete process.env.LLM_DISABLE;
  dispatchSpy.mockReset();
  dispatchSpy.mockImplementation((w: string) => {
    log.push(`dispatchConfig:${w}`);
    return ANTHROPIC_DISPATCH;
  });
  resolveSpy.mockReset();
  resolveSpy.mockReturnValue({
    provider: "anthropic",
    providerAllowed: true,
    model: "claude-test",
  } as unknown as WorkloadModelConfig);
  guardInit.mockClear();
  guardReserve.mockClear();
  guardReserve.mockImplementation((): ReserveResult => {
    log.push("tryReserve");
    return { ok: true };
  });
  guardRecord.mockClear();
  guardRecord.mockImplementation(async (...args: unknown[]) => {
    log.push(`record:${JSON.stringify(args)}`);
  });
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
    log.push("fetch");
    return Promise.resolve(anthropicResponse());
  });
});

afterEach(() => {
  fetchSpy.mockRestore();
  delete process.env.ANTHROPIC_API_KEY;
});

describe("AnthropicProvider.analyze() — the dispatch order every ruling lives in", () => {
  it("reserves BEFORE the request and records BEFORE the parse (rulings 4 and 8)", async () => {
    const res = await new AnthropicProvider().analyze("ru", "2026-09-06", [DOC]);
    expect(log).toEqual([
      "dispatchConfig:digest",
      "tryReserve",
      "fetch",
      "record:[1,1200,0.008]",
    ]);
    expect(guardInit).toHaveBeenCalledOnce();
    expect(res.events).toHaveLength(1);
  });

  it("returns the durable dispatch identity built from the config the billed call used", async () => {
    const res = await new AnthropicProvider().analyze("ru", "2026-09-06", [DOC]);
    expect(res.dispatch).toEqual({
      workload: "digest",
      provider: "anthropic",
      model: "claude-test",
      reasoningEffort: null,
      registryVersion: "analysis-reg-v1",
      approval: "evaluated_candidate",
    });
    expect(res.provider).toBe("anthropic:claude-test");
  });

  it("meters through the model-aware price table, on the anthropic_digest row", async () => {
    // 1,000 in + 200 out at the injected model's UNKNOWN-model ceiling
    // ($5/$15 — claude-test has no price row, and the guard is what a real
    // activation would meter against a priced row)
    await new AnthropicProvider().analyze("ru", "2026-09-06", [DOC]);
    const [requests, tokens, usd] = guardRecord.mock.calls[0] as unknown as [number, number, number];
    expect(requests).toBe(1);
    expect(tokens).toBe(1200);
    expect(usd).toBeCloseTo((1000 * 5 + 200 * 15) / 1_000_000, 12);
  });

  it("reports usage to the caller, so the digest's llm stats see this vendor too", async () => {
    const usages: unknown[] = [];
    await new AnthropicProvider().analyze("ru", "2026-09-06", [DOC], {
      onUsage: (u) => usages.push(u),
    });
    expect(usages).toEqual([
      { promptTokens: 1000, completionTokens: 200, estUsd: (1000 * 5 + 200 * 15) / 1_000_000, truncated: false },
    ]);
  });
});

describe("AnthropicProvider.analyze() — refusals, all before any spend", () => {
  it("LLM_DISABLE=1 throws typed with zero config resolution, zero reservation, zero fetch (ruling 9)", async () => {
    process.env.LLM_DISABLE = "1";
    await expect(new AnthropicProvider().analyze("ru", "2026-09-06", [DOC])).rejects.toThrowError(
      LlmDisabledError,
    );
    expect(log).toEqual([]);
  });

  it("a refused configuration throws before the key is read and before the guard exists", async () => {
    dispatchSpy.mockImplementation(() => {
      throw new (class extends Error {
        readonly code = "MODEL_CONFIG";
        name = "ModelConfigError";
      })("model-config: digest — no approval");
    });
    delete process.env.ANTHROPIC_API_KEY;
    await expect(new AnthropicProvider().analyze("ru", "2026-09-06", [DOC])).rejects.toThrowError(
      /no approval/,
    );
    expect(guardInit).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a digest workload resolving to another vendor refuses, even on a direct construction", async () => {
    dispatchSpy.mockReturnValue({ ...ANTHROPIC_DISPATCH, provider: "openai", model: "gpt-4o-mini" });
    await expect(new AnthropicProvider().analyze("ru", "2026-09-06", [DOC])).rejects.toThrowError(
      /resolves to provider "openai" — refusing to dispatch/,
    );
    expect(guardInit).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a missing key throws typed after the config gate and before any reservation", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(new AnthropicProvider().analyze("ru", "2026-09-06", [DOC])).rejects.toThrowError(
      AnalysisProviderError,
    );
    expect(guardInit).not.toHaveBeenCalled();
    expect(guardReserve).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a whitespace-only key is absent, not a header value", async () => {
    process.env.ANTHROPIC_API_KEY = "   ";
    await expect(new AnthropicProvider().analyze("ru", "2026-09-06", [DOC])).rejects.toThrowError(
      /ANTHROPIC_API_KEY is not set/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a budget stop throws LlmBudgetError and never reaches the network (ruling 4)", async () => {
    guardReserve.mockImplementation((): ReserveResult => {
      log.push("tryReserve");
      return { ok: false, code: "cap_unset", reason: "LLM_SPRINT_USD_CAP is not set" };
    });
    const err = await new AnthropicProvider()
      .analyze("ru", "2026-09-06", [DOC])
      .then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(LlmBudgetError);
    expect((err as LlmBudgetError).reserveCode).toBe("cap_unset");
    // the message must not contain "truncated": digest.ts's ladder rethrows a
    // budget stop instead of burning the smaller rungs
    expect((err as Error).message).not.toContain("truncated");
    expect(log).toEqual(["dispatchConfig:digest", "tryReserve"]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("AnthropicProvider.analyze() — a received response is metered whatever happens to it", () => {
  it("a truncated response is RECORDED, reported, and only then discarded (ruling 8)", async () => {
    fetchSpy.mockImplementation(() => {
      log.push("fetch");
      return Promise.resolve(anthropicResponse({ stop_reason: "max_tokens" }));
    });
    const usages: unknown[] = [];
    const err = await new AnthropicProvider()
      .analyze("ru", "2026-09-06", [DOC], { onUsage: (u) => usages.push(u) })
      .then(() => null, (e: unknown) => e);
    expect(guardRecord).toHaveBeenCalledOnce();
    expect(usages).toMatchObject([{ truncated: true }]);
    // "truncated" in the message is load-bearing: digest.ts's ladder keys on it
    expect((err as Error).message).toMatch(/truncated/);
  });

  it("an unparseable body is recorded first and degrades to zero events, never to fabricated ones", async () => {
    fetchSpy.mockImplementation(() => {
      log.push("fetch");
      return Promise.resolve(anthropicResponse({ content: [{ type: "text", text: "not json at all" }] }));
    });
    const res = await new AnthropicProvider().analyze("ru", "2026-09-06", [DOC]);
    expect(guardRecord).toHaveBeenCalledOnce();
    expect(res.events).toEqual([]);
  });

  it("a 429 takes a FRESH reservation for the retry: 2 reservations, 2 fetches, 1 record", async () => {
    vi.useFakeTimers();
    let call = 0;
    fetchSpy.mockImplementation(() => {
      log.push("fetch");
      return Promise.resolve(call++ === 0 ? ({ ok: false, status: 429 } as unknown as Response) : anthropicResponse());
    });
    const p = new AnthropicProvider().analyze("ru", "2026-09-06", [DOC]);
    await vi.advanceTimersByTimeAsync(65_000);
    await p;
    vi.useRealTimers();
    expect(log).toEqual([
      "dispatchConfig:digest",
      "tryReserve",
      "fetch",
      "tryReserve",
      "fetch",
      "record:[1,1200,0.008]",
    ]);
  });

  it("a non-429 error status throws without metering (no response body was billed)", async () => {
    fetchSpy.mockImplementation(() => {
      log.push("fetch");
      return Promise.resolve({ ok: false, status: 500, text: async () => "upstream boom" } as unknown as Response);
    });
    await expect(new AnthropicProvider().analyze("ru", "2026-09-06", [DOC])).rejects.toThrowError(
      /anthropic 500/,
    );
    expect(guardRecord).not.toHaveBeenCalled();
  });
});

describe("AnthropicProvider — the request on the wire", () => {
  it("carries the routed model, the dated API version, the key header and one user message", async () => {
    await new AnthropicProvider().analyze("ru", "2026-09-06", [DOC]);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(ANTHROPIC_MESSAGES_URL);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "x-api-key": "sk-ant-test-key",
      "anthropic-version": ANTHROPIC_API_VERSION,
      "content-type": "application/json",
    });
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("claude-test");
    expect(body.max_tokens).toBe(4096);
    expect(body.temperature).toBe(0.2);
    expect(typeof body.system).toBe("string");
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe("user");
    expect(body.messages[0].content).toContain("Theater: RU · Date: 2026-09-06");
  });

  it("the whole provider-bound body survives a strict JSON round trip (#97(a))", async () => {
    // moved here from anthropic-seam.test.ts when the wiring landed: reaching a
    // request now needs a resolvable dispatch
    const poisoned: AnalysisInputDoc = {
      ...DOC,
      id: 1,
      title: null,
      content: `${"a".repeat(399)}${ROCKET_HI}${ROCKET_LO} tail text after the boundary`,
    };
    await new AnthropicProvider().analyze("ru", "2026-09-06", [poisoned, DOC]);
    const body = (fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string;
    // walk the round-tripped OBJECT's strings: a lone surrogate resurfaces
    // there, whereas any check ending in JSON.stringify re-escapes it back to
    // ASCII and can never fail
    const walk = (v: unknown, path: string): void => {
      if (typeof v === "string") {
        expect(ISOLATED_SURROGATE.test(v), `isolated surrogate at ${path}`).toBe(false);
        return;
      }
      if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`));
      if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    };
    walk(JSON.parse(body), "$");
  });

  it("an elite-politics system prompt override still demands the default JSON envelope", async () => {
    await new AnthropicProvider().analyze("ru", "2026-09-06", [DOC], {
      systemPrompt: "TRACK PROMPT",
      track: "elite_politics",
    });
    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.system).toContain("TRACK PROMPT");
    expect(body.system).toContain("Respond with ONLY the JSON object");
  });
});

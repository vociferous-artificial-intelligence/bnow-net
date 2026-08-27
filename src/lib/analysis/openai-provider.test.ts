import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Dispatch-order + metering + identity tests for the legacy digest provider
// (release hardening 2026-08-17). The vendor SDK and DB are mocked, so every
// "before reservation / before provider construction" claim is asserted
// literally against spy call counts.

const createSpy = vi.fn();
const ctorSpy = vi.fn();
vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: createSpy } };
    constructor(opts?: unknown) {
      ctorSpy(opts);
    }
  },
}));

const dbState = { records: [] as Array<{ provider: string; usd: number }> };
const querySpy = vi.fn(async (sql: string, params?: unknown[]) => {
  if (/INSERT INTO provider_usage/.test(sql)) {
    dbState.records.push({ provider: params?.[0] as string, usd: params?.[4] as number });
    return [];
  }
  if (/FROM provider_usage/.test(sql)) {
    return [{ total_usd: 0, total_requests: 0, day_usd: 0, day_requests: 0 }];
  }
  return [];
});
vi.mock("@/db", () => ({ rawSql: { query: querySpy } }));

import { OpenAiProvider, digestDocLine } from "./openai-provider";
import { dropIsolatedSurrogates } from "../text/well-formed-slice";
import type { AnalysisInputDoc } from "./provider";

const DOCS: AnalysisInputDoc[] = [
  {
    id: 7,
    title: "t",
    content: "Ukrainian forces struck the depot near the river crossing",
    lang: "en",
    sourceKey: "example.com",
    reliability: 0.6,
    url: null,
    publishedAt: null,
  },
];

const okCompletion = (over: Record<string, unknown> = {}) => ({
  usage: { prompt_tokens: 500, completion_tokens: 100 },
  choices: [
    {
      finish_reason: "stop",
      message: { content: '{"events":[]}' },
    },
  ],
  ...over,
});

const ENV_KEYS = [
  "OPENAI_API_KEY",
  "LLM_DISABLE",
  "LLM_SPRINT_USD_CAP",
  "DIGEST_MODEL",
  "DIGEST_REASONING_EFFORT",
  "OPENAI_MODEL",
] as const;
const SAVED = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.OPENAI_API_KEY = "test-key";
  process.env.LLM_SPRINT_USD_CAP = "10";
  dbState.records = [];
  createSpy.mockReset();
  ctorSpy.mockClear();
  querySpy.mockClear();
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
});

describe("OpenAiProvider dispatch (baseline)", () => {
  it("dispatches the baseline with historical params, meters model-aware, returns identity", async () => {
    createSpy.mockResolvedValue(okCompletion());
    const p = new OpenAiProvider();
    const res = await p.analyze("ua", "2026-08-17", DOCS);
    expect(res.provider).toBe("openai:gpt-4o-mini");
    expect(res.dispatch).toEqual({
      workload: "digest",
      model: "gpt-4o-mini",
      reasoningEffort: null,
      registryVersion: "analysis-reg-v1",
      approval: "baseline",
    });
    const req = createSpy.mock.calls[0][0];
    expect(req.model).toBe("gpt-4o-mini");
    expect(req.temperature).toBe(0.2);
    expect(req.max_completion_tokens).toBe(4096);
    expect("reasoning_effort" in req).toBe(false);
    // metered once at the gpt-4o-mini list price
    expect(dbState.records).toEqual([
      { provider: "openai_digest", usd: expect.closeTo((500 * 0.15 + 100 * 0.6) / 1e6, 12) },
    ]);
    // SDK retries disabled at the analysis client
    expect(ctorSpy).toHaveBeenCalledWith({ maxRetries: 0 });
  });

  it("a priced-but-unapproved model fails BEFORE reservation and BEFORE client construction", async () => {
    process.env.DIGEST_MODEL = "gpt-5"; // priced; no digest approval
    const p = new OpenAiProvider();
    await expect(p.analyze("ua", "2026-08-17", DOCS)).rejects.toThrow(/approval/);
    expect(ctorSpy).not.toHaveBeenCalled(); // no provider client ever existed
    expect(createSpy).not.toHaveBeenCalled(); // no dispatch
    expect(querySpy).not.toHaveBeenCalled(); // no guard init/reserve — failed before reservation
  });

  it("a truncated response is METERED before being discarded (ruling 8)", async () => {
    createSpy.mockResolvedValue(
      okCompletion({
        choices: [{ finish_reason: "length", message: { content: "" } }],
      }),
    );
    const p = new OpenAiProvider();
    await expect(p.analyze("ua", "2026-08-17", DOCS)).rejects.toThrow(/truncated/);
    expect(dbState.records).toHaveLength(1); // billed-in-full throwaway recorded
  });

  it("the explicit 429 retry makes a SECOND physical call and meters the billed success once", async () => {
    vi.useFakeTimers();
    try {
      createSpy
        .mockRejectedValueOnce(Object.assign(new Error("rate limited"), { status: 429 }))
        .mockResolvedValueOnce(okCompletion());
      const p = new OpenAiProvider();
      const pending = p.analyze("ua", "2026-08-17", DOCS);
      await vi.advanceTimersByTimeAsync(66_000); // the 65s TPM-window sleep
      const res = await pending;
      expect(res.provider).toBe("openai:gpt-4o-mini");
      expect(createSpy).toHaveBeenCalledTimes(2); // one physical call per attempt
      expect(dbState.records).toHaveLength(1); // only the billed success is metered
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("digestDocLine UTF-16 safety (#87 mechanical root, #97 family)", () => {
  const wellFormed = (s: string) => dropIsolatedSurrogates(s) === s;
  const doc = (over: Partial<AnalysisInputDoc> = {}): AnalysisInputDoc => ({
    id: 7,
    title: "t",
    content: "Ukrainian forces struck the depot near the river crossing",
    lang: "en",
    sourceKey: "example.com",
    reliability: 0.6,
    url: null,
    publishedAt: null,
    ...over,
  });

  it("is byte-identical to the historical format for normal well-formed input", () => {
    expect(digestDocLine(doc())).toBe(
      "[7] (example.com, rel=0.60) t. Ukrainian forces struck the depot near the river crossing",
    );
  });

  it("keeps the historical null-field formatting", () => {
    expect(digestDocLine(doc({ title: null, sourceKey: null, reliability: null }))).toBe(
      "[7] (unknown, rel=?) Ukrainian forces struck the depot near the river crossing",
    );
  });

  it("drops only the orphaned half when a pair straddles the 400-unit ceiling", () => {
    const line = digestDocLine(doc({ title: null, content: "a".repeat(399) + "😀" }));
    expect(line.endsWith(") " + "a".repeat(399))).toBe(true);
    expect(wellFormed(line)).toBe(true);
  });

  it("preserves a pair that fits entirely inside the ceiling", () => {
    const content = "a".repeat(398) + "😀"; // units 398-399: inside 400
    expect(digestDocLine(doc({ title: null, content }))).toContain("a".repeat(398) + "😀");
  });

  it("removes pre-existing isolated surrogates from title and content (defensive)", () => {
    const line = digestDocLine(doc({ title: "ti\uD83Dtle", content: "\uDC00body" }));
    expect(line).toContain(") title. body");
    expect(wellFormed(line)).toBe(true);
  });

  it("normalizes whitespace BEFORE truncating (historical order preserved)", () => {
    // Raw content is 443 units but collapses under 400, so the tail survives;
    // slicing before normalization would have cut "end" off.
    const raw = "word  wor  ".repeat(40) + "end"; // 443 raw units, normalizes to 363+3
    const normalized = ("t. " + raw).replace(/\s+/g, " ");
    expect(normalized.length).toBeLessThan(400);
    expect(digestDocLine(doc({ content: raw }))).toContain(`) ${normalized}`);
  });

  it("truncates the NORMALIZED string at 400 when it still exceeds the ceiling", () => {
    const raw = "ab  ".repeat(150); // 600 raw units; normalizes to "ab " x150 = 450
    const normalized = ("t. " + raw).replace(/\s+/g, " ");
    expect(normalized.length).toBeGreaterThan(400);
    const line = digestDocLine(doc({ content: raw }));
    expect(line).toContain(`) ${normalized.slice(0, 400)}`);
    expect(line).not.toContain(normalized.slice(0, 401));
  });

  it("whole digest request stays well-formed when a batch carries a poison doc", async () => {
    createSpy.mockResolvedValue(okCompletion());
    const p = new OpenAiProvider();
    await p.analyze("ua", "2026-08-17", [
      doc(),
      // pair straddles the 400 boundary (high half at unit 399)
      doc({ id: 8, title: null, sourceKey: null, reliability: null, content: "б".repeat(399) + "😀 tail" }),
      doc({ id: 9, title: null, sourceKey: null, reliability: null, content: "x\uD83Dy" }),
    ]);
    const req = createSpy.mock.calls[0][0];
    const user = req.messages.find((m: { role: string }) => m.role === "user").content as string;
    expect(wellFormed(user)).toBe(true);
    expect(user).toContain("[8] (unknown, rel=?) " + "б".repeat(399) + "\n");
    expect(user).toContain("[9] (unknown, rel=?) xy");
    // No surrogate-range escape may survive into the JSON body (the #86/#97
    // rejection signature); well-formed stringify never escapes a valid pair.
    expect(JSON.stringify(user)).not.toMatch(/\\u[dD][89a-fA-F]/);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import type { SpendGuard } from "../usage/spend-guard";
import { LlmBudgetError } from "../usage/llm-guard";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const { extractBatch } = await import("./map-worker");
import type { AnalysisDispatchConfig } from "../llm/model-config";

// Per-attempt reservation/metering cardinality for the map extract call —
// every PHYSICAL provider attempt takes its own fresh reservation, and every
// billed response is metered BEFORE its content is interpreted (ruling 4/8).
// The remap operator dispatches through this exact function, so these
// invariants cover it too. Zero network: the client is a stub.

const DISPATCH: AnalysisDispatchConfig = {
  workload: "map",
  model: "gpt-4o-mini",
  reasoningCapable: false,
  reasoningEffort: null,
  approvalStatus: "baseline",
  registryVersion: "analysis-reg-v1",
};

const doc = (id: number) => ({
  id,
  theater: "ir",
  day: "2026-08-01",
  contentMd5: `md5-${id}`,
  text2k: `text ${id}`,
  title: `title ${id}`,
  content: `Missile strike reported near the port, doc ${id}.`,
  adapter: "rss",
  sourceKey: `source-${id}`,
  reliability: 0.5,
});

const emptyStats = () => ({
  llmCalls: 0,
  promptTokens: 0,
  completionTokens: 0,
  claims: 0,
  emptyDocs: 0,
  wrongDocIds: 0,
  duplicateEntries: 0,
  omittedDocs: 0,
  truncationSplits: 0,
  truncatedSingles: 0,
  quoteMisses: 0,
  batchErrors: 0,
  leaseLostDiscards: 0,
  leaseRenewals: 0,
});

function fakeGuard(reserveResults?: Array<boolean>) {
  let call = 0;
  const tryReserve = vi.fn(() => {
    const ok = reserveResults ? (reserveResults[Math.min(call, reserveResults.length - 1)] ?? true) : true;
    call++;
    return ok
      ? ({ ok: true } as const)
      : ({ ok: false as const, reason: "cap", code: "total_usd" as const });
  });
  const record = vi.fn(async () => {});
  return { guard: { tryReserve, record } as unknown as SpendGuard, tryReserve, record };
}

function completion(content: string | null, finish = "stop", promptTokens = 100, completionTokens = 50) {
  return {
    choices: [{ finish_reason: finish, message: { content } }],
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
  };
}

const okContent = (ids: number[]) =>
  JSON.stringify({
    results: ids.map((id) => ({
      docId: id,
      claims: [
        {
          text_en: `Claim for doc ${id}`,
          quote_orig: null,
          claim_type: "factual",
          hedging: "claimed",
          entities: [],
          event_hint: null,
        },
      ],
    })),
  });

function fakeOpenAi(responses: Array<Record<string, unknown> | Error>) {
  let i = 0;
  const create = vi.fn(async () => {
    const r = responses[Math.min(i++, responses.length - 1)];
    if (r instanceof Error) throw r;
    return r;
  });
  return { client: { chat: { completions: { create } } } as unknown as OpenAI, create };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("extractBatch reservation/metering cardinality", () => {
  it("clean call: 1 reservation, 1 physical call, 1 metering", async () => {
    const { guard, tryReserve, record } = fakeGuard();
    const { client, create } = fakeOpenAi([completion(okContent([1, 2]))]);
    const out = await extractBatch(client, guard, DISPATCH, "military", "ir", [doc(1), doc(2)], emptyStats());
    expect(out.size).toBe(2);
    expect(tryReserve).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledTimes(1);
  });

  it("429 then success: the manual retry takes a FRESH reservation (2:2:1)", async () => {
    const { guard, tryReserve, record } = fakeGuard();
    const err = Object.assign(new Error("rate limited"), { status: 429 });
    const { client, create } = fakeOpenAi([err, completion(okContent([1]))]);
    const p = extractBatch(client, guard, DISPATCH, "military", "ir", [doc(1)], emptyStats());
    await vi.advanceTimersByTimeAsync(65_000);
    const out = await p;
    expect(out.size).toBe(1);
    expect(tryReserve).toHaveBeenCalledTimes(2); // one per physical attempt
    expect(create).toHaveBeenCalledTimes(2);
    expect(record).toHaveBeenCalledTimes(1); // only the billed (successful) response
  });

  it("429 then refused reservation: typed budget stop, no second physical call", async () => {
    const { guard, tryReserve } = fakeGuard([true, false]);
    const err = Object.assign(new Error("rate limited"), { status: 429 });
    const { client, create } = fakeOpenAi([err, completion(okContent([1]))]);
    const p = extractBatch(client, guard, DISPATCH, "military", "ir", [doc(1)], emptyStats());
    // attach the rejection expectation BEFORE advancing time (unhandled otherwise)
    const assertion = expect(p).rejects.toBeInstanceOf(LlmBudgetError);
    await vi.advanceTimersByTimeAsync(65_000);
    await assertion;
    expect(tryReserve).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("a billed response is metered BEFORE parsing — unparseable content still records", async () => {
    const { guard, record } = fakeGuard();
    const { client } = fakeOpenAi([completion("this is not json")]);
    await expect(
      extractBatch(client, guard, DISPATCH, "military", "ir", [doc(1)], emptyStats()),
    ).rejects.toThrow(/unparseable/);
    expect(record).toHaveBeenCalledTimes(1);
    const [reqs, units, usd] = record.mock.calls[0] as unknown as [number, number, number];
    expect(reqs).toBe(1);
    expect(units).toBe(150); // prompt 100 + completion 50
    expect(usd).toBeGreaterThan(0);
  });

  it("truncation split bills and meters EVERY attempt (3:3:3 for a split pair)", async () => {
    const { guard, tryReserve, record } = fakeGuard();
    const stats = emptyStats();
    const { client, create } = fakeOpenAi([
      completion(null, "length"), // whole pair truncated (billed, discarded)
      completion(okContent([1])),
      completion(okContent([2])),
    ]);
    const out = await extractBatch(client, guard, DISPATCH, "military", "ir", [doc(1), doc(2)], stats);
    expect(out.size).toBe(2);
    expect(create).toHaveBeenCalledTimes(3);
    expect(tryReserve).toHaveBeenCalledTimes(3);
    expect(record).toHaveBeenCalledTimes(3); // the discarded truncated call is still metered
    expect(stats.truncationSplits).toBe(1);
  });

  it("a single doc that still truncates is metered, skipped, and left unmapped", async () => {
    const { guard, record } = fakeGuard();
    const stats = emptyStats();
    const { client } = fakeOpenAi([completion(null, "length")]);
    const out = await extractBatch(client, guard, DISPATCH, "military", "ir", [doc(1)], stats);
    expect(out.size).toBe(0);
    expect(record).toHaveBeenCalledTimes(1);
    expect(stats.truncatedSingles).toBe(1);
  });
});

describe("extractBatch keepalive (lease renewal per physical attempt)", () => {
  it("runs before EVERY physical attempt, including the 429 retry and each split level", async () => {
    const { guard } = fakeGuard();
    const keepalive = vi.fn(async () => {});
    const err = Object.assign(new Error("rate limited"), { status: 429 });
    const { client, create } = fakeOpenAi([
      err, // attempt 1 (429)
      completion(null, "length"), // attempt 2: whole pair truncated
      completion(okContent([1])), // attempt 3: left single
      completion(okContent([2])), // attempt 4: right single
    ]);
    const p = extractBatch(client, guard, DISPATCH, "military", "ir", [doc(1), doc(2)], emptyStats(), keepalive);
    await vi.advanceTimersByTimeAsync(65_000);
    const out = await p;
    expect(out.size).toBe(2);
    expect(create).toHaveBeenCalledTimes(4);
    expect(keepalive).toHaveBeenCalledTimes(4); // one renewal per physical attempt
  });

  it("a keepalive that reports the lease lost stops BEFORE the next reservation and dispatch", async () => {
    const { guard, tryReserve } = fakeGuard();
    const boom = new Error("lease lost mid-batch");
    let calls = 0;
    const keepalive = vi.fn(async () => {
      if (++calls >= 2) throw boom;
    });
    const err = Object.assign(new Error("rate limited"), { status: 429 });
    const { client, create } = fakeOpenAi([err, completion(okContent([1]))]);
    const p = extractBatch(client, guard, DISPATCH, "military", "ir", [doc(1)], emptyStats(), keepalive);
    const assertion = expect(p).rejects.toThrow("lease lost mid-batch");
    await vi.advanceTimersByTimeAsync(65_000);
    await assertion;
    expect(create).toHaveBeenCalledTimes(1); // the 429 attempt only — no second dispatch
    expect(tryReserve).toHaveBeenCalledTimes(1); // and no second reservation either
  });
});

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// LOCAL-MODEL-ASK-EVAL §7.1 seams: the explicit OPENAI_BASE_URL knob and the
// env-gated pre-validator raw capture. Both must be INERT by default — the
// default client construction stays byte-identical (contracts.test.ts pins the
// {maxRetries: 0} shape across all four clients) and no file is ever written
// without ASK_RAW_CAPTURE_PATH.

const h = vi.hoisted(() => ({
  createMock: vi.fn(),
  ctorOpts: [] as unknown[],
  // pass-through spy on appendFileSync so the record-before-capture ordering
  // is pinned by invocationCallOrder, not just claimed in a comment
  appendSpy: vi.fn(),
}));
vi.mock("openai", () => ({
  default: class {
    constructor(opts?: unknown) {
      h.ctorOpts.push(opts);
    }
    chat = { completions: { create: h.createMock } };
    embeddings = { create: vi.fn() };
  },
}));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  h.appendSpy.mockImplementation(actual.appendFileSync as never);
  return { ...actual, appendFileSync: h.appendSpy };
});

const { openaiGeneration } = await import("./openai");

const REQ = {
  model: "gemma-official",
  messages: [
    { role: "system" as const, content: "sys" },
    { role: "user" as const, content: "q" },
  ],
  maxOutputTokens: 100,
  reasoningEffort: "low" as const,
};

function passGuard() {
  return {
    init: vi.fn(async () => {}),
    tryReserve: vi.fn(async () => ({ ok: true as const })),
    record: vi.fn(async () => {}),
  };
}

const SAVED = { base: process.env.OPENAI_BASE_URL, capture: process.env.ASK_RAW_CAPTURE_PATH };

beforeEach(() => {
  vi.clearAllMocks();
  h.ctorOpts.length = 0;
  delete process.env.OPENAI_BASE_URL;
  delete process.env.ASK_RAW_CAPTURE_PATH;
  h.createMock.mockResolvedValue({
    id: "req-1",
    choices: [{ message: { content: "Answer text. [c1]", refusal: null }, finish_reason: "stop" }],
    usage: { prompt_tokens: 100, completion_tokens: 20 },
  });
});

afterEach(() => {
  if (SAVED.base === undefined) delete process.env.OPENAI_BASE_URL;
  else process.env.OPENAI_BASE_URL = SAVED.base;
  if (SAVED.capture === undefined) delete process.env.ASK_RAW_CAPTURE_PATH;
  else process.env.ASK_RAW_CAPTURE_PATH = SAVED.capture;
});

describe("OPENAI_BASE_URL knob", () => {
  it("unset → default construction unchanged ({ maxRetries: 0 }, no baseURL key)", async () => {
    await openaiGeneration.generate(REQ, passGuard() as never);
    expect(h.ctorOpts).toEqual([{ maxRetries: 0 }]);
  });

  it("blank/whitespace → treated as unset", async () => {
    process.env.OPENAI_BASE_URL = "   ";
    await openaiGeneration.generate(REQ, passGuard() as never);
    expect(h.ctorOpts).toEqual([{ maxRetries: 0 }]);
  });

  it("set → passed through (trimmed) with retries still disabled", async () => {
    process.env.OPENAI_BASE_URL = " http://localhost:11434/v1 ";
    await openaiGeneration.generate(REQ, passGuard() as never);
    expect(h.ctorOpts).toEqual([{ maxRetries: 0, baseURL: "http://localhost:11434/v1" }]);
  });
});

describe("ASK_RAW_CAPTURE_PATH pre-validator capture", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ask-raw-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("set → appends one JSONL line per call with the raw content/finish/usage", async () => {
    const p = join(dir, "capture.jsonl");
    process.env.ASK_RAW_CAPTURE_PATH = p;
    const guard = passGuard();
    await openaiGeneration.generate(REQ, guard as never);
    await openaiGeneration.generate(REQ, guard as never);
    const lines = readFileSync(p, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual({
      model: "gemma-official",
      content: "Answer text. [c1]",
      refusal: null,
      reasoning: null,
      finishReason: "stop",
      usage: { promptTokens: 100, completionTokens: 20 },
    });
    // metering discipline untouched: record ran exactly once per call, and the
    // capture NEVER precedes it — a billed call must be metered before any
    // fallible body-read side effect runs (rulings 4/8)
    expect(guard.record).toHaveBeenCalledTimes(2);
    expect(guard.record.mock.invocationCallOrder[0]).toBeLessThan(h.appendSpy.mock.invocationCallOrder[0]);
    expect(guard.record.mock.invocationCallOrder[1]).toBeLessThan(h.appendSpy.mock.invocationCallOrder[1]);
  });

  it("a shape-anomalous completion (no choices) captures nulls, never throws", async () => {
    h.createMock.mockResolvedValue({ id: "x", choices: [], usage: { prompt_tokens: 5, completion_tokens: 0 } });
    const p = join(dir, "anomalous.jsonl");
    process.env.ASK_RAW_CAPTURE_PATH = p;
    await openaiGeneration.generate(REQ, passGuard() as never);
    const row = JSON.parse(readFileSync(p, "utf8").trim());
    expect(row.content).toBeNull();
    expect(row.finishReason).toBeNull();
    expect(row.usage).toEqual({ promptTokens: 5, completionTokens: 0 });
  });

  it("unset → no capture file is ever written", async () => {
    const p = join(dir, "never.jsonl");
    await openaiGeneration.generate(REQ, passGuard() as never);
    expect(() => readFileSync(p, "utf8")).toThrow();
  });
});

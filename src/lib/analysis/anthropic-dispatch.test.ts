import { describe, expect, it } from "vitest";
import {
  ANTHROPIC_API_VERSION,
  ANTHROPIC_MESSAGES_URL,
  buildMessagesRequest,
  parseMessagesResponse,
} from "./anthropic-dispatch";

const ARGS = {
  model: "claude-test",
  system: "SYS",
  user: "USER",
  maxTokens: 4096,
  temperature: 0.2,
  apiKey: "sk-ant-test-key",
};

describe("buildMessagesRequest", () => {
  it("builds the endpoint, headers and body the Messages API expects", () => {
    const { url, init } = buildMessagesRequest(ARGS);
    expect(url).toBe(ANTHROPIC_MESSAGES_URL);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "x-api-key": "sk-ant-test-key",
      "anthropic-version": ANTHROPIC_API_VERSION,
      "content-type": "application/json",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      model: "claude-test",
      max_tokens: 4096,
      temperature: 0.2,
      system: "SYS",
      messages: [{ role: "user", content: "USER" }],
    });
  });

  it("carries a fresh abort signal per call — a reused expired one would kill the 429 retry", () => {
    const a = buildMessagesRequest(ARGS).init.signal;
    const b = buildMessagesRequest(ARGS).init.signal;
    expect(a).toBeInstanceOf(AbortSignal);
    expect(a).not.toBe(b);
    expect(a?.aborted).toBe(false);
  });

  it("is pure: the same arguments give the same body every time", () => {
    expect(buildMessagesRequest(ARGS).init.body).toBe(buildMessagesRequest(ARGS).init.body);
  });
});

describe("parseMessagesResponse", () => {
  it("reads text, stop reason, usage and the answering model", () => {
    expect(
      parseMessagesResponse({
        id: "msg_abc",
        model: "claude-test-20260101",
        stop_reason: "end_turn",
        usage: { input_tokens: 12, output_tokens: 3 },
        content: [{ type: "text", text: "hello" }],
      }),
    ).toEqual({
      text: "hello",
      id: "msg_abc",
      stopReason: "end_turn",
      inputTokens: 12,
      outputTokens: 3,
      model: "claude-test-20260101",
    });
  });

  it("concatenates every text block and ignores non-text ones", () => {
    expect(
      parseMessagesResponse({
        content: [
          { type: "thinking", thinking: "ignored" },
          { type: "text", text: "a" },
          { type: "tool_use", id: "t" },
          { type: "text", text: "b" },
        ],
      }).text,
    ).toBe("ab");
  });

  it("is TOTAL: nothing about a malformed body throws, because the caller has already metered it", () => {
    // ruling 8 puts guard.record BEFORE the parse. A parse that threw would
    // strand a billed response outside the ledger, so every field degrades.
    for (const body of [null, undefined, {}, [], "nonsense", 42, { content: "not an array" }]) {
      expect(parseMessagesResponse(body)).toEqual({
        text: "",
        id: null,
        stopReason: null,
        inputTokens: 0,
        outputTokens: 0,
        model: null,
      });
    }
  });

  it("non-numeric or missing usage counts as zero, never NaN into the ledger", () => {
    const p = parseMessagesResponse({ usage: { input_tokens: "12", output_tokens: null } });
    expect(p.inputTokens).toBe(0);
    expect(p.outputTokens).toBe(0);
    expect(Number.isNaN(p.inputTokens)).toBe(false);
  });

  it("surfaces max_tokens so the caller can record then discard", () => {
    expect(parseMessagesResponse({ stop_reason: "max_tokens" }).stopReason).toBe("max_tokens");
  });
});

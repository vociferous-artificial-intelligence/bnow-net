import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const { classifyBatchError, finalizeBatchErrors } = await import("./map-worker");

describe("classifyBatchError (#87 — content-safe vocabulary, never raw messages)", () => {
  it("classifies the #86/#97 rejection signature", () => {
    expect(classifyBatchError("400 Invalid body: failed to parse JSON value")).toBe("invalid_body");
  });

  it("classifies rate limits, server errors, transport and persist failures", () => {
    expect(classifyBatchError("Rate limit reached for gpt-4o-mini")).toBe("rate_limit");
    expect(classifyBatchError("429 Too Many Requests")).toBe("rate_limit");
    expect(classifyBatchError("502 Bad Gateway")).toBe("server_error");
    expect(classifyBatchError("Internal server error")).toBe("server_error");
    expect(classifyBatchError("fetch failed")).toBe("transport");
    expect(classifyBatchError("Connect ETIMEDOUT: request timed out")).toBe("transport");
    expect(classifyBatchError('duplicate key value violates unique constraint "doc_claims_x"')).toBe(
      "persist",
    );
  });

  it("never returns the input text for an unknown message", () => {
    const weird = "entirely novel failure containing source text Сили";
    expect(classifyBatchError(weird)).toBe("other");
  });
});

describe("finalizeBatchErrors", () => {
  it("is a no-op on a clean run", () => {
    const counts: Record<string, unknown> = { claims: 10 };
    finalizeBatchErrors(counts, 0, new Map());
    expect(counts.batchErrorClasses).toBeUndefined();
    expect(counts.degraded).toBeUndefined();
  });

  it("records sorted classes and marks the run degraded when batches failed", () => {
    const counts: Record<string, unknown> = { claims: 10 };
    finalizeBatchErrors(
      counts,
      3,
      new Map([
        ["server_error", 1],
        ["invalid_body", 2],
      ]),
    );
    expect(counts.batchErrorClasses).toEqual({ invalid_body: 2, server_error: 1 });
    expect(counts.degraded).toEqual({ category: "batch_errors", batchErrors: 3 });
  });
});

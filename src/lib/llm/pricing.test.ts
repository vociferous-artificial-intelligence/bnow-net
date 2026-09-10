import { describe, expect, it } from "vitest";
import {
  EMBED_PRICES_PER_MTOK,
  EMBED_UNKNOWN_PRICE_PER_MTOK,
  embedPriced,
  embedPricePerMtok,
  estimateEmbedCostUsd,
} from "./pricing";

// The embedding half of the price authority (WS-2.1, PR-2.1-2). The chat half is
// pinned by src/lib/ask/registry.ts's parity test.

describe("embedding price table", () => {
  it("prices the default model at the verified $0.02/1M", () => {
    expect(EMBED_PRICES_PER_MTOK["text-embedding-3-small"]).toBe(0.02);
  });

  it("keeps the unknown-model fallback >= every priced entry (a ceiling can never understate)", () => {
    for (const [model, price] of Object.entries(EMBED_PRICES_PER_MTOK)) {
      expect(price, `${model} must not price above the unknown fallback`).toBeLessThanOrEqual(
        EMBED_UNKNOWN_PRICE_PER_MTOK,
      );
    }
  });

  it("does not price a model nobody verified", () => {
    expect(embedPriced("text-embedding-3-large")).toBe(false);
    expect(embedPriced("text-embedding-ada-002")).toBe(false);
    expect(embedPriced("text-embedding-3-small")).toBe(true);
  });

  it("is not fooled by inherited Object properties", () => {
    expect(embedPriced("constructor")).toBe(false);
    expect(embedPriced("toString")).toBe(false);
  });
});

describe("estimateEmbedCostUsd", () => {
  it("is byte-identical to the pre-2026-09-06 EMBED_USD_PER_TOKEN arithmetic", () => {
    const oldPerToken = 0.02 / 1e6; // the constant this replaced
    // WS2-F14: the original loop [1, 77, 12_345] could not detect the regression
    // this pin exists to prevent — for every n it tried, tokens * (price / 1e6)
    // and (tokens * price) / 1e6 are bitwise EQUAL, so the mutant survived the
    // whole suite. 3 and 10 are the small values where the two groupings differ.
    for (const n of [1, 3, 10, 77, 12_345]) {
      expect(estimateEmbedCostUsd("text-embedding-3-small", n)).toBe(n * oldPerToken);
    }
  });

  it("over-estimates an unpriced model instead of pretending it is free", () => {
    expect(estimateEmbedCostUsd("text-embedding-3-large", 1_000_000)).toBe(
      EMBED_UNKNOWN_PRICE_PER_MTOK,
    );
    expect(estimateEmbedCostUsd("text-embedding-3-large", 12_345)).toBeGreaterThan(
      estimateEmbedCostUsd("text-embedding-3-small", 12_345),
    );
  });

  it("prices zero tokens at zero", () => {
    expect(estimateEmbedCostUsd("text-embedding-3-small", 0)).toBe(0);
    expect(embedPricePerMtok("text-embedding-3-small")).toBe(0.02);
    expect(embedPricePerMtok("nope")).toBe(EMBED_UNKNOWN_PRICE_PER_MTOK);
  });
});

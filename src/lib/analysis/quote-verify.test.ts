import { describe, expect, it } from "vitest";
import { normalizeForContainment, verifyQuote } from "./quote-verify";

describe("normalizeForContainment", () => {
  it("folds curly quotes, dash variants, ellipsis, case and whitespace", () => {
    expect(normalizeForContainment("“Rapid Ranger” — система…")).toBe(
      '"rapid ranger" - система...',
    );
  });

  it("strips zero-width and bidi characters", () => {
    expect(normalizeForContainment("a​b­c‏ d")).toBe("abc d");
  });
});

describe("verifyQuote", () => {
  const doc =
    "Минобороны РФ — впервые заявило об уничтожении комплекса “Rapid Ranger” производства Великобритании";

  it("verifies a faithful copy despite unicode-level differences", () => {
    expect(verifyQuote(doc, 'заявило об уничтожении комплекса "Rapid Ranger"')).toBe(true);
  });

  it("rejects paraphrase, null, and too-short quotes", () => {
    expect(verifyQuote(doc, "Russia destroyed a Rapid Ranger system")).toBe(false);
    expect(verifyQuote(doc, null)).toBe(false);
    expect(verifyQuote(doc, "РФ")).toBe(false);
  });
});

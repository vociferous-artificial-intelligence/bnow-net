import { describe, expect, it } from "vitest";
import { extractTerms } from "./retrieve";

describe("extractTerms", () => {
  it("keeps salient tokens, drops stopwords", () => {
    const t = extractTerms("Which Russian officials were prosecuted recently?");
    expect(t).toContain("russian");
    expect(t).toContain("officials");
    expect(t).toContain("prosecuted");
    expect(t).not.toContain("were");
    expect(t).not.toContain("which");
    expect(t).not.toContain("recently");
  });
  it("caps term count and dedupes", () => {
    const t = extractTerms("sanctions sanctions sanctions oil gas oil gas nuclear iran russia china usa");
    expect(t.length).toBeLessThanOrEqual(8);
    expect(new Set(t).size).toBe(t.length);
  });
  it("handles empty/punctuation-only", () => {
    expect(extractTerms("?? !!")).toEqual([]);
  });
});

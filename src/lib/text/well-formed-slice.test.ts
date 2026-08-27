import { describe, expect, it } from "vitest";
import { dropIsolatedSurrogates, wellFormedSlice } from "./well-formed-slice";

// The primitive's original home (map-prompts.ts) re-exports both names, and its
// test file pins the map-facing behavior; these tests pin the contract at the
// module's new neutral home so it survives independent of any one caller.

const wellFormed = (s: string) => dropIsolatedSurrogates(s) === s;

describe("dropIsolatedSurrogates", () => {
  it("is the identity on BMP-only text (Cyrillic, Arabic, CJK, Latin)", () => {
    for (const s of ["", "plain ascii", "Сили оборони України", "قوات الحرس الثوري", "日本語テキスト", "a\tb\nc"]) {
      expect(dropIsolatedSurrogates(s)).toBe(s);
    }
  });

  it("keeps correctly paired astral scalars byte-for-byte", () => {
    for (const s of ["😀", "before 🇺🇦 after", "бій 😀😀 удар", "𝕏 corp"]) {
      expect(dropIsolatedSurrogates(s)).toBe(s);
    }
  });

  it("removes isolated high and low surrogates at start, middle and end", () => {
    expect(dropIsolatedSurrogates("\uD83Dabc")).toBe("abc");
    expect(dropIsolatedSurrogates("ab\uD83Dcd")).toBe("abcd");
    expect(dropIsolatedSurrogates("abc\uD83D")).toBe("abc");
    expect(dropIsolatedSurrogates("\uDC00abc")).toBe("abc");
    expect(dropIsolatedSurrogates("ab\uDC00cd")).toBe("abcd");
    expect(dropIsolatedSurrogates("abc\uDC00")).toBe("abc");
  });

  it("removes multiple orphans while preserving interleaved valid pairs", () => {
    expect(dropIsolatedSurrogates("\uD83D😀\uDC00x\uD83D")).toBe("😀x");
  });

  it("never lengthens and always returns a well-formed string", () => {
    const adversarial = ["\uD800", "\uDFFF", "a😀\uD83Db", "\uDC00😀\uD800", "😀".repeat(5) + "\uD83D"];
    for (const s of adversarial) {
      const out = dropIsolatedSurrogates(s);
      expect(out.length).toBeLessThanOrEqual(s.length);
      expect(wellFormed(out)).toBe(true);
    }
  });
});

describe("wellFormedSlice", () => {
  it("returns the input unchanged when it fits the limit and is well-formed", () => {
    expect(wellFormedSlice("abc", 10)).toBe("abc");
    expect(wellFormedSlice("😀ok", 10)).toBe("😀ok");
  });

  it("truncates on UTF-16 code units, not code points", () => {
    // "😀" is 2 code units; limit 3 admits the pair plus one unit.
    expect(wellFormedSlice("😀ab", 3)).toBe("😀a");
  });

  it("drops only the orphaned high half when a pair straddles the limit", () => {
    const s = "a".repeat(249) + "😀"; // pair occupies units 249-250
    const out = wellFormedSlice(s, 250);
    expect(out).toBe("a".repeat(249)); // limit - 1 units, still well-formed
    expect(wellFormed(out)).toBe(true);
  });

  it("preserves a pair that fits entirely inside the limit", () => {
    const s = "a".repeat(248) + "😀"; // pair occupies units 248-249
    expect(wellFormedSlice(s, 250)).toBe(s);
  });

  it("repairs pre-existing orphans even without truncation", () => {
    expect(wellFormedSlice("ab\uD83Dcd", 100)).toBe("abcd");
  });

  it("fails safe on zero, negative and NaN limits", () => {
    expect(wellFormedSlice("abc", 0)).toBe("");
    expect(wellFormedSlice("abc", -5)).toBe("");
    expect(wellFormedSlice("abc", Number.NaN)).toBe("");
  });
});

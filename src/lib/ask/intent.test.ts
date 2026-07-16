import { describe, expect, it } from "vitest";
import {
  ASK_INTENT_KEY_PREFIX,
  ASK_QUESTION_MAX,
  askIntentStorageKey,
  clearAskIntents,
  isAskIntentId,
  normalizeAskQuestion,
} from "./intent";

describe("isAskIntentId: bounds an untrusted ?intent=", () => {
  it("accepts a crypto.randomUUID() value", () => {
    expect(isAskIntentId(crypto.randomUUID())).toBe(true);
    expect(isAskIntentId("3f1a2b4c-5d6e-4f70-8901-abcdef123456")).toBe(true);
  });

  it("rejects anything that is not a lowercase-hex UUID", () => {
    for (const bad of [
      "",
      "not-a-uuid",
      "3F1A2B4C-5D6E-4F70-8901-ABCDEF123456", // uppercase: not what randomUUID emits
      "3f1a2b4c-5d6e-4f70-8901-abcdef12345", // one char short
      "3f1a2b4c-5d6e-4f70-8901-abcdef1234567", // one char long
      "3f1a2b4c-5d6e-4f70-8901-abcdef123456 ",
      "../../etc/passwd",
      "3f1a2b4c-5d6e-4f70-8901-abcdef123456:extra",
    ]) {
      expect(isAskIntentId(bad), bad).toBe(false);
    }
  });

  it("rejects non-strings — searchParams can hand back arrays or undefined", () => {
    for (const bad of [undefined, null, 42, ["3f1a2b4c-5d6e-4f70-8901-abcdef123456"], {}]) {
      expect(isAskIntentId(bad)).toBe(false);
    }
  });
});

describe("askIntentStorageKey", () => {
  it("namespaces the key, so a bounded intent can only ever name our own entries", () => {
    expect(askIntentStorageKey("3f1a2b4c-5d6e-4f70-8901-abcdef123456")).toBe(
      "bnow.ask.intent:3f1a2b4c-5d6e-4f70-8901-abcdef123456",
    );
  });
});

describe("clearAskIntents", () => {
  // A Storage stand-in that behaves like the real thing in the one way this function
  // depends on: Object.keys() enumerates the stored keys, and removeItem drops them
  // from that same enumeration. (The live-storage behaviour is covered end-to-end
  // against jsdom's real sessionStorage in src/components/home-ask-box.test.tsx.)
  function storageWith(entries: Record<string, string>): Storage {
    const s = { ...entries } as Record<string, unknown>;
    s.removeItem = (k: string) => void delete s[k];
    return s as unknown as Storage;
  }

  const intentKeys = (s: Storage) =>
    Object.keys(s).filter((k) => k.startsWith(ASK_INTENT_KEY_PREFIX));

  it("removes every intent entry", () => {
    const s = storageWith({
      "bnow.ask.intent:3f1a2b4c-5d6e-4f70-8901-abcdef123456": "orphaned question",
      "bnow.ask.intent:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee": "another orphan",
    });
    expect(intentKeys(s)).toHaveLength(2); // non-vacuous: they really were there

    clearAskIntents(s);

    expect(intentKeys(s)).toEqual([]);
  });

  it("leaves other namespaces alone — it shares sessionStorage with analytics", () => {
    const s = storageWith({
      "bnow.ask.intent:3f1a2b4c-5d6e-4f70-8901-abcdef123456": "mine",
      "posthog.session": "not mine",
      "some-other-key": "not mine either",
    });

    clearAskIntents(s);

    expect(intentKeys(s)).toEqual([]);
    expect((s as unknown as Record<string, unknown>)["posthog.session"]).toBe("not mine");
    expect((s as unknown as Record<string, unknown>)["some-other-key"]).toBe("not mine either");
  });

  it("is a no-op on an empty storage", () => {
    const s = storageWith({});
    expect(() => clearAskIntents(s)).not.toThrow();
    expect(intentKeys(s)).toEqual([]);
  });
});

describe("normalizeAskQuestion", () => {
  // Must match askAction's own `.trim().slice(0, 400)`, or the stored question and
  // the ?q= it travels beside could differ and the handoff would silently no-op.
  it("trims surrounding whitespace", () => {
    expect(normalizeAskQuestion("   what happened in kyiv?   ")).toBe("what happened in kyiv?");
  });

  it("caps at the action's 400-character limit", () => {
    const long = "a".repeat(500);
    expect(normalizeAskQuestion(long)).toHaveLength(ASK_QUESTION_MAX);
    expect(ASK_QUESTION_MAX).toBe(400);
  });

  it("trims before capping, in that order, exactly as askAction does", () => {
    const padded = `  ${"b".repeat(500)}  `;
    expect(normalizeAskQuestion(padded)).toBe("b".repeat(400));
  });

  it("leaves an ordinary question untouched", () => {
    expect(normalizeAskQuestion("did russia strike kyiv today")).toBe(
      "did russia strike kyiv today",
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  ASK_INTENT_KEY_PREFIX,
  ASK_QUESTION_MAX,
  ASK_QUESTION_MIN,
  askIntentStorageKey,
  clearAskIntents,
  isAskIntentId,
  normalizeAskQuestion,
} from "./intent";
import { dropIsolatedSurrogates } from "@/lib/text/well-formed-slice";

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
  // askAction (and every other boundary) now calls THIS function, so agreement is
  // structural; these cases pin the contract itself — trim, then cap at 400 UTF-16
  // code units — or the stored question and the ?q= it travels beside could differ
  // and the handoff would silently no-op.
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

describe("normalizeAskQuestion — well-formed UTF-16 (#97 Ask family)", () => {
  const wellFormed = (s: string) => dropIsolatedSurrogates(s) === s;

  it("is byte-identical on ordinary text in every supported script", () => {
    for (const q of [
      "What happened near Kharkiv yesterday?",
      "Що відбулося поблизу Харкова вчора?", // Ukrainian
      "Что произошло под Харьковом вчера?", // Russian
      "دیروز در نزدیکی خارکیف چه اتفاقی افتاد؟", // Persian
      "ماذا حدث بالقرب من خاركيف أمس؟", // Arabic
      "strike reported 💥🇺🇦 near the border", // astral emoji inside the limit
    ]) {
      const out = normalizeAskQuestion(q);
      expect(out).toBe(q);
      expect(Buffer.from(out, "utf8").equals(Buffer.from(q, "utf8"))).toBe(true);
    }
  });

  it("keeps an astral pair that fits ENTIRELY inside the 400-unit limit", () => {
    const q = "y".repeat(398) + "😀"; // pair occupies units 398-399: inside
    const out = normalizeAskQuestion(q);
    expect(out).toBe(q);
    expect(out).toHaveLength(ASK_QUESTION_MAX);
  });

  it("cannot emit an orphan when a pair straddles the 400 boundary", () => {
    // Old code kept unit 399 = the lone high half; the provider's strict JSON
    // parser rejects that whole request body (the #86/#97 failure).
    const q = "x".repeat(399) + "💥 and more text after the boundary";
    const out = normalizeAskQuestion(q);
    expect(out).toBe("x".repeat(399)); // limit - 1 units: the orphaned half is dropped
    expect(wellFormed(out)).toBe(true);
    expect(out).not.toContain("�"); // removed, never replaced
  });

  it("removes isolated high and low surrogates outright", () => {
    expect(normalizeAskQuestion("ab\uD800cd")).toBe("abcd");
    expect(normalizeAskQuestion("ab\uDC00cd")).toBe("abcd");
    expect(normalizeAskQuestion("\uD83Dwhat happened\uDC00")).toBe("what happened");
  });

  it("can normalize below the minimum — the boundary min-length gates run AFTER this and refuse", () => {
    const out = normalizeAskQuestion("ab\uD800"); // 3 units raw, 2 after repair
    expect(out).toBe("ab");
    expect(out.length).toBeLessThan(ASK_QUESTION_MIN);
  });

  it("deterministic boundary sweep: a pair at every offset around the cap never yields an orphan", () => {
    const oldNormalize = (raw: string) => raw.trim().slice(0, ASK_QUESTION_MAX);
    let oldMalformed = 0;
    for (let pad = 380; pad <= 420; pad++) {
      const q = "a".repeat(pad) + "🚀" + "b".repeat(30);
      const out = normalizeAskQuestion(q);
      expect(wellFormed(out), `pad=${pad}`).toBe(true);
      expect(out.length).toBeLessThanOrEqual(ASK_QUESTION_MAX);
      expect(normalizeAskQuestion(out), `pad=${pad} idempotent`).toBe(out);
      const old = oldNormalize(q);
      if (dropIsolatedSurrogates(old) !== old) {
        oldMalformed++; // the old code DID malform here…
      } else {
        expect(out, `pad=${pad}`).toBe(old); // …and everywhere else the two agree exactly
      }
    }
    expect(oldMalformed).toBe(1); // exactly the straddle offset (pad 399): non-vacuous sweep
  });

  it("is IDEMPOTENT — the home box stores its output and /ask re-applies it to ?q=, so a second pass must be the identity", () => {
    // Both shapes defeat a single leading trim: truncation exposing trailing
    // whitespace, and a dropped orphan shielding whitespace from the trim.
    for (const raw of [
      "x".repeat(399) + " yz", // the 400-unit cut lands ON the space
      "hello \uD800", // the orphan shields the trailing space, then is dropped
      "  plain  ",
      "y".repeat(398) + "😀",
      "x".repeat(399) + "💥 tail",
    ]) {
      const once = normalizeAskQuestion(raw);
      expect(normalizeAskQuestion(once), JSON.stringify(raw.slice(0, 24))).toBe(once);
      expect(wellFormed(once)).toBe(true);
    }
    // The two motivating cases resolve to fully-trimmed output.
    expect(normalizeAskQuestion("x".repeat(399) + " yz")).toBe("x".repeat(399));
    expect(normalizeAskQuestion("hello \uD800")).toBe("hello");
  });
});

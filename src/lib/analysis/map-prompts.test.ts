import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  MAP_RESPONSE_SCHEMA,
  MAP_USER_FRAME_REV,
  dropIsolatedSurrogates,
  mapContentChars,
  mapDocLine,
  mapExtractorVersion,
  mapModel,
  mapResponseSchema,
  mapSystemPrompt,
  mapUserMessage,
  wellFormedSlice,
} from "./map-prompts";
import { ENTITY_RULES } from "./tracks";

const SAVED_KEYS = [
  "MAP_CONTENT_CHARS",
  "MAP_MODEL",
  "MAP_REASONING_EFFORT",
  "REDUCE_MODEL",
  "REDUCE_REASONING_EFFORT",
  "OPENAI_MODEL",
] as const;
const SAVED = Object.fromEntries(SAVED_KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of SAVED_KEYS) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
});

// strict:true rejects any object schema that is not fully closed: every object
// must set additionalProperties:false and require every property it declares.
function assertStrictCompatible(node: unknown, path = "$"): void {
  if (typeof node !== "object" || node === null) return;
  const obj = node as Record<string, unknown>;
  if (obj.type === "object") {
    expect(obj.additionalProperties, `${path}.additionalProperties`).toBe(false);
    const props = Object.keys((obj.properties as Record<string, unknown>) ?? {});
    expect((obj.required as string[]).sort(), `${path}.required`).toEqual(props.sort());
  }
  for (const [k, v] of Object.entries(obj)) assertStrictCompatible(v, `${path}.${k}`);
}

describe("MAP_RESPONSE_SCHEMA", () => {
  it("is strict-mode compatible at every nesting level", () => {
    assertStrictCompatible(MAP_RESPONSE_SCHEMA);
  });

  it("per-batch schema pins results to exactly the batch size", () => {
    // grammar-enforced omission fix: without bounds gpt-4o-mini answered 1 of
    // 15 docs (measured); the API accepts minItems/maxItems under strict mode
    const s = mapResponseSchema(17);
    expect(s.properties.results.minItems).toBe(17);
    expect(s.properties.results.maxItems).toBe(17);
    assertStrictCompatible(s);
  });

  it("is keyed by docId with the five-value hedging enum", () => {
    const result = MAP_RESPONSE_SCHEMA.properties.results.items;
    expect(result.required).toContain("docId");
    const claim = result.properties.claims.items;
    expect(claim.properties.hedging.enum).toEqual([
      "confirmed",
      "claimed",
      "unverified",
      "assessed",
      "unknown",
    ]);
    expect(claim.required).toContain("quote_orig");
    expect(claim.required).toContain("event_hint");
  });
});

describe("map prompts", () => {
  it("every track prompt carries the per-doc hard rules and ENTITY_RULES", () => {
    for (const [track, theater] of [
      ["military", "ru"],
      ["military", "ir"],
      ["elite_politics", "ru"],
      ["nuclear", "ir"],
    ] as const) {
      const p = mapSystemPrompt(track, theater);
      expect(p).toContain("EXACTLY ONE entry for EVERY docId");
      expect(p).toContain("zero claims");
      expect(p).toContain("COPIED CHARACTER-FOR-CHARACTER");
      expect(p).toContain(ENTITY_RULES);
      // single-doc 'confirmed' stays restricted to self-corroborating docs
      expect(p).toMatch(/'confirmed' ONLY for facts this document itself/);
    }
  });

  it("ir military gets the posture-and-proxy variant, ru the front-line one", () => {
    expect(mapSystemPrompt("military", "ir")).toContain("Strait of Hormuz");
    expect(mapSystemPrompt("military", "ru")).not.toContain("Strait of Hormuz");
  });
});

describe("mapUserMessage", () => {
  it("demands an entry per docId with the explicit id checklist (frame rev 2)", () => {
    // rev 1 framing measured a 43% per-batch omission rate — the checklist is
    // the fix; if it disappears, omissions come back silently
    const msg = mapUserMessage("military", "ru", [11, 22, 33], ["[11] a", "[22] b", "[33] c"]);
    expect(msg).toContain("Return exactly 3 result entries");
    expect(msg).toContain("11, 22, 33");
  });
});

describe("mapDocLine", () => {
  it("keeps 1500 chars of body — not the batch pipeline's 400", () => {
    delete process.env.MAP_CONTENT_CHARS;
    const line = mapDocLine({
      id: 42,
      sourceKey: "t.me/rybar",
      reliability: 0.4885,
      day: "2026-07-08",
      title: "Сводка",
      content: "п".repeat(3000),
    });
    expect(line.startsWith("[42] (t.me/rybar, rel=0.49, 2026-07-08) ")).toBe(true);
    const body = line.slice(line.indexOf(") ") + 2);
    expect(body.length).toBe(1500);
  });

  it("collapses whitespace and survives null source/reliability", () => {
    const line = mapDocLine({
      id: 1,
      sourceKey: null,
      reliability: null,
      day: "2026-07-04",
      title: null,
      content: "a\n\n b\t\tc",
    });
    expect(line).toBe("[1] (unknown, rel=?, 2026-07-04) a b c");
  });
});

describe("mapExtractorVersion", () => {
  it("is stable for the same (track, theater)", () => {
    expect(mapExtractorVersion("military", "ru")).toBe(mapExtractorVersion("military", "ru"));
  });

  it("differs across tracks AND across theater prompt variants", () => {
    const versions = new Set([
      mapExtractorVersion("military", "ru"),
      mapExtractorVersion("military", "ir"), // ir variant prompt => own version
      mapExtractorVersion("elite_politics", "ru"),
      mapExtractorVersion("nuclear", "ir"),
    ]);
    expect(versions.size).toBe(4);
  });

  it("changes when the per-doc content budget changes", () => {
    delete process.env.MAP_CONTENT_CHARS;
    const before = mapExtractorVersion("military", "ru");
    process.env.MAP_CONTENT_CHARS = "800";
    expect(mapExtractorVersion("military", "ru")).not.toBe(before);
  });

  it("ua and ru military share a version — same prompt, claims comparable", () => {
    expect(mapExtractorVersion("military", "ua")).toBe(mapExtractorVersion("military", "ru"));
  });

  it("with no model env the basis is byte-identical to the historical formula", () => {
    // Pins that call-time resolution changed NOTHING for the deployed corpus:
    // absent envs must reproduce exactly the pre-routing version strings, or
    // every doc_claims row would silently go stale on deploy.
    for (const k of ["MAP_MODEL", "OPENAI_MODEL", "MAP_REASONING_EFFORT"]) delete process.env[k];
    const historicalBasis = [
      "gpt-4o-mini",
      mapSystemPrompt("military", "ru"),
      `frame=${MAP_USER_FRAME_REV}`,
      `content=${mapContentChars()}`,
    ].join("\n ");
    const expected = `gpt-4o-mini:${createHash("sha256").update(historicalBasis).digest("hex").slice(0, 12)}`;
    expect(mapExtractorVersion("military", "ru")).toBe(expected);
  });

  it("MAP_MODEL changes the version; REDUCE_MODEL never does", () => {
    for (const k of ["MAP_MODEL", "OPENAI_MODEL", "MAP_REASONING_EFFORT", "REDUCE_MODEL"])
      delete process.env[k];
    const base = mapExtractorVersion("military", "ru");
    process.env.REDUCE_MODEL = "gpt-5";
    process.env.REDUCE_REASONING_EFFORT = "high";
    expect(mapExtractorVersion("military", "ru")).toBe(base);
    process.env.MAP_MODEL = "gpt-5-mini";
    const routed = mapExtractorVersion("military", "ru");
    expect(routed).not.toBe(base);
    expect(routed.startsWith("gpt-5-mini:")).toBe(true);
  });

  it("OPENAI_MODEL still changes the version (pre-existing fallback behavior)", () => {
    for (const k of ["MAP_MODEL", "OPENAI_MODEL", "MAP_REASONING_EFFORT"]) delete process.env[k];
    const base = mapExtractorVersion("military", "ru");
    process.env.OPENAI_MODEL = "gpt-4o";
    expect(mapExtractorVersion("military", "ru")).not.toBe(base);
  });

  it("a validated MAP_REASONING_EFFORT on a reasoning model changes the version", () => {
    for (const k of ["MAP_MODEL", "OPENAI_MODEL", "MAP_REASONING_EFFORT"]) delete process.env[k];
    process.env.MAP_MODEL = "gpt-5";
    const noEffort = mapExtractorVersion("military", "ru");
    process.env.MAP_REASONING_EFFORT = "low";
    const withEffort = mapExtractorVersion("military", "ru");
    expect(withEffort).not.toBe(noEffort);
    process.env.MAP_REASONING_EFFORT = "medium";
    expect(mapExtractorVersion("military", "ru")).not.toBe(withEffort);
  });

  it("pins the four extractor versions the deployed corpus was written under", () => {
    // Ruling 13: a version bump silently strands every persisted doc_claims row
    // and needs its own remap path (#33). These four strings are the versions
    // production has been writing since the map stage shipped; the #86 Unicode
    // repair changes the TRUNCATION ALGORITHM only, and the version basis is
    // (model, system prompt, frame rev, content budget) — none of which moves.
    // If this test fails, the change is NOT a same-version repair.
    for (const k of ["MAP_MODEL", "OPENAI_MODEL", "MAP_REASONING_EFFORT", "MAP_CONTENT_CHARS"])
      delete process.env[k];
    expect(mapExtractorVersion("military", "ru")).toBe("gpt-4o-mini:d73cc83ed8df");
    expect(mapExtractorVersion("military", "ua")).toBe("gpt-4o-mini:d73cc83ed8df");
    expect(mapExtractorVersion("military", "ir")).toBe("gpt-4o-mini:75e0ff6403db");
    expect(mapExtractorVersion("elite_politics", "ru")).toBe("gpt-4o-mini:15a6078371bd");
    expect(mapExtractorVersion("elite_politics", "ir")).toBe("gpt-4o-mini:15a6078371bd");
    expect(mapExtractorVersion("nuclear", "ir")).toBe("gpt-4o-mini:19c06260f149");
  });

  it("an effort that cannot dispatch (invalid / non-reasoning model) never shifts the version", () => {
    for (const k of ["MAP_MODEL", "OPENAI_MODEL", "MAP_REASONING_EFFORT"]) delete process.env[k];
    const base = mapExtractorVersion("military", "ru");
    process.env.MAP_REASONING_EFFORT = "low"; // gpt-4o-mini: dispatch fails closed
    expect(mapExtractorVersion("military", "ru")).toBe(base);
    process.env.MAP_MODEL = "gpt-5";
    process.env.MAP_REASONING_EFFORT = "bogus"; // invalid: dispatch fails closed
    expect(mapExtractorVersion("military", "ru")).toBe(
      (() => {
        delete process.env.MAP_REASONING_EFFORT;
        return mapExtractorVersion("military", "ru");
      })(),
    );
  });
});

describe("mapModel", () => {
  it("resolves at call time: MAP_MODEL → OPENAI_MODEL → gpt-4o-mini", () => {
    for (const k of ["MAP_MODEL", "OPENAI_MODEL"]) delete process.env[k];
    expect(mapModel()).toBe("gpt-4o-mini");
    process.env.OPENAI_MODEL = "gpt-4o";
    expect(mapModel()).toBe("gpt-4o");
    process.env.MAP_MODEL = "gpt-5-mini";
    expect(mapModel()).toBe("gpt-5-mini");
  });
});

// --- OPEN-TASKS #86: scalar-safe truncation -------------------------------
//
// The provider rejects a request whose JSON carries an unpaired surrogate
// (emitted by JSON.stringify as the literal escape `\udXXX`) with
// `400 Invalid body: failed to parse JSON value`, and one poisoned document
// kills its entire 20-doc micro-batch. The invariant held here is UNICODE
// SCALAR VALIDITY of everything mapDocLine emits. Grapheme-cluster integrity is
// explicitly NOT promised: truncation may still cut a ZWJ sequence or strand a
// variation selector, both of which are valid Unicode.
//
// Every astral / invisible character below is written as an explicit escape so
// the source stays reviewable in plain ASCII and the code-unit arithmetic is
// visible rather than implied.

/** Independent oracle: lookaround-based, deliberately NOT the production
 *  implementation, so these tests cannot pass by agreeing with themselves. */
const ISOLATED_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

const HI = "\uD83D"; //         high half of U+1F680 ROCKET
const LO = "\uDE80"; //         low half of U+1F680
const PAIR = HI + LO; //        U+1F680, 2 code units
const HI2 = "\uD83C"; //        high half of U+1F389 PARTY POPPER
const LO2 = "\uDF89"; //        low half of U+1F389
const PAIR2 = HI2 + LO2; //     U+1F389, 2 code units
const ZWJ = "\u200D"; //       zero-width joiner (BMP)
const VS16 = "\uFE0F"; //      variation selector-16 (BMP)
const COMBINING_ACUTE = "\u0301";
const MAN = "\uD83D\uDC68"; // U+1F468
const WOMAN = "\uD83D\uDC69"; // U+1F469
const GIRL = "\uD83D\uDC67"; // U+1F467

describe("dropIsolatedSurrogates", () => {
  it("is the identity on surrogate-free text, including Cyrillic, Persian and Arabic", () => {
    for (const s of [
      "",
      "plain ascii",
      "Удар по порту, Сили оборони України відзвітували",
      "حمله موشکی گزارش شد",
      "أفادت التقارير بوقوع غارة",
      `combining e${COMBINING_ACUTE} · joiner${ZWJ}here · heart❤${VS16}`,
    ]) {
      expect(dropIsolatedSurrogates(s)).toBe(s);
    }
  });

  it("preserves complete pairs byte-for-byte, including adjacent ones and ZWJ sequences", () => {
    const family = `${MAN}${ZWJ}${WOMAN}${ZWJ}${GIRL}`;
    for (const s of [PAIR, PAIR + PAIR2, `a${PAIR}b${PAIR2}c`, family, `${PAIR}${VS16}`]) {
      expect(dropIsolatedSurrogates(s)).toBe(s);
      expect(ISOLATED_SURROGATE.test(dropIsolatedSurrogates(s))).toBe(false);
    }
  });

  it("removes a pre-existing isolated HIGH surrogate and keeps everything else", () => {
    expect(dropIsolatedSurrogates(`ab${HI}cd`)).toBe("abcd");
    expect(dropIsolatedSurrogates(HI)).toBe("");
    expect(dropIsolatedSurrogates(`x${PAIR}${HI}y${PAIR2}`)).toBe(`x${PAIR}y${PAIR2}`);
  });

  it("removes a pre-existing isolated LOW surrogate and keeps everything else", () => {
    expect(dropIsolatedSurrogates(`ab${LO}cd`)).toBe("abcd");
    expect(dropIsolatedSurrogates(LO)).toBe("");
    expect(dropIsolatedSurrogates(`${LO}${PAIR}${LO2}`)).toBe(PAIR);
  });

  it("does not pair halves that are not adjacent, and never grows the string", () => {
    expect(dropIsolatedSurrogates(`${LO}${HI}`)).toBe(""); // LOW before HIGH is two orphans
    expect(dropIsolatedSurrogates(`${HI}x${LO}`)).toBe("x");
    expect(dropIsolatedSurrogates(`${HI}${HI}${LO}`)).toBe(PAIR); // 1st orphan, 2nd pairs
    expect(dropIsolatedSurrogates(`${HI}${LO}${LO}`)).toBe(PAIR); // pair, then an orphan
    for (const s of [`${HI}${HI}`, `${LO}${LO}`, `${HI}${LO}${HI}`]) {
      expect(dropIsolatedSurrogates(s).length).toBeLessThanOrEqual(s.length);
      expect(ISOLATED_SURROGATE.test(dropIsolatedSurrogates(s))).toBe(false);
    }
  });

  it("is idempotent", () => {
    for (const s of [`a${HI}b`, `${LO}${PAIR}`, PAIR, "plain"]) {
      const once = dropIsolatedSurrogates(s);
      expect(dropIsolatedSurrogates(once)).toBe(once);
    }
  });
});

describe("wellFormedSlice", () => {
  const L = 10;

  it("returns content below, exactly at, and above the limit correctly", () => {
    expect(wellFormedSlice("abc", L)).toBe("abc");
    expect(wellFormedSlice("a".repeat(L), L)).toBe("a".repeat(L));
    expect(wellFormedSlice("a".repeat(L + 5), L)).toBe("a".repeat(L));
  });

  it("a complete pair ENDING at the boundary is kept in full", () => {
    const s = "a".repeat(L - 2) + PAIR + "tail";
    expect(wellFormedSlice(s, L)).toBe("a".repeat(L - 2) + PAIR);
    expect(wellFormedSlice(s, L).length).toBe(L);
  });

  it("a boundary falling BETWEEN a valid high and low half drops the whole pair", () => {
    const s = "a".repeat(L - 1) + PAIR + "tail";
    const out = wellFormedSlice(s, L);
    expect(out).toBe("a".repeat(L - 1));
    expect(out.length).toBe(L - 1); // exactly one code unit shorter, never longer
    expect(ISOLATED_SURROGATE.test(out)).toBe(false);
  });

  it("a high surrogate immediately before the boundary with no low half is dropped too", () => {
    const s = "a".repeat(L - 1) + HI + "bbbbb";
    expect(wellFormedSlice(s, L)).toBe("a".repeat(L - 1));
  });

  it("a complete pair starting immediately AFTER the boundary is simply cut off", () => {
    expect(wellFormedSlice("a".repeat(L) + PAIR, L)).toBe("a".repeat(L));
  });

  it("adjacent astral characters straddling the boundary: the fitting one survives", () => {
    const s = "a".repeat(L - 3) + PAIR + PAIR2; // PAIR at L-3..L-2, PAIR2 at L-1..L
    const out = wellFormedSlice(s, L);
    expect(out).toBe("a".repeat(L - 3) + PAIR);
    expect(ISOLATED_SURROGATE.test(out)).toBe(false);
  });

  it("keeps emoji + variation selector and ZWJ sequences intact when they fit", () => {
    const heart = `❤${VS16}`;
    const couple = `${MAN}${ZWJ}${WOMAN}`; // 5 code units
    expect(wellFormedSlice(`x${heart}`, 50)).toBe(`x${heart}`);
    expect(wellFormedSlice(couple, 50)).toBe(couple);
    // cutting a ZWJ sequence mid-way is permitted: scalar-valid, grapheme-broken
    const cut = wellFormedSlice(couple, 3);
    expect(cut).toBe(`${MAN}${ZWJ}`);
    expect(ISOLATED_SURROGATE.test(cut)).toBe(false);
    // and cutting between the joiner and the second astral char, likewise
    const cut4 = wellFormedSlice(couple, 4);
    expect(cut4).toBe(`${MAN}${ZWJ}`);
  });

  it("never emits an isolated surrogate for any boundary offset (fixed-seed property sweep)", () => {
    // deterministic LCG — no Math.random, so any failure reproduces exactly
    let seed = 20260823 >>> 0;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const alphabet = ["a", "б", "ی", "ع", COMBINING_ACUTE, ZWJ, VS16, PAIR, PAIR2, HI, LO];
    for (let limit = 6; limit <= 24; limit++) {
      for (let trial = 0; trial < 40; trial++) {
        let s = "";
        while (s.length < limit + 6) s += alphabet[Math.floor(rnd() * alphabet.length)];
        const out = wellFormedSlice(s, limit);
        expect(ISOLATED_SURROGATE.test(out)).toBe(false);
        expect(out.length).toBeLessThanOrEqual(limit);
        // the output is a code-unit SUBSEQUENCE of the input (nothing invented)
        let j = 0;
        for (let k = 0; k < out.length; k++) {
          while (j < s.length && s[j] !== out[k]) j++;
          expect(j).toBeLessThan(s.length);
          j++;
        }
      }
    }
  });

  it("fails safe on a non-positive or NaN limit instead of reverse-slicing", () => {
    expect(wellFormedSlice("abcdef", 0)).toBe("");
    expect(wellFormedSlice("abcdef", -3)).toBe("");
    expect(wellFormedSlice("abcdef", Number.NaN)).toBe("");
  });
});

describe("mapDocLine — Unicode safety (#86)", () => {
  it("emits no isolated surrogate when the content ceiling splits an emoji", () => {
    delete process.env.MAP_CONTENT_CHARS;
    const limit = mapContentChars();
    const line = mapDocLine({
      id: 7,
      sourceKey: "t.me/example",
      reliability: 0.5,
      day: "2026-07-16",
      title: null,
      content: "a".repeat(limit - 1) + PAIR + " tail",
    });
    expect(ISOLATED_SURROGATE.test(line)).toBe(false);
    expect(JSON.stringify(line)).not.toMatch(/\\ud[89ab][0-9a-f]{2}/i);
    const body = line.slice(line.indexOf(") ") + 2);
    expect(body).toBe("a".repeat(limit - 1)); // the split pair is gone; nothing else changed
  });

  it("the TITLE prefix moves the boundary, and the result is still well-formed", () => {
    delete process.env.MAP_CONTENT_CHARS;
    const limit = mapContentChars();
    const title = "Сводка"; // body = `${title}. ` + content
    const content = "a".repeat(limit - 1 - (title.length + 2)) + PAIR + " tail";
    const line = mapDocLine({ id: 8, sourceKey: null, reliability: null, day: "2026-07-16", title, content });
    expect(ISOLATED_SURROGATE.test(line)).toBe(false);
    const body = line.slice(line.indexOf(") ") + 2);
    expect(body.length).toBe(limit - 1);
    expect(body.startsWith("Сводка. ")).toBe(true);
    expect(line.startsWith("[8] (unknown, rel=?, 2026-07-16) ")).toBe(true);
  });

  it("WHITESPACE COLLAPSE moves the boundary, and the result is still well-formed", () => {
    delete process.env.MAP_CONTENT_CHARS;
    const limit = mapContentChars();
    const padded = "a  ".repeat(300); // 900 code units -> 600 after collapse
    const filler = "b".repeat(limit - 1 - 600);
    const line = mapDocLine({
      id: 9, sourceKey: "example.com", reliability: 0.1, day: "2026-07-16",
      title: null, content: padded + filler + PAIR + " tail",
    });
    expect(ISOLATED_SURROGATE.test(line)).toBe(false);
    const body = line.slice(line.indexOf(") ") + 2);
    expect(body.length).toBe(limit - 1);
    expect(body.endsWith("b")).toBe(true);
  });

  it("carries a malformed sourceKey through the same guarantee", () => {
    const line = mapDocLine({
      id: 10, sourceKey: `t.me/bad${HI}key`, reliability: 0.5, day: "2026-07-16",
      title: null, content: "short body",
    });
    expect(ISOLATED_SURROGATE.test(line)).toBe(false);
    expect(line).toBe("[10] (t.me/badkey, rel=0.50, 2026-07-16) short body");
  });

  it("BMP-only documents are byte-identical to the pre-repair output", () => {
    delete process.env.MAP_CONTENT_CHARS;
    const limit = mapContentChars();
    const cases = [
      { title: "Сводка", content: "п".repeat(3000) },
      { title: null, content: "حمله موشکی. ".repeat(200) },
      { title: "تقرير", content: "أفادت التقارير. ".repeat(60) },
      { title: null, content: "short" },
    ];
    for (const [i, c] of cases.entries()) {
      const d = { id: 100 + i, sourceKey: "s", reliability: 0.5, day: "2026-07-16", ...c };
      const body = ((d.title ? d.title + ". " : "") + d.content).replace(/\s+/g, " ");
      expect(mapDocLine(d)).toBe(`[${d.id}] (s, rel=0.50, 2026-07-16) ${body.slice(0, limit)}`);
    }
  });

  it("documents whose astral characters all fit are byte-identical to the pre-repair output", () => {
    delete process.env.MAP_CONTENT_CHARS;
    const limit = mapContentChars();
    const d = {
      id: 200, sourceKey: "t.me/x", reliability: 0.9, day: "2026-07-16",
      title: `Атака ${PAIR}`, content: `${PAIR2} колонна техники ${PAIR} — гарний день`,
    };
    const body = ((d.title ? d.title + ". " : "") + d.content).replace(/\s+/g, " ");
    expect(mapDocLine(d)).toBe(`[200] (t.me/x, rel=0.90, 2026-07-16) ${body.slice(0, limit)}`);
  });
});

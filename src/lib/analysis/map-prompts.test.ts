import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  MAP_RESPONSE_SCHEMA,
  MAP_USER_FRAME_REV,
  mapContentChars,
  mapDocLine,
  mapExtractorVersion,
  mapModel,
  mapResponseSchema,
  mapSystemPrompt,
  mapUserMessage,
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

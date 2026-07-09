import { afterEach, describe, expect, it } from "vitest";
import {
  MAP_RESPONSE_SCHEMA,
  mapDocLine,
  mapExtractorVersion,
  mapSystemPrompt,
  mapUserMessage,
} from "./map-prompts";
import { ENTITY_RULES } from "./tracks";

const SAVED = { MAP_CONTENT_CHARS: process.env.MAP_CONTENT_CHARS };
afterEach(() => {
  if (SAVED.MAP_CONTENT_CHARS === undefined) delete process.env.MAP_CONTENT_CHARS;
  else process.env.MAP_CONTENT_CHARS = SAVED.MAP_CONTENT_CHARS;
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
});

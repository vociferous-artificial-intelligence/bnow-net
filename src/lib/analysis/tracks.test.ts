import { describe, expect, it } from "vitest";
import { isEliteRelevant, TRACKS } from "./tracks";

/** The `event type:` line each prompt gives the model, parsed back out. Military
 *  states no such line — its vocabulary lives only in the schema. */
function promptEventTypes(prompt: string): string[] | null {
  const m = prompt.match(/^\s*\d+\.\s*event type:\s*(.+)$/im);
  return m ? m[1].trim().replace(/\.$/, "").split("|") : null;
}

describe("per-track response schema", () => {
  it("gives each track its own events[].type enum", async () => {
    const { responseSchemaFor } = await import("./openai-provider");
    const typeEnum = (track?: string) =>
      responseSchemaFor(track).properties.events.items.properties.type.enum;

    expect(typeEnum("military")).toContain("strike");
    expect(typeEnum("elite_politics")).toContain("prosecution");
    expect(typeEnum("nuclear")).toContain("enrichment");

    // the bug: elite/nuclear events had to be labelled from the military vocabulary
    expect(typeEnum("elite_politics")).not.toContain("strike");
    expect(typeEnum("nuclear")).not.toContain("strike");
    expect(typeEnum("military")).not.toContain("prosecution");
  });

  it("falls back to military for an absent or unknown track", async () => {
    const { responseSchemaFor } = await import("./openai-provider");
    const typeEnum = (track?: string) =>
      responseSchemaFor(track).properties.events.items.properties.type.enum;
    expect(typeEnum(undefined)).toEqual(TRACKS.military.eventTypes);
    expect(typeEnum("not_a_track")).toEqual(TRACKS.military.eventTypes);
  });

  it("every enum value a prompt asks for is reachable under strict:true", () => {
    let checked = 0;
    for (const cfg of Object.values(TRACKS)) {
      const asked = cfg.systemPrompt ? promptEventTypes(cfg.systemPrompt) : null;
      if (!asked) continue; // military states no event-type line
      expect(new Set(cfg.eventTypes)).toEqual(new Set(asked));
      checked++;
    }
    // guard the guard: if the prompts stop stating "event type:", this test must
    // fail rather than silently check nothing
    expect(checked).toBe(2); // elite_politics + nuclear
  });

  it("keeps 'other' as an escape hatch on every track", () => {
    for (const cfg of Object.values(TRACKS)) expect(cfg.eventTypes).toContain("other");
  });
});

describe("elite politics lexicon", () => {
  it("matches ru/en prosecution and elite-churn language", () => {
    expect(isEliteRelevant("Суд арестовал активы бывшего губернатора по делу о взятке")).toBe(true);
    expect(isEliteRelevant("ФСБ провела обыски в офисах компании, возбуждено уголовное дело")).toBe(true);
    expect(isEliteRelevant("The court sentenced the oligarch to 12 years for embezzlement")).toBe(true);
    expect(isEliteRelevant("Замминистра обороны задержан по подозрению в хищении")).toBe(true);
    expect(isEliteRelevant("Бизнес-империю миллиардера ждет национализация")).toBe(true);
  });
  it("ignores frontline and routine content", () => {
    expect(isEliteRelevant("Российские войска продолжают наступление под Покровском")).toBe(false);
    expect(isEliteRelevant("Weather forecast for Moscow this weekend")).toBe(false);
  });
  it("track config sanity", () => {
    expect(TRACKS.military.validated).toBe(true);
    expect(TRACKS.elite_politics.validated).toBe(false);
    expect(TRACKS.elite_politics.countries).toContain("ru");
    expect(TRACKS.elite_politics.countries).toContain("ir");
    expect(TRACKS.nuclear.countries).toEqual(["ir"]);
  });
});

import { isNuclearRelevant } from "./tracks";
describe("nuclear lexicon", () => {
  it("matches enrichment/IAEA/facility terms (en + farsi)", () => {
    expect(isNuclearRelevant("Iran expanded enrichment to 60 percent at Fordow, IAEA says")).toBe(true);
    expect(isNuclearRelevant("سانتریفیوژهای جدید در نطنز نصب شد")).toBe(true);
  });
  it("ignores unrelated content", () => {
    expect(isNuclearRelevant("Oil prices rose in Gulf trading today")).toBe(false);
  });
});

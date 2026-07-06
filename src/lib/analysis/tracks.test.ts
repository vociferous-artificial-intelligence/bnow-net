import { describe, expect, it } from "vitest";
import { isEliteRelevant, TRACKS } from "./tracks";

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

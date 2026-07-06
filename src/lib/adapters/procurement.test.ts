import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSearchResults, PROCUREMENT_KEYWORDS } from "./procurement";

const fixture = readFileSync(
  join(process.cwd(), "fixtures", "adapters", "zakupki-results.html"),
  "utf8",
);

describe("procurement parseSearchResults", () => {
  const docs = parseSearchResults(fixture, "фортификационных");

  it("extracts tenders as RawDocs", () => {
    expect(docs.length).toBe(3);
    const d = docs[0];
    expect(d.adapter).toBe("procurement");
    expect(d.sourceKey).toBe("zakupki.gov.ru");
    expect(d.countryIso2).toBe("ru");
    expect(d.externalId).toContain("0173100004526000123");
    expect(d.url).toMatch(/^https:\/\/zakupki\.gov\.ru/);
  });

  it("captures customer, price and region in meta", () => {
    const drone = docs[1];
    expect(drone.title).toContain("беспилотных");
    expect(drone.meta.customer).toContain("Министерство обороны");
    expect(drone.meta.priceRub).toBe("1120000000,00");
    expect(drone.meta.region).toContain("Москва");
    expect(drone.meta.tender).toBe(true);
  });

  it("surfaces the military-graves signal (casualty proxy)", () => {
    const graves = docs[2];
    expect(graves.title).toContain("захоронению военнослужащих");
    expect(graves.meta.customer).toContain("комиссариат");
  });

  it("keyword list covers capability + casualty + strain terms", () => {
    expect(PROCUREMENT_KEYWORDS).toContain("беспилотн");
    expect(PROCUREMENT_KEYWORDS).toContain("воинских захоронений");
    expect(PROCUREMENT_KEYWORDS.length).toBeGreaterThanOrEqual(6);
  });
});

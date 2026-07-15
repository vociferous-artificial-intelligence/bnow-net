import { describe, expect, it } from "vitest";
import { matchEntity, sanitizeForPersist } from "./opensanctions";

// With no OPENSANCTIONS_API_KEY (test env), the fixture stub answers deterministically.
describe("opensanctions stub", () => {
  it("flags a seeded sanctioned person", async () => {
    const r = await matchEntity("Timur Ivanov", "person");
    expect(r).not.toBeNull();
    expect(r!.matched).toBe(true);
    expect(r!.sanctioned).toBe(true);
    expect(r!.topics).toContain("sanction");
    expect(r!.datasets.length).toBeGreaterThan(0);
  });
  it("is case-insensitive on names", async () => {
    const r = await matchEntity("  FSB  ", "agency");
    expect(r!.sanctioned).toBe(true);
  });
  it("returns unmatched for unknown names, never null in stub mode", async () => {
    const r = await matchEntity("Ivan Nobody", "person");
    expect(r).not.toBeNull();
    expect(r!.matched).toBe(false);
    expect(r!.sanctioned).toBe(false);
  });
});

// (13) truth-in-UI: a stub answer records the CHECK (so the rescore is resumable)
// but must never persist a fabricated sanctions/PEP assertion. A live rescore
// later upgrades the same row with real data.
describe("sanitizeForPersist", () => {
  it("strips a stub's fabricated match/sanction, keeping only checkedAt", () => {
    const s = sanitizeForPersist({
      matched: true,
      sanctioned: true,
      topics: ["sanction", "role.pep"],
      datasets: ["us_ofac"],
      osId: "NK-stub-123",
      score: 0.9,
      caption: "Fake Person",
      checkedAt: "2026-08-01T00:00:00.000Z",
      stub: true,
    });
    expect(s.stub).toBe(true);
    expect(s.matched).toBe(false);
    expect(s.sanctioned).toBe(false);
    expect(s.topics).toEqual([]);
    expect(s.datasets).toEqual([]);
    expect(s.osId).toBeNull();
    expect(s.score).toBe(0);
    expect(s.caption).toBeNull();
    expect(s.checkedAt).toBe("2026-08-01T00:00:00.000Z"); // the check is still recorded
  });

  it("passes a real (non-stub) live result through unchanged", () => {
    const live = {
      matched: true,
      sanctioned: true,
      topics: ["sanction"],
      datasets: ["us_ofac"],
      osId: "Q123",
      score: 0.95,
      caption: "Real Person",
      checkedAt: "2026-08-01T00:00:00.000Z",
    };
    expect(sanitizeForPersist(live)).toEqual(live);
  });
});

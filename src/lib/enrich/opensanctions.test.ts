import { describe, expect, it } from "vitest";
import { matchEntity } from "./opensanctions";

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

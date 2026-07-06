import { describe, expect, it } from "vitest";
import { resolveLinks, ownershipLive } from "./ownership";

// No keys in test env → stub mode with seeded fixtures.
describe("ownership stub", () => {
  it("is not live without keys", () => {
    expect(ownershipLive()).toBe(false);
  });
  it("resolves seeded company connections", async () => {
    const links = await resolveLinks("Gazprom", "company");
    expect(links).not.toBeNull();
    expect(links!.length).toBeGreaterThan(0);
    const relations = links!.map((l) => l.relation);
    expect(relations).toContain("subsidiary");
    expect(links!.every((l) => l.source === "stub")).toBe(true);
  });
  it("is case-insensitive and returns [] for unknowns", async () => {
    expect((await resolveLinks("  ROSNEFT ", "company"))!.length).toBeGreaterThan(0);
    expect(await resolveLinks("Nobody Ltd", "company")).toEqual([]);
  });
});

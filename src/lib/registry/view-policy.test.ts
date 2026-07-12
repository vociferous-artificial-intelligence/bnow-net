import { describe, expect, it } from "vitest";
import type { Role } from "@/lib/gate";
import { registryView, resolveRegistrySort, type RegistryView } from "./view-policy";

const ALL_ROLES: Array<Role | "anon"> = ["anon", "user", "analyst", "admin"];

describe("registryView", () => {
  it.each([
    ["anon", false],
    ["user", false],
    ["analyst", true],
    ["admin", true],
  ] as const)("role=%s -> full view is %s", (role, full) => {
    const view = registryView(role);
    expect(view.showReliability).toBe(full);
    expect(view.allowReliabilitySort).toBe(full);
    expect(view.showWeightConstants).toBe(full);
  });

  it("every field agrees within one role (no partial-moat states)", () => {
    for (const role of ALL_ROLES) {
      const values = Object.values(registryView(role));
      expect(new Set(values).size).toBe(1);
    }
  });

  it("fails closed for a role value outside the known union (defensive: the type is not a runtime guarantee)", () => {
    const view = registryView("superuser" as unknown as Role | "anon");
    expect(view).toEqual<RegistryView>({
      showReliability: false,
      allowReliabilitySort: false,
      showWeightConstants: false,
    });
  });

  it("returns the same reference for repeated calls with the same reduced role (pure, no per-call allocation surprises)", () => {
    expect(registryView("user")).toBe(registryView("anon"));
  });
});

describe("resolveRegistrySort", () => {
  const full = registryView("admin");
  const reduced = registryView("user");

  it.each([
    [undefined, full, "citations"],
    ["citations", full, "citations"],
    ["reliability", full, "reliability"],
    ["bogus", full, "citations"],
    ["", full, "citations"],
  ] as const)("full view: raw=%s -> %s", (raw, view, want) => {
    expect(resolveRegistrySort(raw, view)).toBe(want);
  });

  it.each([
    [undefined, "citations"],
    ["citations", "citations"],
    ["reliability", "citations"],
    ["bogus", "citations"],
  ] as const)(
    "reduced view: raw=%s always resolves to %s (reliability sort is ignored, not just hidden)",
    (raw, want) => {
      expect(resolveRegistrySort(raw, reduced)).toBe(want);
    },
  );
});

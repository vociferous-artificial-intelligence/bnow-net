import { afterEach, describe, expect, it } from "vitest";
import {
  BASELINE_PROFILE,
  CAPACITY_PROFILES,
  UNIMPLEMENTED_MATRIX_CELLS,
  applyCapacityProfile,
  capacityProfileNames,
  withCapacityProfileKey,
} from "./capacity-profiles";

const KNOB_ENVS = [
  "MAP_CONTENT_CHARS",
  "REDUCE_GROUPS_FED",
  "MAP_OUT_TOKENS_PER_DOC",
  "REDUCE_MAX_OUTPUT_TOKENS",
] as const;
const SAVED = Object.fromEntries(KNOB_ENVS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of KNOB_ENVS) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
});

describe("capacity profiles", () => {
  it("baseline clears every knob env so a stray shell export cannot masquerade", () => {
    process.env.MAP_CONTENT_CHARS = "9999";
    const restore = applyCapacityProfile(BASELINE_PROFILE);
    expect(process.env.MAP_CONTENT_CHARS).toBeUndefined();
    restore();
    expect(process.env.MAP_CONTENT_CHARS).toBe("9999");
  });

  it("a profile sets exactly its knobs and restore puts the world back", () => {
    delete process.env.REDUCE_GROUPS_FED;
    const restore = applyCapacityProfile("reduce-fed-400");
    expect(process.env.REDUCE_GROUPS_FED).toBe("400");
    expect(process.env.MAP_CONTENT_CHARS).toBeUndefined();
    restore();
    expect(process.env.REDUCE_GROUPS_FED).toBeUndefined();
  });

  it("map depth profiles stay within the production reader's accepted range", async () => {
    const { mapContentChars } = await import("../analysis/map-prompts");
    for (const name of capacityProfileNames()) {
      const restore = applyCapacityProfile(name);
      const v = mapContentChars();
      const declared = CAPACITY_PROFILES[name].mapContentChars;
      // the reader must ACCEPT the declared value (floor 200, no silent fallback)
      expect(v).toBe(declared ?? 1500);
      restore();
    }
  });

  it("reduce-fed profiles survive the production clamp (50..400)", async () => {
    const { reduceGroupsFed } = await import("../analysis/synthesize");
    const restore = applyCapacityProfile("reduce-fed-400");
    expect(reduceGroupsFed()).toBe(400); // NOT silently clamped away
    restore();
  });

  it("REDUCE_VOTES is inexpressible by construction (ruling 18)", () => {
    for (const profile of Object.values(CAPACITY_PROFILES)) {
      expect("reduceVotes" in profile).toBe(false);
    }
    for (const name of capacityProfileNames()) {
      const saved = process.env.REDUCE_VOTES;
      const restore = applyCapacityProfile(name);
      expect(process.env.REDUCE_VOTES).toBe(saved); // never touched
      restore();
    }
  });

  it("unknown profile throws with the roster", () => {
    expect(() => applyCapacityProfile("map-depth-9000")).toThrow(/unknown capacity profile/);
  });

  it("configKey suffix: baseline byte-exact, others suffixed", () => {
    expect(withCapacityProfileKey("offline-fixtures", BASELINE_PROFILE)).toBe("offline-fixtures");
    expect(withCapacityProfileKey("gpt-4o-mini", BASELINE_PROFILE)).toBe("gpt-4o-mini");
    expect(withCapacityProfileKey("offline-fixtures", "map-depth-4000")).toBe(
      "offline-fixtures+map-depth-4000",
    );
    expect(withCapacityProfileKey("gpt-5@low", "reduce-fed-400")).toBe("gpt-5@low+reduce-fed-400");
  });

  it("the unimplementable cells stay visible with reasons", () => {
    const cells = UNIMPLEMENTED_MATRIX_CELLS.map((c) => c.cell);
    expect(cells).toContain("reduce-fed-800");
    expect(cells).toContain("reduce-hierarchical-all");
    expect(cells).toContain("map-claims-adaptive");
    for (const c of UNIMPLEMENTED_MATRIX_CELLS) expect(c.requires.length).toBeGreaterThan(20);
  });
});

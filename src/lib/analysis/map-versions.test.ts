import { describe, expect, it } from "vitest";
import { mapExtractorVersion } from "./map-prompts";
import { currentVersion, currentVersionPairs, versionFilterSql } from "./map-versions";
import { TRACKS, type Track } from "./tracks";

describe("map-versions accessor (OPEN-TASKS #35)", () => {
  it("returns exactly the configured tracks for each theater, versions matching the map worker", () => {
    for (const theater of ["ru", "ua", "ir"]) {
      const pairs = currentVersionPairs(theater);
      const expected = (Object.keys(TRACKS) as Track[]).filter((t) =>
        TRACKS[t].countries.includes(theater),
      );
      expect(pairs.map((p) => p.track)).toEqual(expected);
      for (const p of pairs) {
        expect(p.extractorVersion).toBe(mapExtractorVersion(p.track, theater));
      }
    }
  });

  it("ru and ir military versions differ (ir has its own prompt)", () => {
    expect(currentVersion("military", "ru")).not.toBe(currentVersion("military", "ir"));
  });

  it("returns null / empty for unconfigured (track, theater)", () => {
    expect(currentVersion("nuclear", "ru")).toBeNull();
    expect(currentVersionPairs("zz")).toEqual([]);
    expect(versionFilterSql("zz").sql).toBe("false");
  });

  it("builds a parameterized IN filter with correct placeholder numbering", () => {
    const { sql, params } = versionFilterSql("ua", "dc", 3);
    expect(sql).toBe("(dc.track, dc.extractor_version) IN (($3, $4))");
    expect(params).toEqual(["military", mapExtractorVersion("military", "ua")]);
  });
});

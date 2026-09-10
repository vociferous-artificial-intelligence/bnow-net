import { describe, expect, it } from "vitest";
import {
  SERIES_URL_SLUGS,
  benchmarkKeyForEdition,
  editionKeyOfBenchmarkKey,
  reportDateOfBenchmarkKey,
} from "./benchmark-key";
import { FIXTURE_FINAL_LABEL, NORMALIZED_EDITION_LABELS } from "./editions";
import { ConflictDomainError } from "./errors";
import { REFERENCE_SERIES_IDS } from "./vocabulary";

// The shape the fixture-backed route already enforces (product-view.ts:73).
// The new encoding is designed to satisfy it, so the route's key grammar does
// not widen when the DB provider takes over — copied here deliberately rather
// than exported, so a change to either copy shows up as a failure.
const BENCHMARK_KEY_SHAPE = /^[a-z0-9][a-z0-9-]*(~[A-Za-z0-9][A-Za-z0-9-]*)?$/;

const DAY = "2026-03-05";

/** Every (series, label) pair the normalization table can produce. */
function everyRealEditionKey(): string[] {
  const keys: string[] = [];
  for (const series of REFERENCE_SERIES_IDS) {
    for (const label of NORMALIZED_EDITION_LABELS[series]) {
      keys.push(`${series}:${DAY}:${label}`);
    }
  }
  return keys;
}

describe("benchmark URL keys for real editions", () => {
  it("round-trips EVERY (series, normalization label) pair the table can produce", () => {
    const keys = everyRealEditionKey();
    expect(keys.length).toBeGreaterThan(1);
    for (const editionKey of keys) {
      const urlKey = benchmarkKeyForEdition(editionKey);
      expect(editionKeyOfBenchmarkKey(urlKey), urlKey).toBe(editionKey);
    }
  });

  it("is INJECTIVE across the whole table — no two editions share a URL key", () => {
    const urlKeys = everyRealEditionKey().map(benchmarkKeyForEdition);
    expect(new Set(urlKeys).size).toBe(urlKeys.length);
  });

  it("every minted key satisfies the route's existing shape (the grammar does not widen)", () => {
    for (const urlKey of everyRealEditionKey().map(benchmarkKeyForEdition)) {
      expect(BENCHMARK_KEY_SHAPE.test(urlKey), urlKey).toBe(true);
      expect(urlKey).not.toContain(":");
      expect(urlKey).not.toContain("_");
    }
  });

  it("spells the series with dashes, not underscores", () => {
    expect(benchmarkKeyForEdition(`roca:${DAY}:daily`)).toBe(`roca-${DAY}-daily`);
    expect(benchmarkKeyForEdition(`iran_update:${DAY}:evening`)).toBe(
      `iran-update-${DAY}-evening`,
    );
    expect(SERIES_URL_SLUGS.iran_update).toBe("iran-update");
  });

  it("reports the report day without a second decode", () => {
    expect(reportDateOfBenchmarkKey(`iran-update-${DAY}-morning`)).toBe(DAY);
    expect(reportDateOfBenchmarkKey("not-a-key")).toBeNull();
  });
});

describe("fail-closed refusals", () => {
  it("refuses to MINT a key for anything outside the two closed tables", () => {
    const cases = [
      `roca:${DAY}`, // not three segments
      `roca:${DAY}:daily:extra`,
      `unknown_series:${DAY}:daily`,
      `roca:2026-02-31:daily`, // not a real calendar day
      `roca:${DAY}:evening`, // a real label, but not one ROCA can produce
      `iran_update:${DAY}:daily`, // ...and vice versa
      `roca:${DAY}:${FIXTURE_FINAL_LABEL}`, // the reserved fixture label
    ];
    for (const editionKey of cases) {
      expect(() => benchmarkKeyForEdition(editionKey), editionKey).toThrow(ConflictDomainError);
    }
  });

  it("refuses to DECODE a key it could not have minted", () => {
    const cases = [
      "",
      "roca",
      `roca-${DAY}`,
      `roca-${DAY}-daily-extra`,
      `roca-${DAY}-DAILY`,
      `roca-${DAY}-${FIXTURE_FINAL_LABEL}`,
      `roca-2026-02-31-daily`,
      `roca-${DAY}-evening`,
      `iran-update-${DAY}-daily`,
      `iran_update-${DAY}-evening`, // underscore spelling is not the URL form
      `../../etc/passwd`,
      `roca-${DAY}-daily/evidence`,
    ];
    for (const urlKey of cases) {
      expect(editionKeyOfBenchmarkKey(urlKey), urlKey).toBeNull();
    }
  });

  it("never decodes a FIXTURE golden key as an edition (the two key spaces are disjoint)", () => {
    // real golden keys from fixtures/conflicts/goldens/golden-results-v1.json
    for (const goldenKey of [
      "roca-ua-only-001b",
      "iran-gulf-unavailable-010b",
      "cc-matcher-failclosed-013b~B-zero-valid-rounds",
    ]) {
      expect(editionKeyOfBenchmarkKey(goldenKey), goldenKey).toBeNull();
    }
  });
});

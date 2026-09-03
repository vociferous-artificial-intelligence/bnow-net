import { describe, expect, it } from "vitest";
import { gistNumeralStyleErrors, numeralsPreserved, numericValues } from "./numerals";
import * as scoreMap from "./score-map";

describe("numericValues / numeralsPreserved (moved from score-map at the corpus-v2 landing)", () => {
  it("reads digits, dot decimals, and stripped thousands separators", () => {
    expect(numericValues("1,000km and 3.5 tons and 7")).toEqual([1000, 3.5, 7]);
  });

  it("reads simple single number-words", () => {
    expect(numericValues("four drones over the depot")).toEqual([4]);
  });

  it("preservation requires every reference value in the candidate", () => {
    expect(numeralsPreserved("4 drones", "four drones intercepted")).toBe(true);
    expect(numeralsPreserved("4 drones", "5 drones intercepted")).toBe(false);
  });

  it("score-map re-exports stay importable (existing importers unbroken)", () => {
    expect(scoreMap.numericValues).toBe(numericValues);
    expect(scoreMap.numeralsPreserved).toBe(numeralsPreserved);
  });
});

describe("gistNumeralStyleErrors (checkNumerals gist discipline)", () => {
  it("rejects adjacent number-words", () => {
    expect(gistNumeralStyleErrors("two hundred drones")).toHaveLength(1);
  });

  it("rejects hyphenated number-words", () => {
    expect(gistNumeralStyleErrors("twenty-one soldiers")).toHaveLength(1);
  });

  it("catches an overlapping pair after a non-number word", () => {
    // the ("a", "two") pair must not consume "two" away from ("two", "hundred")
    expect(gistNumeralStyleErrors("a two hundred meter advance")).toHaveLength(1);
  });

  it("accepts bare digits, single number-words, and punctuated sequences", () => {
    expect(gistNumeralStyleErrors("200 drones, four intercepted")).toEqual([]);
    expect(gistNumeralStyleErrors("four, five drones reported")).toEqual([]);
    expect(gistNumeralStyleErrors("no numbers at all")).toEqual([]);
  });
});

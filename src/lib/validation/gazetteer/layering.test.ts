// Layering pins for the gazetteer package (48h step 06).
//
// Two properties this package must keep, both of which a well-meaning future
// refactor would break silently:
//
//  1. NO CYCLE. src/lib/validation/** must not import src/lib/conflicts/**.
//     The dependency already runs the other way (conflicts/keyword-matcher.ts,
//     conflicts/backtest-matrix.ts, evals/score-validation.ts all import
//     validation/keywords), so theater tags and gazetteer lookup keys here are
//     plain strings rather than imported ConflictId/theater vocabularies.
//  2. NO BUNDLE LEAK. keywords.ts binds ru-ua-v1 only. If it re-exported the
//     registry, the Iran tables would ride into every module graph that reaches
//     extractSignature — including src/lib/analysis/stub-provider.ts, which is
//     inside the Next build.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as keywords from "../keywords";

const VALIDATION_DIR = join(process.cwd(), "src", "lib", "validation");

function tsFilesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return tsFilesUnder(full);
    return name.endsWith(".ts") || name.endsWith(".tsx") ? [full] : [];
  });
}

describe("gazetteer layering", () => {
  it("no file under src/lib/validation imports src/lib/conflicts (the cycle pin)", () => {
    const files = tsFilesUnder(VALIDATION_DIR);
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(/from\s+["'][^"']*\.\.\/conflicts\//.test(source), file).toBe(false);
      expect(/from\s+["']@\/lib\/conflicts\//.test(source), file).toBe(false);
    }
  });

  it("keywords.ts binds ru-ua-v1 only — no registry import, no Iran tables", () => {
    const source = readFileSync(join(VALIDATION_DIR, "keywords.ts"), "utf8");
    expect(source).toContain('from "./gazetteer/ru-ua-v1"');
    expect(/from\s+["']\.\/gazetteer["']/.test(source)).toBe(false);
    expect(/from\s+["']\.\/gazetteer\/index["']/.test(source)).toBe(false);
    expect(/from\s+["']\.\/gazetteer\/iran-levant-v1["']/.test(source)).toBe(false);
  });

  it("keywords.ts still exports exactly its historical runtime surface", () => {
    expect(Object.keys(keywords).sort()).toEqual([
      "MATCH_THRESHOLD",
      "TOPONYM_THEATER",
      "classifyTakeawayTheater",
      "expandToponyms",
      "extractSignature",
      "matchScore",
    ]);
  });
});

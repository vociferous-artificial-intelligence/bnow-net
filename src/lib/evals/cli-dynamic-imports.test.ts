// Dynamic-import allowlist for the eval CLI (Gate-5 control-plane MINOR-3).
//
// isolation.test.ts pins the CLI's STATIC import surface but is
// inherited-frozen, so this ADDITIVE pin closes the remaining seam: the
// mode-scoped dynamic imports. The set of dynamic `import(...)` specifiers in
// scripts/analysis-eval.ts must equal EXACTLY the live-runner module (the
// paid path, reachable only through the live mode's preflight) and the
// conflict validation profile (offline-only, reachable only through
// `--profile conflict`). A future mode quietly dynamic-importing anything
// else — provider SDKs, db, spend machinery — fails here.
// (The regex also matches type-position `typeof import("…")`, which names the
// same profile module; the Set dedupes it.)

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("analysis-eval CLI dynamic-import allowlist", () => {
  it("dynamic import specifiers are exactly {live-runner, conflict-validation-profile}", () => {
    const src = readFileSync(join(process.cwd(), "scripts", "analysis-eval.ts"), "utf8");
    const specifiers = [
      ...new Set([...src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1])),
    ].sort();
    expect(specifiers).toEqual([
      "../src/lib/evals/conflict-validation-profile",
      "../src/lib/evals/live-runner",
    ]);
  });
});

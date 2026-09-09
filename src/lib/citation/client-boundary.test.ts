import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The citation builder is reachable from a "use client" component:
// claim-copy-actions.tsx -> claim-copy-model.ts -> citation/ics206.ts. So its
// import graph is a CLIENT bundle graph, and it must stay on pure leaves.
//
// This is not hypothetical. ics206.ts first read ruling 19's attribution labels
// straight out of publication-guard.ts, which imports the analysis provider
// stack — that single edge put src/lib/usage/spend-guard.ts and @/db into the
// client component's graph (31 modules, versus 12 after the labels moved to
// src/lib/analysis/attribution-labels.ts). The import was type-only and the
// bundler erases it, so nothing shipped; the first RUNTIME import added to the
// guard would have made it real, silently. The scan is the guard against that,
// on the src/lib/evals/isolation.test.ts precedent.
//
// disclosure-policy.ts is deliberately NOT covered: it is server-only, is never
// imported by claim-copy-model.ts, and takes `import type { Role }` from
// @/lib/gate. Its whole job is to run before the client boundary.

// Paths relative to this directory. estimative.ts joins the graph through
// claim-copy-model.ts (the copy "status" line) and through ics206.ts itself, so
// it is under the same constraint even though it lives in src/lib/tradecraft/.
const CLIENT_REACHABLE = ["ics206.ts", "../tradecraft/estimative.ts"];

/** Any module specifier reaching a server-only or heavyweight layer. `\s*`
 *  rather than `\s+` after `from` so an unspaced `from"..."` cannot slip past. */
const FORBIDDEN = [
  { name: "the database client", re: /(?:from\s*|import\s*\(\s*)["'][^"']*(?:@\/db|\/db\/index)["']/ },
  { name: "the spend/usage layer", re: /(?:from\s*|import\s*\(\s*)["'][^"']*\/usage\/[^"']*["']/ },
  // `[^"']*\/` matches both "@/lib/analysis/provider" and a relative "./provider".
  { name: "the analysis provider stack", re: /(?:from\s*|import\s*\(\s*)["'][^"']*\/(?:provider|openai-provider|openai-client|stub-provider|synthesize|digest|publication-guard)["']/ },
  { name: "the LLM routing layer", re: /(?:from\s*|import\s*\(\s*)["'][^"']*\/llm\/[^"']*["']/ },
  { name: "the eval control plane", re: /(?:from\s*|import\s*\(\s*)["'][^"']*evals\/[^"']*["']/ },
  { name: "next/headers or server auth", re: /(?:from\s*|import\s*\(\s*)["'](?:next\/headers|server-only)["']/ },
];

describe("citation modules reachable from the client stay on pure leaves", () => {
  for (const file of CLIENT_REACHABLE) {
    const source = readFileSync(join(__dirname, file), "utf8");
    for (const { name, re } of FORBIDDEN) {
      it(`${file} does not import ${name}`, () => {
        expect(re.test(source), `${file} must not import ${name}`).toBe(false);
      });
    }
  }

  it("scans a file that really exists and would really fail", () => {
    // Non-vacuous: the same scan applied to the module the labels used to come
    // from must trip, or the regexes prove nothing.
    const guard = readFileSync(join(__dirname, "..", "analysis", "publication-guard.ts"), "utf8");
    expect(FORBIDDEN.some(({ re }) => re.test(guard))).toBe(true);
  });
});

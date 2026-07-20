import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Phase 5 import-graph rule (§12): the Ask product path imports NO vendor SDK.
// The ONLY Ask-pipeline module allowed to import "openai" is the gateway
// adapter. Other subsystems keep their own seams and are OUT of this rule's
// scope (registered): the digest AnalysisProvider (openai-provider.ts +
// synthesize.ts), the validation matcher (llm-match.ts), and the entity-audit
// cron — they predate the gateway and migrate when they next change.

const REPO_SRC = join(__dirname, "..", "..");

/** Directories the rule COVERS — the Ask product path end to end. */
const COVERED = [
  "lib/ask",
  "lib/embeddings",
  "app/ask",
  "app/api/ask",
  "components",
];

/** The single allowed vendor-SDK importer inside the covered set. */
const ALLOWED = new Set(["lib/llm/openai.ts"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("import-graph: no vendor SDK in the Ask product path", () => {
  it('only the gateway adapter imports "openai"', () => {
    const offenders: string[] = [];
    for (const dir of [...COVERED, "lib/llm"]) {
      for (const file of walk(join(REPO_SRC, dir))) {
        const rel = file.slice(REPO_SRC.length + 1).replace(/\\/g, "/");
        if (ALLOWED.has(rel)) continue;
        const src = readFileSync(file, "utf8");
        if (/from\s+["']openai["']|require\(["']openai["']\)/.test(src)) {
          offenders.push(rel);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the retrieval/orchestration layer never imports the adapter's SDK types directly either", () => {
    // belt-and-braces: the raw string "openai" as a MODULE specifier must not
    // appear in retrieve/composite/limits/runs/router/cache (provider strings
    // like "openai:gpt-5" are data, not imports, and don't match this regex)
    for (const f of ["lib/ask/retrieve-v2.ts", "lib/ask/limits.ts", "lib/ask/runs.ts", "lib/ask/router.ts", "lib/ask/cache.ts"]) {
      const src = readFileSync(join(REPO_SRC, f), "utf8");
      expect(/from\s+["']openai["']/.test(src), `${f} must not import the SDK`).toBe(false);
    }
  });
});

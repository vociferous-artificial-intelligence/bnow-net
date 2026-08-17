import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Production isolation of the eval control plane (spec C-line safety rule):
// evalDispatchConfig() bypasses the analysis-registry approval and the map
// activation lock, so NOTHING in the production surface may reach it — no file
// under src/app/ and none of the production analysis dispatch modules may
// import ANYTHING from src/lib/evals. A passing candidate scorecard can only
// ever produce a PROPOSED registry entry in report text.

const REPO_SRC = join(__dirname, "..", "..");
const REPO_ROOT = join(REPO_SRC, "..");

/** The production analysis dispatch modules (openai-client.test.ts's list,
 *  minus the eval live-runner itself). */
const PRODUCTION_DISPATCH_MODULES = [
  "lib/analysis/map-worker.ts",
  "lib/analysis/synthesize.ts",
  "lib/analysis/openai-provider.ts",
  "lib/validation/llm-match.ts",
  "app/api/cron/entity-audit/route.ts",
];

/** Any module-specifier reference into the eval library, static or dynamic. */
const EVALS_IMPORT_RE = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["'][^"']*evals\/[^"']*["']/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("eval-library isolation", () => {
  it("no file under src/app/ imports the eval library", () => {
    const offenders: string[] = [];
    for (const file of walk(join(REPO_SRC, "app"))) {
      if (EVALS_IMPORT_RE.test(readFileSync(file, "utf8"))) {
        offenders.push(file.slice(REPO_SRC.length + 1));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no production analysis dispatch module imports the eval library", () => {
    for (const rel of PRODUCTION_DISPATCH_MODULES) {
      const src = readFileSync(join(REPO_SRC, rel), "utf8");
      expect(EVALS_IMPORT_RE.test(src), `${rel} must not import src/lib/evals`).toBe(false);
    }
  });

  it("no src/lib module OUTSIDE src/lib/evals imports the eval library", () => {
    const offenders: string[] = [];
    for (const file of walk(join(REPO_SRC, "lib"))) {
      const rel = file.slice(REPO_SRC.length + 1).replace(/\\/g, "/");
      if (rel.startsWith("lib/evals/")) continue;
      if (EVALS_IMPORT_RE.test(readFileSync(file, "utf8"))) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it("the runner script loads live-runner ONLY via dynamic import inside the live mode", () => {
    const src = readFileSync(join(REPO_ROOT, "scripts", "analysis-eval.ts"), "utf8");
    expect(/from\s+["'][^"']*live-runner["']/.test(src), "no static live-runner import").toBe(false);
    expect(src).toContain('await import("../src/lib/evals/live-runner")');
  });

  it("only live-runner touches the client factory or the eval guard inside the eval library", () => {
    // defense in depth: the offline/estimate/report machinery must have no
    // path to a provider even inside its own package
    for (const file of walk(join(REPO_SRC, "lib", "evals"))) {
      const rel = file.slice(REPO_SRC.length + 1).replace(/\\/g, "/");
      if (rel === "lib/evals/live-runner.ts" || rel === "lib/evals/eval-guard.ts") continue;
      const src = readFileSync(file, "utf8");
      expect(src.includes("analysisOpenAiClient"), `${rel} must not touch the client factory`).toBe(false);
      expect(/from\s+["'][^"']*eval-guard["']/.test(src), `${rel} must not wire the spend guard`).toBe(false);
    }
  });
});

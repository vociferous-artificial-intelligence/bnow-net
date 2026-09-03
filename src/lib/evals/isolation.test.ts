import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Production isolation of the eval control plane (spec C-line safety rule,
// hardened per review remediation safety MINOR-1/NOTE-1):
// evalDispatchConfig() bypasses the analysis-registry approval and the map
// activation lock, so NOTHING in the production surface may reach it — no file
// anywhere under src/ outside src/lib/evals itself, and no script other than
// the eval CLI, may import ANYTHING from src/lib/evals. A passing candidate
// scorecard can only ever produce a PROPOSED registry entry in report text.

const REPO_SRC = join(__dirname, "..", "..");
const REPO_ROOT = join(REPO_SRC, "..");
const SCRIPTS_DIR = join(REPO_ROOT, "scripts");

/** The production analysis dispatch modules (openai-client.test.ts's list,
 *  minus the eval live-runner itself). */
const PRODUCTION_DISPATCH_MODULES = [
  "lib/analysis/map-worker.ts",
  "lib/analysis/synthesize.ts",
  "lib/analysis/openai-provider.ts",
  "lib/validation/llm-match.ts",
  "app/api/cron/entity-audit/route.ts",
];

/** Any module-specifier reference into the eval library, static or dynamic.
 *  `\s*` (not `\s+`) after `from` so a minified/unspaced `from"..."` cannot
 *  slip past the scan (NOTE-1). */
const EVALS_IMPORT_RE = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'][^"']*evals\/[^"']*["']/;

/** Static import (any form) of the live dispatch module. */
const LIVE_RUNNER_STATIC_RE = /from\s*["'][^"']*live-runner["']/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const srcFiles = walk(REPO_SRC).map((f) => f.slice(REPO_SRC.length + 1).replace(/\\/g, "/"));
// A13-F1: recurse like the src/ scan — a future nested script must not evade
// the isolation gates
const scriptFiles = walk(SCRIPTS_DIR)
  .map((f) => f.slice(SCRIPTS_DIR.length + 1).replace(/\\/g, "/"))
  .filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f));

describe("eval-library isolation", () => {
  it("no file anywhere under src/ outside src/lib/evals imports the eval library", () => {
    const offenders: string[] = [];
    for (const rel of srcFiles) {
      if (rel.startsWith("lib/evals/")) continue;
      if (EVALS_IMPORT_RE.test(readFileSync(join(REPO_SRC, rel), "utf8"))) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it("no production analysis dispatch module imports the eval library", () => {
    for (const rel of PRODUCTION_DISPATCH_MODULES) {
      const src = readFileSync(join(REPO_SRC, rel), "utf8");
      expect(EVALS_IMPORT_RE.test(src), `${rel} must not import src/lib/evals`).toBe(false);
    }
  });

  it("no script other than the eval CLI imports the eval library, and the CLI's static surface is contracts+runner only", () => {
    for (const f of scriptFiles) {
      const src = readFileSync(join(SCRIPTS_DIR, f), "utf8");
      if (f === "evals/corpus-v2/run-admit.ts") {
        // the corpus-v2 admission pipeline: PURE modules only (validator +
        // admission transform + composition) — never the runner, guards, or
        // any dispatch-capable surface
        const specs = [...src.matchAll(/from\s*["']([^"']*evals\/[^"']*)["']/g)].map((m) => m[1]);
        expect(specs.length).toBeGreaterThan(0);
        for (const spec of specs) {
          expect(
            /evals\/(contracts|corpus-v2-admit|corpus-v2-compose)$/.test(spec),
            `scripts/${f} statically imports ${spec} — only contracts/corpus-v2-admit/corpus-v2-compose allowed`,
          ).toBe(true);
        }
        continue;
      }
      if (f !== "analysis-eval.ts") {
        expect(EVALS_IMPORT_RE.test(src), `scripts/${f} must not import src/lib/evals`).toBe(false);
        continue;
      }
      // the eval CLI: static imports limited to the pure modules; live-runner
      // reachable ONLY via the dynamic import inside the live mode
      const staticEvalImports = [...src.matchAll(/from\s*["']([^"']*evals\/[^"']*)["']/g)].map((m) => m[1]);
      for (const spec of staticEvalImports) {
        expect(
          /evals\/(contracts|runner)$/.test(spec),
          `scripts/${f} statically imports ${spec} — only contracts/runner allowed`,
        ).toBe(true);
      }
      expect(src).toContain('await import("../src/lib/evals/live-runner")');
    }
  });

  it("no static import of live-runner exists anywhere in src/ or scripts/ (dynamic-only)", () => {
    const offenders: string[] = [];
    for (const rel of srcFiles) {
      if (rel === "lib/evals/live-runner.ts") continue;
      if (LIVE_RUNNER_STATIC_RE.test(readFileSync(join(REPO_SRC, rel), "utf8"))) offenders.push(rel);
    }
    for (const f of scriptFiles) {
      if (LIVE_RUNNER_STATIC_RE.test(readFileSync(join(SCRIPTS_DIR, f), "utf8"))) offenders.push(`scripts/${f}`);
    }
    expect(offenders).toEqual([]);
  });

  it("only live-runner can reach the SDK: no other eval module (and not the eval CLI) value-imports openai or constructs a client", () => {
    const checkNoSdk = (label: string, src: string) => {
      expect(src.includes("new OpenAI("), `${label} must not construct the SDK`).toBe(false);
      // any NON-type-only import statement whose specifier is openai (or a
      // subpath), plus the dynamic/require forms, is a value import
      expect(
        /import\s+(?!type\b)[^;]*?from\s*["']openai(?:\/[^"']*)?["']/.test(src),
        `${label} may import the SDK type-only at most`,
      ).toBe(false);
      expect(
        /(?:require\s*\(\s*|import\s*\(\s*)["']openai(?:\/[^"']*)?["']/.test(src),
        `${label} must not dynamically load the SDK`,
      ).toBe(false);
    };
    for (const rel of srcFiles) {
      if (!rel.startsWith("lib/evals/")) continue;
      if (rel === "lib/evals/live-runner.ts") continue;
      checkNoSdk(rel, readFileSync(join(REPO_SRC, rel), "utf8"));
    }
    // scripts: the eval CLI must never touch the SDK. ask-eval-harvest.ts is
    // the PRE-EXISTING Ask harvest paid tool (its own supervisor-run
    // authorization, outside this control plane) and is deliberately excluded.
    for (const f of scriptFiles) {
      if (f === "ask-eval-harvest.ts") continue;
      checkNoSdk(`scripts/${f}`, readFileSync(join(SCRIPTS_DIR, f), "utf8"));
    }
  });

  it("only live-runner/eval-guard touch the client factory or the spend guard inside the eval library", () => {
    // defense in depth: the offline/estimate/report machinery must have no
    // path to a provider even inside its own package
    for (const rel of srcFiles) {
      if (!rel.startsWith("lib/evals/")) continue;
      if (rel === "lib/evals/live-runner.ts" || rel === "lib/evals/eval-guard.ts") continue;
      const src = readFileSync(join(REPO_SRC, rel), "utf8");
      expect(src.includes("analysisOpenAiClient"), `${rel} must not touch the client factory`).toBe(false);
      expect(/from\s*["'][^"']*eval-guard["']/.test(src), `${rel} must not wire the spend guard`).toBe(false);
    }
  });
});

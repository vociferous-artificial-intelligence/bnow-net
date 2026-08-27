// Subprocess pins for the hardening items that live in the CLI: the
// union-aware DB-free property of every $0 mode (A9-1/A14-F2 — src/db binds
// DATABASE_URL eagerly at module load, so a blanked env would crash ANY mode
// whose eager or executed import closure reaches @/db; both dynamic-import
// branches are exercised) and the --fresh acknowledgement refusal (C-A7-2),
// asserted to refuse BEFORE any byte of the committed results is touched.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const TSX_BIN = join(process.cwd(), "node_modules", ".bin", "tsx");
const CLI = join(process.cwd(), "scripts", "analysis-eval.ts");

const BLANKED_ENV = {
  ...process.env,
  OPENAI_API_KEY: "",
  DATABASE_URL: "",
  DATABASE_URL_UNPOOLED: "",
  NEON_API_KEY: "",
  LLM_DISABLE: "1",
};

function runCli(args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
  const out = spawnSync(TSX_BIN, [CLI, ...args], {
    env: BLANKED_ENV,
    encoding: "utf8",
    timeout: 120_000,
  });
  return { status: out.status, stdout: out.stdout ?? "", stderr: out.stderr ?? "" };
}

describe("A9-1: every $0 mode stays DB-free under a blanked env (union-aware)", () => {
  it("--report runs to completion with no DATABASE_URL", () => {
    const r = runCli(["--report", "--out", "/tmp/hardening-cli-report-probe.md"]);
    expect(r.status).toBe(0);
    expect(r.stderr).not.toMatch(/DATABASE_URL/);
  }, 120_000);

  it("--profile conflict --report (the second dynamic-import branch) is DB-free too", () => {
    const r = runCli(["--profile", "conflict", "--report", "--out", "/tmp/hardening-cli-conflict-probe.md"]);
    expect(r.status).toBe(0);
    expect(r.stderr).not.toMatch(/DATABASE_URL/);
  }, 120_000);

  // --capacity-matrix's DB-free property is covered by the same static
  // closure as --report (no dynamic import of its own) and was execution-
  // verified in review; a subprocess case here would rewrite the committed
  // CAPACITY-MATRIX-ESTIMATE.md timestamp, so it is deliberately omitted.
});

describe("C-A7-2: --fresh requires an explicit discard acknowledgement", () => {
  it("--offline --fresh without --fresh-ack refuses BEFORE touching the committed results", () => {
    const path = "docs/evals/analysis/results/validation-offline-fixtures.json";
    const before = readFileSync(path, "utf8");
    const r = runCli(["--offline", "--workload", "validation", "--fresh"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/acknowledge explicitly with: --fresh-ack validation\/offline-fixtures/);
    expect(readFileSync(path, "utf8")).toBe(before); // untouched
  }, 120_000);
});

// Conflict-mode CLI refusal pins (Phase 5 pre-gate NOTE-3): the refusals in
// scripts/analysis-eval.ts are code-enforced but were untested. The isolation
// test pins the CLI's STATIC import surface, so these pins spawn the CLI as a
// real subprocess instead of importing it — the refusal exit codes and
// messages are observed exactly as an operator would see them. Every spawn
// runs with every paid/db env var blanked inline: the refusal paths and the
// validate-dataset positive control are all offline-pure by contract, and a
// blanked environment proves it (a hidden env dependency would fail loudly
// here, never silently consume credentials).
//
// Structural note (from reading main()): the --execute-live and --workload
// refusals fire BEFORE the conflict profile's mode-scoped dynamic import, and
// the unknown-profile refusal fires before anything conflict-related at all;
// only the --conflict id validation runs after the dynamic import.

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const TSX_BIN = join(process.cwd(), "node_modules", ".bin", "tsx");
const CLI = join(process.cwd(), "scripts", "analysis-eval.ts");

const BLANKED_ENV = {
  ...process.env,
  OPENAI_API_KEY: "",
  ANTHROPIC_API_KEY: "",
  X_API_KEY: "",
  OPENSANCTIONS_API_KEY: "",
  DATABASE_URL: "",
  NEON_API_KEY: "",
  NEON_PROJECT_ID: "",
  POSTMARK_SERVER_TOKEN: "",
  TELEGRAM_API_ID: "",
  TELEGRAM_API_HASH: "",
  TELEGRAM_SESSION: "",
  LLM_DISABLE: "1",
};

function runCli(
  args: readonly string[],
  env: NodeJS.ProcessEnv = BLANKED_ENV,
): { status: number | null; stdout: string; stderr: string } {
  const out = spawnSync(TSX_BIN, [CLI, ...args], {
    env,
    encoding: "utf8",
    timeout: 60_000,
  });
  return { status: out.status, stdout: out.stdout ?? "", stderr: out.stderr ?? "" };
}

// FAKE (syntactically plausible, non-functional) credentials for the
// equals-form probes: the refusal must fire before ANY client construction,
// so even a key-bearing environment never gets used
const FAKE_LIVE_ENV: NodeJS.ProcessEnv = {
  ...BLANKED_ENV,
  OPENAI_API_KEY: "sk-fake-refusal-probe-key-never-real",
  DATABASE_URL: "postgres://fake:fake@localhost:5432/fake",
};

describe("conflict-mode CLI refusals (subprocess, blanked env)", () => {
  it("--profile conflict --execute-live refuses with exit 2 (no live dispatch path)", () => {
    const r = runCli(["--profile", "conflict", "--execute-live"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/NO live dispatch path/);
  }, 60_000);

  it("--profile conflict --workload validation refuses with exit 2 (profile pins the workload)", () => {
    const r = runCli(["--profile", "conflict", "--workload", "validation"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/pins the validation workload/);
  }, 60_000);

  it("an unknown --profile refuses with exit 2 before anything conflict-related runs", () => {
    const r = runCli(["--profile", "wrongprofile"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/unknown profile "wrongprofile"/);
  }, 60_000);

  it("an unknown --conflict id refuses with exit 2 naming the valid ids", () => {
    const r = runCli(["--profile", "conflict", "--conflict", "bogus_conflict", "--validate-dataset"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/unknown conflict\(s\): bogus_conflict/);
    expect(r.stderr).toMatch(/russia_ukraine, iran_regional/);
  }, 60_000);

  it("equals-form flags refuse with exit 2 — the reviewer's live-path probe never reaches client construction", () => {
    // reviewer probe shape (Gate-5 ops MAJOR-1): before the fix,
    // "--profile=conflict" was silently discarded and this argv passed the
    // generic live preflight with a key present, reaching buildLiveDeps
    const r = runCli(
      [
        "--profile=conflict",
        "--execute-live",
        "--workload",
        "validation",
        "--model",
        "gpt-4o-mini",
        "--db-ack",
        "fake-ack",
      ],
      FAKE_LIVE_ENV,
    );
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--profile=conflict is not accepted/);
    expect(r.stderr).toMatch(/use "--profile conflict"/);
  }, 60_000);

  it("equals-form refusal covers the generic path too (--workload=validation)", () => {
    const r = runCli(["--workload=validation", "--validate-dataset"], FAKE_LIVE_ENV);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--workload=validation is not accepted/);
  }, 60_000);

  it("equals-form refusal precedes ANY mode work — validate-dataset with an equals token refuses", () => {
    const r = runCli(["--profile", "conflict", "--validate-dataset", "--conflict=iran_regional"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--conflict=iran_regional is not accepted/);
    expect(r.stdout).not.toContain("OK"); // no dataset work ran
  }, 60_000);

  it("positive control: --profile conflict --validate-dataset exits 0 under the blanked env", () => {
    const r = runCli(["--profile", "conflict", "--validate-dataset"]);
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("[conflict/russia_ukraine] OK");
    expect(r.stdout).toContain("[conflict/iran_regional] OK");
    expect(r.stdout).toContain("No DB, no provider, nothing written.");
  }, 60_000);
});

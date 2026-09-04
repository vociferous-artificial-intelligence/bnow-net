// Subprocess pins for the hardening items that live in the CLI: the
// union-aware DB-free property of every $0 mode (A9-1/A14-F2 — src/db binds
// DATABASE_URL eagerly at module load, so a blanked env would crash ANY mode
// whose eager or executed import closure reaches @/db; both dynamic-import
// branches are exercised) and the --fresh acknowledgement refusal (C-A7-2),
// asserted to refuse BEFORE any byte of the committed results is touched.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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

describe("2026-09-04 capture: live-only, refuses before any client/DB work, heldout inspection refused", () => {
  const SCRATCH = join(process.cwd(), "docs", "evals", "analysis", "capture", "hardening-cli-probe");

  it("a non-live mode with EVAL_CAPTURE_DIR set prints the notice and creates NOTHING", () => {
    const r = runCli(["--estimate", "--workload", "validation", "--repetitions", "1"]);
    // runCli's env is BLANKED_ENV; add the capture dir for this probe only
    const probe = spawnSync(TSX_BIN, [CLI, "--estimate", "--workload", "validation", "--repetitions", "1"], {
      env: { ...BLANKED_ENV, EVAL_CAPTURE_DIR: SCRATCH },
      encoding: "utf8",
      timeout: 120_000,
    });
    expect(r.status).toBe(0);
    expect(probe.status).toBe(0);
    expect(probe.stdout).toMatch(/only --execute-live dispatches — ignored/);
    expect(existsSync(SCRATCH)).toBe(false);
  }, 120_000);

  it("--execute-live with an un-ignored in-repo EVAL_CAPTURE_DIR refuses AFTER preflight but BEFORE any client construction or DB use (exit 2, no results file)", () => {
    const resultsPath = "docs/evals/analysis/results/live-validation-v2-gpt-4o-mini.json";
    const existed = existsSync(resultsPath);
    const r = spawnSync(
      TSX_BIN,
      [CLI, "--execute-live", "--workload", "validation", "--model", "gpt-4o-mini", "--db-ack", "eval-probe.invalid", "--repetitions", "3"],
      {
        env: {
          ...BLANKED_ENV,
          LLM_DISABLE: "",
          OPENAI_API_KEY: "sk-probe-not-a-real-key",
          EVAL_DATABASE_URL: "postgres://probe:probe@eval-probe.invalid/db",
          LLM_SPRINT_USD_CAP: "1",
          EVAL_USD_CAP_DAILY: "1",
          EVAL_CAPTURE_DIR: join(process.cwd(), "docs", "evals", "analysis", "results"),
        },
        encoding: "utf8",
        timeout: 120_000,
      },
    );
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/REFUSED \(capture\).*NOT gitignored/);
    expect(r.stderr).not.toMatch(/ECONNREFUSED|ENOTFOUND|getaddrinfo/); // never reached the DB
    expect(existsSync(resultsPath)).toBe(existed); // nothing written
  }, 120_000);

  it("the DEFAULT capture dir passes the gitignore check BEFORE it exists, and the sink opens before any DB/client work (review F1/F3)", () => {
    const dir = join(process.cwd(), "docs", "evals", "analysis", "capture", `f1-probe-${process.pid}`);
    expect(existsSync(dir)).toBe(false);
    const r = spawnSync(
      TSX_BIN,
      [CLI, "--execute-live", "--workload", "validation", "--model", "gpt-4o-mini", "--db-ack", "eval-probe.invalid", "--repetitions", "3"],
      {
        env: {
          ...BLANKED_ENV,
          LLM_DISABLE: "",
          OPENAI_API_KEY: "sk-probe-not-a-real-key",
          EVAL_DATABASE_URL: "postgres://probe:probe@eval-probe.invalid/db",
          LLM_SPRINT_USD_CAP: "1",
          EVAL_USD_CAP_DAILY: "1",
          EVAL_CAPTURE_DIR: dir,
        },
        encoding: "utf8",
        timeout: 120_000,
      },
    );
    try {
      expect(r.stderr).not.toMatch(/REFUSED \(capture\)/); // the not-yet-existing default dir is accepted
      expect(r.stdout).toMatch(/capture: .*f1-probe/); // the sink opened (dir created) ...
      expect(existsSync(dir)).toBe(true);
      expect(r.status).not.toBe(0); // ... and the run then failed at the guard's DB init against the unroutable host — no dispatch
      expect(readdirSync(dir)).toEqual([]); // nothing dispatched: no attempt line, no file
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("--capture-inspect refuses a heldout capture file by name (exit 2)", () => {
    const dir = join(process.cwd(), "docs", "evals", "analysis", "capture");
    const dirExisted = existsSync(dir);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const held = join(dir, "probe.heldout.jsonl");
    writeFileSync(held, "", { mode: 0o600 });
    try {
      const r = runCli(["--capture-inspect", held]);
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/heldout input refused/);
    } finally {
      rmSync(held, { force: true });
      if (!dirExisted) rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});

describe("2026-09-04 validation parity: vote-count flag, estimates, diagnostic acknowledgement", () => {
  const LIVE_ENV = {
    ...BLANKED_ENV,
    LLM_DISABLE: "",
    OPENAI_API_KEY: "sk-probe-not-a-real-key",
    EVAL_DATABASE_URL: "postgres://probe:probe@eval-probe.invalid/db",
    LLM_SPRINT_USD_CAP: "1",
    EVAL_USD_CAP_DAILY: "1",
  };
  const totalCalls = (stdout: string): number => {
    const m = stdout.match(/\bcalls (\d+) ·/);
    return m ? Number(m[1]) : NaN;
  };

  it("--validation-votes accepts only 5 or 1; the estimate counts 5 calls per case by default and 1 in the diagnostic count", () => {
    const bad = runCli(["--estimate", "--workload", "validation", "--validation-votes", "3"]);
    expect(bad.status).toBe(2);
    expect(bad.stderr).toMatch(/only 5 .* or 1/);
    const five = runCli(["--estimate", "--workload", "validation", "--repetitions", "1"]);
    const one = runCli(["--estimate", "--workload", "validation", "--repetitions", "1", "--validation-votes", "1"]);
    expect(five.status).toBe(0);
    expect(one.status).toBe(0);
    const c5 = totalCalls(five.stdout);
    const c1 = totalCalls(one.stdout);
    expect(c1).toBe(17); // one call per validation-v2 case
    expect(c5).toBe(85); // five vote rounds per case
  }, 120_000);

  it("--execute-live --validation-votes 1 without --single-round-diagnostic refuses in preflight (before any client/DB work); a stray MATCH_VOTES refuses too", () => {
    const r = spawnSync(TSX_BIN, [CLI, "--execute-live", "--workload", "validation", "--model", "gpt-4o-mini", "--db-ack", "eval-probe.invalid", "--repetitions", "3", "--validation-votes", "1"], { env: LIVE_ENV, encoding: "utf8", timeout: 120_000 });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/REFUSED \(before any client construction\).*--single-round-diagnostic/);
    const mv = spawnSync(TSX_BIN, [CLI, "--execute-live", "--workload", "validation", "--model", "gpt-4o-mini", "--db-ack", "eval-probe.invalid", "--repetitions", "3"], { env: { ...LIVE_ENV, MATCH_VOTES: "3" }, encoding: "utf8", timeout: 120_000 });
    expect(mv.status).toBe(2);
    expect(mv.stderr).toMatch(/MATCHER_MODE\/MATCH_VOTES alter/);
    expect(existsSync("docs/evals/analysis/results/live-validation-v2-gpt-4o-mini+votes1.json")).toBe(false);
  }, 120_000);

  it("--single-round-diagnostic outside live mode is refused (it is a live acknowledgement)", () => {
    const r = runCli(["--estimate", "--workload", "validation", "--single-round-diagnostic"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/live-mode acknowledgement/);
  }, 120_000);
});

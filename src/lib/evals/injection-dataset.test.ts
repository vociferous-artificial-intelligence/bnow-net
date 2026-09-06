import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AnalysisEvalDataset, EvalResultsFile, MapEvalCase } from "./contracts";
import { scoreMapCase } from "./score-map";
import { applyCapacityProfile, buildAnalysisEstimatePlan, buildMapCandidatePrompt, offlineIdentity, parseCaptureFile, scoreOfflineCase } from "./runner";

const ROOT = resolve(__dirname, "../../..");
const FILE = "map-inj-dev-v1.json";
const ds = JSON.parse(readFileSync(join(ROOT, "docs/evals/analysis", FILE), "utf8")) as AnalysisEvalDataset;
const cases = ds.cases as MapEvalCase[];
const tempRoots: string[] = [];
afterEach(() => { for (const p of tempRoots.splice(0)) rmSync(p, { recursive: true, force: true }); });

// A private CLI filesystem with ONLY the new development dataset. Loading a
// default or frozen file by mistake fails instead of reading another corpus.
function cliRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "inj-selector-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "docs/evals/analysis/results"), { recursive: true });
  copyFileSync(join(ROOT, "scripts/analysis-eval.ts"), join(root, "scripts/analysis-eval.ts"));
  // The sandbox must never load a checkout's production environment file.
  writeFileSync(join(root, "scripts/env.ts"), "export {};\n");
  copyFileSync(join(ROOT, "docs/evals/analysis", FILE), join(root, "docs/evals/analysis", FILE));
  for (const p of ["src", "node_modules", "tsconfig.json"]) symlinkSync(join(ROOT, p), join(root, p));
  return root;
}
function cli(root: string, args: string[], env: Record<string, string> = {}) {
  const run = spawnSync(join(ROOT, "node_modules/.bin/tsx"), [join(root, "scripts/analysis-eval.ts"), ...args], {
    cwd: root, encoding: "utf8", timeout: 20_000,
    env: { ...process.env, OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", POSTMARK_SERVER_TOKEN: "", LLM_DISABLE: "1",
      DATABASE_URL: "", DATABASE_URL_UNPOOLED: "", EVAL_DATABASE_URL: "", EVAL_CAPTURE_DIR: "", EVAL_CAPTURE_RAW: "",
      EVAL_CAPTURE_RAW_HELDOUT: "", ...env },
  });
  return { status: run.status, output: run.stdout + run.stderr };
}

// Argument vectors here are part of the exposure ledger; every refusal runs
// without credentials and must happen before live preflight/client creation.
describe("dataset selector", () => {
  it.each([
    [["--dataset"], "needs a name"],
    [["--dataset", "--offline"], "needs a name"],
    [["--dataset", "unknown"], "unknown name"],
    [["--dataset", "../../map-v2"], "unknown name"],
    [["--dataset", "__proto__"], "unknown name"],
    [["--dataset", "map-inj-dev-v1", "--dataset", "map-v2"], "only once"],
    [["--dataset", "map-inj-dev-v1", "--workload", "digest"], "exactly the map workload"],
    [["--dataset", "map-inj-dev-v1", "--workload", "map,digest"], "exactly the map workload"],
    [["--dataset", "map-inj-dev-v1", "--profile", "conflict"], "not applicable"],
    [["--dataset", "map-inj-dev-v1", "--capacity-matrix"], "not applicable"],
    [["--dataset", "map-inj-dev-v1", "--capture-inspect", "unused.jsonl"], "not applicable"],
    [["--dataset", "map-inj-dev-v1", "--execute-live"], "requires --dev"],
    [["--dataset", "map-v2", "--execute-live"], "requires --dev"],
    [["--dataset=map-inj-dev-v1", "--execute-live"], "space-separated"],
  ] as Array<[string[], string]>)("refuses %j before dispatch", (args, message) => {
    const root = cliRoot();
    const r = cli(root, args);
    expect(r.status, r.output).toBe(2);
    expect(r.output).toContain(message);
    expect(r.output).not.toContain("live eval:");
    expect(readdirSync(join(root, "docs/evals/analysis/results"))).toEqual([]);
  });

  it("validates only the named dataset and infers its workload", () => {
    const r = cli(cliRoot(), ["--validate-dataset", "--dataset", "map-inj-dev-v1"]);
    expect(r.status, r.output).toBe(0);
    expect(r.output).toContain("map-inj-dev-v1: 6 cases");
    expect(r.output).not.toContain("map-v2:");
  });

  it("leaves the default map file selection unchanged", () => {
    // No default file exists in this sandbox; the missing-file path witnesses
    // the exact default selection without opening its cases.
    const r = cli(cliRoot(), ["--estimate", "--workload", "map"]);
    expect(r.status, r.output).toBe(2);
    expect(r.output).toMatch(/missing dataset: .*\/map-v2\.json/);
  });

  it("writes only its own dev result file, resumes byte-exactly and never verdicts", () => {
    const root = cliRoot();
    const args = ["--offline", "--workload", "map", "--dataset", "map-inj-dev-v1"];
    const r = cli(root, args);
    expect(r.status, r.output).toBe(0);
    expect(r.output.match(/machinery=OK/g)).toHaveLength(6);
    const dir = join(root, "docs/evals/analysis/results");
    const file = "map-inj-dev-v1-offline-fixtures.json";
    expect(readdirSync(dir)).toEqual([file]);
    const before = readFileSync(join(dir, file), "utf8");
    const rf = JSON.parse(before) as EvalResultsFile;
    expect(rf.scope).toBe("dev");
    expect(Object.keys(rf.results)).toHaveLength(6);
    expect(cli(root, args).output).toContain("nothing to do");
    expect(readFileSync(join(dir, file), "utf8")).toBe(before);
    const report = cli(root, ["--report", "--dataset", "map-inj-dev-v1", "--out", join(root, "report.md")]);
    expect(report.status, report.output).toBe(0);
    expect(readFileSync(join(root, "report.md"), "utf8")).toContain("VERDICT: **INSUFFICIENT_DATA**");
  });

  it("keeps a targeted new-dataset run dev-scoped", () => {
    const root = cliRoot();
    const r = cli(root, ["--offline", "--dataset", "map-inj-dev-v1", "--only", cases[0].id]);
    expect(r.status, r.output).toBe(0);
    const rf = JSON.parse(readFileSync(join(root, "docs/evals/analysis/results/map-inj-dev-v1-offline-fixtures.json"), "utf8"));
    expect(rf.scope).toBe("dev");
    expect(Object.keys(rf.results)).toHaveLength(1);
  });

  it("estimates 18 map calls for either baseline or full-depth development input", () => {
    for (const capacity of ["baseline", "map-depth-full"]) {
      const r = cli(cliRoot(), ["--estimate", "--dataset", "map-inj-dev-v1", "--dev", "--repetitions", "3", "--capacity", capacity]);
      expect(r.status, r.output).toBe(0);
      expect(r.output).toContain("calls 18");
    }
  });

  it("reconciliation selects the dataset as well as workload/configKey", () => {
    const root = cliRoot();
    const capture = join(root, "capture");
    mkdirSync(capture);
    // Minimal synthetic metadata for a different dataset: never a historical
    // capture or heldout case. No result/raw output is needed for exclusion.
    const line = JSON.stringify({
      kind: "run", version: 1, runId: "other", workload: "map", configKey: "fixture-model",
      datasetVersion: "different-development-corpus", split: "development", raw: false,
    }) + "\n";
    expect(parseCaptureFile("other.dev.jsonl", line).run?.datasetVersion).toBe("different-development-corpus");
    writeFileSync(join(capture, "other.dev.jsonl"), line);
    const r = cli(root, ["--capture-reconcile", "--dataset", "map-inj-dev-v1", "--model", "fixture-model"], { EVAL_CAPTURE_DIR: capture });
    expect(r.status, r.output).toBe(0);
    expect(r.output).toContain("1 capture file(s)");
    expect(r.output).toContain("other workload/configKey/dataset cells");
    expect(r.output).toContain("results absent");
  });
});

describe("development injection corpus machinery", () => {
  it("pins the committed supplement's identity and whole checks without joining the frozen capacity matrix", () => {
    const rf = JSON.parse(readFileSync(join(ROOT, "docs/evals/analysis/results/map-inj-dev-v1-offline-fixtures.json"), "utf8")) as EvalResultsFile;
    const restore = applyCapacityProfile("baseline");
    try {
      expect(rf.identity).toEqual(offlineIdentity(ds));
      expect(rf.scope).toBe("dev");
      expect(Object.values(rf.results)).toHaveLength(6);
      for (const c of cases) {
        const committed = Object.values(rf.results).find((r) => r.caseId === c.id)!;
        const current = scoreOfflineCase(c, ds.datasetVersion, "test");
        expect(committed.checks, c.id).toEqual(current.checks);
        expect(committed.rawOutputDigest, c.id).toBe(current.rawOutputDigest);
      }
    } finally { restore(); }
  });

  it("matches all expectations with valid schemas, and the failures really hit injection patterns", () => {
    const restore = applyCapacityProfile("baseline");
    try {
      for (const c of cases) {
        const r = scoreOfflineCase(c, ds.datasetVersion, "test");
        expect(r.status, c.id).toBe("scored");
        expect(r.checks.pass, c.id).toBe(c.offline.expectation === "pass");
        const checks = scoreMapCase(c, c.offline.rawOutput);
        expect(checks.schemaValid, c.id).toBe(true);
        expect(checks.injectionHits.length > 0, c.id).toBe(c.offline.expectation === "fail");
      }
    } finally { restore(); }
  });

  it("isolates failures in text, event hints and entity names: removing the payload repairs all three", () => {
    for (const i of [0, 2, 3]) {
      const c = cases[i];
      const raw = JSON.parse(c.offline.rawOutput);
      if (i === 0) raw.results[0].claims.pop();
      if (i === 2) raw.results[0].claims[0].event_hint = "Talven reactor seal inspection postponed";
      if (i === 3) raw.results[0].claims[0].entities = [];
      expect(scoreMapCase(c, JSON.stringify(raw)).pass, c.id).toBe(true);
    }
  });

  it("both quiet companions fail if a claim is invented for them", () => {
    const quietCases = cases.filter((c) => c.input.docs.some((d) => d.capacity?.quietControl));
    expect(quietCases).toHaveLength(2);
    for (const c of quietCases) {
      const raw = JSON.parse(c.offline.rawOutput);
      raw.results[1].claims.push(raw.results[0].claims[0]);
      const checks = scoreMapCase(c, JSON.stringify(raw));
      expect(checks.emptyDocViolations).toBe(1);
      expect(checks.pass).toBe(false);
    }
  });

  it("reports the forged-notice claim; echoing its marker under negation still fails", () => {
    const c = cases[5];
    const raw = JSON.parse(c.offline.rawOutput);
    expect(scoreMapCase(c, JSON.stringify(raw)).pass).toBe(true);
    raw.results[0].claims[0].event_hint = "Notice did not authorize TEAL-ROOK";
    const checks = scoreMapCase(c, JSON.stringify(raw));
    expect(checks.injectionHits).toEqual(c.reference.injectionPatterns);
    expect(checks.pass).toBe(false);
    raw.results[0].claims = [];
    expect(scoreMapCase(c, JSON.stringify(raw)).recall).toBe(0);
  });

  it("proves exactly when the deep-tail payload reaches the prompt, without calling clipped input resistance", () => {
    const c = cases[4];
    const d = c.input.docs[0];
    const offset = d.capacity!.injectionPayloadOffsetU16!;
    expect(offset).toBeGreaterThan(4000);
    expect(d.content.length).toBeLessThanOrEqual(6000);
    expect(offset / d.content.length).toBeGreaterThan(0.9);
    expect(d.content.slice(offset)).toContain(c.reference.injectionPatterns![0]);
    for (const profile of ["baseline", "map-depth-4000", "map-depth-full"]) {
      const restore = applyCapacityProfile(profile);
      try {
        const prompt = buildMapCandidatePrompt(c.input);
        expect(prompt.user.includes(c.reference.injectionPatterns![0]), profile).toBe(profile === "map-depth-full");
        expect(scoreOfflineCase(c, ds.datasetVersion, "test").checks.pass).toBe(true);
        expect(buildAnalysisEstimatePlan(ds, "gpt-4o-mini", 3).totalCalls).toBe(18);
      } finally { restore(); }
    }
  });
});

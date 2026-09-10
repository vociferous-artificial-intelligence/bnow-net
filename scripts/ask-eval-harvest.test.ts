import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// WS2-F12: the paid --generate pass routes through analysisOpenAiClient() but
// read neither the LLM kill switch nor the offline provider selector, so a run an
// operator believed was disabled would still dispatch. Driven as a SUBPROCESS
// because the refusal must happen inside the real CLI, before any client is
// constructed — a unit call to an unexported function could not see that.
//
// OPENAI_API_KEY is blanked in every case, so a regression cannot become a paid
// call from this test: without the fix the run refuses at the key check instead,
// with a different message, which is what makes the assertions discriminate.

const TSX = join(process.cwd(), "node_modules", ".bin", "tsx");
const CLI = join(process.cwd(), "scripts", "ask-eval-harvest.ts");

function run(extraEnv: Record<string, string>) {
  // Names are SET, never unset: scripts/env.ts loads .env.local and dotenv refills
  // an ABSENT name, so unsetting is what invites the real value back (#112).
  const r = spawnSync(TSX, [CLI, "--generate"], {
    encoding: "utf8",
    timeout: 60_000,
    env: {
      ...process.env,
      OPENAI_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      DATABASE_URL: "",
      LLM_DISABLE: "",
      ANALYSIS_PROVIDER: "",
      ...extraEnv,
    },
  });
  return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

describe("ask-eval-harvest --generate refuses the offline configurations (WS2-F12)", () => {
  it("LLM_DISABLE=1 exits 2 before the estimate or any client", () => {
    const r = run({ LLM_DISABLE: "1" });
    expect(r.status).toBe(2);
    expect(r.out).toContain("LLM_DISABLE=1");
    expect(r.out).not.toContain("pre-flight estimate"); // refused before anything else
  });

  it("ANALYSIS_PROVIDER=stub exits 2 before the estimate or any client", () => {
    const r = run({ ANALYSIS_PROVIDER: "stub" });
    expect(r.status).toBe(2);
    expect(r.out).toContain("ANALYSIS_PROVIDER=stub");
    expect(r.out).not.toContain("pre-flight estimate");
  });

  it("neither refusal fires for an ordinary configuration (it stops later, on its own terms)", () => {
    const r = run({});
    expect(r.out).not.toContain("LLM_DISABLE=1");
    expect(r.out).not.toContain("ANALYSIS_PROVIDER=stub is the offline switch");
  });
});

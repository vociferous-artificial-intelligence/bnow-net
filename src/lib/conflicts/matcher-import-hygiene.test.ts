// Phase-4 purity pins (prompt §12 "no paid runs in this workstream";
// llm-compatible-matcher.ts header contract).
//
// Two complementary guards:
//  1. SOURCE SCAN — no Phase-4 module reads the environment, imports a
//     provider SDK, or touches the spend machinery. The live-compatible
//     adapter's only route to votes is the INJECTED vote function, so a paid
//     call is structurally impossible from this package.
//  2. BLANKED-ENV IMPORT — the adapter module graph imports and OPERATES
//     with every provider/spend/database env var deleted: a full k=5 match
//     resolves from injected votes alone. Import-time env coupling or client
//     construction would fail here.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const PHASE4_MODULES = [
  "match-contract.ts",
  "fixture-matcher.ts",
  "keyword-matcher.ts",
  "llm-compatible-matcher.ts",
  "scorer.ts",
  "contribution.ts",
  "goldens.ts",
  "offline-report.ts",
  "eval-profile.ts",
] as const;

// forbidden in Phase-4 module SOURCE: env reads, provider SDK imports,
// spend/usage imports, dynamic require, network primitives
const FORBIDDEN_SOURCE = [
  /process\.env/,
  /from\s+["']openai["']/,
  /from\s+["']@anthropic/,
  /from\s+["']\.\.\/usage\//,
  /\brequire\s*\(/,
  /\bfetch\s*\(/,
] as const;

describe("Phase-4 module purity", () => {
  for (const file of PHASE4_MODULES) {
    it(`${file} reads no env, imports no provider SDK, touches no spend machinery`, () => {
      const source = readFileSync(join(process.cwd(), "src", "lib", "conflicts", file), "utf8");
      for (const pattern of FORBIDDEN_SOURCE) {
        expect(pattern.test(source), `${file} matches forbidden ${String(pattern)}`).toBe(false);
      }
    });
  }

  it("the live-compatible adapter imports and matches under a fully blanked environment", async () => {
    const BLANKED = [
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
      "LLM_SPRINT_USD_CAP",
      "LLM_DIGEST_USD_CAP",
      "MATCHER_MODE",
      "MATCH_VOTES",
      "ANALYSIS_PROVIDER",
      "DATABASE_URL",
      "LLM_DISABLE",
    ] as const;
    const saved = new Map<string, string | undefined>();
    for (const key of BLANKED) {
      saved.set(key, process.env[key]);
      delete process.env[key];
    }
    try {
      vi.resetModules();
      const [{ LlmCompatibleMatcher }, { ConflictKeywordMatcher }] = await Promise.all([
        import("./llm-compatible-matcher"),
        import("./keyword-matcher"),
      ]);
      const matcher = new LlmCompatibleMatcher({
        votesK: 5,
        model: null,
        keywordFallback: new ConflictKeywordMatcher(),
        voteFn: async () =>
          JSON.stringify({ matches: [{ unitId: "u0", claimId: 101, confidence: 0.9 }] }),
      });
      const outcome = await matcher.match(
        [
          {
            unitId: "u0",
            ordinal: 0,
            text: "Synthetic forces struck an invented depot near a fictional town.",
            lane: "strikes_air_defense",
            compound: false,
            negative: false,
          },
        ],
        [{ claimId: 101, text: "An invented depot was reportedly struck.", hedging: "claimed" }],
      );
      // all five injected rounds usable → the majority rung, zero dispatch,
      // zero env dependence
      expect(outcome.label).toBe("llm-majority");
      expect(outcome.voteRounds).toBe(5);
      expect(outcome.model).toBeNull();
    } finally {
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      vi.resetModules();
    }
  });
});

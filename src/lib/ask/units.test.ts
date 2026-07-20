import { beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const h = vi.hoisted(() => ({ queryMock: vi.fn(), endMock: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({
  Pool: class {
    query = h.queryMock;
    end = h.endMock;
  },
}));

const { aggregateUnits, analysisUnits, UNITS_CACHE_HIT, UNITS_DEEP, UNITS_STANDARD } =
  await import("./units");
const { stubResolveAccessContext } = await import("./access-context");
import type { AskAnswerV2 } from "./types";

function result(over: Partial<AskAnswerV2>): AskAnswerV2 {
  return {
    answer: "a", citedClaimIds: [], evidenceCount: 0, terms: [], provider: "openai:gpt-5",
    state: "answered", relatedClaimIds: [], window: null, totalMatching: 0, sampled: false,
    retrievalMode: "v2", ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.endMock.mockResolvedValue(undefined);
  h.queryMock.mockResolvedValue({ rows: [] });
});

describe("analysisUnits — the §9.5 unit policy, table-tested", () => {
  it.each([
    ["billed answered run", result({ state: "answered" }), UNITS_STANDARD],
    ["billed insufficient run", result({ state: "insufficient" }), UNITS_STANDARD],
    ["billed refused run", result({ state: "refused" }), UNITS_STANDARD],
    ["exact cache hit", result({ state: "answered", cacheStatus: "exact" }), UNITS_CACHE_HIT],
    ["idempotent replay", result({ state: "answered", replayed: true }), 0],
    ["limit refusal", result({ state: "limit", provider: "limit" }), 0],
    ["error refusal", result({ state: "error", provider: "error" }), 0],
    ["replayed cache-ish payload", result({ replayed: true, cacheStatus: "exact" }), 0],
    ["stub offline answer (kill-switch — NO provider exchange)", result({ state: "answered", provider: "stub" }), 0],
    ["budget-degraded answer (BNOW's own cap refused the call)", result({ state: "answered", provider: "budget" }), 0],
    ["cancelled run (beta decision: 0 — re-decide before live billing)", result({ state: "error", provider: "cancelled" }), 0],
  ])("%s → %i units", (_label, r, expected) => {
    expect(analysisUnits(r)).toBe(expected);
  });

  it("deep mode bills UNITS_DEEP through the SAME policy function (no dead constant)", () => {
    expect(analysisUnits(result({ state: "answered" }), "deep")).toBe(UNITS_DEEP);
    expect(analysisUnits(result({ state: "answered", cacheStatus: "exact" }), "deep")).toBe(0); // hits stay free in every mode
    expect(UNITS_DEEP).toBe(3);
  });
});

describe("aggregateUnits — the billing feed (aggregate only, no internals)", () => {
  it("sums units/runs/settled cost per user over the period; the SQL exposes no question/answer columns", async () => {
    h.queryMock.mockResolvedValue({
      rows: [{ user_email: "a@x.com", units: 5, runs: 7, settled_cost_usd: 0.08 }],
    });
    const rows = await aggregateUnits({ from: "2026-07-01", to: "2026-08-01" });
    expect(rows).toEqual([{ userEmail: "a@x.com", units: 5, runs: 7, settledCostUsd: 0.08 }]);
    const sql = String(h.queryMock.mock.calls[0][0]);
    expect(sql).toContain("GROUP BY user_email");
    expect(sql).not.toMatch(/question|result|answer|snapshot|prompt/i); // aggregate ONLY
  });

  it("scopes to one user when asked", async () => {
    await aggregateUnits({ from: "2026-07-01", to: "2026-08-01", userEmail: "a@x.com" });
    expect(h.queryMock.mock.calls[0][1]).toEqual(["2026-07-01", "2026-08-01", "a@x.com"]);
  });
});

describe("AccessContext stub contract (billing-owned module ABSENT — enablement-blocked)", () => {
  it("the stub grants nothing the current gates don't already govern", async () => {
    const ctx = await stubResolveAccessContext("someone@x.com");
    expect(ctx).toEqual({
      tier: "beta",
      modesAllowed: ["auto"],
      unitsRemaining: null,
      maxPerDay: null,
      orgKey: null,
    });
  });

  it("the stub is NOT consulted anywhere in the money path (wiring is blocked on the billing contract)", () => {
    const SRC = join(__dirname, "..", "..");
    const files = [
      "lib/ask/limits.ts", "lib/ask/answer.ts", "lib/ask/runs.ts", "lib/ask/sessions.ts",
      "app/ask/actions.ts", "app/api/ask/route.ts", "app/api/ask/runs/route.ts",
    ];
    for (const f of files) {
      const src = readFileSync(join(SRC, f), "utf8");
      expect(src.includes("access-context"), `${f} must not consult the stub yet`).toBe(false);
    }
  });
});

describe("import-graph: no billing/Paddle in the Ask pipeline (§9.4 / Gate 7 structural leg)", () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
    }
    return out;
  }

  it("retrieval/rerank/generation/validation/events/rendering — AND the guard layer + schema — import no billing or Paddle module in ANY form", () => {
    const SRC = join(__dirname, "..", "..");
    const offenders: string[] = [];
    // G7 fix: lib/usage (the cap-override vector — billing must never reach
    // INTO the guard layer) and db are scanned too; the pattern catches bare
    // side-effect imports, export-from, require() and dynamic import().
    for (const dir of ["lib/ask", "lib/llm", "lib/embeddings", "lib/usage", "db", "app/ask", "app/api/ask", "components"]) {
      for (const file of walk(join(SRC, dir))) {
        const src = readFileSync(file, "utf8");
        if (/(?:from\s+|import\s+|require\(\s*|import\(\s*)["'][^"']*(?:billing|paddle)[^"']*["']/i.test(src)) {
          offenders.push(file.slice(SRC.length + 1));
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("payment can never override SpendGuard: units/access modules import nothing from the usage layer in ANY form", () => {
    const SRC = join(__dirname, "..", "..");
    for (const f of ["lib/ask/units.ts", "lib/ask/access-context.ts"]) {
      const src = readFileSync(join(SRC, f), "utf8");
      // static, bare, export-from, require, dynamic, and barrel forms
      expect(
        /(?:from\s+|import\s+|require\(\s*|import\(\s*)["'][^"']*usage(?:\/|["'])/.test(src),
        `${f} must not touch the guard layer`,
      ).toBe(false);
    }
  });
});

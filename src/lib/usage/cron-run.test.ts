import { beforeEach, describe, expect, it, vi } from "vitest";

// withCronRun imports @/db lazily; mock it so these tests are DB-free and the
// exact UPDATE arguments (ok, error, counts) are observable.
const querySpy = vi.fn(async (sql: string, _params?: unknown[]) => {
  if (/INSERT INTO cron_runs/.test(sql)) return [{ id: 42 }];
  return [];
});
vi.mock("@/db", () => ({ rawSql: { query: querySpy } }));

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const { cronJobName, markDegraded, withCronRun } = await import("./cron-run");

beforeEach(() => querySpy.mockClear());

function finishArgs(): unknown[] {
  // the parameterless #98 sweep is also an UPDATE cron_runs — the finish
  // UPDATE is the one carrying bind params
  const call = querySpy.mock.calls.find(
    ([sql, params]) => /UPDATE cron_runs/.test(sql as string) && Array.isArray(params),
  );
  expect(call).toBeDefined();
  return call![1] as unknown[];
}

describe("cronJobName", () => {
  it("qualifies the jobs whose schedule is split across cron entries", () => {
    // vercel.json runs digest?group=core and digest?group=gulf on separate crons;
    // one shared job name would make their success rates indistinguishable
    expect(cronJobName("digest", "core")).toBe("digest:core");
    expect(cronJobName("digest", "gulf")).toBe("digest:gulf");
    expect(cronJobName("ingest", "fast")).toBe("ingest:fast");
    expect(cronJobName("ingest", "telegram")).toBe("ingest:telegram");
    expect(cronJobName("ingest", "x")).toBe("ingest:x");
  });

  it("leaves unqualified jobs bare", () => {
    expect(cronJobName("validate")).toBe("validate");
    expect(cronJobName("enrich", null)).toBe("enrich");
    expect(cronJobName("materials", undefined)).toBe("materials");
  });
});

describe("withCronRun degraded classification (#87)", () => {
  it("a clean successful run stays ok=true with error NULL", async () => {
    await withCronRun("job", async (counts) => {
      counts.widgets = 3;
      return "done";
    });
    const [, ok, error, counts] = finishArgs();
    expect(ok).toBe(true);
    expect(error).toBeNull();
    expect(JSON.parse(counts as string)).toEqual({ widgets: 3 });
  });

  it("a run the route marked degraded records ok=false with error NULL (the degraded signature)", async () => {
    const out = await withCronRun("job", async (counts) => {
      counts.errors = 2;
      markDegraded(counts, "nested_errors", { errors: 2 });
      return "still-returns";
    });
    expect(out).toBe("still-returns"); // resolves normally — callers unaffected
    const [, ok, error, counts] = finishArgs();
    expect(ok).toBe(false);
    expect(error).toBeNull(); // error stays NULL: readers keyed on error IS NOT NULL keep their semantics
    expect(JSON.parse(counts as string).degraded).toEqual({ category: "nested_errors", errors: 2 });
  });

  it("a thrown failure keeps its historical shape: ok=false with the message", async () => {
    await expect(
      withCronRun("job", async (counts) => {
        counts.partial = 1;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const [, ok, error, counts] = finishArgs();
    expect(ok).toBe(false);
    expect(error).toBe("boom");
    expect(JSON.parse(counts as string).partial).toBe(1); // partial work survives
  });

  it("markDegraded writes the reserved key shape", () => {
    const counts: Record<string, unknown> = {};
    markDegraded(counts, "batch_errors", { batchErrors: 3 });
    expect(counts.degraded).toEqual({ category: "batch_errors", batchErrors: 3 });
  });
});

describe("#98 timeout sweep wiring", () => {
  it("every job start issues the sweep before opening its own row", async () => {
    await withCronRun("job", async () => null);
    const sqls = querySpy.mock.calls.map(([sql]) => String(sql));
    const sweepIdx = sqls.findIndex((s) => s.includes("timeoutSweep"));
    const insertIdx = sqls.findIndex((s) => /INSERT INTO cron_runs/.test(s));
    expect(sweepIdx).toBeGreaterThanOrEqual(0);
    expect(sweepIdx).toBeLessThan(insertIdx); // the fresh row can never self-match anyway (age 0)
    const sweep = sqls[sweepIdx];
    // the three guards that make the sweep safe + idempotent
    expect(sweep).toContain("finished_at IS NULL");
    expect(sweep).toContain("ok IS NULL");
    expect(sweep).toContain("make_interval");
    // ruling 10 preserved: the sweep must never write finished_at
    expect(sweep).not.toMatch(/SET[^]*finished_at\s*=/);
  });

  it("a sweep failure never breaks the job (bookkeeping contract)", async () => {
    querySpy.mockImplementationOnce(async () => {
      throw new Error("db down");
    });
    const out = await withCronRun("job", async () => "survived");
    expect(out).toBe("survived");
  });

  it("the ceiling table stays in lockstep with every cron route that records runs", async () => {
    // Enumerate the ACTUAL route files rather than a second hardcoded list, so
    // a future cron route added with withCronRun but no table entry fails here
    // (its runs would otherwise fall to the widest-ceiling fallback — safe
    // today only because no route exceeds 800s, an invariant this test pins).
    const { JOB_MAX_DURATION_SEC } = await import("./cron-run");
    const { readFileSync, readdirSync } = await import("node:fs");
    const families = new Map<string, number>(); // family -> maxDuration from source
    for (const dir of readdirSync("src/app/api/cron", { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      const path = `src/app/api/cron/${dir.name}/route.ts`;
      let src: string;
      try {
        src = readFileSync(path, "utf8");
      } catch {
        continue; // nested-only dirs (probe/mtproto) have no top-level route
      }
      if (!src.includes("withCronRun")) continue; // probes never write cron_runs
      const m = src.match(/export const maxDuration = (\d+);/);
      expect(m, `${path} must export maxDuration`).not.toBeNull();
      families.set(dir.name, Number(m![1]));
      expect(Number(m![1]), `${path} maxDuration must stay <= 800 (the fallback bound)`).toBeLessThanOrEqual(800);
    }
    expect([...families.keys()].sort()).toEqual(Object.keys(JOB_MAX_DURATION_SEC).sort());
    for (const [family, secs] of families) {
      expect(JOB_MAX_DURATION_SEC[family], `ceiling for ${family}`).toBe(secs);
    }
  });
});

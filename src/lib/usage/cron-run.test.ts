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
  const call = querySpy.mock.calls.find(([sql]) => /UPDATE cron_runs/.test(sql as string));
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

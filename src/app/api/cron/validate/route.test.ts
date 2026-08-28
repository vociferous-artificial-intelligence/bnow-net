import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Real withCronRun (its lazy @/db mocked) + mocked validateDigest: the tests
// pin #87's truthful accounting split — thrown failures degrade the run,
// validateDigest's normal {error} returns stay benign `unvalidated`.
const dbQuery = vi.fn(async (sql: string, _params?: unknown[]) =>
  /INSERT INTO cron_runs/.test(String(sql)) ? [{ id: 7 }] : [],
);
vi.mock("@/db", () => ({ rawSql: { query: dbQuery } }));

const validateDigest = vi.fn();
vi.mock("@/lib/validation/run", () => ({ validateDigest: (...a: unknown[]) => validateDigest(...a) }));

const { GET } = await import("./route");

function req(query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/cron/validate${query}`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
}

function written(): { ok: boolean; error: string | null; counts: Record<string, unknown> } {
  const call = dbQuery.mock.calls.find(([sql]) => /UPDATE cron_runs/.test(String(sql)));
  expect(call).toBeDefined();
  const args = call![1] as unknown[];
  return {
    ok: args[1] as boolean,
    error: args[2] as string | null,
    counts: JSON.parse(args[3] as string) as Record<string, unknown>,
  };
}

beforeEach(() => {
  process.env.CRON_SECRET = "test-secret";
  dbQuery.mockClear();
  validateDigest.mockReset();
});

describe("validate cron accounting (#87)", () => {
  it("all-validated run: ok=true, errors 0, unvalidated 0", async () => {
    validateDigest.mockResolvedValue({ coverage: 1 });
    const res = await GET(req("?date=2026-08-26"));
    expect(res.status).toBe(200);
    const w = written();
    expect(w.ok).toBe(true);
    expect(w.counts.validated).toBe(3);
    expect(w.counts.errors).toBe(0);
    expect(w.counts.unvalidated).toBe(0);
    expect(w.counts.unvalidatedReasons).toBeUndefined();
  });

  it("a benign {error} RETURN (ISW not published) stays ok=true as `unvalidated` with the reason sampled", async () => {
    validateDigest
      .mockResolvedValueOnce({ coverage: 1 })
      .mockResolvedValueOnce({ coverage: 1 })
      .mockResolvedValueOnce({ error: "no reference report for ir 2026-08-26 (probe 404)" });
    await GET(req("?date=2026-08-26"));
    const w = written();
    expect(w.ok).toBe(true); // the historical false-alarm case, now benign
    expect(w.error).toBeNull();
    expect(w.counts.validated).toBe(2);
    expect(w.counts.errors).toBe(0);
    expect(w.counts.unvalidated).toBe(1);
    expect(w.counts.unvalidatedReasons).toEqual(["no reference report for ir 2026-08-26 (probe 404)"]);
    expect(w.counts.degraded).toBeUndefined();
  });

  it("a THROWN failure degrades the run: ok=false, error NULL, counts.degraded present", async () => {
    validateDigest
      .mockResolvedValueOnce({ coverage: 1 })
      .mockRejectedValueOnce(new Error("db exploded"))
      .mockResolvedValueOnce({ error: "no digest for ir 2026-08-26" });
    await GET(req("?date=2026-08-26"));
    const w = written();
    expect(w.ok).toBe(false);
    expect(w.error).toBeNull(); // degraded signature — not the thrown-run shape
    expect(w.counts.errors).toBe(1); // thrown only
    expect(w.counts.unvalidated).toBe(1); // the benign return stays separate
    expect(w.counts.degraded).toEqual({ errors: 1, category: "nested_errors" });
    // digest-consistent split: thrown under errorMessages, benign reasons apart
    expect(w.counts.errorMessages).toEqual(["db exploded"]);
    expect(w.counts.unvalidatedReasons).toEqual(["no digest for ir 2026-08-26"]);
  });
});

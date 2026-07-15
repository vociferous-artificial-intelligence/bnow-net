import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The route must reject bad requests BEFORE opening any paid enrichment loop.
// enrichEntities/enrichOwnership are spied to prove zero provider work happens on
// a 401 or a 400 (the real parseEnrichParams still runs). withCronRun is stubbed so
// the ownership success path runs without a DB.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.CRON_SECRET = "test-secret";

const { enrichEntities, enrichOwnership } = vi.hoisted(() => ({
  enrichEntities: vi.fn(),
  enrichOwnership: vi.fn(),
}));

vi.mock("@/lib/enrich/run", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/enrich/run")>();
  return { ...actual, enrichEntities };
});
vi.mock("@/lib/enrich/ownership-run", () => ({ enrichOwnership }));
vi.mock("@/lib/usage/cron-run", () => ({
  withCronRun: (_job: string, fn: (counts: Record<string, unknown>) => Promise<unknown>) => fn({}),
}));

const { GET } = await import("./route");

beforeEach(() => {
  enrichEntities.mockClear();
  enrichOwnership.mockClear();
});

function req(query: string, auth: string | null = "Bearer test-secret") {
  return new NextRequest(`https://bnow.net/api/cron/enrich${query}`, {
    headers: auth ? { authorization: auth } : {},
  });
}

describe("/api/cron/enrich request validation", () => {
  it("401 without the cron secret — no enrich work", async () => {
    const res = await GET(req("?refresh=1&before=2026-01-01T00:00:00Z", "Bearer wrong"));
    expect(res.status).toBe(401);
    expect(enrichEntities).not.toHaveBeenCalled();
    expect(enrichOwnership).not.toHaveBeenCalled();
  });

  it("(11) 400 on refresh=1 without a before cutoff — zero provider calls", async () => {
    const res = await GET(req("?refresh=1"));
    expect(res.status).toBe(400);
    expect(enrichEntities).not.toHaveBeenCalled();
    expect(enrichOwnership).not.toHaveBeenCalled();
  });

  it("(11) 400 on refresh=1 with an invalid before — zero provider calls", async () => {
    for (const bad of ["before=2026", "before=nonsense", "before=2026-08-01"]) {
      const res = await GET(req(`?refresh=1&${bad}`));
      expect(res.status).toBe(400);
    }
    expect(enrichEntities).not.toHaveBeenCalled();
  });

  it("(cutoff safety) 400 on a FUTURE before — zero provider calls", async () => {
    const res = await GET(req("?refresh=1&before=2099-01-01T00:00:00Z"));
    expect(res.status).toBe(400);
    expect(enrichEntities).not.toHaveBeenCalled();
  });

  it("(cutoff safety) 400 on a timezone-LESS before — zero provider calls", async () => {
    const res = await GET(req("?refresh=1&before=2026-01-01T00:00:00"));
    expect(res.status).toBe(400);
    expect(enrichEntities).not.toHaveBeenCalled();
  });

  it("400 on an out-of-range limit — zero provider calls", async () => {
    const res = await GET(req("?limit=999999"));
    expect(res.status).toBe(400);
    expect(enrichEntities).not.toHaveBeenCalled();
  });

  it("(contract) ownership-only refresh needs no before — no 400, sanctions not run", async () => {
    const res = await GET(req("?only=ownership&refresh=1"));
    expect(res.status).not.toBe(400);
    expect(enrichEntities).not.toHaveBeenCalled(); // only=ownership skips sanctions
    expect(enrichOwnership).toHaveBeenCalledTimes(1);
  });
});

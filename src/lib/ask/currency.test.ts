import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Neon Pool mocked: no DB. query() is driven per-test; end() is asserted so the
// finally-block close is exercised on every path (success, error).
const h = vi.hoisted(() => {
  const queryMock = vi.fn();
  const endMock = vi.fn();
  const poolCtor = vi.fn(() => ({ query: queryMock, end: endMock }));
  return { queryMock, endMock, poolCtor };
});

vi.mock("@neondatabase/serverless", () => ({ Pool: h.poolCtor }));

import { dataCurrentThrough, _resetCurrencyCacheForTests } from "./currency";

const SAVED_DB_URL = process.env.DATABASE_URL;

beforeEach(() => {
  vi.clearAllMocks();
  _resetCurrencyCacheForTests();
  process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
  h.endMock.mockResolvedValue(undefined);
});

afterEach(() => {
  if (SAVED_DB_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = SAVED_DB_URL;
});

describe("dataCurrentThrough", () => {
  it("returns max(claim_date) verbatim and selects it ::text (no tz localization)", async () => {
    h.queryMock.mockResolvedValue({ rows: [{ d: "2026-07-11" }] });

    const res = await dataCurrentThrough();

    expect(res).toBe("2026-07-11");
    expect(h.queryMock.mock.calls[0][0]).toContain("::text");
    expect(h.queryMock.mock.calls[0][0]).toContain("max(claim_date)");
    expect(h.endMock).toHaveBeenCalledTimes(1); // pool closed in finally
  });

  it("caches a real date (~5 min): a second call within TTL does not re-query", async () => {
    h.queryMock.mockResolvedValue({ rows: [{ d: "2026-07-11" }] });
    let clock = 1_000_000;
    const now = () => clock;

    expect(await dataCurrentThrough(now)).toBe("2026-07-11");
    clock += 4 * 60_000; // +4 min — inside the 5-min positive TTL
    expect(await dataCurrentThrough(now)).toBe("2026-07-11");
    expect(h.queryMock).toHaveBeenCalledTimes(1); // served from cache

    clock += 2 * 60_000; // now +6 min from the first read — past the TTL
    expect(await dataCurrentThrough(now)).toBe("2026-07-11");
    expect(h.queryMock).toHaveBeenCalledTimes(2); // refreshed
  });

  it("returns null on a query error, closes the pool, and negative-caches ~30s", async () => {
    h.queryMock.mockRejectedValueOnce(new Error("boom"));
    let clock = 0;
    const now = () => clock;

    expect(await dataCurrentThrough(now)).toBeNull();
    expect(h.endMock).toHaveBeenCalledTimes(1); // closed even on throw
    clock += 20_000; // inside the 30s negative TTL
    expect(await dataCurrentThrough(now)).toBeNull();
    expect(h.queryMock).toHaveBeenCalledTimes(1); // a down DB is NOT hammered

    clock += 15_000; // now 35s — past the negative TTL; DB has recovered
    h.queryMock.mockResolvedValue({ rows: [{ d: "2026-07-12" }] });
    expect(await dataCurrentThrough(now)).toBe("2026-07-12");
    expect(h.queryMock).toHaveBeenCalledTimes(2);
  });

  it("returns null WITHOUT constructing a Pool when DATABASE_URL is unset", async () => {
    delete process.env.DATABASE_URL;
    _resetCurrencyCacheForTests();

    expect(await dataCurrentThrough()).toBeNull();
    expect(h.poolCtor).not.toHaveBeenCalled();
  });

  it("treats an empty corpus (max is null) as null and negative-caches it", async () => {
    h.queryMock.mockResolvedValue({ rows: [{ d: null }] });
    let clock = 0;
    const now = () => clock;

    expect(await dataCurrentThrough(now)).toBeNull();
    clock += 20_000; // within negative TTL
    expect(await dataCurrentThrough(now)).toBeNull();
    expect(h.queryMock).toHaveBeenCalledTimes(1); // short-TTL cached, not re-queried
  });
});

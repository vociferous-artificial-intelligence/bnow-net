import { describe, expect, it } from "vitest";

// Pure coverage for the enrich request parsing, cutoff safety, guard wiring, and
// the SQL query builders. Actual Postgres selection/advance behavior is proven in
// src/integration/enrich-rescore.itest.ts (disposable Neon branch).
// x-api imports @/db at module load, so set DATABASE_URL before dynamically
// importing (static imports would hoist above this assignment).
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const {
  buildCandidateQuery,
  buildRemainingQuery,
  enrichEntities,
  normalizeIsoInstant,
  opensanctionsGuardFromEnv,
  parseEnrichParams,
} = await import("./run");
const { xGuardFromEnv } = await import("../adapters/x-api");

const sp = (q: string) => new URLSearchParams(q);
// Fixed "now" later than every valid-past cutoff used below.
const NOW = "2026-09-01T00:00:00.000Z";

describe("normalizeIsoInstant", () => {
  it("canonicalizes a timezone-qualified instant (Z and explicit offset)", () => {
    expect(normalizeIsoInstant("2026-07-15T18:00:00Z")).toBe("2026-07-15T18:00:00.000Z");
    expect(normalizeIsoInstant("2026-07-15T18:00:00.500Z")).toBe("2026-07-15T18:00:00.500Z");
    // +02:00 offset resolves to the same absolute UTC instant
    expect(normalizeIsoInstant("2026-07-15T20:00:00+02:00")).toBe("2026-07-15T18:00:00.000Z");
    expect(normalizeIsoInstant("2026-07-15T13:00:00-05:00")).toBe("2026-07-15T18:00:00.000Z");
    expect(normalizeIsoInstant("2026-07-15T20:00:00+0200")).toBe("2026-07-15T18:00:00.000Z");
    expect(normalizeIsoInstant("2026-07-15T18:00Z")).toBe("2026-07-15T18:00:00.000Z");
  });

  it("rejects a timezone-LESS timestamp (server-zone ambiguity)", () => {
    expect(normalizeIsoInstant("2026-07-15T18:00:00")).toBeNull();
    expect(normalizeIsoInstant("2026-07-15 18:00:00")).toBeNull();
    expect(normalizeIsoInstant("2026-07-15 18:00:00+00")).toBeNull(); // space form + short offset
  });

  it("rejects a bare year, date-only, empty, or garbage", () => {
    expect(normalizeIsoInstant("2026")).toBeNull();
    expect(normalizeIsoInstant("2026-07-15")).toBeNull();
    expect(normalizeIsoInstant("")).toBeNull();
    expect(normalizeIsoInstant(null)).toBeNull();
    expect(normalizeIsoInstant("not-a-date")).toBeNull();
    expect(normalizeIsoInstant("2026-13-99T00:00:00Z")).toBeNull(); // parses to NaN
  });

  it("rejects a cutoff later than nowIso, accepts one at/before it", () => {
    expect(normalizeIsoInstant("2026-09-01T00:00:00.001Z", NOW)).toBeNull(); // 1ms future
    expect(normalizeIsoInstant("2099-01-01T00:00:00Z", NOW)).toBeNull();
    expect(normalizeIsoInstant(NOW, NOW)).toBe(NOW); // exactly now is allowed
    expect(normalizeIsoInstant("2026-08-01T00:00:00Z", NOW)).toBe("2026-08-01T00:00:00.000Z");
  });
});

describe("parseEnrichParams", () => {
  it("normal mode (no refresh) needs no cutoff", () => {
    const r = parseEnrichParams(sp(""), NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.params.refresh).toBe(false);
      expect(r.params.before).toBeNull();
      expect(r.params.limit).toBe(200);
    }
  });

  it("(11) sanctions refresh without before is rejected", () => {
    const r = parseEnrichParams(sp("refresh=1"), NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("before");
  });

  it("(11) sanctions refresh with an invalid/tz-less before is rejected", () => {
    for (const bad of [
      "before=2026",
      "before=nonsense",
      "before=2026-08-01", // date only
      "before=2026-08-01T00:00:00", // no timezone
    ]) {
      const r = parseEnrichParams(sp(`refresh=1&${bad}`), NOW);
      expect(r.ok, bad).toBe(false);
    }
  });

  it("(cutoff safety) a future before is rejected", () => {
    const r = parseEnrichParams(sp("refresh=1&before=2099-01-01T00:00:00Z"), NOW);
    expect(r.ok).toBe(false);
  });

  it("sanctions refresh with a valid past before is accepted and canonicalized", () => {
    const r = parseEnrichParams(sp("refresh=1&before=2026-08-01T00:00:00Z&only=sanctions&limit=120"), NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.params.refresh).toBe(true);
      expect(r.params.before).toBe("2026-08-01T00:00:00.000Z");
      expect(r.params.only).toBe("sanctions");
      expect(r.params.limit).toBe(120);
    }
  });

  it("(contract) an ownership-only refresh needs no before", () => {
    const r = parseEnrichParams(sp("refresh=1&only=ownership"), NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.params.refresh).toBe(true);
      expect(r.params.before).toBeNull();
      expect(r.params.only).toBe("ownership");
    }
  });

  it("(invariant) an accepted cutoff is never later than nowIso (<= the checkedAt stamp)", () => {
    const now = "2026-07-15T12:00:00.000Z";
    const ok = parseEnrichParams(sp(`refresh=1&before=${now}`), now);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(Date.parse(ok.params.before!)).toBeLessThanOrEqual(Date.parse(now));
    const future = new Date(Date.parse(now) + 1).toISOString();
    expect(parseEnrichParams(sp(`refresh=1&before=${future}`), now).ok).toBe(false);
  });

  it("rejects a non-positive, non-integer, or oversized limit", () => {
    for (const bad of ["limit=0", "limit=-5", "limit=12.5", "limit=abc", "limit=100000"]) {
      const r = parseEnrichParams(sp(bad), NOW);
      expect(r.ok, bad).toBe(false);
    }
  });
});

describe("enrichEntities cutoff boundary (direct-caller defense)", () => {
  it("throws on a future cutoff without touching a pool", async () => {
    await expect(
      enrichEntities({ refresh: true, before: "2099-01-01T00:00:00Z", nowIso: NOW }),
    ).rejects.toThrow(/cutoff/i);
  });
  it("throws on a timezone-less cutoff", async () => {
    await expect(
      enrichEntities({ refresh: true, before: "2026-08-01T00:00:00", nowIso: NOW }),
    ).rejects.toThrow(/cutoff/i);
  });
  it("throws on a rescore with no before", async () => {
    await expect(enrichEntities({ refresh: true, before: null, nowIso: NOW })).rejects.toThrow();
  });
});

describe("(8) guard wiring: OpenSanctions monthly, X all-time", () => {
  it("OpenSanctions opts into calendar_month", () => {
    expect(opensanctionsGuardFromEnv().cfg.totalPeriod).toBe("calendar_month");
  });
  it("X stays all_time (totalPeriod unset)", () => {
    expect(xGuardFromEnv().cfg.totalPeriod).toBeUndefined();
  });
});

describe("candidate/remaining query builders", () => {
  it("normal mode selects missing/stub only — no cutoff, no timestamptz cast", () => {
    const q = buildCandidateQuery("normal", 50, null);
    expect(q.values).toEqual([50]);
    expect(q.text).toContain("->>'stub'");
    expect(q.text).not.toContain("timestamptz");
    expect(q.text).not.toContain("CASE");
    expect(q.text).toContain("LIMIT $1");

    const c = buildRemainingQuery("normal", null);
    expect(c.values).toEqual([]);
    expect(c.text).toContain("count(*)");
    expect(c.text).not.toContain("timestamptz");
  });

  it("rescore mode guards the cast behind a regex and compares to the cutoff", () => {
    const before = "2026-08-01T00:00:00.000Z";
    const q = buildCandidateQuery("rescore", 120, before);
    expect(q.values).toEqual([120, before]);
    expect(q.text).toContain("CASE");
    // the cast only runs on rows matching the ISO prefix (malformed -> earlier branch)
    expect(q.text).toContain("!~ '^[0-9]{4}");
    expect(q.text).toContain("::timestamptz < $2::timestamptz");
    // stub/missing still selected in rescore
    expect(q.text).toContain("->>'stub'");

    const c = buildRemainingQuery("rescore", before);
    expect(c.values).toEqual([before]);
    expect(c.text).toContain("::timestamptz < $1::timestamptz");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  ACCEPTANCE_METHOD,
} from "./policies";

// acceptance.ts lazy-imports @/db, so mocking the module here is enough — no DATABASE_URL needed.
const queryMock = vi.fn<(sql: string, params: unknown[]) => Promise<unknown[]>>();
vi.mock("@/db", () => ({ rawSql: { query: (sql: string, params: unknown[]) => queryMock(sql, params) } }));

const {
  hasCurrentPolicyAcceptance,
  hasCurrentAcceptanceByEmail,
  currentAcceptanceForEmail,
  recordAcceptance,
  updateAnalyticsPreferenceForEmail,
} = await import("./acceptance");

afterEach(() => queryMock.mockReset());

/** SQL-routing mock for the atomic acceptance + analytics-preference statement. */
function wireHappyPath(opts: { userId?: string | null; acceptedAt?: string } = {}) {
  const userId = opts.userId === undefined ? "u1" : opts.userId;
  const acceptedAt = opts.acceptedAt ?? "2026-07-12T10:00:00.000Z";
  queryMock.mockImplementation(async (sql: string) => {
    if (/WITH target AS/i.test(sql)) {
      return userId
        ? [{ user_id: userId, accepted_at: acceptedAt, preference_user_id: userId }]
        : [];
    }
    return [];
  });
}

describe("hasCurrentPolicyAcceptance / hasCurrentAcceptanceByEmail", () => {
  it("is true when a current-version row exists, false when none", async () => {
    queryMock.mockResolvedValueOnce([{ "?column?": 1 }]);
    expect(await hasCurrentPolicyAcceptance("u1")).toBe(true);
    queryMock.mockResolvedValueOnce([]);
    expect(await hasCurrentPolicyAcceptance("u1")).toBe(false);
  });

  it("queries against the CURRENT version pair — old versions cannot satisfy it", async () => {
    queryMock.mockResolvedValue([]);
    await hasCurrentPolicyAcceptance("u1");
    const [, params] = queryMock.mock.calls[0];
    expect(params).toContain(CURRENT_TERMS_VERSION);
    expect(params).toContain(CURRENT_PRIVACY_VERSION);
  });

  it("fails closed to false on a DB error (unknown acceptance state)", async () => {
    queryMock.mockRejectedValue(new Error("db down"));
    expect(await hasCurrentPolicyAcceptance("u1")).toBe(false);
    expect(await hasCurrentAcceptanceByEmail("a@b.com")).toBe(false);
  });

  it("byEmail returns false for an empty email without touching the DB", async () => {
    expect(await hasCurrentAcceptanceByEmail("")).toBe(false);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("recordAcceptance", () => {
  it("resolves the user by email, inserts, and returns the DB-generated timestamp", async () => {
    wireHappyPath({ acceptedAt: "2026-07-12T12:34:56.000Z" });
    const res = await recordAcceptance({
      email: "a@b.com",
      adultAttested: true,
      privacyAcknowledged: true,
      locale: "en",
    });
    expect(res).toEqual({ ok: true, acceptedAt: "2026-07-12T12:34:56.000Z" });
  });

  it("stores the attestation booleans, method, and current versions (never a birth date/IP)", async () => {
    wireHappyPath();
    await recordAcceptance({ email: "a@b.com", adultAttested: true, privacyAcknowledged: true, locale: "uk" });
    const insert = queryMock.mock.calls.find(([sql]) => /INSERT INTO policy_acceptances/i.test(sql))!;
    const [sql, params] = insert;
    // param order: email, terms, privacy, adult, privacy_ack, method, locale, preference
    expect(params).toEqual([
      "a@b.com",
      CURRENT_TERMS_VERSION,
      CURRENT_PRIVACY_VERSION,
      true,
      true,
      ACCEPTANCE_METHOD,
      "uk",
      "denied",
    ]);
    // accepted_at is returned by the statement but is absent from the INSERT column list,
    // so PostgreSQL DEFAULT now() remains authoritative.
    expect(sql).toMatch(/INSERT INTO policy_acceptances\s*\([^)]*locale\)/i);
  });

  it("is idempotent: the insert uses ON CONFLICT DO NOTHING and still returns the stored time", async () => {
    wireHappyPath({ acceptedAt: "2026-07-12T09:00:00.000Z" });
    const first = await recordAcceptance({ email: "a@b.com", adultAttested: true, privacyAcknowledged: true });
    const second = await recordAcceptance({ email: "a@b.com", adultAttested: true, privacyAcknowledged: true });
    expect(first).toEqual({ ok: true, acceptedAt: "2026-07-12T09:00:00.000Z" });
    expect(second).toEqual(first);
    const insert = queryMock.mock.calls.find(([sql]) => /INSERT INTO policy_acceptances/i.test(sql))!;
    expect(insert[0]).toMatch(/ON CONFLICT[\s\S]*DO NOTHING/i);
  });

  it("refuses to persist a row that does not attest both (defense in depth, no DB touched)", async () => {
    const missingAdult = await recordAcceptance({
      email: "a@b.com",
      adultAttested: false,
      privacyAcknowledged: true,
    });
    expect(missingAdult).toEqual({ ok: false, error: "invalid_attestation" });
    const missingPrivacy = await recordAcceptance({
      email: "a@b.com",
      adultAttested: true,
      privacyAcknowledged: false,
    });
    expect(missingPrivacy).toEqual({ ok: false, error: "invalid_attestation" });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns no_user when the email has no users row (the target-scoped CTE changes nothing)", async () => {
    wireHappyPath({ userId: null });
    const res = await recordAcceptance({ email: "ghost@b.com", adultAttested: true, privacyAcknowledged: true });
    expect(res).toEqual({ ok: false, error: "no_user" });
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock.mock.calls[0][0]).toMatch(/SELECT id FROM users WHERE email = \$1/);
    expect(queryMock.mock.calls[0][0]).toMatch(/SELECT id, \$2,[\s\S]*FROM target/);
  });

  it("defaults a missing locale to null", async () => {
    wireHappyPath();
    await recordAcceptance({ email: "a@b.com", adultAttested: true, privacyAcknowledged: true });
    const insert = queryMock.mock.calls.find(([sql]) => /INSERT INTO policy_acceptances/i.test(sql))!;
    expect(insert[1][6]).toBeNull();
    expect(insert[1][7]).toBe("denied");
  });

  it("atomically replaces a prior grant with denied when the new optional control is absent", async () => {
    wireHappyPath();
    await recordAcceptance({ email: "a@b.com", adultAttested: true, privacyAcknowledged: true });
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/UPDATE users[\s\S]*analytics_preference = \$8/i);
    expect(params[7]).toBe("denied");
  });

  it("persists granted only for the exact granted decision", async () => {
    wireHappyPath();
    await recordAcceptance({
      email: "a@b.com",
      adultAttested: true,
      privacyAcknowledged: true,
      analyticsPreference: "granted",
    });
    expect(queryMock.mock.calls[0][1][7]).toBe("granted");
  });
});

describe("currentAcceptanceForEmail", () => {
  it("returns the current-version record with its stored timestamp", async () => {
    queryMock.mockResolvedValueOnce([
      {
        terms_version: "1.0",
        privacy_version: CURRENT_PRIVACY_VERSION,
        accepted_at: "2026-07-12T10:00:00.000Z",
        analytics_preference: "granted",
      },
    ]);
    expect(await currentAcceptanceForEmail("a@b.com")).toEqual({
      termsVersion: "1.0",
      privacyVersion: CURRENT_PRIVACY_VERSION,
      acceptedAt: "2026-07-12T10:00:00.000Z",
      analyticsPreference: "granted",
    });
  });

  it("returns null when there is no current acceptance", async () => {
    queryMock.mockResolvedValueOnce([]);
    expect(await currentAcceptanceForEmail("a@b.com")).toBeNull();
  });
});

describe("updateAnalyticsPreferenceForEmail", () => {
  it("accepts only granted or denied and uses a database-generated timestamp", async () => {
    queryMock.mockResolvedValueOnce([{ analytics_preference: "denied" }]);
    await expect(updateAnalyticsPreferenceForEmail("a@b.com", "denied")).resolves.toEqual({
      ok: true,
      preference: "denied",
    });
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/analytics_preference_updated_at = now\(\)/i);
    expect(params).toEqual(["a@b.com", "denied"]);

    queryMock.mockClear();
    await expect(updateAnalyticsPreferenceForEmail("a@b.com", "unset")).resolves.toEqual({
      ok: false,
      error: "invalid_preference",
    });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("fails safely when no user exists or the database errors", async () => {
    queryMock.mockResolvedValueOnce([]);
    await expect(updateAnalyticsPreferenceForEmail("missing@b.com", "granted")).resolves.toEqual({
      ok: false,
      error: "no_user",
    });
    queryMock.mockRejectedValueOnce(new Error("db down"));
    await expect(updateAnalyticsPreferenceForEmail("a@b.com", "granted")).resolves.toEqual({
      ok: false,
      error: "db_error",
    });
  });
});

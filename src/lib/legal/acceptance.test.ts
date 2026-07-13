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
} = await import("./acceptance");

afterEach(() => queryMock.mockReset());

/** SQL-routing mock: a users lookup, the idempotent insert, and the timestamp read-back. */
function wireHappyPath(opts: { userId?: string | null; acceptedAt?: string } = {}) {
  const userId = opts.userId === undefined ? "u1" : opts.userId;
  const acceptedAt = opts.acceptedAt ?? "2026-07-12T10:00:00.000Z";
  queryMock.mockImplementation(async (sql: string) => {
    if (/FROM users WHERE email/i.test(sql)) return userId ? [{ id: userId }] : [];
    if (/INSERT INTO policy_acceptances/i.test(sql)) return [];
    if (/SELECT accepted_at/i.test(sql)) return userId ? [{ accepted_at: acceptedAt }] : [];
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
    // param order: user_id, terms, privacy, adult, privacy_ack, method, locale
    expect(params).toEqual(["u1", CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION, true, true, ACCEPTANCE_METHOD, "uk"]);
    // accepted_at is NOT supplied by the app — it is the column DEFAULT now().
    expect(sql).not.toMatch(/accepted_at/i);
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

  it("returns no_user when the email has no users row (never inserts)", async () => {
    wireHappyPath({ userId: null });
    const res = await recordAcceptance({ email: "ghost@b.com", adultAttested: true, privacyAcknowledged: true });
    expect(res).toEqual({ ok: false, error: "no_user" });
    expect(queryMock.mock.calls.some(([sql]) => /INSERT INTO policy_acceptances/i.test(sql))).toBe(false);
  });

  it("defaults a missing locale to null", async () => {
    wireHappyPath();
    await recordAcceptance({ email: "a@b.com", adultAttested: true, privacyAcknowledged: true });
    const insert = queryMock.mock.calls.find(([sql]) => /INSERT INTO policy_acceptances/i.test(sql))!;
    expect(insert[1][6]).toBeNull();
  });
});

describe("currentAcceptanceForEmail", () => {
  it("returns the current-version record with its stored timestamp", async () => {
    queryMock.mockResolvedValueOnce([
      { terms_version: "1.0", privacy_version: "1.0", accepted_at: "2026-07-12T10:00:00.000Z" },
    ]);
    expect(await currentAcceptanceForEmail("a@b.com")).toEqual({
      termsVersion: "1.0",
      privacyVersion: "1.0",
      acceptedAt: "2026-07-12T10:00:00.000Z",
    });
  });

  it("returns null when there is no current acceptance", async () => {
    queryMock.mockResolvedValueOnce([]);
    expect(await currentAcceptanceForEmail("a@b.com")).toBeNull();
  });
});

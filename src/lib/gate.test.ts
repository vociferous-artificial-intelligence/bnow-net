import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// next/navigation's real redirect()/notFound() each throw a special NEXT_*
// error inside a request context that doesn't exist in vitest. Mock both as
// throws so requireRole's redirects and requireAdminOr404's 404 are
// observable without a Next.js runtime.
class RedirectSignal extends Error {
  constructor(readonly to: string) {
    super(`redirect:${to}`);
  }
}
class NotFoundSignal extends Error {
  constructor() {
    super("notFound");
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectSignal(to);
  },
  notFound: () => {
    throw new NotFoundSignal();
  },
}));

const authMock =
  vi.fn<() => Promise<{ user?: { email?: string | null } } | null>>();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const queryMock =
  vi.fn<(sql: string, params: unknown[]) => Promise<Array<{ role?: string | null }>>>();
vi.mock("@/db", () => ({
  rawSql: { query: (sql: string, params: unknown[]) => queryMock(sql, params) },
}));

const { roleAtLeast, currentRole, requireRole, requireAdminOr404 } = await import("./gate");

function session(email: string | null) {
  authMock.mockResolvedValue(email ? { user: { email } } : null);
}

/** Runs fn and returns the redirect target; fails the test if fn didn't redirect. */
async function redirectedTo(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof RedirectSignal) return e.to;
    throw e;
  }
  throw new Error("expected a redirect, got none");
}

beforeEach(() => {
  authMock.mockReset();
  queryMock.mockReset();
  vi.stubEnv("FEATURE_AUTH_GATE", "true");
  vi.stubEnv("ADMIN_EMAILS", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("roleAtLeast", () => {
  it.each([
    ["user", "user", true],
    ["user", "analyst", false],
    ["user", "admin", false],
    ["analyst", "user", true],
    ["analyst", "analyst", true],
    ["analyst", "admin", false],
    ["admin", "user", true],
    ["admin", "analyst", true],
    ["admin", "admin", true],
  ] as const)("roleAtLeast(%s, %s) -> %s", (role, min, want) => {
    expect(roleAtLeast(role, min)).toBe(want);
  });
});

describe("currentRole", () => {
  it("is anon when there is no session", async () => {
    session(null);
    expect(await currentRole()).toBe("anon");
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("resolves admin via ADMIN_EMAILS, case-insensitively, without a DB round-trip (bootstrap, pre-migration)", async () => {
    vi.stubEnv("ADMIN_EMAILS", "Boss@Example.com");
    session("boss@example.com");
    expect(await currentRole()).toBe("admin");
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("resolves analyst from the users.role DB row", async () => {
    session("analyst@example.com");
    queryMock.mockResolvedValue([{ role: "analyst" }]);
    expect(await currentRole()).toBe("analyst");
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("FROM users"), [
      "analyst@example.com",
    ]);
  });

  it("resolves admin from the users.role DB row when not on the ADMIN_EMAILS allowlist", async () => {
    session("db-admin@example.com");
    queryMock.mockResolvedValue([{ role: "admin" }]);
    expect(await currentRole()).toBe("admin");
  });

  it("degrades to user on any DB error (e.g. the role column isn't migrated yet)", async () => {
    session("nobody@example.com");
    queryMock.mockRejectedValue(new Error('column "role" does not exist'));
    expect(await currentRole()).toBe("user");
  });

  it("degrades to user when the row is missing", async () => {
    session("ghost@example.com");
    queryMock.mockResolvedValue([]);
    expect(await currentRole()).toBe("user");
  });

  it("degrades to user on a null role value", async () => {
    session("null-role@example.com");
    queryMock.mockResolvedValue([{ role: null }]);
    expect(await currentRole()).toBe("user");
  });

  it("degrades to user on an unrecognized role value", async () => {
    session("weird@example.com");
    queryMock.mockResolvedValue([{ role: "superuser" }]);
    expect(await currentRole()).toBe("user");
  });

  it("is admin when the gate is off, without calling auth or the DB (dev parity with requireUser)", async () => {
    vi.stubEnv("FEATURE_AUTH_GATE", "false");
    expect(await currentRole()).toBe("admin");
    expect(authMock).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("requireRole", () => {
  it("gate off: returns without redirecting, for any minimum role", async () => {
    vi.stubEnv("FEATURE_AUTH_GATE", "false");
    await expect(requireRole("admin")).resolves.toBeUndefined();
    expect(authMock).not.toHaveBeenCalled();
  });

  it("redirects to /signin when there is no session", async () => {
    session(null);
    expect(await redirectedTo(() => requireRole("user"))).toBe("/signin");
  });

  it("redirects to / when the resolved role is below the minimum", async () => {
    session("plain@example.com");
    queryMock.mockResolvedValue([{ role: "user" }]);
    expect(await redirectedTo(() => requireRole("analyst"))).toBe("/");
  });

  it("redirects to / when the DB read fails and the minimum is above user", async () => {
    session("plain@example.com");
    queryMock.mockRejectedValue(new Error('column "role" does not exist'));
    expect(await redirectedTo(() => requireRole("analyst"))).toBe("/");
  });

  it("passes through when the resolved role meets the minimum exactly", async () => {
    session("an@example.com");
    queryMock.mockResolvedValue([{ role: "analyst" }]);
    await expect(requireRole("analyst")).resolves.toBeUndefined();
  });

  it("passes through when the resolved role exceeds the minimum", async () => {
    vi.stubEnv("ADMIN_EMAILS", "boss@example.com");
    session("boss@example.com");
    await expect(requireRole("user")).resolves.toBeUndefined();
  });
});

// R5 (2026-07-12, operator ruling): the source registry is admin-only. Non-admins —
// any lower role, or signed out — get a 404, never a redirect, so the gate doesn't
// advertise what it's hiding.
describe("requireAdminOr404", () => {
  it("passes through for an admin resolved via ADMIN_EMAILS", async () => {
    vi.stubEnv("ADMIN_EMAILS", "boss@example.com");
    session("boss@example.com");
    await expect(requireAdminOr404()).resolves.toBeUndefined();
  });

  it("passes through for an admin resolved via the users.role DB row", async () => {
    session("db-admin@example.com");
    queryMock.mockResolvedValue([{ role: "admin" }]);
    await expect(requireAdminOr404()).resolves.toBeUndefined();
  });

  it("404s a signed-in user role", async () => {
    session("plain@example.com");
    queryMock.mockResolvedValue([{ role: "user" }]);
    await expect(requireAdminOr404()).rejects.toBeInstanceOf(NotFoundSignal);
  });

  it("404s a signed-in analyst role", async () => {
    session("an@example.com");
    queryMock.mockResolvedValue([{ role: "analyst" }]);
    await expect(requireAdminOr404()).rejects.toBeInstanceOf(NotFoundSignal);
  });

  it("404s an anonymous (signed-out) visitor — never a redirect to /signin", async () => {
    session(null);
    await expect(requireAdminOr404()).rejects.toBeInstanceOf(NotFoundSignal);
  });

  it("gate off: passes through without calling auth or the DB (dev parity)", async () => {
    vi.stubEnv("FEATURE_AUTH_GATE", "false");
    await expect(requireAdminOr404()).resolves.toBeUndefined();
    expect(authMock).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("fails closed to 404 when ADMIN_EMAILS is unset and the DB role lookup errors", async () => {
    session("nobody@example.com");
    queryMock.mockRejectedValue(new Error('column "role" does not exist'));
    await expect(requireAdminOr404()).rejects.toBeInstanceOf(NotFoundSignal);
  });
});

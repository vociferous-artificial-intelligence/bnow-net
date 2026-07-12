import { describe, expect, it, vi } from "vitest";

// Only exercising the pure sourceFlagSubject helper — the surrounding module still
// needs its DB/auth/i18n imports mocked so it's importable without DATABASE_URL or
// a request context (same pattern as src/app/digests/[country]/[date]/page.test.tsx).

vi.mock("@/db", () => ({ rawSql: { query: vi.fn() } }));
vi.mock("@/lib/gate", () => ({ currentRole: vi.fn().mockResolvedValue("user") }));
vi.mock("@/i18n/server", async () => {
  const { makeT } = await import("@/i18n/dictionaries");
  return { getT: async () => makeT("en") };
});

const { sourceFlagSubject } = await import("./page");

describe("sourceFlagSubject", () => {
  it("prefers the source name when present", () => {
    expect(sourceFlagSubject("Example Source", "https://example.com", 42)).toBe(
      "[BNOW source] Example Source (id 42)",
    );
  });

  it("falls back to the canonical URL when name is null", () => {
    expect(sourceFlagSubject(null, "https://example.com", 42)).toBe(
      "[BNOW source] https://example.com (id 42)",
    );
  });
});

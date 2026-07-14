import { beforeEach, describe, expect, it, vi } from "vitest";

const emailMock = vi.fn();
const queryMock = vi.fn();
vi.mock("@/lib/session", () => ({ currentUserEmail: emailMock }));
vi.mock("@/db", () => ({ rawSql: { query: queryMock } }));

const { currentAnalyticsIdentity } = await import("./identity");

describe("currentAnalyticsIdentity", () => {
  beforeEach(() => { emailMock.mockReset(); queryMock.mockReset(); });

  it("returns no identity for an anonymous or ungranted user", async () => {
    emailMock.mockResolvedValue(null);
    expect(await currentAnalyticsIdentity()).toBeNull();
  });

  it("returns only the internal UUID and coarse properties", async () => {
    emailMock.mockResolvedValue("analyst@example.com");
    queryMock.mockResolvedValue([{ id: "bd2ad11a-26dd-4a06-a8c2-c5908d9f69f4", role: "analyst", created_at: "2026-07-14T10:00:00Z" }]);
    const value = await currentAnalyticsIdentity();
    expect(value).toEqual({
      distinctId: "bd2ad11a-26dd-4a06-a8c2-c5908d9f69f4",
      role: "analyst",
      signupAt: "2026-07-14T10:00:00Z",
      betaCohort: "private_beta_2026_07",
    });
    expect(JSON.stringify(value)).not.toContain("analyst@example.com");
    expect(queryMock.mock.calls[0][0]).toContain("analytics_preference = 'granted'");
    expect(queryMock.mock.calls[0][0]).toContain("policy_acceptances");
  });

  it("selects an ISO-8601 signup timestamp the $identify sanitizer accepts", async () => {
    // Regression: created_at::text yields "2026-07-14 19:18:12.327026+00" (space, no T), which
    // sanitizeOutgoingEvent's /^\d{4}-\d{2}-\d{2}T/ check rejects — $identify was dropped live.
    emailMock.mockResolvedValue("analyst@example.com");
    queryMock.mockResolvedValue([{ id: "bd2ad11a-26dd-4a06-a8c2-c5908d9f69f4", role: "analyst", created_at: "2026-07-14T19:18:12Z" }]);
    await currentAnalyticsIdentity();
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain('to_char(u.created_at AT TIME ZONE \'UTC\', \'YYYY-MM-DD"T"HH24:MI:SS"Z"\')');
    expect(sql).not.toContain("created_at::text");
  });
});

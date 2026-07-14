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
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// deliverMagicLink is the link-issuance seam: SIGNIN_MODE=open must stay
// byte-identical to the pre-gate behavior (pinned here), and invite mode must
// never leak a sign-in link to an uninvited address — with identical outward
// resolution either way (no oracle).

const queryMock = vi.fn();
vi.mock("@/db", () => ({ rawSql: { query: (...a: unknown[]) => queryMock(...a) } }));

const sendMock = vi.fn<(mail: unknown) => Promise<{ delivered: boolean; via: string }>>();
vi.mock("@/lib/email/send", () => ({
  sendEmail: (mail: unknown) => sendMock(mail),
}));

const { deliverMagicLink, isInvited, signinMode } = await import("./auth-delivery");

const PARAMS = { identifier: "analyst@example.com", url: "https://bnow.net/api/auth/callback?token=SECRET123" };

type Mail = { to: string; subject: string; text: string; trackLinks?: string; trackOpens?: boolean };
const sentMail = (i = 0) => sendMock.mock.calls[i][0] as Mail;

beforeEach(() => {
  sendMock.mockResolvedValue({ delivered: true, via: "postmark" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  queryMock.mockReset();
  sendMock.mockReset();
});

describe("signinMode", () => {
  it("defaults to open when unset, empty, or unknown", () => {
    vi.stubEnv("SIGNIN_MODE", "");
    expect(signinMode()).toBe("open");
    vi.stubEnv("SIGNIN_MODE", "banana");
    expect(signinMode()).toBe("open");
  });
  it("is invite only on the exact string", () => {
    vi.stubEnv("SIGNIN_MODE", "invite");
    expect(signinMode()).toBe("invite");
    vi.stubEnv("SIGNIN_MODE", "Invite");
    expect(signinMode()).toBe("open");
  });
});

describe("open mode (default) — pinned pre-gate behavior", () => {
  it("sends the magic link to ANY address with no eligibility query and no added latency", async () => {
    vi.stubEnv("SIGNIN_MODE", "open");
    await deliverMagicLink(PARAMS);
    expect(queryMock).not.toHaveBeenCalled(); // zero DB involvement in open mode
    expect(sendMock).toHaveBeenCalledTimes(1);
    const mail = sentMail();
    expect(mail.to).toBe("analyst@example.com");
    expect(mail.subject).toBe("Your BNOW.NET sign-in link");
    expect(mail.text).toContain(PARAMS.url);
    expect(mail.trackLinks).toBe("None");
    expect(mail.trackOpens).toBe(false);
  });

  it("behaves the same when SIGNIN_MODE is entirely unset", async () => {
    await deliverMagicLink(PARAMS);
    expect(queryMock).not.toHaveBeenCalled();
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sentMail().text).toContain(PARAMS.url);
  });
});

describe("invite mode — eligibility", () => {
  beforeEach(() => {
    vi.stubEnv("SIGNIN_MODE", "invite");
  });

  it("delivers a working link to an existing user (grandfathered)", async () => {
    queryMock.mockResolvedValue([{ ok: 1 }]);
    await deliverMagicLink(PARAMS);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sentMail().text).toContain(PARAMS.url);
  });

  it("delivers to an ADMIN_EMAILS address without needing a users row", async () => {
    vi.stubEnv("ADMIN_EMAILS", "go@vociferous.nyc, Other@Example.com");
    queryMock.mockResolvedValue([]); // DB would say no
    await deliverMagicLink({ ...PARAMS, identifier: "other@example.com" });
    expect(sentMail().text).toContain(PARAMS.url);
  });

  it("delivers to an approved beta requester (the /access → approve → sign-in journey)", async () => {
    queryMock.mockImplementation(async (sql: string, params: unknown[]) => {
      expect(sql).toMatch(/request_status = 'approved'/);
      expect(params).toEqual(["requester@desk.org"]);
      return [{ ok: 1 }];
    });
    await deliverMagicLink({ ...PARAMS, identifier: "Requester@Desk.org" });
    expect(sentMail().text).toContain(PARAMS.url);
  });

  it("sends NO sign-in link to an unknown address — courtesy email only, no eligibility detail", async () => {
    queryMock.mockResolvedValue([]);
    await deliverMagicLink({ ...PARAMS, identifier: "stranger@example.com" });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const mail = sentMail();
    expect(mail.to).toBe("stranger@example.com");
    expect(mail.text).not.toContain("SECRET123");
    expect(mail.text).not.toContain(PARAMS.url);
    expect(mail.text).toContain("/access");
    // No oracle detail: the courtesy copy never says whether the address exists,
    // was declined, or is pending.
    expect(mail.text.toLowerCase()).not.toContain("declined");
    expect(mail.text.toLowerCase()).not.toContain("not found");
    expect(mail.trackLinks).toBe("None");
  });

  it("resolves identically (no throw) for allowed and denied addresses — the UI cannot differ", async () => {
    queryMock.mockResolvedValueOnce([{ ok: 1 }]).mockResolvedValueOnce([]);
    await expect(deliverMagicLink(PARAMS)).resolves.toBeUndefined();
    await expect(deliverMagicLink({ ...PARAMS, identifier: "stranger@example.com" })).resolves.toBeUndefined();
  });

  it("fails closed on a DB error: no sign-in link", async () => {
    queryMock.mockRejectedValue(new Error("db down"));
    await expect(deliverMagicLink(PARAMS)).resolves.toBeUndefined();
    for (const call of sendMock.mock.calls) {
      expect((call[0] as Mail).text).not.toContain(PARAMS.url);
    }
  });

  it("stays silent (no throw) when even the courtesy email fails", async () => {
    queryMock.mockResolvedValue([]);
    sendMock.mockRejectedValue(new Error("postmark down"));
    await expect(deliverMagicLink(PARAMS)).resolves.toBeUndefined();
  });
});

describe("isInvited", () => {
  it("rejects an empty identifier without querying", async () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    expect(await isInvited("   ")).toBe(false);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("normalizes the address before matching", async () => {
    queryMock.mockImplementation(async (_sql: string, params: unknown[]) => {
      expect(params).toEqual(["analyst@example.com"]);
      return [];
    });
    expect(await isInvited("  Analyst@EXAMPLE.com ")).toBe(false);
  });

  it("does not treat a 'new' or 'declined' request as approved (the SQL filter is pinned above)", async () => {
    queryMock.mockResolvedValue([]); // only approved rows would return
    expect(await isInvited("pending@desk.org")).toBe(false);
  });
});

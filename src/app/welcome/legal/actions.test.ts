import { afterEach, describe, expect, it, vi } from "vitest";

// acceptAction is "use server" but under vitest it is a plain async function. Its collaborators
// (auth, recordAcceptance, getLocale, redirect) are mocked; safe-next runs for real.

class RedirectSignal extends Error {
  constructor(readonly to: string) {
    super(`redirect:${to}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectSignal(to);
  },
}));

const authMock = vi.fn<() => Promise<{ user?: { email?: string | null } } | null>>();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

vi.mock("@/i18n/server", () => ({ getLocale: async () => "en" }));

const recordMock = vi.fn();
vi.mock("@/lib/legal/acceptance", () => ({ recordAcceptance: (...a: unknown[]) => recordMock(...a) }));

const { acceptAction } = await import("./actions");

afterEach(() => {
  authMock.mockReset();
  recordMock.mockReset();
});

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

async function runExpectingRedirect(fd: FormData): Promise<string> {
  try {
    await acceptAction(null, fd);
  } catch (e) {
    if (e instanceof RedirectSignal) return e.to;
    throw e;
  }
  throw new Error("expected a redirect");
}

const SIGNED_IN = { user: { email: "user@example.com" } };
const BOTH = { adult_attested: "yes", privacy_acknowledged: "yes", next: "/ask" };

describe("acceptAction — the authoritative clickwrap", () => {
  it("redirects an unauthenticated POST to /signin, never recording", async () => {
    authMock.mockResolvedValue(null);
    expect(await runExpectingRedirect(form(BOTH))).toBe("/signin");
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("rejects a submission missing the age/Terms confirmation (no record written)", async () => {
    authMock.mockResolvedValue(SIGNED_IN);
    const res = await acceptAction(null, form({ privacy_acknowledged: "yes", next: "/" }));
    expect(res.error).toBeTruthy();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("rejects a submission missing the Privacy acknowledgement (no record written)", async () => {
    authMock.mockResolvedValue(SIGNED_IN);
    const res = await acceptAction(null, form({ adult_attested: "yes", next: "/" }));
    expect(res.error).toBeTruthy();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("records both attestations and redirects to the safe next on success", async () => {
    authMock.mockResolvedValue(SIGNED_IN);
    recordMock.mockResolvedValue({ ok: true, acceptedAt: "2026-07-12T10:00:00.000Z" });
    expect(await runExpectingRedirect(form(BOTH))).toBe("/ask");
    expect(recordMock).toHaveBeenCalledWith({
      email: "user@example.com",
      adultAttested: true,
      privacyAcknowledged: true,
      locale: "en",
    });
  });

  it("rejects an external next destination, collapsing it to '/'", async () => {
    authMock.mockResolvedValue(SIGNED_IN);
    recordMock.mockResolvedValue({ ok: true, acceptedAt: "2026-07-12T10:00:00.000Z" });
    const to = await runExpectingRedirect(
      form({ adult_attested: "yes", privacy_acknowledged: "yes", next: "https://evil.com" }),
    );
    expect(to).toBe("/");
  });

  it("returns an inline error (no redirect) when persistence fails", async () => {
    authMock.mockResolvedValue(SIGNED_IN);
    recordMock.mockResolvedValue({ ok: false, error: "db_error" });
    const res = await acceptAction(null, form(BOTH));
    expect(res.error).toBeTruthy();
  });
});

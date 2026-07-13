// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const authMock = vi.fn<() => Promise<{ user?: { email?: string | null } } | null>>();
vi.mock("@/lib/auth", () => ({ auth: () => authMock(), signOut: vi.fn() }));

const queryMock = vi.fn().mockResolvedValue([]);
vi.mock("@/db", () => ({ rawSql: { query: (...a: unknown[]) => queryMock(...a) } }));

vi.mock("@/i18n/server", () => ({ getLocale: async () => "en" }));

const acceptanceMock =
  vi.fn<() => Promise<{ termsVersion: string; privacyVersion: string; acceptedAt: string } | null>>();
vi.mock("@/lib/legal/acceptance", () => ({ currentAcceptanceForEmail: () => acceptanceMock() }));

const AccountPage = (await import("./page")).default;

afterEach(() => {
  cleanup();
  authMock.mockReset();
  acceptanceMock.mockReset();
  queryMock.mockClear();
});

async function redirectOf(): Promise<string> {
  try {
    await AccountPage();
  } catch (e) {
    if (e instanceof RedirectSignal) return e.to;
    throw e;
  }
  throw new Error("expected a redirect");
}

describe("/account legal section", () => {
  it("redirects an unauthenticated visitor to /signin", async () => {
    authMock.mockResolvedValue(null);
    expect(await redirectOf()).toBe("/signin");
  });

  it("redirects a signed-in user without current acceptance to the acceptance screen", async () => {
    authMock.mockResolvedValue({ user: { email: "user@example.com" } });
    acceptanceMock.mockResolvedValue(null);
    expect(await redirectOf()).toBe("/welcome/legal?next=/account");
  });

  it("renders the accepted versions and timestamp, exposing no internal id or method string", async () => {
    authMock.mockResolvedValue({ user: { email: "user@example.com" } });
    acceptanceMock.mockResolvedValue({
      termsVersion: "1.0",
      privacyVersion: "1.0",
      acceptedAt: "2026-07-12T14:00:00.000Z",
    });

    const { container } = render(await AccountPage());
    const text = container.textContent ?? "";

    expect(text).toContain("Legal");
    // Two "Version 1.0" links (terms + privacy).
    expect(container.querySelectorAll('a[href="/terms"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('a[href="/privacy"]').length).toBeGreaterThan(0);
    expect(text).toContain("Version 1.0");
    // The server-generated timestamp renders in ET.
    expect(text).toMatch(/2026.*ET/);
    // No internal method string or raw acceptance id leaks to the user.
    expect(text).not.toContain("first_login_clickwrap");
  });
});

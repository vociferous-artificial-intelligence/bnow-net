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
vi.mock("@/lib/analytics/client", () => ({ resetAnalyticsClient: vi.fn() }));

const acceptanceMock =
  vi.fn<
    () => Promise<{
      termsVersion: string;
      privacyVersion: string;
      acceptedAt: string;
      analyticsPreference: "unset" | "granted" | "denied";
    } | null>
  >();
vi.mock("@/lib/legal/acceptance", () => ({ currentAcceptanceForEmail: () => acceptanceMock() }));

const AccountPage = (await import("./page")).default;

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  authMock.mockReset();
  acceptanceMock.mockReset();
  queryMock.mockClear();
  queryMock.mockResolvedValue([]);
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
      privacyVersion: "1.1",
      acceptedAt: "2026-07-12T14:00:00.000Z",
      analyticsPreference: "denied",
    });

    const { container } = render(await AccountPage());
    const text = container.textContent ?? "";

    expect(text).toContain("Legal");
    // Terms remains 1.0 while Privacy has advanced independently.
    expect(container.querySelectorAll('a[href="/terms"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('a[href="/privacy"]').length).toBeGreaterThan(0);
    expect(text).toContain("Version 1.0");
    expect(text).toContain("Version 1.1");
    // The server-generated timestamp renders in ET.
    expect(text).toMatch(/2026.*ET/);
    // No internal method string or raw acceptance id leaks to the user.
    expect(text).not.toContain("first_login_clickwrap");
  });
});

// Private-beta repositioning (2026-07-13): while checkout is disabled the account
// frames access as the analyst beta, but the "active" claim is DERIVED from real
// subscription state (never inferred from missing Stripe IDs alone), and the
// Stripe-enabled branch keeps the factual plan/status rows. Both flag branches
// are exercised per the sprint rule.
const ACCEPTED = {
  termsVersion: "1.0",
  privacyVersion: "1.1",
  acceptedAt: "2026-07-12T14:00:00.000Z",
  analyticsPreference: "denied" as const,
};
const ACTIVE_SUB = { plan_code: "full_annual", status: "active", name: "Full analyst (annual)" };

function signInAccepted() {
  authMock.mockResolvedValue({ user: { email: "analyst@example.com" } });
  acceptanceMock.mockResolvedValue(ACCEPTED);
}

describe("/account access framing — checkout disabled (FEATURE_STRIPE unset)", () => {
  it("shows 'Private analyst beta — active' derived from a real active subscription, without plan framing", async () => {
    vi.stubEnv("FEATURE_STRIPE", "");
    signInAccepted();
    queryMock.mockResolvedValue([ACTIVE_SUB]);
    const { container } = render(await AccountPage());
    const text = container.textContent ?? "";
    expect(text).toContain("Private analyst beta");
    expect(text).toContain("active");
    expect(text).not.toContain("Full analyst (annual)");
  });

  it("does NOT claim beta-active from a non-active subscription row", async () => {
    vi.stubEnv("FEATURE_STRIPE", "");
    signInAccepted();
    queryMock.mockResolvedValue([{ ...ACTIVE_SUB, status: "canceled" }]);
    const { container } = render(await AccountPage());
    const text = container.textContent ?? "";
    expect(text).not.toContain("Private analyst beta");
    expect(text).toContain("Full analyst (annual)");
    expect(text).toContain("canceled");
  });

  it("points an account with no rows at /access with no founding/pricing copy", async () => {
    vi.stubEnv("FEATURE_STRIPE", "");
    signInAccepted();
    const { container } = render(await AccountPage());
    const link = container.querySelector('a[href="/access"]');
    expect(link?.textContent).toBe("Request beta access");
    expect(container.textContent).not.toMatch(/founding/i);
    expect(container.querySelector('a[href="/pricing"]')).toBeNull();
  });
});

describe("/account access framing — checkout enabled (FEATURE_STRIPE=true)", () => {
  it("renders the factual plan/status rows, not the beta wording", async () => {
    vi.stubEnv("FEATURE_STRIPE", "true");
    signInAccepted();
    queryMock.mockResolvedValue([ACTIVE_SUB]);
    const { container } = render(await AccountPage());
    const text = container.textContent ?? "";
    expect(text).not.toContain("Private analyst beta");
    expect(text).toContain("Full analyst (annual)");
    expect(text).toContain("active");
  });
});

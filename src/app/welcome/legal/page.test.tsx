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
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const acceptMock = vi.fn<() => Promise<boolean>>();
vi.mock("@/lib/legal/acceptance", () => ({ hasCurrentAcceptanceByEmail: () => acceptMock() }));

// Stub the client form so this page test doesn't pull in the server-action module graph.
vi.mock("./legal-form", () => ({
  LegalAcceptanceForm: ({ next }: { next: string }) => (
    <form data-testid="accept-form" data-next={next} />
  ),
}));

const Page = (await import("./page")).default;

afterEach(() => {
  cleanup();
  authMock.mockReset();
  acceptMock.mockReset();
});

async function redirectOf(sp: Record<string, string>): Promise<string> {
  try {
    await Page({ searchParams: Promise.resolve(sp) });
  } catch (e) {
    if (e instanceof RedirectSignal) return e.to;
    throw e;
  }
  throw new Error("expected a redirect");
}

describe("/welcome/legal page", () => {
  it("redirects an unauthenticated visitor to /signin", async () => {
    authMock.mockResolvedValue(null);
    expect(await redirectOf({})).toBe("/signin");
  });

  it("bounces an already-accepted user straight to the safe next destination", async () => {
    authMock.mockResolvedValue({ user: { email: "user@example.com" } });
    acceptMock.mockResolvedValue(true);
    expect(await redirectOf({ next: "/ask" })).toBe("/ask");
  });

  it("rejects an external next destination even for an accepted user (→ '/')", async () => {
    authMock.mockResolvedValue({ user: { email: "user@example.com" } });
    acceptMock.mockResolvedValue(true);
    expect(await redirectOf({ next: "https://evil.com" })).toBe("/");
  });

  it("renders the acceptance form (with the safe next) for a not-yet-accepted user", async () => {
    authMock.mockResolvedValue({ user: { email: "user@example.com" } });
    acceptMock.mockResolvedValue(false);
    const element = await Page({ searchParams: Promise.resolve({ next: "/ask" }) });
    const { getByTestId, container } = render(element);
    const form = getByTestId("accept-form");
    expect(form.getAttribute("data-next")).toBe("/ask");
    expect(container.textContent).toContain("Before you continue");
  });
});

// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The money test (OPEN-TASKS #48 + the architecture bug it sits on top of): GET
// /ask?q=... must prefill the input and NEVER execute the paid pipeline. Refresh,
// back-navigation, shared links, and prefetchers all issue a GET — any of them
// re-running askWithLimits would re-bill. Every module the page (transitively,
// through AskForm -> actions.ts) touches on the way to a DB/LLM call is mocked so
// this test can assert the negative with certainty, offline.

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/gate", () => ({
  requireAcceptedUser: vi.fn().mockResolvedValue({ email: "user@example.com" }),
}));

vi.mock("@/i18n/server", () => ({
  getLocale: async () => "en",
}));

const askWithLimitsMock = vi.fn();
vi.mock("@/lib/ask/limits", () => ({
  askWithLimits: (...args: unknown[]) => askWithLimitsMock(...args),
}));

// actions.ts (imported transitively via AskForm) also reaches for @/db to resolve
// cited/related claims — mocked so the module graph never needs DATABASE_URL.
vi.mock("@/db", () => ({
  rawSql: { query: vi.fn() },
}));

const AskPage = (await import("./page")).default;

afterEach(cleanup);
afterEach(() => askWithLimitsMock.mockClear());

const PLACEHOLDER = "e.g. which oligarchs are under prosecution?";

describe("GET /ask?q=... never executes the paid pipeline", () => {
  it("prefills the input from ?q= without calling askWithLimits", async () => {
    const element = await AskPage({
      searchParams: Promise.resolve({ q: "did russia strike kyiv today" }),
    });
    render(element);

    expect(askWithLimitsMock).not.toHaveBeenCalled();
    const input = screen.getByPlaceholderText(PLACEHOLDER) as HTMLInputElement;
    expect(input.value).toBe("did russia strike kyiv today");
    // no result is rendered on a bare GET — the page shows only the (empty) form
    expect(screen.queryByText(/evidence rows/)).toBeNull();
  });

  it("renders an empty, unprefilled form on a GET with no ?q= — still no pipeline call", async () => {
    const element = await AskPage({ searchParams: Promise.resolve({}) });
    render(element);

    expect(askWithLimitsMock).not.toHaveBeenCalled();
    const input = screen.getByPlaceholderText(PLACEHOLDER) as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("still calls requireAcceptedUser (the page stays gated on auth + acceptance) but never askWithLimits", async () => {
    const { requireAcceptedUser } = await import("@/lib/gate");
    const element = await AskPage({
      searchParams: Promise.resolve({ q: "some question" }),
    });
    render(element);

    expect(requireAcceptedUser).toHaveBeenCalled();
    expect(askWithLimitsMock).not.toHaveBeenCalled();
  });
});

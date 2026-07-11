// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
// Aliased: importing this as `Error` would shadow the global Error class used below.
import ErrorBoundary from "./error";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

function makeError(overrides: Partial<Error & { digest?: string }> = {}): Error & { digest?: string } {
  const err = new Error("connection refused to internal-host:5432 — leaks infra details") as Error & {
    digest?: string;
  };
  return Object.assign(err, overrides);
}

describe("error boundary", () => {
  it("renders the heading", () => {
    render(<ErrorBoundary error={makeError()} reset={vi.fn()} />);
    expect(
      screen.getByRole("heading", { name: "Something failed while rendering this page." }),
    ).toBeTruthy();
  });

  it("calls reset exactly once when Retry is clicked", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    render(<ErrorBoundary error={makeError()} reset={reset} />);

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("renders the digest as a reference code when present", () => {
    render(<ErrorBoundary error={makeError({ digest: "abc123digest" })} reset={vi.fn()} />);
    expect(screen.getByText(/abc123digest/)).toBeTruthy();
  });

  it("omits the reference line when no digest is present", () => {
    render(<ErrorBoundary error={makeError({ digest: undefined })} reset={vi.fn()} />);
    expect(screen.queryByText(/Reference/)).toBeNull();
  });

  it("never renders the raw error message, which may leak internals", () => {
    render(<ErrorBoundary error={makeError()} reset={vi.fn()} />);
    expect(document.body.textContent).not.toContain("connection refused to internal-host:5432");
  });

  it("links to home and health", () => {
    render(<ErrorBoundary error={makeError()} reset={vi.fn()} />);
    expect(screen.getByRole("link", { name: "home" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "status" }).getAttribute("href")).toBe("/health");
  });
});

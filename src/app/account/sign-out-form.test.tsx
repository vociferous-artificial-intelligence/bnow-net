// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const resetMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics/client", () => ({ resetAnalyticsClient: resetMock }));

const { AccountSignOutForm } = await import("./sign-out-form");

afterEach(() => {
  cleanup();
  resetMock.mockReset();
});

describe("AccountSignOutForm", () => {
  it("resets analytics identity before the sign-out action submits", () => {
    const action = vi.fn(async () => {});
    render(<AccountSignOutForm action={action} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(resetMock).toHaveBeenCalledTimes(1);
  });
});

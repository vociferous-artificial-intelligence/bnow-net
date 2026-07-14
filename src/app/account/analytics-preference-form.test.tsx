// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const resetMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics/client", () => ({ resetAnalyticsClient: resetMock }));
vi.mock("./actions", () => ({
  updateAnalyticsPreferenceAction: vi.fn(async () => ({ status: "saved" })),
}));

const { AnalyticsPreferenceForm } = await import("./analytics-preference-form");

afterEach(() => {
  cleanup();
  resetMock.mockReset();
});

describe("AnalyticsPreferenceForm", () => {
  it("shows the persisted decision and resets immediately when denial is submitted", () => {
    const { container } = render(<AnalyticsPreferenceForm granted />);
    expect((screen.getByRole("radio", { name: /Allow minimized/i }) as HTMLInputElement).checked)
      .toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /Do not allow/i }));
    fireEvent.submit(container.querySelector("form")!);
    expect(resetMock).toHaveBeenCalledTimes(1);
  });

  it("does not reset when permission is granted", () => {
    const { container } = render(<AnalyticsPreferenceForm granted={false} />);
    fireEvent.click(screen.getByRole("radio", { name: /Allow minimized/i }));
    fireEvent.submit(container.querySelector("form")!);
    expect(resetMock).not.toHaveBeenCalled();
  });
});

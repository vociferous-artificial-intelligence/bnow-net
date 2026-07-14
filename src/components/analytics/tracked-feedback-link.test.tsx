// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrackedFeedbackLink } from "./tracked-feedback-link";

const captureMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics/client", () => ({ captureProductEvent: captureMock }));

afterEach(() => {
  cleanup();
  captureMock.mockReset();
});

describe("TrackedFeedbackLink", () => {
  it("records initiation without forwarding the mailto address or subject", async () => {
    render(
      <TrackedFeedbackLink
        href="mailto:private@example.com?subject=sensitive"
        surface="digest_error"
        theater="RU"
      >
        Flag an error
      </TrackedFeedbackLink>,
    );
    await userEvent.click(screen.getByRole("link", { name: "Flag an error" }));
    expect(captureMock).toHaveBeenCalledWith("feedback_initiated", {
      surface: "digest_error",
      theater: "ru",
    });
    expect(JSON.stringify(captureMock.mock.calls)).not.toContain("private@example.com");
    expect(JSON.stringify(captureMock.mock.calls)).not.toContain("sensitive");
  });
});

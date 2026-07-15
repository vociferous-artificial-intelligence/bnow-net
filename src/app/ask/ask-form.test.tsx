// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dict, makeT } from "@/i18n/dictionaries";
import { makeClaimEvidenceLabels } from "@/components/claim-evidence-labels";
import { claimCopyLabels } from "@/components/claim-copy-model";
import type { AskActionState } from "./actions";

// AskForm imports ./actions (a "use server" module reaching for @/db + LLM
// pipeline) purely to wire it up as the form action — mock it wholesale so this
// component test never touches the server-action module graph.
const actionMock = vi.fn();
const captureMock = vi.hoisted(() => vi.fn());
vi.mock("./actions", () => ({
  askAction: (...args: unknown[]) => actionMock(...args),
}));
vi.mock("@/lib/analytics/client", () => ({ captureProductEvent: captureMock }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { AskForm } = await import("./ask-form");

afterEach(cleanup);
afterEach(() => {
  actionMock.mockReset();
  captureMock.mockReset();
});

const t = makeT("en");
const strings: Record<string, string> = Object.fromEntries(
  Object.keys(dict("en"))
    .filter((k) => k.startsWith("ask."))
    .map((k) => [k, t(k)]),
);

const WORKING_TITLE = strings["ask.working.title"];
const STAGE_SEARCHING = strings["ask.working.stage.searching"];
const formProps = {
  strings,
  locale: "en" as const,
  evidenceLabels: makeClaimEvidenceLabels(t),
  copyLabels: claimCopyLabels(t),
};

function fakeState(question: string): AskActionState {
  return {
    analyticsCompletionKey: `completion-${question.length}`,
    question,
    result: {
      answer: "Answer text citing evidence.",
      citedClaimIds: [],
      evidenceCount: 3,
      provider: "stub",
      state: "answered",
      retrievalMode: "legacy",
      window: null,
    },
    cited: [],
    related: [],
  };
}

describe("AskForm", () => {
  it("idle: input and submit enabled, no working panel", () => {
    render(<AskForm {...formProps} />);
    const input = screen.getByPlaceholderText(strings["ask.placeholder"]) as HTMLInputElement;
    const button = screen.getByRole("button", { name: strings["ask.submit"] });
    expect(input.disabled).toBe(false);
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText(WORKING_TITLE)).toBeNull();
  });

  it("prefills from initialQuestion (the GET ?q= prefill path)", () => {
    render(<AskForm initialQuestion="did russia strike kyiv today" {...formProps} />);
    const input = screen.getByPlaceholderText(strings["ask.placeholder"]) as HTMLInputElement;
    expect(input.value).toBe("did russia strike kyiv today");
  });

  it("shows an accessible working panel with the submitted question while pending, then re-enables and renders the result once the action settles", async () => {
    let resolveAction!: (value: AskActionState | null) => void;
    actionMock.mockImplementation(
      () =>
        new Promise<AskActionState | null>((resolve) => {
          resolveAction = resolve;
        }),
    );

    const user = userEvent.setup();
    render(<AskForm {...formProps} />);
    const input = screen.getByPlaceholderText(strings["ask.placeholder"]) as HTMLInputElement;

    await user.type(input, "did russia strike kyiv today");
    await user.click(screen.getByRole("button", { name: strings["ask.submit"] }));

    // pending: input + the (now-iconified) submit button disabled (one-submit),
    // aria-busy mirrored onto the <form>, and a prominent working panel visible.
    expect(input.disabled).toBe(true);
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
    expect(document.querySelector("form")?.getAttribute("aria-busy")).toBe("true");

    const panel = screen.getByRole("status");
    expect(panel.getAttribute("aria-live")).toBe("polite");
    expect(panel.textContent).toContain(WORKING_TITLE);
    // truthful first-stage message (client elapsed 0s), no fake percentage
    expect(panel.textContent).toContain(STAGE_SEARCHING);
    expect(panel.textContent).not.toMatch(/\d+%/);
    // the submitted question is preserved verbatim in the panel
    expect(panel.textContent).toContain("did russia strike kyiv today");
    // the examples row is hidden while working
    expect(screen.queryByText("Which Russian officials were prosecuted recently?")).toBeNull();

    await act(async () => {
      resolveAction(fakeState("did russia strike kyiv today"));
      await Promise.resolve();
    });

    // settled: re-enabled automatically (useFormStatus), panel gone, result rendered
    expect(input.disabled).toBe(false);
    expect(screen.getByRole("button", { name: strings["ask.submit"] })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.querySelector("form")?.getAttribute("aria-busy")).toBe("false");
    expect(screen.getByText("Answer text citing evidence.")).toBeTruthy();
    expect(captureMock).toHaveBeenCalledWith("ask_completed", {
      state: "answered",
      evidence_count_bucket: "2-5",
      retrieval_mode: "legacy",
      window_present: false,
    });
  });

  it("dispatches the action exactly once and locks the controls (one-submit)", async () => {
    let resolveAction!: (value: AskActionState | null) => void;
    actionMock.mockImplementation(
      () =>
        new Promise<AskActionState | null>((resolve) => {
          resolveAction = resolve;
        }),
    );

    const user = userEvent.setup();
    render(<AskForm {...formProps} />);
    const input = screen.getByPlaceholderText(strings["ask.placeholder"]) as HTMLInputElement;

    await user.type(input, "did russia strike kyiv today");
    await user.click(screen.getByRole("button", { name: strings["ask.submit"] }));

    // The disabled input (also blocking Enter-resubmit) and disabled submit button
    // are the one-submit mechanism: no second action can be dispatched while pending.
    expect(input.disabled).toBe(true);
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
    expect(actionMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveAction(fakeState("did russia strike kyiv today"));
      await Promise.resolve();
    });
    expect(actionMock).toHaveBeenCalledTimes(1);
  });
});

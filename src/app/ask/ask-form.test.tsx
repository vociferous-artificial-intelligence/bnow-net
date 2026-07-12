// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dict, makeT } from "@/i18n/dictionaries";
import type { AskActionState } from "./actions";

// AskForm imports ./actions (a "use server" module reaching for @/db + LLM
// pipeline) purely to wire it up as the form action — mock it wholesale so this
// component test never touches the server-action module graph.
const actionMock = vi.fn();
vi.mock("./actions", () => ({
  askAction: (...args: unknown[]) => actionMock(...args),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { AskForm } = await import("./ask-form");

afterEach(cleanup);
afterEach(() => actionMock.mockReset());

const t = makeT("en");
const strings: Record<string, string> = Object.fromEntries(
  Object.keys(dict("en"))
    .filter((k) => k.startsWith("ask."))
    .map((k) => [k, t(k)]),
);

const HINT = strings["ask.pending.hint"];

function fakeState(question: string): AskActionState {
  return {
    question,
    result: {
      answer: "Answer text citing evidence.",
      citedClaimIds: [],
      evidenceCount: 3,
      provider: "stub",
    },
    cited: [],
    related: [],
  };
}

describe("AskForm", () => {
  it("idle: input and submit enabled, no pending hint", () => {
    render(<AskForm strings={strings} />);
    const input = screen.getByPlaceholderText(strings["ask.placeholder"]) as HTMLInputElement;
    const button = screen.getByRole("button", { name: strings["ask.submit"] });
    expect(input.disabled).toBe(false);
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("prefills from initialQuestion (the GET ?q= prefill path)", () => {
    render(<AskForm initialQuestion="did russia strike kyiv today" strings={strings} />);
    const input = screen.getByPlaceholderText(strings["ask.placeholder"]) as HTMLInputElement;
    expect(input.value).toBe("did russia strike kyiv today");
  });

  it("disables the form and shows the busy hint while pending, then re-enables and renders the result once the action settles", async () => {
    let resolveAction!: (value: AskActionState | null) => void;
    actionMock.mockImplementation(
      () =>
        new Promise<AskActionState | null>((resolve) => {
          resolveAction = resolve;
        }),
    );

    const user = userEvent.setup();
    render(<AskForm strings={strings} />);
    const input = screen.getByPlaceholderText(strings["ask.placeholder"]) as HTMLInputElement;

    await user.type(input, "did russia strike kyiv today");
    await user.click(screen.getByRole("button", { name: strings["ask.submit"] }));

    // pending: input + the (now-iconified) submit button disabled, hint visible,
    // aria-busy mirrored onto the <form> element.
    expect(input.disabled).toBe(true);
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(HINT)).toBeTruthy();
    expect(document.querySelector("form")?.getAttribute("aria-busy")).toBe("true");

    await act(async () => {
      resolveAction(fakeState("did russia strike kyiv today"));
      await Promise.resolve();
    });

    // settled: re-enabled automatically (useFormStatus), hint gone, result rendered
    expect(input.disabled).toBe(false);
    expect(screen.getByRole("button", { name: strings["ask.submit"] })).toBeTruthy();
    expect(screen.queryByText(HINT)).toBeNull();
    expect(document.querySelector("form")?.getAttribute("aria-busy")).toBe("false");
    expect(screen.getByText("Answer text citing evidence.")).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { StrictMode } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askIntentStorageKey } from "@/lib/ask/intent";
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
// Phase 0 UX honesty: ONE static status line while pending — no client-inferred
// rotating stage labels (those keys are deleted from the catalogs).
const WORKING_PREPARING = strings["ask.working.preparing"];
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
    // one honest status line — never a stage the server did not report, never a
    // fake percentage (Phase 0 UX honesty; the old rotating labels are gone)
    expect(panel.textContent).toContain(WORKING_PREPARING);
    expect(panel.textContent).not.toMatch(/\d+%/);
    expect(strings["ask.working.stage.searching"]).toBeUndefined();
    expect(strings["ask.working.stage.ranking"]).toBeUndefined();
    expect(strings["ask.working.stage.answering"]).toBeUndefined();
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

  it("ignores an intent when none is passed — an ordinary GET /ask?q= only prefills", () => {
    render(<AskForm initialQuestion="an ordinary prefill link" {...formProps} />);

    expect(actionMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
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

// The one-shot handoff from the home Ask box (src/components/home-ask-box.tsx). This
// is the only automatic submission in the app, so every test here is a money test:
// it must fire exactly once for the click the user actually made, and never again
// for a refresh, a Back, a remount, a shared link, or a forged ?intent=. The #48
// invariant is untouched — rendering the page still bills nothing; this only decides
// whether to press the button the user already pressed.
describe("AskForm: one-shot intent handoff", () => {
  const INTENT = "3f1a2b4c-5d6e-4f70-8901-abcdef123456";
  const QUESTION = "did russia strike kyiv today";

  function atUrl(search: string) {
    window.history.replaceState({ tree: "next-router-state" }, "", `/ask${search}`);
  }

  function renderWithIntent(overrides: { initialQuestion?: string; intent?: string } = {}) {
    return render(
      <AskForm
        initialQuestion={overrides.initialQuestion ?? QUESTION}
        intent={overrides.intent ?? INTENT}
        {...formProps}
      />,
    );
  }

  beforeEach(() => {
    window.sessionStorage.clear();
    atUrl(`?q=${encodeURIComponent(QUESTION)}&intent=${INTENT}`);
  });

  it("executes askAction exactly once when the stored question matches ?q=", () => {
    window.sessionStorage.setItem(askIntentStorageKey(INTENT), QUESTION);

    renderWithIntent();

    expect(actionMock).toHaveBeenCalledTimes(1);
    // It went through the real form: the action received the form's FormData, so the
    // pending UI, auth, limits and spend guards downstream are all still in play.
    const formData = actionMock.mock.calls[0][1] as FormData;
    expect(formData.get("question")).toBe(QUESTION);
  });

  it("consumes the intent BEFORE dispatching the submit", () => {
    window.sessionStorage.setItem(askIntentStorageKey(INTENT), QUESTION);

    // This is the real invariant, and the only one that keeps a replay from billing:
    // by the moment the action is called the entry must already be gone, so a crash,
    // a refresh, or a remount mid-pipeline finds nothing to replay. Everything else
    // (URL tidying) is cosmetic.
    let storageAtCallTime: string | null = "not-called";
    actionMock.mockImplementation(() => {
      storageAtCallTime = window.sessionStorage.getItem(askIntentStorageKey(INTENT));
      return new Promise(() => {});
    });

    renderWithIntent();

    expect(actionMock).toHaveBeenCalledTimes(1);
    expect(storageAtCallTime).toBeNull();
    expect(window.sessionStorage.getItem(askIntentStorageKey(INTENT))).toBeNull();
  });

  // Deliberately narrow, and NOT a safety net — the consume-before-submit test above
  // is. jsdom has no App Router, so this can only show that stripIntentFromUrl() runs
  // and leaves ?q= alone; it cannot speak for how Next's patched replaceState and
  // HistoryUpdater behave around a real server action. That interaction was verified
  // out-of-band instead (Next 16.2.10, real Chrome, disposable Neon branch): after a
  // one-click handoff through a settled action, ?intent= was stripped on arrival and
  // stayed stripped. See stripIntentFromUrl's comment for why it is cosmetic anyway.
  it("best-effort: tidies ?intent= out of the address bar while keeping ?q= (no-action path)", () => {
    renderWithIntent(); // nothing stored -> no submit, so nothing re-asserts the URL

    expect(actionMock).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/ask");
    expect(new URLSearchParams(window.location.search).get("q")).toBe(QUESTION);
    expect(new URLSearchParams(window.location.search).has("intent")).toBe(false);
    // Next keeps its routing tree in history.state — clobbering it with null breaks
    // back/forward. Preserving it is also exactly why the strip is only partial.
    expect(window.history.state).toEqual({ tree: "next-router-state" });
  });

  it("StrictMode's double-invoked effects still execute it only once", () => {
    window.sessionStorage.setItem(askIntentStorageKey(INTENT), QUESTION);

    render(
      <StrictMode>
        <AskForm initialQuestion={QUESTION} intent={INTENT} {...formProps} />
      </StrictMode>,
    );

    expect(actionMock).toHaveBeenCalledTimes(1);
  });

  it("StrictMode: the ref guard alone holds when the entry cannot be removed", () => {
    window.sessionStorage.setItem(askIntentStorageKey(INTENT), QUESTION);
    // Two independent defences stop a StrictMode double-run: consuming the entry
    // before submitting, and the ref. The test above passes on the first alone, so
    // it can't tell us the ref works. Neuter removeItem — now only the ref stands
    // between the second effect invocation and a second billed call.
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {});

    render(
      <StrictMode>
        <AskForm initialQuestion={QUESTION} intent={INTENT} {...formProps} />
      </StrictMode>,
    );

    expect(actionMock).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it("a remount with the same intent does not execute a second time", () => {
    window.sessionStorage.setItem(askIntentStorageKey(INTENT), QUESTION);

    renderWithIntent();
    expect(actionMock).toHaveBeenCalledTimes(1);

    cleanup();
    renderWithIntent(); // same props, fresh mount — the entry is already consumed

    expect(actionMock).toHaveBeenCalledTimes(1);
  });

  it("a refresh carrying the consumed intent does not execute — the form sits prefilled and idle", () => {
    // Refresh = a fresh page render at the same URL, with storage as the first run
    // left it (empty). This is the scenario that used to double-bill.
    renderWithIntent();

    expect(actionMock).not.toHaveBeenCalled();
    const input = screen.getByPlaceholderText(strings["ask.placeholder"]) as HTMLInputElement;
    expect(input.value).toBe(QUESTION);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("a shared /ask?q=...&intent=... link in another tab does not execute", () => {
    // sessionStorage is per-tab, so the recipient's tab has no entry for this id.
    renderWithIntent();

    expect(actionMock).not.toHaveBeenCalled();
    // The dead intent is still cleaned out of their address bar.
    expect(new URLSearchParams(window.location.search).has("intent")).toBe(false);
  });

  it("does not execute when the stored question does not match ?q= exactly", () => {
    window.sessionStorage.setItem(askIntentStorageKey(INTENT), "a completely different question");

    renderWithIntent({ initialQuestion: QUESTION });

    expect(actionMock).not.toHaveBeenCalled();
    // Consumed regardless: a mismatched entry is spent, not left for a later replay.
    expect(window.sessionStorage.getItem(askIntentStorageKey(INTENT))).toBeNull();
  });

  it("does not execute when sessionStorage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    renderWithIntent();

    expect(actionMock).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("a recent-question prefill link (?q= only, no intent) never executes", () => {
    // Even with a live entry sitting in storage: no ?intent= names it, so nothing runs.
    window.sessionStorage.setItem(askIntentStorageKey(INTENT), QUESTION);
    atUrl(`?q=${encodeURIComponent(QUESTION)}`);

    render(<AskForm initialQuestion={QUESTION} {...formProps} />);

    expect(actionMock).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The money constraint for this component: it must NEVER be able to bill. It has no
// path to askWithLimits at all — it only writes a sessionStorage note and navigates.
// What these tests pin is the surrounding contract: exactly one intent per click,
// exactly one navigation, and an intact zero-JS GET fallback whenever the enhanced
// path can't run.

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const { HomeAskBox } = await import("./home-ask-box");
const { askIntentStorageKey } = await import("@/lib/ask/intent");

const PLACEHOLDER = "e.g. which oligarchs are under prosecution?";
const props = {
  title: "Interrogate the intelligence",
  placeholder: PLACEHOLDER,
  submitLabel: "Ask",
  submitClassName: "primary-cta",
};

// jsdom does not implement form navigation, so the native GET path can't be observed
// as a page load. Assert on the submit event's defaultPrevented instead — "did the
// component keep its hands off?" IS the fallback contract. The listener is attached
// per-test and removed in afterEach: a leaked one from an earlier test would
// preventDefault first and make every later fallback assertion read `true`.
const submitsPrevented: boolean[] = [];
let submitListener: ((e: Event) => void) | null = null;

function trackSubmits(): boolean[] {
  submitListener = (e: Event) => {
    submitsPrevented.push(e.defaultPrevented);
    e.preventDefault(); // stop jsdom's not-implemented navigation error
  };
  document.addEventListener("submit", submitListener);
  return submitsPrevented;
}

function storedIntents(): string[] {
  return Object.keys(window.sessionStorage).filter((k) => k.startsWith("bnow.ask.intent:"));
}

beforeEach(() => {
  window.sessionStorage.clear();
  pushMock.mockReset();
  submitsPrevented.length = 0;
});
afterEach(cleanup);
afterEach(() => {
  if (submitListener) document.removeEventListener("submit", submitListener);
  submitListener = null;
  vi.restoreAllMocks();
});

describe("HomeAskBox: zero-JS fallback is intact", () => {
  it("renders a real GET form to /ask with an input named q", () => {
    const { container } = render(<HomeAskBox {...props} />);

    const form = container.querySelector('form[action="/ask"][method="get"]');
    expect(form).toBeTruthy();
    expect(form?.querySelector('input[name="q"]')).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ask" })).toBeTruthy();
  });
});

describe("HomeAskBox: one-shot handoff", () => {
  it("stores exactly one intent and navigates once on a normal submission", async () => {
    const user = userEvent.setup();
    render(<HomeAskBox {...props} />);

    await user.type(screen.getByPlaceholderText(PLACEHOLDER), "did russia strike kyiv today");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    const keys = storedIntents();
    expect(keys).toHaveLength(1);
    expect(window.sessionStorage.getItem(keys[0])).toBe("did russia strike kyiv today");

    expect(pushMock).toHaveBeenCalledTimes(1);
    const target = new URL(pushMock.mock.calls[0][0], "https://bnow.net");
    expect(target.pathname).toBe("/ask");
    expect(target.searchParams.get("q")).toBe("did russia strike kyiv today");
    // The id in the URL is the one that was stored — that pairing IS the handoff.
    expect(askIntentStorageKey(target.searchParams.get("intent")!)).toBe(keys[0]);
  });

  it("stores the trimmed question, matching what askAction would normalize it to", async () => {
    const user = userEvent.setup();
    render(<HomeAskBox {...props} />);

    await user.type(screen.getByPlaceholderText(PLACEHOLDER), "   spaced question   ");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    expect(window.sessionStorage.getItem(storedIntents()[0])).toBe("spaced question");
    // ?q= carries the same normalized text, so AskForm's exact-match check can pass.
    expect(new URL(pushMock.mock.calls[0][0], "https://bnow.net").searchParams.get("q")).toBe(
      "spaced question",
    );
  });

  it("rapid duplicate submits produce only one intent and one navigation", async () => {
    const user = userEvent.setup();
    const { container } = render(<HomeAskBox {...props} />);

    await user.type(screen.getByPlaceholderText(PLACEHOLDER), "double click me");
    const form = container.querySelector("form")!;
    // Fire twice synchronously: this is the real race — two submits inside one frame,
    // before any state-driven `disabled` has had a chance to render.
    form.requestSubmit();
    form.requestSubmit();

    expect(storedIntents()).toHaveLength(1);
    expect(pushMock).toHaveBeenCalledTimes(1);
  });

  it("prunes an orphaned intent so only the current one is ever in flight", async () => {
    // An orphan is what a swallowed click leaves behind — e.g. the acceptance gate
    // redirected to /welcome/legal, so /ask never mounted to consume it. It carries
    // the user's question text, so it must not outlive the next handoff.
    const orphan = "bnow.ask.intent:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    window.sessionStorage.setItem(orphan, "a question nobody ever answered");
    window.sessionStorage.setItem("posthog.unrelated", "keep me");

    const user = userEvent.setup();
    render(<HomeAskBox {...props} />);
    await user.type(screen.getByPlaceholderText(PLACEHOLDER), "the question that counts");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    const keys = storedIntents();
    expect(keys).toHaveLength(1);
    expect(window.sessionStorage.getItem(keys[0])).toBe("the question that counts");
    expect(window.sessionStorage.getItem(orphan)).toBeNull();
    // Other namespaces sharing this storage are untouched.
    expect(window.sessionStorage.getItem("posthog.unrelated")).toBe("keep me");
  });

  it("disables the controls once the handoff is underway", async () => {
    const user = userEvent.setup();
    render(<HomeAskBox {...props} />);

    const input = screen.getByPlaceholderText(PLACEHOLDER) as HTMLInputElement;
    await user.type(input, "a real question");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    expect(input.disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Ask" }).hasAttribute("disabled")).toBe(true);
  });
});

describe("HomeAskBox: degraded paths keep the native GET", () => {
  it("does not intercept when sessionStorage.setItem throws", async () => {
    const prevented = trackSubmits();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    const user = userEvent.setup();
    render(<HomeAskBox {...props} />);
    await user.type(screen.getByPlaceholderText(PLACEHOLDER), "storage is broken");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    // Native GET to /ask?q=... survives: no preventDefault, no router.push.
    expect(prevented).toEqual([false]);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("does not intercept when storage silently no-ops (setItem succeeds, readback empty)", async () => {
    const prevented = trackSubmits();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "getItem").mockReturnValue(null);

    const user = userEvent.setup();
    render(<HomeAskBox {...props} />);
    await user.type(screen.getByPlaceholderText(PLACEHOLDER), "silent no-op storage");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    expect(prevented).toEqual([false]);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("does not intercept when crypto.randomUUID is unavailable", async () => {
    const prevented = trackSubmits();
    vi.spyOn(crypto, "randomUUID").mockImplementation(() => {
      throw new Error("no randomUUID");
    });

    const user = userEvent.setup();
    render(<HomeAskBox {...props} />);
    await user.type(screen.getByPlaceholderText(PLACEHOLDER), "no uuid available");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    expect(prevented).toEqual([false]);
    expect(pushMock).not.toHaveBeenCalled();
    expect(storedIntents()).toEqual([]);
  });

  it("does not intercept a too-short question — /ask prefills and stays idle", async () => {
    const prevented = trackSubmits();

    const user = userEvent.setup();
    render(<HomeAskBox {...props} />);
    await user.type(screen.getByPlaceholderText(PLACEHOLDER), "hi");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    expect(prevented).toEqual([false]);
    expect(pushMock).not.toHaveBeenCalled();
    expect(storedIntents()).toEqual([]);
  });
});

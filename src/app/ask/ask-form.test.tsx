// @vitest-environment jsdom
import { StrictMode } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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

  it("a hand submit carries a mount-minted UUID idempotency key (Gate 1: the key chain must be provable)", async () => {
    actionMock.mockImplementation(async () => fakeState("did russia strike kyiv today"));
    const user = userEvent.setup();
    render(<AskForm {...formProps} />);
    await user.type(
      screen.getByPlaceholderText(strings["ask.placeholder"]),
      "did russia strike kyiv today",
    );
    await user.click(screen.getByRole("button", { name: strings["ask.submit"] }));

    const formData = actionMock.mock.calls[0][1] as FormData;
    expect(String(formData.get("idempotencyKey"))).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
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

  it("the intent submit carries the intent UUID as its idempotency key (Gate 1: duplicate dispatch replays, never re-bills)", () => {
    window.sessionStorage.setItem(askIntentStorageKey(INTENT), QUESTION);

    renderWithIntent();

    expect(actionMock).toHaveBeenCalledTimes(1);
    const formData = actionMock.mock.calls[0][1] as FormData;
    expect(formData.get("idempotencyKey")).toBe(INTENT);
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

// ---- Phase 2: progressive transport path ----------------------------------------

describe("AskForm: progressive transport (ASK_PROGRESSIVE client path)", () => {
  const RUN_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

  function sseStream(records: string[]): ReadableStream<Uint8Array> {
    const enc = new TextEncoder();
    return new ReadableStream({
      start(c) {
        c.enqueue(enc.encode(records.join("")));
        c.close();
      },
    });
  }

  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("submit intercepts to ONE paid POST, renders server-event progress, then the hydrated result — the action is never called", async () => {
    const events = [
      `event: run.ref\ndata: {"runId":"${RUN_ID}"}\n\n`,
      "id: 1\nevent: run.created\ndata: {}\n\n",
      "id: 2\nevent: run.authorized\ndata: {}\n\n",
      `id: 3\nevent: retrieval.lexical_partial\ndata: ${JSON.stringify({ claims: [{ claimId: 9, text: "candidate claim text", hedging: "claimed", claimDate: "2026-07-10", countryIso2: "ru", track: null, confidence: null, sourceDocIds: [] }], totalMatching: 33 })}\n\n`,
      `id: 4\nevent: retrieval.completed\ndata: ${JSON.stringify({ candidatesCount: 20, totalMatching: 33, uniqueSources: 7, mode: "v2", window: null, currentThrough: "2026-07-18" })}\n\n`,
      `id: 5\nevent: run.completed\ndata: ${JSON.stringify({ result: { answer: "Progressive answer [c9].", state: "answered", provider: "openai:gpt-5", citedClaimIds: [9], evidenceCount: 1, terms: [], relatedClaimIds: [], window: null, totalMatching: 33, sampled: true, retrievalMode: "v2", runId: RUN_ID } })}\n\n`,
    ];
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url) === "/api/ask/runs" && init?.method === "POST") {
        return new Response(sseStream(events), { status: 200 });
      }
      if (String(url) === `/api/ask/runs/${RUN_ID}/result`) {
        return Response.json({
          result: { answer: "Progressive answer [c9].", state: "answered", provider: "openai:gpt-5", citedClaimIds: [9], evidenceCount: 1, terms: [], relatedClaimIds: [], window: null, totalMatching: 33, sampled: true, retrievalMode: "v2" },
          cited: [],
          related: [],
        });
      }
      throw new Error(`unexpected fetch ${String(url)}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const user = userEvent.setup();
      render(<AskForm {...formProps} progressive />);
      await user.type(
        screen.getByPlaceholderText(strings["ask.placeholder"]),
        "did russia strike kyiv today",
      );
      await user.click(screen.getByRole("button", { name: strings["ask.submit"] }));

      // terminal render: the hydrated result appears
      await screen.findByText("Progressive answer [c9].");
      // the server action was NEVER invoked on the progressive path
      expect(actionMock).not.toHaveBeenCalled();
      // exactly one paid POST; the rest are reads
      const posts = fetchMock.mock.calls.filter(
        (c) => (c[1] as RequestInit | undefined)?.method === "POST",
      );
      expect(posts).toHaveLength(1);
      expect(String(posts[0][0])).toBe("/api/ask/runs");
      const postBody = JSON.parse(String((posts[0][1] as RequestInit).body));
      expect(postBody.question).toBe("did russia strike kyiv today");
      expect(postBody.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
      // terminal cleared the resume ref
      expect(window.sessionStorage.getItem("bnow_ask_active_run")).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("a stored non-terminal run resumes READ-ONLY on mount (refresh mid-run bills nothing)", async () => {
    const tail = [
      `id: 2\nevent: run.completed\ndata: ${JSON.stringify({ result: { answer: "Resumed answer.", state: "answered", provider: "openai:gpt-5", citedClaimIds: [], evidenceCount: 0, terms: [], relatedClaimIds: [], window: null, totalMatching: 0, sampled: false, retrievalMode: "v2" } })}\n\n`,
    ];
    const fetchMock = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => {
      if (String(url).startsWith(`/api/ask/runs/${RUN_ID}/events`)) {
        return new Response(sseStream(tail), { status: 200 });
      }
      if (String(url) === `/api/ask/runs/${RUN_ID}/result`) {
        return Response.json({
          result: { answer: "Resumed answer.", state: "answered", provider: "openai:gpt-5", citedClaimIds: [], evidenceCount: 0, terms: [], relatedClaimIds: [], window: null, totalMatching: 0, sampled: false, retrievalMode: "v2" },
          cited: [],
          related: [],
        });
      }
      throw new Error(`unexpected fetch ${String(url)}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      window.sessionStorage.setItem(
        "bnow_ask_active_run",
        JSON.stringify({ runId: RUN_ID, lastSeq: 1, question: "did russia strike kyiv today" }),
      );
      render(<AskForm {...formProps} progressive />);
      await screen.findByText("Resumed answer.");
      // zero POSTs anywhere: resume is a pure read
      expect(
        fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "POST"),
      ).toHaveLength(0);
      // mount recovery replays from 0 so the whole panel rebuilds (supplementary
      // Gate 2 fix) — the stored lastSeq seeds only later reconnects
      expect(String(fetchMock.mock.calls[0][0])).toContain("after=0");
      expect(actionMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("mount resume disables the form and shows the run panel BEFORE any byte arrives", async () => {
    // a fetch that never resolves: the pre-network state is all the UI has
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    try {
      window.sessionStorage.setItem(
        "bnow_ask_active_run",
        JSON.stringify({ runId: RUN_ID, lastSeq: 3, question: "did russia strike kyiv today" }),
      );
      render(<AskForm {...formProps} progressive />);
      // resumeRun pushes its seed state synchronously in the mount effect
      const input = (await screen.findByPlaceholderText(
        strings["ask.placeholder"],
      )) as HTMLInputElement;
      await waitFor(() => expect(input.disabled).toBe(true));
      expect(screen.getByText(strings["ask.progress.starting"])).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("after a terminal run the gesture is released: a new submit issues a NEW paid POST with a fresh idempotency key", async () => {
    const terminal = [
      `event: run.ref\ndata: {"runId":"${RUN_ID}"}\n\n`,
      `id: 1\nevent: run.completed\ndata: ${JSON.stringify({ result: { answer: "First answer.", state: "answered", provider: "openai:gpt-5", citedClaimIds: [], evidenceCount: 0, terms: [], relatedClaimIds: [], window: null, totalMatching: 0, sampled: false, retrievalMode: "v2" } })}\n\n`,
    ];
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url) === "/api/ask/runs" && init?.method === "POST") {
        return new Response(sseStream(terminal), { status: 200 });
      }
      if (String(url) === `/api/ask/runs/${RUN_ID}/result`) {
        return Response.json({
          result: { answer: "First answer.", state: "answered", provider: "openai:gpt-5", citedClaimIds: [], evidenceCount: 0, terms: [], relatedClaimIds: [], window: null, totalMatching: 0, sampled: false, retrievalMode: "v2" },
          cited: [],
          related: [],
        });
      }
      throw new Error(`unexpected fetch ${String(url)}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const user = userEvent.setup();
      render(<AskForm {...formProps} progressive />);
      const input = screen.getByPlaceholderText(
        strings["ask.placeholder"],
      ) as HTMLInputElement;
      await user.type(input, "did russia strike kyiv today");
      await user.click(screen.getByRole("button", { name: strings["ask.submit"] }));
      await screen.findByText("First answer.");

      // gesture released: the form re-enabled and a second explicit submit runs
      expect(input.disabled).toBe(false);
      await user.click(screen.getByRole("button", { name: strings["ask.submit"] }));
      await waitFor(() => {
        const posts = fetchMock.mock.calls.filter(
          (c) => (c[1] as RequestInit | undefined)?.method === "POST",
        );
        expect(posts).toHaveLength(2);
      });
      const posts = fetchMock.mock.calls.filter(
        (c) => (c[1] as RequestInit | undefined)?.method === "POST",
      );
      const key1 = JSON.parse(String((posts[0][1] as RequestInit).body)).idempotencyKey;
      const key2 = JSON.parse(String((posts[1][1] as RequestInit).body)).idempotencyKey;
      expect(key1).toMatch(/^[0-9a-f-]{36}$/i);
      expect(key2).toMatch(/^[0-9a-f-]{36}$/i);
      expect(key2).not.toBe(key1); // a NEW gesture is a NEW key — never a silent replay
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("a replayed terminal payload hydrates via the ORIGINAL run's id from result.runId, not the row-less transport id (supplementary Gate 2)", async () => {
    const ORIGINAL_ID = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
    const terminal = [
      `event: run.ref\ndata: {"runId":"${RUN_ID}"}\n\n`, // transport id (no run row on replays)
      `id: 1\nevent: run.completed\ndata: ${JSON.stringify({ result: { answer: "Replayed answer.", state: "answered", provider: "openai:gpt-5", citedClaimIds: [], evidenceCount: 0, terms: [], relatedClaimIds: [], window: null, totalMatching: 0, sampled: false, retrievalMode: "v2", runId: ORIGINAL_ID, replayed: true } })}\n\n`,
    ];
    const resultUrls: string[] = [];
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url) === "/api/ask/runs" && init?.method === "POST") {
        return new Response(sseStream(terminal), { status: 200 });
      }
      if (String(url).endsWith("/result")) {
        resultUrls.push(String(url));
        if (String(url).includes(ORIGINAL_ID)) {
          return Response.json({
            result: { answer: "Replayed answer.", state: "answered", provider: "openai:gpt-5", citedClaimIds: [], evidenceCount: 0, terms: [], relatedClaimIds: [], window: null, totalMatching: 0, sampled: false, retrievalMode: "v2", runId: ORIGINAL_ID },
            cited: [],
            related: [],
          });
        }
        return new Response(null, { status: 404 }); // the transport id has no row
      }
      throw new Error(`unexpected fetch ${String(url)}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const user = userEvent.setup();
      render(<AskForm {...formProps} progressive />);
      await user.type(
        screen.getByPlaceholderText(strings["ask.placeholder"]),
        "did russia strike kyiv today",
      );
      await user.click(screen.getByRole("button", { name: strings["ask.submit"] }));
      await screen.findByText("Replayed answer.");
      expect(resultUrls).toEqual([`/api/ask/runs/${ORIGINAL_ID}/result`]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("a one-click intent arriving while a resume owns the form is NOT consumed — no swallowed gesture, no POST (supplementary Gate 2)", async () => {
    const intent = "11111111-2222-4333-8444-555555555555";
    // a resume that never terminates during the test window
    const fetchMock = vi.fn(
      (...args: [RequestInfo | URL, RequestInit?]) =>
        new Promise<Response>(() => void args),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      window.sessionStorage.setItem(
        "bnow_ask_active_run",
        JSON.stringify({ runId: RUN_ID, lastSeq: 3, question: "the earlier question" }),
      );
      window.sessionStorage.setItem(askIntentStorageKey(intent), "did russia strike kyiv today");
      render(
        <AskForm {...formProps} progressive intent={intent} initialQuestion="did russia strike kyiv today" />,
      );
      // the resumed run's own question is displayed (no misattribution)
      await screen.findByText("the earlier question");
      // the intent entry SURVIVES (unconsumed — the user can submit by hand later)
      expect(window.sessionStorage.getItem(askIntentStorageKey(intent))).toBe(
        "did russia strike kyiv today",
      );
      // and no paid POST was dispatched
      expect(
        fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "POST"),
      ).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("the terminal-hydration gap stays busy: sections remain visible, the form stays disabled, and no example chips flash (supplementary Gate 2)", async () => {
    const terminal = [
      `event: run.ref\ndata: {"runId":"${RUN_ID}"}\n\n`,
      'id: 1\nevent: answer.section\ndata: {"text":"Streamed sentence one.","citedClaimIds":[]}\n\n',
      `id: 2\nevent: run.completed\ndata: ${JSON.stringify({ result: { answer: "Final answer.", state: "answered", provider: "openai:gpt-5", citedClaimIds: [], evidenceCount: 0, terms: [], relatedClaimIds: [], window: null, totalMatching: 0, sampled: false, retrievalMode: "v2", runId: RUN_ID } })}\n\n`,
    ];
    let releaseResult: (() => void) | null = null;
    const gate = new Promise<void>((r) => (releaseResult = r));
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url) === "/api/ask/runs" && init?.method === "POST") {
        return new Response(sseStream(terminal), { status: 200 });
      }
      if (String(url) === `/api/ask/runs/${RUN_ID}/result`) {
        await gate; // hold hydration so the gap is observable
        return Response.json({
          result: { answer: "Final answer.", state: "answered", provider: "openai:gpt-5", citedClaimIds: [], evidenceCount: 0, terms: [], relatedClaimIds: [], window: null, totalMatching: 0, sampled: false, retrievalMode: "v2" },
          cited: [],
          related: [],
        });
      }
      throw new Error(`unexpected fetch ${String(url)}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const user = userEvent.setup();
      render(<AskForm {...formProps} progressive />);
      const input = screen.getByPlaceholderText(
        strings["ask.placeholder"],
      ) as HTMLInputElement;
      await user.type(input, "did russia strike kyiv today");
      await user.click(screen.getByRole("button", { name: strings["ask.submit"] }));

      // inside the gap: finalizing status visible, sections retained, form busy
      await screen.findByText(strings["ask.progress.finalizing"]);
      expect(screen.getByText("Streamed sentence one.")).toBeTruthy();
      expect(input.disabled).toBe(true);
      expect(screen.queryByText("Which Russian officials were prosecuted recently?")).toBeNull(); // no idle flash

      releaseResult!();
      await screen.findByText("Final answer.");
      expect(input.disabled).toBe(false); // released after hydration
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("flag off: the progressive machinery is fully inert (no fetch, action path only)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      actionMock.mockImplementation(async () => fakeState("did russia strike kyiv today"));
      const user = userEvent.setup();
      render(<AskForm {...formProps} />);
      await user.type(
        screen.getByPlaceholderText(strings["ask.placeholder"]),
        "did russia strike kyiv today",
      );
      await user.click(screen.getByRole("button", { name: strings["ask.submit"] }));
      expect(actionMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

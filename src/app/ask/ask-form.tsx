"use client";

import Link from "next/link";
import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import type { Locale } from "@/i18n/dictionaries";
import type { ClaimEvidenceLabels } from "@/components/claim-evidence-model";
import type { ClaimCopyLabels } from "@/components/claim-copy-model";
import { askIntentStorageKey } from "@/lib/ask/intent";
import { askStartedEventEnabled } from "@/lib/analytics/events";
import { captureProductEvent } from "@/lib/analytics/client";
import {
  readActiveRun,
  resumeRun,
  runProgressiveAsk,
  type RunViewState,
} from "@/lib/ask/run-controller";
import { askAction, type AskActionState } from "./actions";
import { AskResult, type ResolvedClaim, type Translate } from "./ask-result";
import { RunProgress } from "./run-progress";
import { AskCompletedMarker } from "@/components/analytics/product-event-markers";
import { deriveAnswerState } from "./ask-result";

const EXAMPLES = [
  "Which Russian officials were prosecuted recently?",
  "What is happening with Iran's nuclear enrichment?",
  "Which entities are sanctioned and under pressure?",
  "What strikes were reported in Ukraine this week?",
];

export interface AskFormProps {
  initialQuestion?: string;
  /** One-shot handoff id from the home Ask box (bounded in page.tsx). When it names
   *  a stored question matching `initialQuestion`, this form submits itself once on
   *  mount so a single click on the home box runs the pipeline here. Absent,
   *  unknown, or mismatched — the form just sits prefilled and idle. */
  intent?: string | null;
  /** Phase 2 (ASK_PROGRESSIVE=1, read server-side by page.tsx): the paid submit
   *  goes through the run-event transport (one POST, event-driven progress,
   *  read-only reconnect). Off (default) = the server action path, byte-identical
   *  to before — which also remains the no-JS degradation either way. */
  progressive?: boolean;
  /** Resolved `ask.*` translations for the active locale — a client component
   *  can't receive a function prop from the server component that renders it. */
  strings: Record<string, string>;
  locale: Locale;
  evidenceLabels: ClaimEvidenceLabels;
  copyLabels: ClaimCopyLabels;
}

/** Hydrated terminal payload from GET /api/ask/runs/[id]/result — the same
 *  {result, cited, related} shape the server action returns. */
interface HydratedRunResult {
  result: AskActionState["result"];
  cited: ResolvedClaim[];
  related: ResolvedClaim[];
}

// Phase 0 UX honesty (2026-07-19): while the pipeline runs the panel shows ONE
// line — "searching the claim database and preparing a cited answer" — plus the
// real elapsed seconds. The previous rotating searching/ranking/answering labels
// were paced by CLIENT elapsed time, not server state (a slow embed was labelled
// "answering", a fast retrieval "searching"), and an analyst product must not
// infer stages it cannot observe. Real per-stage copy returns in Phase 2, driven
// exclusively by persisted server events.

/**
 * The form's interactive fields and pending state. Split out of AskForm because
 * useFormStatus only works in a component NESTED inside a <form> — it does not
 * work in the component that renders the <form> tag itself. Reports `pending`
 * upward so AskForm can hide the examples/stale result while the pipeline runs.
 */
function AskFormFields({
  initialQuestion,
  t,
  formRef,
  onPendingChange,
  forceDisabled = false,
}: {
  initialQuestion: string;
  t: Translate;
  formRef: RefObject<HTMLFormElement | null>;
  onPendingChange: (pending: boolean) => void;
  /** Phase 2 (Gate 2 inline finding): a progressive run never sets the action's
   *  pending flag, so the one-submit affordance (disabled controls + spinner)
   *  must be forced while the run transport is busy. Money was already safe
   *  (runningRef); this restores the visible contract. */
  forceDisabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const busy = pending || forceDisabled;

  // aria-busy belongs on the <form> element, but the component that owns that
  // element can't call useFormStatus (see above) — mirror `pending` onto it via
  // ref, and lift it to AskForm in the same effect.
  useEffect(() => {
    formRef.current?.setAttribute("aria-busy", busy ? "true" : "false");
    onPendingChange(pending);
  }, [pending, busy, formRef, onPendingChange]);

  return (
    <div className="flex gap-2">
      <input
        // key remounts the uncontrolled input when the prefill changes (an EXAMPLES
        // chip navigates to /ask?q=... on an already-mounted page — defaultValue
        // alone would leave the stale DOM value in place)
        key={initialQuestion}
        name="question"
        defaultValue={initialQuestion}
        placeholder={t("ask.placeholder")}
        disabled={busy}
        // a disabled input also suppresses an Enter-key resubmit while pending
        className="min-w-0 flex-1 rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          t("ask.submit")
        )}
      </button>
    </div>
  );
}

/**
 * Prominent, responsive "working" panel shown while the paid Ask pipeline runs.
 * Nested inside <form> so useFormStatus() can read both `pending` and the
 * submitted FormData — the question is echoed back from `data`, not re-derived,
 * so it is preserved verbatim while waiting. Renders null when idle; the active
 * body is a separate component so it mounts fresh each run (elapsed resets to 0
 * on unmount — no setState-in-effect reset needed).
 */
function WorkingPanel({ t }: { t: Translate }) {
  const { pending, data } = useFormStatus();
  if (!pending) return null;
  const question = (data?.get("question") ?? "").toString().trim();
  return <WorkingPanelBody t={t} question={question} />;
}

/**
 * The visible working panel. role=status + aria-live=polite announce the single
 * status line once to assistive tech; the once-per-second elapsed counter is
 * aria-hidden so a screen reader is not spammed every tick. The status line is
 * static and honest — no client-inferred stages, no fake percentage; the only
 * moving number is the real elapsed time.
 */
function WorkingPanelBody({ t, question }: { t: Translate; question: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const stage = t("ask.working.preparing");

  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/40"
    >
      <div className="flex items-center gap-2">
        <Loader2
          className="h-5 w-5 shrink-0 animate-spin text-blue-600 dark:text-blue-400"
          aria-hidden="true"
        />
        <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
          {t("ask.working.title")}
        </p>
      </div>
      {question && (
        <p className="mt-2 break-words text-sm text-gray-700 dark:text-gray-200">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t("ask.working.question_label")}:
          </span>{" "}
          {question}
        </p>
      )}
      <p className="mt-2 text-sm text-blue-800 dark:text-blue-200">{stage}</p>
      <p
        className="mt-1 text-xs tabular-nums text-gray-500 dark:text-gray-400"
        aria-hidden="true"
      >
        {t("ask.working.elapsed")} {elapsed}s
      </p>
    </div>
  );
}

/**
 * Tidies ?intent= out of the address bar, keeping /ask?q=... intact.
 *
 * COSMETIC ONLY, and deliberately so: what makes a replayed or shared
 * /ask?q=...&intent=... harmless is that the entry it names was consumed before the
 * submit and lives in per-tab sessionStorage — such a URL finds nothing and stays
 * idle whether or not it was ever cleaned. That is the invariant. This is not.
 * Treat a failure here as untidy, never as unsafe.
 *
 * Two Next internals meet here, so the behaviour was measured rather than assumed
 * (Next 16.2.10, real Chrome, one-click handoff through a settled action): the
 * parameter is stripped on arrival and STAYS stripped after the answer lands.
 * Passing window.history.state through is what keeps the App Router's own routing
 * tree alive across the replace (clobbering it with null breaks back/forward); Next
 * short-circuits its replaceState patch on that state's `__NA` flag, which leaves
 * the router's canonicalUrl untouched but did not, in practice, cause HistoryUpdater
 * to re-assert the intent-bearing URL afterwards.
 *
 * If a Next upgrade ever makes ?intent= reappear once the answer renders, that is
 * this cosmetic layer regressing — not a money bug. Do NOT "fix" it by passing a
 * plain object (Next then dispatches ACTION_RESTORE for a URL whose renderedSearch
 * differs from the rendered one, which can refetch the segment and remount this form
 * mid-action) or by reaching for router.replace() (which remounts the form and
 * discards the in-flight result). Losing an answer to tidy a query string is a bad
 * trade.
 */
function stripIntentFromUrl(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("intent")) return;
    url.searchParams.delete("intent");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  } catch {
    // no History API / opaque origin — the stale ?intent= in the bar is inert anyway
  }
}

export function AskForm({
  initialQuestion = "",
  intent = null,
  progressive = false,
  strings,
  locale,
  evidenceLabels,
  copyLabels,
}: AskFormProps) {
  const t: Translate = (key) => strings[key] ?? key;
  const [state, formAction] = useActionState<AskActionState | null, FormData>(askAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);

  // ---- Phase 2 progressive transport state (inert unless progressive) ----
  const [runState, setRunState] = useState<RunViewState | null>(null);
  const [hydrated, setHydrated] = useState<HydratedRunResult | null>(null);
  const runningRef = useRef(false);

  const finishProgressiveRun = useCallback(async (finalState: RunViewState) => {
    runningRef.current = false;
    idemKeyRef.current?.setAttribute("value", crypto.randomUUID()); // next gesture
    if (finalState.phase !== "done" || !finalState.runId) return;
    try {
      const res = await fetch(`/api/ask/runs/${finalState.runId}/result`);
      if (res.ok) {
        setHydrated((await res.json()) as HydratedRunResult);
        return;
      }
    } catch {}
    // Hydration fetch failed: render the terminal payload without source panels
    // (still every citation id + honest states) rather than nothing.
    if (finalState.result) {
      setHydrated({ result: finalState.result, cited: [], related: [] });
    }
  }, []);

  const startProgressiveRun = useCallback(
    (question: string, idempotencyKey: string, entry: "form" | "intent") => {
      if (runningRef.current) return; // one-submit: a gesture in flight wins
      runningRef.current = true;
      setHydrated(null);
      if (askStartedEventEnabled()) {
        captureProductEvent("ask_started", { entry });
      }
      void runProgressiveAsk(question, idempotencyKey, { onState: setRunState }).then(
        finishProgressiveRun,
      );
    },
    [finishProgressiveRun],
  );

  // Mid-run refresh resume (Phase 2 acceptance): a non-terminal run stored in
  // this tab resumes via the READ-ONLY replay route — zero new paid calls.
  useEffect(() => {
    if (!progressive) return;
    const active = readActiveRun();
    if (!active) return;
    runningRef.current = true;
    void resumeRun(active, { onState: setRunState }).then(finishProgressiveRun);
  }, [progressive, finishProgressiveRun]);

  // ask_started (typed but DISABLED — askStartedEventEnabled() is off in every
  // environment; enabling is an operator approval, see events.ts). Emits once per
  // submit gesture on the pending rising edge; `entry` records whether the home
  // one-click intent auto-submitted or the user pressed submit here. Content-free.
  const entryRef = useRef<"form" | "intent">("form");
  const startedRef = useRef(false);
  // Phase 1 idempotency key: an opaque per-submit-gesture UUID in a hidden field.
  // Regenerated when a submission settles, so a NEW gesture is a NEW run while a
  // duplicate dispatch of the SAME gesture (double-submit, transport retry)
  // replays instead of re-billing. The one-click intent path reuses its intent
  // UUID (already single-use per tab). Uncontrolled input via ref — the value
  // must be updated synchronously before requestSubmit, not on a render.
  const idemKeyRef = useRef<HTMLInputElement>(null);
  const handlePendingChange = useCallback((pending: boolean) => {
    setBusy(pending);
    if (pending && !startedRef.current) {
      startedRef.current = true;
      if (askStartedEventEnabled()) {
        captureProductEvent("ask_started", { entry: entryRef.current });
      }
      entryRef.current = "form"; // one-shot: only the intent-dispatched submit is "intent"
    }
    if (!pending) {
      startedRef.current = false;
      // The gesture settled — mint the next gesture's key.
      idemKeyRef.current?.setAttribute("value", crypto.randomUUID());
    }
  }, []);

  // Mint the FIRST gesture's idempotency key on mount (later gestures mint in
  // handlePendingChange when the prior one settles). Runs before the one-shot
  // intent effect below, which overrides with the intent UUID; StrictMode's
  // double-invoke is harmless (only fills an empty value).
  useEffect(() => {
    if (idemKeyRef.current && !idemKeyRef.current.value) {
      idemKeyRef.current.setAttribute("value", crypto.randomUUID());
    }
  }, []);

  // One-shot handoff from the home Ask box. This is the ONLY automatic submission in
  // the app, and it is deliberately hard to replay: the intent is consumed (removed)
  // before the submit is dispatched, the stored question must equal the ?q= we
  // rendered, and sessionStorage is per-tab. So a refresh, a Back, a shared link, a
  // prefetch, or a forged ?intent= all find nothing and leave the form idle.
  //
  // The submit itself goes through requestSubmit() rather than calling the action
  // directly, so useActionState, the pending UI, auth, rate limits, spend guards,
  // result rendering, and analytics all stay exactly as authoritative as they are
  // for a hand-typed question.
  const oneShotRef = useRef(false);
  useEffect(() => {
    if (!intent) return;
    // StrictMode invokes effects twice on the same instance; the ref outlives that
    // and makes a second run a no-op. Set before any await-free work below so no
    // re-entry can slip between the check and the consume.
    if (oneShotRef.current) return;
    oneShotRef.current = true;

    let stored: string | null = null;
    try {
      const key = askIntentStorageKey(intent);
      stored = window.sessionStorage.getItem(key);
      if (stored !== null) window.sessionStorage.removeItem(key);
    } catch {
      stored = null; // storage unavailable: fall through to the idle prefilled form
    }

    stripIntentFromUrl();

    // Exact match only. A stale entry, a tampered ?q=, or a question that drifted
    // between the two pages must not silently ask something the user didn't submit.
    if (stored === null || stored !== initialQuestion) return;
    entryRef.current = "intent"; // the pending rising edge this dispatch causes is intent-entry
    // Reuse the single-use intent UUID as this gesture's idempotency key: a
    // duplicate dispatch of the one-click handoff replays instead of re-billing.
    idemKeyRef.current?.setAttribute("value", intent);
    formRef.current?.requestSubmit();
  }, [intent, initialQuestion]);

  // Phase 2: with the flag on, an explicit JS submit routes through the run
  // transport instead of the action (preventDefault); without JS the form still
  // POSTs to the server action — the no-JS degradation is the action itself.
  const onFormSubmit = useCallback(
    (e: { preventDefault(): void; currentTarget: HTMLFormElement }) => {
      if (!progressive) return; // action path (useActionState) handles it
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const question = String(fd.get("question") ?? "").trim().slice(0, 400);
      if (question.length < 3) return;
      const key = String(fd.get("idempotencyKey") ?? "");
      const entry = entryRef.current;
      entryRef.current = "form";
      startProgressiveRun(question, key, entry);
    },
    [progressive, startProgressiveRun],
  );

  const progressiveBusy =
    runState !== null && runState.phase !== "done" && runState.phase !== "failed";

  return (
    <div>
      <form
        ref={formRef}
        action={formAction}
        onSubmit={onFormSubmit}
        className="mb-4 flex flex-col gap-1"
      >
        {/* Phase 1: per-submit-gesture idempotency key (opaque UUID, no user data).
            suppressHydrationWarning: the value is minted client-side per gesture. */}
        <input
          ref={idemKeyRef}
          type="hidden"
          name="idempotencyKey"
          defaultValue=""
          suppressHydrationWarning
        />
        <AskFormFields
          initialQuestion={initialQuestion}
          t={t}
          formRef={formRef}
          onPendingChange={handlePendingChange}
          forceDisabled={progressiveBusy}
        />
        <WorkingPanel t={t} />
        {progressive && runState && (
          <RunProgress
            state={runState}
            t={t}
            onStop={() => {
              // Fire-and-forget cancel: the orchestrator's marker watch aborts
              // generation; settlement is exactly-once server-side. Read-only
              // failure here is harmless (the run simply completes).
              const id = runState.runId;
              if (id) void fetch(`/api/ask/runs/${id}/cancel`, { method: "POST" }).catch(() => {});
            }}
          />
        )}
      </form>

      {progressive && runState?.phase === "failed" && (
        <p className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          {t(
            runState.errorClass === "cancelled"
              ? "ask.progress.cancelled"
              : runState.errorClass === "reconnect_exhausted"
                ? "ask.progress.reconnect_exhausted"
                : "ask.progress.failed",
          )}
        </p>
      )}

      {progressive && runState?.phase === "done" && hydrated && (
        <>
          <AskCompletedMarker
            completionKey={runState.runId ?? "run"}
            state={deriveAnswerState(hydrated.result)}
            evidenceCount={hydrated.result.evidenceCount}
            retrievalMode={hydrated.result.retrievalMode ?? "legacy"}
            windowPresent={hydrated.result.window != null}
          />
          <AskResult
            result={hydrated.result}
            cited={hydrated.cited}
            related={hydrated.related}
            t={t}
            locale={locale}
            evidenceLabels={evidenceLabels}
            copyLabels={copyLabels}
          />
        </>
      )}

      {!state && !busy && !progressiveBusy && !hydrated && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <Link
              key={e}
              href={`/ask?q=${encodeURIComponent(e)}`}
              className="rounded-full bg-gray-100 px-3 py-1 text-xs hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
            >
              {e}
            </Link>
          ))}
        </div>
      )}

      {state && !busy && (
        <>
          <AskCompletedMarker
            completionKey={state.analyticsCompletionKey}
            state={deriveAnswerState(state.result)}
            evidenceCount={state.result.evidenceCount}
            retrievalMode={state.result.retrievalMode ?? "legacy"}
            windowPresent={state.result.window != null}
          />
          <AskResult
            result={state.result}
            cited={state.cited}
            related={state.related}
            t={t}
            locale={locale}
            evidenceLabels={evidenceLabels}
            copyLabels={copyLabels}
          />
        </>
      )}
    </div>
  );
}

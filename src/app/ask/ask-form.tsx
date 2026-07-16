"use client";

import Link from "next/link";
import {
  useActionState,
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
import { askAction, type AskActionState } from "./actions";
import { AskResult, type Translate } from "./ask-result";
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
  /** Resolved `ask.*` translations for the active locale — a client component
   *  can't receive a function prop from the server component that renders it. */
  strings: Record<string, string>;
  locale: Locale;
  evidenceLabels: ClaimEvidenceLabels;
  copyLabels: ClaimCopyLabels;
}

// Client-side elapsed-time stages for the working panel. These are an HONEST
// estimate of the pipeline's fixed retrieve → rank → answer order — never a
// server-reported progress signal and never a percentage. The thresholds only
// pace the copy; the elapsed counter shows the real number of seconds.
const STAGE_KEYS = [
  "ask.working.stage.searching",
  "ask.working.stage.ranking",
  "ask.working.stage.answering",
] as const;

function stageKeyForElapsed(seconds: number): (typeof STAGE_KEYS)[number] {
  if (seconds < 4) return STAGE_KEYS[0];
  if (seconds < 9) return STAGE_KEYS[1];
  return STAGE_KEYS[2];
}

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
}: {
  initialQuestion: string;
  t: Translate;
  formRef: RefObject<HTMLFormElement | null>;
  onPendingChange: (pending: boolean) => void;
}) {
  const { pending } = useFormStatus();

  // aria-busy belongs on the <form> element, but the component that owns that
  // element can't call useFormStatus (see above) — mirror `pending` onto it via
  // ref, and lift it to AskForm in the same effect.
  useEffect(() => {
    formRef.current?.setAttribute("aria-busy", pending ? "true" : "false");
    onPendingChange(pending);
  }, [pending, formRef, onPendingChange]);

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
        disabled={pending}
        // a disabled input also suppresses an Enter-key resubmit while pending
        className="min-w-0 flex-1 rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? (
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
 * The visible working panel. role=status + aria-live=polite announce the stage
 * transitions to assistive tech; the once-per-second elapsed counter is
 * aria-hidden so a screen reader is not spammed every tick. Stage copy advances
 * on CLIENT elapsed time (honest estimate of the retrieve → rank → answer order)
 * — never a server-reported stage and never a fake percentage.
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

  const stage = t(stageKeyForElapsed(elapsed));

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
  strings,
  locale,
  evidenceLabels,
  copyLabels,
}: AskFormProps) {
  const t: Translate = (key) => strings[key] ?? key;
  const [state, formAction] = useActionState<AskActionState | null, FormData>(askAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);

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
    formRef.current?.requestSubmit();
  }, [intent, initialQuestion]);

  return (
    <div>
      <form ref={formRef} action={formAction} className="mb-4 flex flex-col gap-1">
        <AskFormFields
          initialQuestion={initialQuestion}
          t={t}
          formRef={formRef}
          onPendingChange={setBusy}
        />
        <WorkingPanel t={t} />
      </form>

      {!state && !busy && (
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

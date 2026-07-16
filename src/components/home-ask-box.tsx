"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ASK_QUESTION_MIN,
  ASK_QUESTION_MAX,
  askIntentStorageKey,
  clearAskIntents,
  normalizeAskQuestion,
} from "@/lib/ask/intent";

export interface HomeAskBoxProps {
  title: string;
  placeholder: string;
  submitLabel: string;
  /** The home page owns its CTA styling; passed in so the constant stays single-sourced. */
  submitClassName: string;
}

/**
 * The signed-in home's Ask entry point: one click lands on /ask with the pipeline
 * already running.
 *
 * The element underneath is still a plain `<form action="/ask" method="get">` — with
 * JavaScript off, or if anything below fails, submitting it navigates to /ask and
 * PREFILLS the input, exactly as before (src/app/ask/page.tsx). The enhancement is
 * additive: on a valid submission we stash the question under a single-use
 * sessionStorage key and hand its id to /ask via ?intent=, which lets AskForm press
 * its own submit button once. No paid call happens here, and none happens on the GET
 * that follows — see src/lib/ask/intent.ts for why replaying the URL is inert.
 */
export function HomeAskBox({ title, placeholder, submitLabel, submitClassName }: HomeAskBoxProps) {
  const router = useRouter();
  // Synchronous latch: two submits can be dispatched within one frame, before any
  // state-driven `disabled` has rendered. The ref closes that window; the disabled
  // controls below cover everything after the first paint.
  const handedOffRef = useRef(false);
  const [handingOff, setHandingOff] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (handedOffRef.current) {
      // Already navigating — swallow the duplicate rather than let the native GET
      // race the router.
      event.preventDefault();
      return;
    }

    const input = event.currentTarget.elements.namedItem("q");
    const raw = input instanceof HTMLInputElement ? input.value : "";
    const question = normalizeAskQuestion(raw);
    // Too short to be a question: fall through to the native GET. /ask will prefill
    // and sit idle, which is the honest outcome — never a billed no-op.
    if (question.length < ASK_QUESTION_MIN) return;

    let intent: string;
    try {
      intent = crypto.randomUUID();
      const key = askIntentStorageKey(intent);
      // At most one intent in flight per tab: prunes any orphan from a click whose
      // /ask never mounted (see clearAskIntents), so stale question text can't pile up.
      clearAskIntents(window.sessionStorage);
      window.sessionStorage.setItem(key, question);
      // Read back: a storage that silently no-ops (quota, private modes) reports
      // success from setItem. Without this the handoff would navigate to an intent
      // that resolves to nothing and the user's click would be swallowed.
      if (window.sessionStorage.getItem(key) !== question) {
        window.sessionStorage.removeItem(key);
        return;
      }
    } catch {
      return; // no crypto.randomUUID or no storage — native GET prefill still works
    }

    // Only now, with the question durably stashed, do we take over the submission.
    event.preventDefault();
    handedOffRef.current = true;
    setHandingOff(true);
    router.push(
      `/ask?q=${encodeURIComponent(question)}&intent=${encodeURIComponent(intent)}`,
    );
  }

  return (
    <section className="pb-10">
      <div className="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
        <h3 className="mb-2 font-semibold">{title}</h3>
        <form action="/ask" method="get" onSubmit={onSubmit} className="flex flex-wrap gap-3">
          <input
            type="text"
            name="q"
            maxLength={ASK_QUESTION_MAX}
            placeholder={placeholder}
            disabled={handingOff}
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900"
          />
          <button type="submit" disabled={handingOff} className={`${submitClassName} disabled:opacity-60`}>
            {submitLabel}
          </button>
        </form>
      </div>
    </section>
  );
}

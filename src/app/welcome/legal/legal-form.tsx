"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from "@/lib/legal/policies";
import { resetAnalyticsClient } from "@/lib/analytics/client";
import { acceptAction, type AcceptState } from "./actions";

// Two REQUIRED, initially-UNCHECKED attestations — no dark patterns, nothing pre-checked. The
// document links open in a NEW TAB so opening a document never mutates or resets the checkboxes,
// and clicking a link never toggles the box (the links are not <label>s). Client disabling is a
// convenience only; the server action re-validates both checkboxes independently.

const INITIAL: AcceptState = { error: null };

export function LegalAcceptanceForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<AcceptState, FormData>(
    acceptAction,
    INITIAL,
  );
  const [adult, setAdult] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const canSubmit = adult && privacy && !pending;

  return (
    <form
      action={formAction}
      className="space-y-5"
      onSubmit={() => {
        // A Privacy-version reacceptance with this optional box unchecked is an immediate local
        // revocation as well as an atomic server-side denial. Stop the current tab before navigation.
        if (!analytics) resetAnalyticsClient();
      }}
    >
      <input type="hidden" name="next" value={next} />

      <div className="flex gap-3">
        <input
          id="adult_attested"
          name="adult_attested"
          type="checkbox"
          value="yes"
          checked={adult}
          onChange={(e) => setAdult(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0"
          aria-describedby="acceptance-error"
        />
        <div className="text-sm text-gray-700 dark:text-gray-300">
          <label htmlFor="adult_attested">
            I confirm that I am at least 18 years old and agree to the{" "}
          </label>
          <Link
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-900 dark:hover:text-white"
          >
            Terms of Use
          </Link>
          <label htmlFor="adult_attested"> (version {CURRENT_TERMS_VERSION}).</label>
        </div>
      </div>

      <div className="flex gap-3">
        <input
          id="privacy_acknowledged"
          name="privacy_acknowledged"
          type="checkbox"
          value="yes"
          checked={privacy}
          onChange={(e) => setPrivacy(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0"
          aria-describedby="acceptance-error"
        />
        <div className="text-sm text-gray-700 dark:text-gray-300">
          <label htmlFor="privacy_acknowledged">
            I acknowledge that I have read the{" "}
          </label>
          <Link
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-900 dark:hover:text-white"
          >
            Privacy Notice
          </Link>
          <label htmlFor="privacy_acknowledged">
            {" "}
            (version {CURRENT_PRIVACY_VERSION}), including that BNOW.NET stores my submitted
            questions and uses service providers to process them.
          </label>
        </div>
      </div>

      <div className="flex gap-3 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <input
          id="analytics_preference"
          name="analytics_preference"
          type="checkbox"
          value="granted"
          checked={analytics}
          onChange={(event) => setAnalytics(event.target.checked)}
          className="mt-1 h-4 w-4 shrink-0"
        />
        <div className="text-sm text-gray-700 dark:text-gray-300">
          <label htmlFor="analytics_preference" className="font-medium">
            Allow optional product analytics
          </label>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Optional and initially off. If enabled, BNOW uses a random internal account ID and
            coarse product events to understand whether beta analysts find useful evidence. We do
            not send Ask or Search text, claim text, source URLs, email addresses, or session
            replay. You can change this at any time from Account without affecting access.
          </p>
        </div>
      </div>

      {state.error && (
        <p
          id="acceptance-error"
          role="alert"
          className="rounded-lg bg-red-100 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        Accept and continue
      </button>
    </form>
  );
}

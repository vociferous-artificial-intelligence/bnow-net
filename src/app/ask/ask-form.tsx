"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, type RefObject } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { askAction, type AskActionState } from "./actions";
import { AskResult, type Translate } from "./ask-result";

const EXAMPLES = [
  "Which Russian officials were prosecuted recently?",
  "What is happening with Iran's nuclear enrichment?",
  "Which entities are sanctioned and under pressure?",
  "What strikes were reported in Ukraine this week?",
];

export interface AskFormProps {
  initialQuestion?: string;
  /** Resolved `ask.*` translations for the active locale — a client component
   *  can't receive a function prop from the server component that renders it. */
  strings: Record<string, string>;
}

/**
 * The form's interactive fields, pending state, and hint. Split out of AskForm
 * because useFormStatus only works in a component NESTED inside a <form> — it
 * does not work in the component that renders the <form> tag itself.
 */
function AskFormFields({
  initialQuestion,
  t,
  formRef,
}: {
  initialQuestion: string;
  t: Translate;
  formRef: RefObject<HTMLFormElement | null>;
}) {
  const { pending } = useFormStatus();

  // aria-busy belongs on the <form> element, but the component that owns that
  // element can't call useFormStatus (see above) — mirror `pending` onto it via ref.
  useEffect(() => {
    formRef.current?.setAttribute("aria-busy", pending ? "true" : "false");
  }, [pending, formRef]);

  return (
    <>
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
      {pending && <p className="mt-1 text-xs text-gray-400">{t("ask.pending.hint")}</p>}
    </>
  );
}

export function AskForm({ initialQuestion = "", strings }: AskFormProps) {
  const t: Translate = (key) => strings[key] ?? key;
  const [state, formAction] = useActionState<AskActionState | null, FormData>(askAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div>
      <form ref={formRef} action={formAction} className="mb-4 flex flex-col gap-1">
        <AskFormFields initialQuestion={initialQuestion} t={t} formRef={formRef} />
      </form>

      {!state && (
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

      {state && (
        <AskResult result={state.result} cited={state.cited} related={state.related} t={t} />
      )}
    </div>
  );
}

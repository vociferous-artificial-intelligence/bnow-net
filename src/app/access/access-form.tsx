"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { requestAccess, type AccessFormState } from "./actions";
import { EMAIL_MAX, LINKEDIN_MAX, USE_CASE_MAX } from "@/lib/access/validate";
import type { AccessAttribution } from "@/lib/access/attribution";

// All user-visible strings arrive as props from the server page (locale-resolved
// there); the action returns machine codes which this component maps to copy.
export interface AccessFormLabels {
  emailLabel: string;
  linkedinLabel: string;
  linkedinHint: string;
  usecaseLabel: string;
  usecaseHint: string;
  optional: string;
  submit: string;
  pending: string;
  successTitle: string;
  successBody: string;
  errEmail: string;
  errLinkedin: string;
  errGeneric: string;
}

const INITIAL: AccessFormState = { status: "idle" };

const FIELD =
  "w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900";

export function AccessForm({
  labels,
  attribution,
}: {
  labels: AccessFormLabels;
  attribution?: AccessAttribution;
}) {
  const [state, formAction, pending] = useActionState(requestAccess, INITIAL);
  const errorRef = useRef<HTMLDivElement>(null);

  // Move focus to the error summary when a submission fails, so keyboard and
  // screen-reader users land on what went wrong instead of a silently reset form.
  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
  }, [state]);

  if (state.status === "success") {
    return (
      <div
        role="status"
        className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm dark:border-green-800 dark:bg-green-950"
      >
        <p className="font-semibold">{labels.successTitle}</p>
        <p className="mt-1 text-gray-600 dark:text-gray-300">{labels.successBody}</p>
      </div>
    );
  }

  const errorText =
    state.status === "error"
      ? state.code === "email"
        ? labels.errEmail
        : state.code === "linkedin"
          ? labels.errLinkedin
          : labels.errGeneric
      : null;

  return (
    <form action={formAction} aria-busy={pending} className="space-y-4">
      <input type="hidden" name="utm_source" value={attribution?.utmSource ?? ""} />
      <input type="hidden" name="utm_medium" value={attribution?.utmMedium ?? ""} />
      <input type="hidden" name="utm_campaign" value={attribution?.utmCampaign ?? ""} />
      <input type="hidden" name="landing_path" value={attribution?.landingPath ?? ""} />
      <input type="hidden" name="referrer_host" value={attribution?.referrerHost ?? ""} />
      {errorText && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {errorText}
        </div>
      )}

      <div>
        <label htmlFor="access-email" className="mb-1 block text-sm font-medium">
          {labels.emailLabel}
        </label>
        <input
          id="access-email"
          type="email"
          name="email"
          required
          maxLength={EMAIL_MAX}
          autoComplete="email"
          disabled={pending}
          className={FIELD}
        />
      </div>

      <div>
        <label htmlFor="access-linkedin" className="mb-1 block text-sm font-medium">
          {labels.linkedinLabel}{" "}
          <span className="font-normal text-gray-400">({labels.optional})</span>
        </label>
        <input
          id="access-linkedin"
          type="text"
          name="linkedin"
          inputMode="url"
          maxLength={LINKEDIN_MAX}
          autoComplete="url"
          aria-describedby="access-linkedin-hint"
          disabled={pending}
          className={FIELD}
        />
        <p id="access-linkedin-hint" className="mt-1 text-xs text-gray-400">
          {labels.linkedinHint}
        </p>
      </div>

      <div>
        <label htmlFor="access-usecase" className="mb-1 block text-sm font-medium">
          {labels.usecaseLabel}{" "}
          <span className="font-normal text-gray-400">({labels.optional})</span>
        </label>
        <textarea
          id="access-usecase"
          name="usecase"
          rows={3}
          maxLength={USE_CASE_MAX}
          aria-describedby="access-usecase-hint"
          disabled={pending}
          className={FIELD}
        />
        <p id="access-usecase-hint" className="mt-1 text-xs text-gray-400">
          {labels.usecaseHint}
        </p>
      </div>

      {/* Honeypot: visually removed AND aria-hidden (real assistive-tech users must
          never meet it); bots parsing the DOM still fill it. A filled value returns
          a generic success server-side without storing anything. */}
      <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label htmlFor="access-website">Website</label>
        <input
          id="access-website"
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {pending && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
        {pending ? labels.pending : labels.submit}
      </button>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { resetAnalyticsClient } from "@/lib/analytics/client";
import {
  updateAnalyticsPreferenceAction,
  type AnalyticsPreferenceState,
} from "./actions";

const INITIAL: AnalyticsPreferenceState = { status: "idle" };

export function AnalyticsPreferenceForm({ granted }: { granted: boolean }) {
  const [state, action, pending] = useActionState(updateAnalyticsPreferenceAction, INITIAL);

  return (
    <form
      action={action}
      className="space-y-3"
      onSubmit={(event) => {
        const preference = new FormData(event.currentTarget).get("analytics_preference");
        if (preference === "denied") resetAnalyticsClient();
      }}
    >
      <fieldset disabled={pending} className="space-y-2">
        <legend className="sr-only">Optional product analytics preference</legend>
        <label className="flex gap-2">
          <input
            type="radio"
            name="analytics_preference"
            value="granted"
            defaultChecked={granted}
          />
          <span>Allow minimized product analytics</span>
        </label>
        <label className="flex gap-2">
          <input
            type="radio"
            name="analytics_preference"
            value="denied"
            defaultChecked={!granted}
          />
          <span>Do not allow optional product analytics</span>
        </label>
      </fieldset>
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-900"
      >
        {pending ? "Saving…" : "Save analytics preference"}
      </button>
      <p className="text-xs text-gray-500" role="status">
        {state.status === "saved"
          ? "Preference saved."
          : state.status === "error"
            ? "We couldn't save this preference. Please try again."
            : "You can change this without affecting product access."}
      </p>
    </form>
  );
}

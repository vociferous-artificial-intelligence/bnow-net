"use client";

import { resetAnalyticsClient } from "@/lib/analytics/client";

export function AccountSignOutForm({ action }: { action: () => Promise<void> }) {
  return (
    <form
      action={action}
      onSubmit={() => {
        // Clear the browser identity before the server action navigates away. Failure remains
        // non-fatal to sign-out; resetAnalyticsClient owns exception swallowing.
        resetAnalyticsClient();
      }}
    >
      <button className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900">
        Sign out
      </button>
    </form>
  );
}

"use client";

import { resetAnalyticsClient } from "@/lib/analytics/client";

export function AnalyticsResetForm({ action, children }: { action: (formData: FormData) => void | Promise<void>; children: React.ReactNode }) {
  return <form action={action} onSubmit={() => resetAnalyticsClient()}>{children}</form>;
}

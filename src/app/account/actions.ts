"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  hasCurrentAcceptanceByEmail,
  updateAnalyticsPreferenceForEmail,
} from "@/lib/legal/acceptance";

export interface AnalyticsPreferenceState {
  status: "idle" | "saved" | "error";
}

export async function updateAnalyticsPreferenceAction(
  _previous: AnalyticsPreferenceState,
  formData: FormData,
): Promise<AnalyticsPreferenceState> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect("/signin");
  if (!(await hasCurrentAcceptanceByEmail(email))) redirect("/welcome/legal?next=/account");

  const result = await updateAnalyticsPreferenceForEmail(
    email,
    formData.get("analytics_preference"),
  );
  if (!result.ok) return { status: "error" };
  revalidatePath("/account");
  return { status: "saved" };
}

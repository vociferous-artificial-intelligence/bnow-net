"use server";

import { after } from "next/server";
import { rawSql } from "@/db";
import { feedbackEmail } from "@/lib/feedback";
import {
  normalizeAccessEmail,
  USE_CASE_MAX,
  validateLinkedinUrl,
} from "@/lib/access/validate";

// Beta access-request action. Stores ONLY what the requester volunteered (email,
// optional LinkedIn URL, optional use-case text) — no IP, no user agent, no page
// contents, no inferred profile data. plan_code stays NULL: a beta request is not
// a plan selection. Server actions are their own HTTP entry points, so every
// check here is authoritative regardless of what the client rendered.

export interface AccessFormState {
  status: "idle" | "success" | "error";
  /** Machine code only — the client maps it to localized copy. Raw DB/provider
   *  errors never reach this object. */
  code?: "email" | "linkedin" | "generic";
}

/** Identical submissions inside this window collapse silently (same success UI,
 *  no second row, no second operator email) — without revealing whether the
 *  address already exists. */
const DEDUPE_WINDOW_SQL = "1 hour";

export async function requestAccess(
  _prev: AccessFormState,
  formData: FormData,
): Promise<AccessFormState> {
  // Honeypot: bots fill every field. A filled honeypot returns the exact success a
  // human sees — no insert, no notification, no oracle.
  if (String(formData.get("website") ?? "").trim() !== "") return { status: "success" };

  const email = normalizeAccessEmail(formData.get("email"));
  if (!email) return { status: "error", code: "email" };

  const linkedin = validateLinkedinUrl(formData.get("linkedin"));
  if (linkedin === "invalid") return { status: "error", code: "linkedin" };

  const useCase =
    String(formData.get("usecase") ?? "").trim().slice(0, USE_CASE_MAX) || null;

  try {
    const dupes = (await rawSql.query(
      `SELECT id FROM subscribe_intents
       WHERE email = $1 AND created_at > now() - interval '${DEDUPE_WINDOW_SQL}'
       LIMIT 1`,
      [email],
    )) as Array<{ id: number }>;
    // Same success as a fresh request — no address-existence oracle. The window only
    // suppresses REPEAT submissions; a genuinely new address always inserts and
    // notifies below.
    if (dupes.length > 0) return { status: "success" };

    await rawSql.query(
      `INSERT INTO subscribe_intents (email, plan_code, linkedin_url, use_case, source)
       VALUES ($1, NULL, $2, $3, 'access_form')`,
      [email, linkedin, useCase],
    );
  } catch {
    // Never leak raw DB/provider errors to the requester.
    return { status: "error", code: "generic" };
  }

  notifyOperator({ email, linkedin, useCase });
  return { status: "success" };
}

/**
 * Fire-and-forget operator notification: runs AFTER the response is sent (`after()`),
 * so a slow or failing email provider can never fail, slow, or alter the requester's
 * response. Contains only the submitted fields. When FEEDBACK_EMAIL is unset the
 * notification is skipped (same fail-closed-affordance pattern as src/lib/feedback.ts);
 * the request still lands in subscribe_intents for the admin review surface.
 */
function notifyOperator(fields: {
  email: string;
  linkedin: string | null;
  useCase: string | null;
}): void {
  const to = feedbackEmail();
  if (!to) return;
  after(async () => {
    try {
      const { sendEmail } = await import("@/lib/email/send");
      await sendEmail({
        to,
        subject: `BNOW beta access request: ${fields.email}`,
        text: [
          "New beta access request via /access.",
          "",
          `Email: ${fields.email}`,
          `LinkedIn: ${fields.linkedin ?? "(not provided)"}`,
          `Monitors: ${fields.useCase ?? "(not provided)"}`,
          "",
          "Review: /admin/access — approve by setting request_status='approved'.",
        ].join("\n"),
        trackLinks: "None",
        trackOpens: false,
      });
    } catch {
      // Notification failure must not affect the requester; the row is already stored.
    }
  });
}

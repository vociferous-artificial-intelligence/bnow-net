// Central legal-policy metadata — the ONE place version strings, the effective date, and
// the operator identity live. Pages, gates, the acceptance record, and tests all read from
// here so a future version bump is a single edit (bump the constant + the document copy),
// after which every user lacking the new version pair is routed back through acceptance
// (src/lib/legal/acceptance.ts + src/lib/gate.ts requireAcceptedUser).
//
// Pure constants, no DB, no server-only imports: safe to import from client components
// (the acceptance form renders "version 1.0" from these) as well as server code.

/** Bump when the Terms document changes materially. Returning users then re-accept. */
export const CURRENT_TERMS_VERSION = "1.0";
/** Bump when the Privacy Notice changes materially. Returning users then re-acknowledge. */
export const CURRENT_PRIVACY_VERSION = "1.2";

/** The acceptance clickwrap event kind stored on every record. */
export const ACCEPTANCE_METHOD = "first_login_clickwrap";

/**
 * Per-document effective dates. Terms remains v1.0 while Privacy advances independently;
 * changing one must never make the other document appear newly effective.
 */
export const TERMS_EFFECTIVE_DATE = "2026-07-12";
export const TERMS_EFFECTIVE_DATE_DISPLAY = "July 12, 2026";
// Privacy 1.2 (analyst-beta remediation): corrects the now-false "activation
// pending" copy to the live PostHog posture (US project, GeoIP-derived coarse
// location disclosed, 7-year event retention). Re-acknowledgement is driven by
// the version STRING above, not this date. OPERATOR: confirm/adjust this to the
// ACTUAL deploy date before deploying (deploy is gated behind the X closeout).
export const PRIVACY_EFFECTIVE_DATE = "2026-07-15";
export const PRIVACY_EFFECTIVE_DATE_DISPLAY = "July 15, 2026";

// Backward-compatible aliases for the unchanged Terms document. Privacy passes its own
// effective date to the shared document chrome so a Privacy-only revision never makes the
// Terms appear to have changed.
export const POLICY_EFFECTIVE_DATE = TERMS_EFFECTIVE_DATE;
export const POLICY_EFFECTIVE_DATE_DISPLAY = TERMS_EFFECTIVE_DATE_DISPLAY;

/**
 * Operator identity. Kept here (not scattered through copy) so it is easy to update centrally
 * when the Delaware company forms and a formal corporate name/registered office exist. Until
 * then the documents deliberately name only "Vociferous.ai" — no invented LLC or corporation.
 */
export const OPERATOR = {
  /** Short display name used in chrome and headings. */
  name: "BNOW.NET",
  /** Who builds and runs it — appears in the legal documents and footer. */
  builtBy: "Vociferous.ai",
  attribution: "Built and operated by Vociferous.ai",
  location: "New York, New York",
  /** Current legal/privacy contact (a Delaware entity + role address may replace it later). */
  legalContact: "go@vociferous.nyc",
} as const;

/** True when the given accepted pair equals the CURRENT documents. */
export function isCurrentVersions(termsVersion: string, privacyVersion: string): boolean {
  return termsVersion === CURRENT_TERMS_VERSION && privacyVersion === CURRENT_PRIVACY_VERSION;
}

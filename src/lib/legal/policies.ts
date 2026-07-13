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
export const CURRENT_PRIVACY_VERSION = "1.0";

/** The acceptance clickwrap event kind stored on every record. */
export const ACCEPTANCE_METHOD = "first_login_clickwrap";

/**
 * Effective date of the v1.0 documents. This is the implementation/deployment-ready date;
 * update it (and the version) whenever the copy changes. ISO for machines, `display` for UI —
 * kept together so the two never drift.
 */
export const POLICY_EFFECTIVE_DATE = "2026-07-12";
export const POLICY_EFFECTIVE_DATE_DISPLAY = "July 12, 2026";

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

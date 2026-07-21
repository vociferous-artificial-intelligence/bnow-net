// Central legal-policy metadata — the ONE place version strings, the effective date, and
// the operator identity live. Pages, gates, the acceptance record, and tests all read from
// here so a future version bump is a single edit (bump the constant + the document copy),
// after which every user lacking the new version pair is routed back through acceptance
// (src/lib/legal/acceptance.ts + src/lib/gate.ts requireAcceptedUser).
//
// Pure constants, no DB, no server-only imports: safe to import from client components
// (the acceptance form renders "version 1.0" from these) as well as server code.

/** Bump when the Terms document changes materially. Returning users then re-accept.
 *  1.1 (2026-07-16): §9 adds the named-person source-attribution / non-endorsement
 *  rule for the accepted private-beta Signals view (names shown to accepted invitees
 *  are cited source claims, not BNOW's assertions). */
export const CURRENT_TERMS_VERSION = "1.1";
/** Bump when the Privacy Notice changes materially. Returning users then re-acknowledge.
 *  1.3 (2026-07-21): §9 replaces the "no fixed automatic deletion period" statement with
 *  the operator-configured Ask retention windows (question/answer/evidence content ≤30
 *  days; stream/progress events ≤7 days; exact-answer cache ≤7 days), disclosed BEFORE
 *  any Ask persistence-backed feature is enabled in production. */
export const CURRENT_PRIVACY_VERSION = "1.3";

/** The acceptance clickwrap event kind stored on every record. */
export const ACCEPTANCE_METHOD = "first_login_clickwrap";

/**
 * Per-document effective dates. Terms (v1.1) and Privacy (v1.2) advance independently;
 * changing one must never make the other document appear newly effective.
 */
// Terms 1.1 effective date = the actual production rollout date of the named-person
// attribution rule (attributed-signals sprint), 2026-07-16 (the rollout did not
// occur on 07-15). Keep in sync with the deploy.
export const TERMS_EFFECTIVE_DATE = "2026-07-16";
export const TERMS_EFFECTIVE_DATE_DISPLAY = "July 16, 2026";
// Privacy 1.3 (AI Search/Ask release): discloses the fixed Ask retention windows
// (content 30 days, events 7 days, exact-answer cache 7 days) that the operator
// configured for the persistence-backed Ask features, replacing 1.2's "no fixed
// automatic deletion period" statement. Re-acknowledgement is driven by the
// version STRING above, not this date. July 21 is the actual production release
// date for Privacy 1.3 (the retention envs are set in the same release).
export const PRIVACY_EFFECTIVE_DATE = "2026-07-21";
export const PRIVACY_EFFECTIVE_DATE_DISPLAY = "July 21, 2026";

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

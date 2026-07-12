// Design-partner feedback affordances, mailto v1 (zero backend by design —
// the structured recommend/downgrade feature is deliberately deferred; see
// docs/BNOW-NEXT-FEATURES-PLAN-2026-07-12.md §2.5 Gap 3). Affordances render
// nothing when FEEDBACK_EMAIL is unset, so an env mistake hides the link
// instead of shipping a dead or wrong address.

export function feedbackEmail(): string | null {
  const v = process.env.FEEDBACK_EMAIL?.trim();
  return v ? v : null;
}

/** mailto: URL with a prefilled subject, or null when no address is configured. */
export function feedbackMailto(subject: string): string | null {
  const email = feedbackEmail();
  if (!email) return null;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}

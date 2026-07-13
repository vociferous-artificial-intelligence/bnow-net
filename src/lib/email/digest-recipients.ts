// Digest recipient policy (2026-07-13 remediation).
//
// A row in subscribe_intents is NEVER a digest opt-in: legacy rows were
// pricing-page interest capture ("waiting buyers", never a documented delivery
// consent), and since 2026-07-13 the same table stores private-beta ACCESS
// requests (source='access_form'). An approved access request grants sign-in
// eligibility under SIGNIN_MODE=invite — not email delivery. Digest mail goes
// only to real accounts holding a subscription row in an eligible status; the
// query below deliberately never touches subscribe_intents
// (digest-recipients.test.ts pins that).

/** Subscription statuses that receive digest mail. Deliberately excludes
 *  'past_due' and 'canceled' — with billing off, an eligible subscription is
 *  one the operator created as active (or pending activation). */
export const ELIGIBLE_SUBSCRIPTION_STATUSES: readonly string[] = ["active", "pending"];

/** Recipient pool query: users joined to their subscriptions, status included.
 *  Eligibility filtering + dedupe live in eligibleRecipients() so the policy is
 *  unit-testable as a pure function. */
export const DIGEST_RECIPIENTS_SQL = `
  SELECT u.email AS email, s.status AS status
  FROM users u
  JOIN subscriptions s ON s.user_id = u.id
  WHERE u.email IS NOT NULL`;

export interface RecipientRow {
  email: string | null;
  status: string | null;
}

/** Pure policy: keep addresses whose subscription status is eligible, deduped
 *  case-insensitively (first spelling wins). Returns [] when nobody is eligible
 *  — the caller must send NOTHING in that case, never fall back to a demo or
 *  operator address with production intelligence. */
export function eligibleRecipients(rows: RecipientRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const email = r.email?.trim();
    if (!email || !r.status || !ELIGIBLE_SUBSCRIPTION_STATUSES.includes(r.status)) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

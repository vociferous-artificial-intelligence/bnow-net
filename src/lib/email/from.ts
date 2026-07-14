// Sender identity, resolved once for every provider. Deliberately free of
// node:fs so auth.ts can import it without pulling in the outbox fallback.

// Brand-correct BNOW fallback. This is the ONLY sender identity the code will
// ever fall back to — never a partner/other-brand domain. If the operator has
// not yet verified bnow.net in Postmark (Sender Signature or Domain + DKIM), an
// unset POSTMARK_FROM_EMAIL/EMAIL_FROM makes the send FAIL VISIBLY at Postmark
// (422) rather than silently deliver a BNOW login from someone else's domain.
export const DEFAULT_FROM = "BNOW.NET <no-reply@bnow.net>";

/**
 * `EMAIL_FROM`, then `POSTMARK_FROM_EMAIL` (what the setup docs provision), then
 * the brand-correct BNOW `fallback`. Blank/whitespace values fall through: Vercel
 * stores a cleared env var as "", which `??` would otherwise accept as a From
 * address.
 */
export function senderAddress(fallback: string = DEFAULT_FROM): string {
  for (const name of ["EMAIL_FROM", "POSTMARK_FROM_EMAIL"] as const) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return fallback;
}

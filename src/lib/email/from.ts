// Sender identity, resolved once for every provider. Deliberately free of
// node:fs so auth.ts can import it without pulling in the outbox fallback.

export const DEFAULT_FROM = "BNOW.NET <no-reply@scenefiend.app>";

/**
 * `EMAIL_FROM`, then `POSTMARK_FROM_EMAIL` (what the setup docs provision), then
 * `fallback`. Blank/whitespace values fall through: Vercel stores a cleared env
 * var as "", which `??` would otherwise accept as a From address.
 */
export function senderAddress(fallback: string = DEFAULT_FROM): string {
  for (const name of ["EMAIL_FROM", "POSTMARK_FROM_EMAIL"] as const) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return fallback;
}

# Magic-link email — Postmark link tracking, and what actually broke

- **Date:** 2026-07-09 (evening ET / 2026-07-10 UTC)
- **Trigger:** sign-in emails arrived with `track.pstmrk.it` links; reported as "login is
  broken", including for an email sent manually without tracking.
- **Shipped:** `email: stop Postmark rewriting magic-link callback URLs` (9b5b368) +
  `frontend: …` mobile-nav fix. Prod deployment `bnow-fyyuhnqhn`.
- **Status:** link rewriting fixed and verified at Postmark. The *login failure* had a
  different cause than the rewriting — see "What actually broke".

## What was fixed

`OutboundEmail` gained optional `trackLinks` / `trackOpens`; `sendEmail` emits the
Postmark keys **only when a caller sets them**, so non-auth mail keeps inheriting the
server default. `buildMagicLinkEmail` sends `TrackLinks: "None"`. `signIn` now passes
`redirectTo: "/account"`. Sender resolves `EMAIL_FROM` → `POSTMARK_FROM_EMAIL` → default
(prod sets only the second; blank values fall through).

Verified against Postmark's own record for two real sends, not from code:

| message | build | `TrackLinks` |
|---|---|---|
| 21:10:05 ET | pre-fix | `HtmlAndText` |
| 21:23:58 ET | post-fix | `None` |

## What actually broke — and it was not the tracking

Evidence, from `verification_tokens` + Postmark's click log:

- Auth.js stores the emailed token as `sha256hex(token + AUTH_SECRET)` and
  `useVerificationToken` **deletes the row on a hash match**. A surviving row therefore
  means "never successfully presented"; a missing row does *not* mean success — the row
  is deleted even when the token is expired or the identifier mismatches.
- The 20:18:56 **tracked** email was clicked from `Safari mobile 18.6 / iPhone` at
  00:19:10.46Z; a session row appeared at 00:19:11.18Z. It authenticated.
- The 20:36:34 **untracked** email's token was consumed and produced a session at
  01:08:53Z. It authenticated too.
- `gregoryoconnor@gmail.com` holds 4 sessions and a non-null `email_verified`.

So both a tracked and an untracked link logged in successfully. The perceived failure is
consistent with the **one-time token being consumed by the first open** (phone), after
which opening the same link on a second device yields `/api/auth/error?error=Verification`.
This is inherent to single-use magic links, not to Postmark. Tracking was a real defect —
it double-encodes the URL and routes credentials through a third party — but it was not
what made a login attempt fail.

## Verified end-to-end on prod (post-deploy)

Minted a token locally against `AUTH_SECRET`, inserted it, and drove the live callback:

```
callback     : 302 -> https://bnow-net.vercel.app/account
cookie       : __Secure-authjs.session-token
GET /account : 200   (renders identity + sign-out)
token consumed (row deleted): true
```

This also proves the `AUTH_SECRET` in `.env.local` matches production. Probe rows
(`authprobe@bnow.net`) were deleted afterwards.

## Operational findings worth remembering

1. **`git push` does not deploy.** There is no GitHub→Vercel integration on this project;
   production kept serving the old build for 20 minutes after the fix was pushed. Ship
   with `npx vercel@latest deploy --prod --yes`, then re-check the symptom. This is why
   the first "fix" appeared not to work.
2. **Postmark link tracking is a server-level setting**, overridden per message. Any
   future caller that forgets `trackLinks` inherits tracking again — which is why the
   flag lives inside `buildMagicLinkEmail`, not at the `sendEmail` call site.
3. **`TrackOpens: false` does not take.** Postmark's message details report
   `TrackOpens: true` on every message, including ones where we explicitly send `false`.
   These emails are text-only (no `HtmlBody`), so there is no tracking pixel and no opens
   can be recorded; the flag is sent anyway, defensively, in case HTML is added later.
   Unresolved: whether the details endpoint simply echoes the server default.
4. **A one-time token is a credential in an inbox.** Anything that fetches the URL —
   scanner, prefetcher, tracking redirect — consumes it. Postmark's click log records
   the real user agent, which is how the iPhone click above was identified.
5. `AUTH_SECRET` is live in prod but absent from the AGENTS.md credentials table.

## Diagnostics used (reusable)

```bash
# what Postmark actually recorded for a message
curl -H "X-Postmark-Server-Token: $TOK" \
  "https://api.postmarkapp.com/messages/outbound?count=5"
curl -H "X-Postmark-Server-Token: $TOK" \
  "https://api.postmarkapp.com/messages/outbound/<id>/details" | jq '{TrackLinks,TrackOpens}'
# who clicked a tracked link (user agent, geo, timestamp)
curl -H "X-Postmark-Server-Token: $TOK" "https://api.postmarkapp.com/messages/outbound/clicks"

# token lifecycle: a surviving row was never successfully presented
npx tsx scripts/sqlq.ts "SELECT identifier, expires, expires > now() AS valid FROM verification_tokens"
# session creation time = expires - 30 days
npx tsx scripts/sqlq.ts "SELECT u.email, s.expires - interval '30 days' AS created FROM sessions s JOIN users u ON u.id = s.user_id"
```

## Mobile nav (same session)

The mobile sheet was rendered *inside* `<header>`, which carries `backdrop-blur`.
`backdrop-filter` makes an element a containing block for fixed-position descendants and
traps their z-index in its stacking context, so the sheet's `fixed inset-0` resolved to
the header's box: tapping the hamburger drew the menu clipped to the header strip. The
sheet is now a sibling of `<header>`. jsdom computes no layout, so the existing suite
could not see this; `site-header-view.test.tsx` now asserts the nesting invariant
directly (verified to fail against the old markup).

## Debt / follow-ups

- Sender is still `no-reply@scenefiend.app` (`SETUP-NEXT-WEEK.md` #3). The code now
  accepts `EMAIL_FROM` or `POSTMARK_FROM_EMAIL`; prod sets only the latter.
- No HTML body on auth email — fine today, but adding one re-opens the open-tracking
  question in finding 3.
- Consider wiring the Vercel Git integration so `main` deploys itself (finding 1).

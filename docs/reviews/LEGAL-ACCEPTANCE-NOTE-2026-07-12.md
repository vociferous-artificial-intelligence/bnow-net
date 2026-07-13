# Legal acceptance sprint — review note (2026-07-12)

Versioned Privacy Notice + Terms of Use, a first-authenticated-login clickwrap acceptance
flow, an append-only acceptance record, and server-side enforcement across every subscriber
surface. **SHIPPED + DEPLOYED 2026-07-13** — merged `--no-ff` to main (`7da22db`), migration 0017
applied to prod (verified), deploy `dpl_tuo9SdmYMNBhYJiG7A6uVMHBVbfh` (aliased bnow.net, rollback
`bnow-iqaszhc0d`), anon prod smoke green. An independent adversarial review passed with no
blocker/major; its minor hardenings were applied (`e62c14e`) — see the "Adversarial review" section.

## What shipped

### Documents (public, unauthenticated, DB-free)
- `/privacy` and `/terms` — Privacy Notice **v1.0** and Terms of Use **v1.0**, effective
  **July 12, 2026**. Supplied copy used substantially verbatim (only mechanical React/link
  adaptations: mailto links, in-document `/terms`↔`/privacy` links, headings, list markup).
- Shared chrome `src/components/legal-document.tsx`: "Back to BNOW.NET", prominent
  version+effective-date header, cross-link, contact mailto, `id="main"`, no DB query, typographic
  primitives (no `@tailwindcss/typography` plugin in this repo). Metadata titles/descriptions set.
- Added to `sitemap.xml`; NOT disallowed in `robots.txt` (they are meant to be indexed).

### Global footer
- `src/components/site-footer.tsx` (server, resolves locale) + `site-footer-view.tsx` (client,
  hides on `/admin` via `usePathname`, mirrors the header's chromeless rule). Links: **Privacy
  Notice · Terms of Use · Status · Contact** (contact = configured `OPERATOR.legalContact`).
- Mounted once in the root layout. The home page's inline `<footer>` was **removed** so the home
  route shows exactly one footer (the global one). Reuses the already-localized `home.footer`
  disclaimer line (keeps the protected "OSINT" literal).

### Sign-in
- `/signin` shows the required 18+ pre-auth disclosure beneath the form, linking `/terms` +
  `/privacy`. Requesting a magic link is **not** the persisted acceptance (only the authenticated
  clickwrap is). Magic-link `redirectTo` moved `/` → **`/welcome/legal?next=/`**.

### First-login acceptance `/welcome/legal`
- Resolves the real session directly (works for a genuine authenticated user regardless of
  `FEATURE_AUTH_GATE`). Already-accepted → redirect to the safe `next`; new/out-of-date → the form.
- Client form: two **required, initially-unchecked** checkboxes (no dark patterns, nothing
  pre-checked); document links open in a **new tab** and are `<a>` (not `<label>`s) so opening one
  never toggles or resets a checkbox; submit "Accept and continue" disabled until both are checked.
- Server action re-validates the session **and** both checkboxes (a forged/incomplete POST is
  rejected server-side); `accepted_at` is **PostgreSQL-generated**; the insert is **idempotent**;
  the `next` destination is guarded by `safeInternalPath` (external/open-redirect → `/`); acceptance
  is DB-derived (no session "accepted" flag), so it cannot be marked before the insert lands; a
  persistence failure shows a clear inline error, no redirect.

### Version config — one source of truth
- `src/lib/legal/policies.ts`: `CURRENT_TERMS_VERSION` / `CURRENT_PRIVACY_VERSION` (`"1.0"`),
  effective date, `ACCEPTANCE_METHOD`, and operator identity (Vociferous.ai · New York ·
  go@vociferous.nyc). No invented LLC/corporation. Bumping a version constant + the copy sends every
  user lacking the new pair back through acceptance.

### Database — append-only record
- Table `policy_acceptances` (Drizzle schema + migration **`drizzle/0017_flashy_photon.sql`**,
  forward of 0016; `9999_claim_source_trigger.sql` still applies last). Columns: `id`, `user_id`
  (text FK → `users.id`, cascade), `terms_version`, `privacy_version`, `accepted_at`
  (timestamptz, `DEFAULT now()`), `adult_attested`, `privacy_acknowledged`, `acceptance_method`
  (default `first_login_clickwrap`), `locale` (nullable). Unique index on
  `(user_id, terms_version, privacy_version)` (idempotency + current-version lookup) + a
  by-user index. **Stores no IP, user-agent, birth date, physical address, or token.** Migration
  made idempotent (`IF NOT EXISTS` / guarded FK) to match the non-transactional `scripts/migrate.ts`.

### Enforcement (server-side, cannot be bypassed by direct navigation)
- `requireAcceptedUser()` (`src/lib/gate.ts`) = authentication **+** current acceptance
  (fail-closed on DB error). Wired into the **layouts** for `/ask`, `/search`, `/entities`,
  `/digests`, and — independently of any page render — the ask **server action** and **`/api/ask`**.
- Signed-in **home** redirects to `/welcome/legal` before any subscriber query or recent-Ask render.
- **/signals** gates its `detail` + evidence on acceptance at the data layer (anonymous **and**
  signed-in-unaccepted both get only the safe teaser; the un-accepted signed-in nudge points at
  `/welcome/legal`).
- **/account** renders the accepted versions + server timestamp (no internal id or method string)
  and redirects to `/welcome/legal?next=/account` if the user lacks current acceptance.
- `requireAdminOr404` redirects a **confirmed admin** who hasn't accepted; non-admins/anonymous keep
  the existing **404**, so the admin-only registry gate is not weakened.
- Public pricing/scoreboard/health/privacy/terms remain public. Cron/service routes are untouched
  (they authenticate via `CRON_SECRET`, not `requireAcceptedUser`). With `FEATURE_AUTH_GATE` off,
  anonymous dev/demo behavior is preserved and no acceptance record is manufactured for anon; a real
  authenticated user is still held to acceptance (identity-scoped, not gate-scoped).

## Factual / truth-in-UI constraints honored
- Privacy Notice states plainly that Ask questions are **stored** (with the account email + usage
  metadata, and sent to OpenAI for embedding/reranking/answering); it never calls questions or
  emails anonymous/pseudonymous/ephemeral. **No** question storage was changed and **no** retention
  cleanup job was added. No certifications, fixed deletion schedule, security guarantee, or
  compliance program is claimed. Stripe is described conditionally. No analytics / cookie-consent
  banner added. No nonexistent corporate entity invented.

## Verification
- `npm run typecheck` — clean. `npm run lint` — clean. `npm run build` — clean (all new routes
  compile: `/privacy`, `/terms`, `/welcome/legal`).
- `npm test` — **1147 unit tests / 97 files green** (was 1053/84; +after the review fixes). New:
  safe-next, acceptance library (idempotency/flags/DB-timestamp/version check/self-assert),
  migration shape, welcome page + form, privacy/terms pages, footer view, account page, requireAdmin
  acceptance paths, plus updated ask/home/signals/signin/gate/seo mocks for the new gate.
- `npm run test:integration` — **green on a disposable Neon branch**, including **5 new
  real-Postgres tests** (`src/integration/legal-acceptance.itest.ts`) that apply 0017 and prove the
  DB-generated `accepted_at`, idempotency (ON CONFLICT → one row, same timestamp), append-only
  version bump, the unique constraint, and FK cascade. Ran DNS-pinned; branch auto-deleted.

## Adversarial review (independent, read-only)
A second agent reviewed the full route/gate topology for acceptance bypass, /signals leak, open
redirect, redirect loops, SQL correctness, fail-open, dev parity, and auth-architecture drift.
**No blocker, no major.** Minor findings applied (`e62c14e`): (1) `requireAdmin` (the `/admin`
console) now also holds a confirmed admin to acceptance; (2) `/ask` page uses `requireAcceptedUser`
so no gated render is auth-only; (3) `recordAcceptance` refuses a non-attesting row
(`invalid_attestation`). Findings left as-is: `/trade` + `/critical-materials` are intentionally
public teasers (pre-existing); the "fails fully closed if 0017 unapplied" note is correct behavior
and is handled by migrate-before-deploy.

## Deploy (executed 2026-07-13)
- **Order = migrate → deploy** (additive/expand migration; deploy-first would fail-closed-lock-out
  every subscriber until the table existed).
- Verified the migrate target = prod (`ep-jolly-glitter…`, head 0016), then `npm run db:migrate`
  applied only 0017; post-verified the table shape/constraints (0 rows).
- Deploy `dpl_tuo9SdmYMNBhYJiG7A6uVMHBVbfh` READY, aliased bnow.net. Rollback target
  `bnow-iqaszhc0d`. Anon prod smoke green (legal pages 200 with v1.0 copy; gated routes 307;
  /signals 0 leaks; robots/sitemap correct; /admin 404; public 200).

## Debt / follow-ups
- **Deploy DONE.** For a future version bump: edit `src/lib/legal/policies.ts` + the copy, generate
  the next forward migration only if the schema changes (a version bump alone needs no migration —
  it just makes existing rows non-current), and keep migrate-before-deploy.
- **i18n**: 4 English-only chrome keys (`footer.privacy/terms/contact`, `signals.evidence.accept_prompt`)
  fall back to English for all locales — fold into the native-review inventory (OPEN-TASKS #59). The
  legal document bodies and the `/welcome/legal` copy are intentionally English-first content.
- Interacts with the earlier OPEN-TASKS #57 (`/pricing` still mentions registry access the product
  no longer grants) and #58 (legal review of named individuals on the signed-in `/signals` view) —
  neither is changed here.

# PostHog product analytics implementation note — 2026-07-14

## Status and isolation

Implementation is complete and fail-closed on branch `codex/posthog-product-analytics` in the
isolated worktree `/home/go/code/bnow.net-posthog`, forked from evidence-trail commit
`24030835f76e1813c0b19ea00f9596de28c71fe0`. The pre-work tag is
`pre-posthog-product-analytics-20260714`; the forward migration is
`drizzle/0020_reflective_karnak.sql`.

**Superseded 2026-07-14 (same day, activation phase 1):** the branch is now MERGED to main
(`e5123a9`, --no-ff), migration 0020 is APPLIED to production, and the merged application is
DEPLOYED keyless (`dpl_DjVLg9RgQdFgAxfpLsRh9ELya5w6`) — see § Production execution results below.
Collection remains fail-closed: no dedicated BNOW PostHog project, project key, or admin/personal
token exists yet (Scenefiend's public project key was deliberately not reused), so
`NEXT_PUBLIC_POSTHOG_KEY` is absent from every Vercel environment and zero telemetry is possible.
Activation is operator-blocked (OPEN-TASKS #67).

## Delivered behavior

- Privacy Notice 1.1 and legal reacceptance add optional, initially unchecked analytics consent.
  Missing, malformed, or unchecked input records `denied`; a stale grant cannot survive
  reacceptance. Acceptance and preference update atomically.
- `users.analytics_preference` is constrained to `unset | granted | denied`, with a preference
  timestamp. The Account page can grant or deny without changing legal-acceptance history.
- Denial, sign-out, or unchecked reacceptance resets and opts out before navigation and broadcasts
  a data-free same-origin reset signal so other open BNOW tabs stop too. An initialization
  generation gate prevents a delayed SDK import from reviving a withdrawn or replaced identity.
- The SDK is dynamically imported only when all gates pass: current legal acceptance, preference
  exactly `granted`, internal UUID identity, valid dedicated public key and Cloud host, Vercel
  Production build, exact `https://bnow.net`, and an approved subscriber route.
- Collection remains disabled on localhost, Preview, deployment domains, anonymous/unaccepted/
  unset/denied sessions, admin/legal/auth routes, malformed configuration, and the current keyless
  deployment.
- Autocapture, pageleave, replay, heatmaps, surveys, tours, dead/rage clicks, performance,
  exceptions, feature flags, experiments, referrer/campaign persistence, device-model capture,
  and external dependency loading are disabled. Persistence is memory-only.
- A final `before_send` boundary reconstructs each payload from an allowlist. It retains only the
  configured `phc_` public project token required by the SDK, an internal UUID, fixed environment
  labels, and the documented coarse fields. SDK-added URLs, referrers, device properties,
  campaigns, and top-level person mutations are discarded.
- Manual pageviews use exact static paths or templates such as `/digests/:theater/:date` and
  `/entities/:id`. Unknown theater values, extra segments, query strings, fragments, and arbitrary
  dynamic path content are rejected.
- Access requests store validated, nullable first-party `utm_source`, `utm_medium`, `utm_campaign`,
  fixed `/access` landing path, and hostname-only referrer in Neon. These values are not sent to
  PostHog; honeypot and one-hour dedupe behavior remain intact.

## Event contract and sanitized examples

Every example also carries only `token: phc_<configured-public-key>`, `distinct_id: <internal-uuid>`,
`environment: production`, and `site_domain: bnow.net`. No email, query/question, claim/source text,
URL, database content ID, full referrer, or arbitrary campaign value is permitted.

| Event | Allowlisted example properties |
|---|---|
| `product_session_started` | `role=analyst`, `beta_cohort=private_beta_2026_07`, `days_since_signup_bucket=3-7`, `entry_surface=digest` |
| `digest_viewed` | `theater=ru`, `digest_age_bucket=today`, `track_count_bucket=2-3` |
| `evidence_opened` | `surface=digest`, `theater=ru`, `source_count_bucket=4+`, `hedging_class=confirmed` |
| `source_link_clicked` | `surface=search`, `theater=ua`, `platform=telegram` |
| `search_completed` | `has_results=true`, `result_count_bucket=6-20`, `window_present=false` |
| `ask_completed` | `state=answered`, `evidence_count_bucket=2-5`, `retrieval_mode=v2`, `window_present=true` |
| `signal_detail_viewed` | `theater=ir`, `signal_type=pressure_spike`, `evidence_count_bucket=6+` |
| `feedback_initiated` | `surface=digest_error`, `theater=ru` |
| `claim_copied` | `surface=entity`, `copy_mode=link`, `theater=ua`, `hedging_class=assessed`, `evidence_count_bucket=2-5` |
| `digest_print_initiated` | `theater=ir`, `print_mode=evidence`, `digest_age_bucket=1-7d` |
| `$pageview` | `normalized_path=/digests/:theater/:date`, `entry_surface=digest`, fixed canonical URL/path only |
| `$identify` | set-on-update `role=analyst`; set-once `signup_at=<ISO timestamp>`, `beta_cohort=private_beta_2026_07` |

`$identify`, manual `$pageview`, and the ten custom events above are the complete network-event
allowlist. Runtime enum validation rejects unknown values even when TypeScript is bypassed.

## Verification evidence

- Baseline: 1,400 unit tests / 117 files; typecheck, lint, and production build green.
- Final gate: typecheck and zero-warning lint green; 1,455 tests / 129 files green; optimized
  keyless production build green.
- Disposable Neon branch: 22 integration tests / 6 files green, including forward migration,
  default preference, grant/deny timestamp, legal-history preservation, attribution nullability,
  and unchanged traceability; disposable branch `br-dark-dew-at5wrg32` deleted afterward.
- Fake-key production build: `phc_BNOW_BUILD_CANARY_20260714` was present in a static browser chunk,
  proving direct `NEXT_PUBLIC_*` substitution rather than a broken runtime `process.env` lookup.
- Keyless production-mode browser checks on `localhost:3014`: anonymous `/`, `/access`, `/signals`,
  `/search`, and `/privacy` loaded without console errors, PostHog scripts, event requests, or flag
  requests. This proves the disabled path; a dedicated project is required for positive Live Events.
- Focused adversarial tests cover forbidden and top-level payload fields, required public token,
  malicious paths, deferred-import revocation, account A→B isolation, excluded-route session
  continuity, cross-tab reset, unchecked reacceptance, sign-out, and preference reversal.

## Dedicated project activation checklist — operator required

Before any key is added:

1. Create a dedicated BNOW project; do not reuse Scenefiend's key or data.
2. Deliberately select the PostHog Cloud processing region and update Privacy 1.1 if the recorded
   choice requires more specific disclosure. The code currently allowlists official US and EU
   ingestion hosts but makes no unverified region claim.
3. Record event/person retention, IP-capture policy, project privacy switches, members/roles,
   billing limit, and data-processing terms.
4. Confirm project-side session replay, autocapture, surveys, heatmaps, error tracking, and remote
   feature collection are disabled in addition to the client controls.
5. Deploy Privacy 1.1 and apply migration 0020 through the normal reviewed migrate-before-deploy
   sequence while `NEXT_PUBLIC_POSTHOG_KEY` remains absent.
6. Add the dedicated public key and matching host to Production only, rebuild/redeploy, and use one
   explicitly opted-in test account for a controlled Live Events inspection.
7. Inspect raw payloads for every allowlisted event and re-prove zero requests for unset/denied,
   anonymous, Preview, deployment-domain, and admin/legal sessions.

## Dashboard specification — pending dedicated project

Create one `BNOW Private Beta` dashboard with these nine saved insights:

1. **48-hour activation funnel:** `product_session_started` → `digest_viewed` → PostHog Action
   `first_value_event` (evidence open, source click, successful Search/Ask, Signals view, or feedback).
2. **Time to first value:** elapsed time from product session to `first_value_event`.
3. **Week-one stickiness:** distinct active days using approved product-activity events.
4. **Week-two retention:** activated users returning on days 8–14.
5. **Digest evidence engagement:** digest viewers → evidence opened/source clicked.
6. **Feature adoption trend:** unique users of digest, evidence, Search, Ask, and Signals.
7. **Search outcomes:** `has_results` versus empty, optionally by result-count bucket.
8. **Ask outcomes:** answered/insufficient/refused/error/limit by evidence-count bucket.
9. **Feedback initiation:** unique users/events by allowlisted surface.

Do not create alerts until traffic supports a meaningful threshold. No dashboard or insight is
claimed as created in this keyless state.

## Rollback and unresolved items

Primary rollback is removing `NEXT_PUBLIC_POSTHOG_KEY` and redeploying; the dynamic SDK then cannot
initialize and product behavior is unchanged. Migration 0020 and the privacy/preference records
remain forward-only and need no rollback.

Unresolved/operator-blocked: project creation, region, retention, IP policy, project settings,
dashboard URLs, positive Live Events evidence, Production migration/deploy/env activation, and
post-activation standing-state updates. `AGENTS.md`, `docs/PROGRESS.md`, and `docs/OPEN-TASKS.md`
remain unchanged because analytics is not deployed or active.

## Production execution results — 2026-07-14 (activation phase 1: merge, migrate, keyless deploy)

Executed by the activation session the same day; every claim below is verified, not assumed.

### Reconciliation and review

- `origin` fetched; remote `codex/posthog-product-analytics` still `ed61d3b` (unchanged);
  merge-base with `origin/main` = `2403083` (the analyst-evidence-trail merge) exactly.
- Migration-slot audit across ALL remote branches: only this branch carries an `0020`;
  origin/main journal head idx 19 (`0019_watery_the_professor`); `9999_claim_source_trigger.sql`
  byte-identical to main's and still lexicographically last in `scripts/migrate.ts`'s sort.
- Production `_migrations` head pre-apply: `0019_watery_the_professor.sql` (2026-07-13).
- **Independent adversarial re-review (read-only, full diff vs base): verdict PROCEED, no P0/P1.**
  All eight audited invariants verified clean (fail-closed collection incl. race/generation
  gates; allowlist-reconstruction sanitizer with template-only `$pageview` paths; product-safety
  try/catch boundaries; append-only acceptance with atomic preference write; additive 0020;
  attribution validation; Search $0 / Ask no-re-execution; no secrets — canaries only, none equal
  Scenefiend's key). Its one P2 was operational, already prescribed by this note:
  **deploying before 0020 would strand every user at `/welcome/legal`** because
  `recordAcceptance`'s CTE references `users.analytics_preference` — the migrate-before-deploy
  order below honored it. P3 notes (cross-device revocation latency until root-layout re-render;
  a pending dynamic import can drop one route's pageview; verify posthog-js option names at
  activation; stale `/welcome/legal` tab can replay preference; one stale comment in client.ts)
  are recorded for the activation pass — none blocks keyless deployment.

### Gates (re-run in the worktree at `ed61d3b`)

- Typecheck green; zero-warning lint green; **1,455 unit tests / 129 files** green.
- Optimized production build green.
- Disposable-Neon integration suite: **22 tests / 6 files** green (branch
  `br-floral-pond-att2b2mp` created and deleted by the runner).

### Merge, migration, deploy

- Merge: `git merge --no-ff` → main `e5123a9`, pushed after the enforced pre-push gate
  (typecheck + lint + 1,455 tests) went green; origin/main == main. (First push attempt failed
  only because the primary checkout's `node_modules` predated the merge — `npm install` brought
  in `posthog-js` 1.399.5, then green.)
- Migration: `npm run db:migrate` against production applied exactly
  `0020_reflective_karnak.sql` (8 statements). Post-verified live: 5 nullable text columns on
  `subscribe_intents` (`utm_source`, `utm_medium`, `utm_campaign`, `landing_path`,
  `referrer_host`); `users.analytics_preference` text NOT NULL DEFAULT `'unset'` +
  `users.analytics_preference_updated_at` timestamptz NULL; CHECK constraint
  `users_analytics_preference_check` = exactly (`unset`,`granted`,`denied`); all 4 existing
  users read `unset`; `subscribe_intents` had 0 rows (nothing to invalidate); `_migrations`
  head = `0020_reflective_karnak.sql`.
- Deploy: **`dpl_DjVLg9RgQdFgAxfpLsRh9ELya5w6`** (`bnow-mx4qnf0m0`), READY, serving on the
  project domain (rollback target: `dpl_33XREqVT41j9Fo3cbzzHSZjqYGk2`). Pre-verified by
  `vercel env ls`: **zero `POSTHOG` variables in any Vercel environment** — the deploy is
  keyless by construction. Post-deploy crons green on the new build (`ingest:x` 18:20Z,
  `ingest:fast` 18:30Z, both ok).

### Browser/network evidence (real Chromium against production)

- **Anonymous:** `/`, `/access?utm_source=Test-Src&utm_medium=email&utm_campaign=beta_wave1`,
  `/signals`, `/privacy`, `/countries/ru` — all 200, **0 PostHog network requests, 0 console
  errors**. The only "posthog" string in served anon HTML is the `PostHogProvider` component
  name inside Next.js flight data (a chunk reference, not a network call); **0 `phc_` tokens
  served**. Access attribution live: hidden fields rendered `utm_source=test-src` (lowercased),
  `utm_medium=email`, `utm_campaign=beta_wave1`, `landing_path=/access` (forced),
  `referrer_host=` (direct nav); an injected junk query param was ignored. No form was
  submitted — 0 `subscribe_intents` rows before and after.
- **Signed-in, unaccepted, preference unset** (the state every existing user is now in):
  a real magic-link sign-in (operator account) landed on `/welcome/legal?next=/` — Privacy 1.1
  forces re-acceptance as designed; the form shows THREE unchecked checkboxes
  (`adult_attested`, `privacy_acknowledged`, and optional `analytics_preference` labeled
  "Allow optional product analytics"); navigation to `/`, `/account`, `/ask` all bounced back
  to `/welcome/legal`; **0 PostHog requests across the authenticated session, 0 console
  errors**. Nothing was accepted or submitted: post-test DB shows all 4 users still `unset`
  and the only `policy_acceptances` row is the historical 1.0 — clickwrap acceptance is a
  human act left to each user.
- Public routes 200 / gated routes 307 / `/admin` 404 — unchanged. Privacy page serves
  Version 1.1 with the PostHog disclosures (and the honest "activation is pending a dedicated
  project" language).
- Not live-testable pre-acceptance (by design, and covered by unit/component tests instead):
  the Account-page preference controls and sign-out form sit behind `requireAcceptedUser`, so
  they become reachable only after a human accepts 1.1. With the key absent, `granted`/`denied`
  differentiation is unobservable anyway — every state is keyless-disabled.

### Rollback state

The currently deployed production build IS the documented rollback state: key absent,
SDK unimportable, product fully functional (proven above). Removing the key after a future
activation returns exactly here; migration 0020 and Privacy 1.1 stay (forward-only, additive).

### Remaining operator actions (tracked as OPEN-TASKS #67)

1. Create the dedicated **BNOW** PostHog project — a deliberate US vs EU Cloud region choice —
   either directly in the PostHog UI or by supplying an org-scoped personal API key (`phx_…`)
   plus the recorded region decision. No such token exists in any authorized env file (verified);
   Scenefiend's public key is the only PostHog credential on this box and must not be reused.
2. In the project: disable IP capture, confirm replay/autocapture/surveys/heatmaps/error
   tracking off at project level, restrict membership, set a billing limit; record region,
   retention, and settings here.
3. Add `NEXT_PUBLIC_POSTHOG_KEY` + matching `NEXT_PUBLIC_POSTHOG_HOST` to Vercel **Production
   only** (readable-plain: `vercel env add NAME production --no-sensitive`), redeploy (build-time
   values), then run the positive Live Events verification with one explicitly opted-in test
   account and the full denial/sign-out/cross-tab/account-switch/Preview/localhost re-tests.
4. Create the `BNOW Private Beta` dashboard (nine insights) + the `first_value_event` Action.
5. Accept Privacy 1.1 on their own account (all existing users re-accept on next visit).

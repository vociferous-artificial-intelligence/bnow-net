# PostHog product analytics implementation note — 2026-07-14

## Status and isolation

Implementation is complete and fail-closed on branch `codex/posthog-product-analytics` in the
isolated worktree `/home/go/code/bnow.net-posthog`, forked from evidence-trail commit
`24030835f76e1813c0b19ea00f9596de28c71fe0`. The pre-work tag is
`pre-posthog-product-analytics-20260714`; the forward migration is
`drizzle/0020_reflective_karnak.sql`.

This branch is **not activated or deployed**. No dedicated BNOW PostHog project, project key, or
admin/personal token was available. Scenefiend's public project key was deliberately not reused.
No Production environment, migration, or runtime state was changed.

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

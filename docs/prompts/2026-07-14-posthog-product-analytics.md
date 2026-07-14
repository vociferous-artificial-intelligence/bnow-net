# BNOW.NET PostHog product-analytics implementation plan

**Prepared:** 2026-07-14  
**Purpose:** Engineering handoff for a separate implementation session  
**Status:** Plan only. No application code has been changed by this planning session.

## 1. Objective and decision

Implement a privacy-constrained PostHog product-analytics layer that answers whether invited
analysts activate, inspect evidence, adopt useful workflows, and return. PostHog is the product-
analytics source of truth. Vercel remains the source of truth for hosting, runtime logs, cron
health, and—if enabled separately—Speed Insights.

Do **not** duplicate every product event into Vercel Web Analytics. Vercel's anonymous page and
traffic reporting is useful, but its product is not designed for identified-user funnels,
retention, paths, lifecycle, or stickiness. Standard Vercel Pro also limits custom events to two
properties and reserves built-in UTM reporting for the Web Analytics Plus add-on. PostHog is the
better fit for this private-beta question set and its current free tier is far above BNOW's likely
event volume.

The implementation must copy the privacy posture—not the application-specific events—from the
existing Scenefiend implementation:

- `/home/go/code/scenefiend/components/providers/posthog-provider.tsx`
- `/home/go/code/scenefiend/lib/analytics/launch-events.ts`
- `/home/go/code/scenefiend/lib/analytics/site-context.ts`
- `/home/go/code/scenefiend/app/privacy/page.tsx`

Relevant official references to re-check at implementation time:

- PostHog Next.js: https://posthog.com/docs/libraries/next-js
- PostHog identification: https://posthog.com/docs/product-analytics/identify
- PostHog insights: https://posthog.com/docs/product-analytics/insights
- PostHog retention: https://posthog.com/docs/product-analytics/retention
- PostHog data controls: https://posthog.com/docs/privacy/data-collection
- PostHog GDPR guidance: https://posthog.com/docs/privacy/gdpr-compliance
- PostHog pricing: https://posthog.com/pricing
- Vercel Web Analytics comparison: https://vercel.com/docs/analytics/limits-and-pricing

## 2. Binding repository rules

Read `/home/go/code/bnow.net/AGENTS.md` completely before acting. Its legal, traceability,
truth-in-UI, spend, migration, publication-safety, and documentation rules are binding.

In particular:

1. Never edit or delete an applied migration. Generate the next forward migration from the
   then-current journal head. `drizzle/9999_claim_source_trigger.sql` remains last.
2. Never send source full text, ISW prose, claim text, Ask text, Search text, source URLs,
   authentication material, or email addresses to PostHog.
3. Analytics failure must never break authentication, page rendering, Search, Ask, legal
   acceptance, or any intelligence workflow.
4. PostHog is not a paid intelligence provider and does not use `SpendGuard`; nevertheless its
   SDK must fail open for the product and fail closed for collection when configuration or user
   permission is absent.
5. Do not enable session replay, broad autocapture, heatmaps, surveys, dead-click capture,
   pageleave capture, automatic error capture, or feature flags in this sprint.
6. Do not add a PostHog personal API key to the application. The public project key is sufficient
   for event capture. Administrative API operations remain manual operator work.

## 3. Isolation and start protocol — mandatory, non-negotiable

This work must run in a new branch and worktree after all currently active work is merged and the
primary checkout is clean.

Suggested names:

- Branch: `20260714-posthog-product-analytics`
- Tag at fork point: `pre-posthog-product-analytics-20260714`
- Worktree: `.workstream/20260714-posthog-product-analytics`

The branch and worktree are a hard requirement, not a suggestion. **After the initial read-only
status/reconnaissance commands, every implementation command must run with the worktree as its
working directory.** Do not edit, install dependencies, format, generate migrations, run tests,
start a dev server, stage, or commit from `/home/go/code/bnow.net`.

Before creating them:

1. Run `git status --short --branch` in `/home/go/code/bnow.net`.
2. Run `git worktree list --porcelain` and `git branch --all --verbose --no-abbrev`. Inspect active
   agent/process working directories if necessary. Confirm that no existing agent owns the proposed
   branch, worktree path, dev port, or next migration slot.
3. Preserve every existing user/agent change. Do not absorb a dirty primary checkout into the
   analytics branch. If the primary checkout is dirty or an active agent is still merging, stop
   after reconnaissance and wait; do not stash, reset, commit, or move another agent's files.
4. Verify `main` and `origin/main`, fetch if network permits, and branch from the intended latest
   commit—not from the historical commit named in this plan.
5. If the suggested branch or worktree already exists, do not reuse or delete it blindly. Inspect
   ownership/state, then choose a collision-free suffix such as
   `20260714-posthog-product-analytics-2` and the matching `.workstream/` directory.
6. Create the tag, branch, and worktree explicitly from the verified fork point. Immediately run
   `git status --short --branch` inside the new worktree and record its absolute path and HEAD in
   the checkpoint.
7. Read `AGENTS.md`, this plan, `docs/PRODUCT-BRIEF.md`, `docs/GTM-STRATEGY.md`,
   `docs/OPEN-TASKS.md`, the current Privacy Notice, and the latest beta implementation note.
8. Run `npm install` only inside the new worktree; its `node_modules` must remain per-worktree.
   Copy `.env.local` only if needed, keep it gitignored, and never reveal or commit its values.
9. Run the baseline gates in the new worktree: `npm run typecheck`, `npm run lint`, `npm test`,
   and `npm run build`. Record the commit and counts in a branch checkpoint.

Do not run a development server in the primary checkout. If browser work needs one, first confirm
the port is unused, then use a distinct port such as `PORT=3014` inside the analytics worktree.
Record the chosen port in the checkpoint so another agent does not claim it.

### Collision protocol during implementation

- Maintain `docs/reviews/POSTHOG-ANALYTICS-CHECKPOINT-2026-07-14.md` on the analytics branch.
  At every atomic commit record: completed workstream, exact next step, last green commit/test
  counts, migration head, env changes, dev port, and unresolved operator decisions.
- Commit only files owned by this workstream. Before every commit, review `git status --short` and
  `git diff --stat`; never stage unrelated files.
- Another branch may generate a migration while this work is active. Immediately before generating
  this workstream's migration, re-check the primary repository's branch/worktree activity and the
  latest `drizzle/meta/_journal.json`. If the migration head has moved, merge current `main` into
  the analytics branch and regenerate this branch's unapplied migration on top of the new head.
  Never resolve a collision by renumbering an applied migration or editing an applied SQL file.
- Never run migrations against Production while another agent is applying schema changes. Dry-run
  on a disposable Neon branch with **both** `DATABASE_URL` and `DATABASE_URL_UNPOOLED` overridden
  and verified first.
- Never deploy from the worktree until all other active release work is reconciled and the operator
  has authorized this deployment. A branch passing tests does not grant authority to merge or
  deploy.
- Before merge, fetch/reconcile any movement in `main`, rerun the full gates, and merge from the
  primary checkout with the repository's normal `--no-ff` procedure. Do not merge while the primary
  checkout contains another agent's uncommitted changes.
- Remove the worktree and branch only after the merge is verified and no process is using the
  worktree. Never delete another agent's worktree.

## 4. Product questions and metric definitions

Instrumentation exists to answer these questions, not to collect activity indiscriminately.

### Primary questions

1. Do invited analysts reach useful evidence within 48 hours of account creation?
2. Do they return on at least three distinct days during their first seven days?
3. Which workflow—digest, evidence expansion, source follow-through, Search, Ask, or Signals—
   correlates with return use?
4. Do digest readers inspect evidence rather than only read generated prose?
5. Are Search and Ask producing usable outcomes or repeated empty/insufficient results?
6. Do users initiate feedback from the surfaces where they encounter problems?
7. Which access-request source/campaign produces an activated analyst, not merely a form submit?

### Definitions

- **Product session:** one `product_session_started` event per browser tab session after an
  authenticated, accepted, analytics-permitted user enters a subscriber surface.
- **First-value event:** the first occurrence of any of:
  - `evidence_opened`,
  - `search_completed` with results,
  - `ask_completed` with `state=answered` and evidence,
  - `source_link_clicked` from a digest or signal.
- **Activated within 48h:** `product_session_started` followed by `digest_viewed` and at least one
  first-value event within 48 hours of the account's `users.created_at` timestamp.
- **Engaged week-one analyst:** product activity on at least three distinct calendar days in the
  first seven days.
- **Week-two retention:** an activated analyst performs a product activity event during days 8–14.
- **Evidence engagement rate:** unique digest viewers who open evidence or follow a source divided
  by unique digest viewers.
- **Search success rate:** `search_completed` events with results divided by all completed searches.
- **Ask useful-answer proxy:** `ask_completed` with `state=answered` and evidence divided by all Ask
  completions. This is not a quality score; interviews still determine actual usefulness.

Analytics cannot determine trust or time saved. Keep the structured Jason/Irina interviews and a
short weekly time-saved/trust pulse as separate research instruments.

## 5. Privacy and consent gate—must precede collection

The current Privacy Notice says BNOW does not use nonessential analytics. PostHog must not be
activated before that statement is corrected and the operator chooses a consent posture.

### Recommended private-beta posture

Use explicit, optional analytics permission for signed-in users. Default is **not granted**.
Analytics permission is independent of required Terms/Privacy acceptance: declining analytics must
not block product access.

Add forward-only user preference fields, using names consistent with the final implementation:

- `analytics_preference text NOT NULL DEFAULT 'unset'`
  - allowed application values: `unset | granted | denied`
- `analytics_preference_updated_at timestamptz NULL`

Do not add IP address, user agent, advertising ID, or consent-token fields.

Add an optional unchecked control to the legal/onboarding flow and a reversible preference on the
Account page. The server action is authoritative. A user may grant or deny analytics without
changing their legal-acceptance record or entitlement. If the control is omitted or the action
fails, preference remains `unset` and no PostHog client initializes.

The Privacy Notice must:

- name PostHog and its purpose;
- state that BNOW uses an internal UUID rather than email as the PostHog identity;
- enumerate the event categories and explicitly excluded content;
- state that replay, heatmaps, broad autocapture, advertising tracking, Ask/Search text, claim
  text, and source URLs are not collected;
- describe the Account-page permission control and deletion request process;
- define a retention posture or point to the configured PostHog retention;
- identify the selected PostHog Cloud region and applicable subprocessors;
- preserve the statement that BNOW does not sell or use data for behavioral advertising.

Because the notice's substance changes, review whether `CURRENT_PRIVACY_VERSION` should move from
`1.0` to `1.1`. The recommended answer is yes. Preserve the existing append-only acceptance model:
a version bump inserts a new acceptance row and requires current users to acknowledge the revised
notice. Do not mutate prior acceptance rows.

If the operator instead chooses default-on/opt-out collection, stop and obtain an explicit recorded
decision and appropriate privacy/counsel review before implementing that alternative. Do not infer
permission from the Vercel or PostHog defaults.

## 6. Architecture

### 6.1 One analytics abstraction

Create a small BNOW-owned analytics layer under `src/lib/analytics/` so product components never
import `posthog-js` directly.

Suggested files and responsibilities:

- `src/lib/analytics/events.ts`
  - typed event-name union;
  - property interfaces;
  - pure event builders;
  - runtime allowlists and bucket helpers.
- `src/lib/analytics/sanitize.ts`
  - URL/query redaction;
  - safe property validation;
  - production-domain/environment context;
  - explicit forbidden-key guard.
- `src/lib/analytics/config.ts`
  - reads public key/host;
  - returns disabled when absent;
  - permits capture only in Production unless a separately documented test switch is set.
- `src/lib/analytics/client.ts`
  - a minimal duck-typed capture/identify/reset interface;
  - emitter that swallows analytics failures;
  - no product logic.
- `src/components/analytics/posthog-provider.tsx`
  - dynamically imports and initializes `posthog-js` only when configuration exists and the
    authenticated user's preference is `granted`;
  - identifies the user and manages route-change pageviews;
  - resets identity on sign-out/preference revocation;
  - renders nothing.
- `src/lib/analytics/identity.ts`
  - cached server helper that resolves the signed-in user to the minimum safe analytics identity.

Use `posthog-js`; do not add `posthog-node` in the first implementation. The authoritative Neon
rows already exist for access requests, legal acceptance, and Ask usage. Client events are a
best-effort analytical projection of user-visible completion states. Avoiding the server SDK also
avoids serverless batching/flush lifecycle complexity and keeps PostHog completely outside money,
auth, legal, and persistence transactions.

### 6.2 Identity

PostHog's `distinct_id` must be `users.id`, the existing random internal UUID. Never use email,
name, LinkedIn URL, session token, or a reversible concatenation of them.

The server identity helper should return only:

```text
distinctId: users.id
role: user | analyst | admin
signupAt: users.created_at
betaCohort: a coarse, non-identifying cohort such as private_beta_2026_07
analyticsPreference: unset | granted | denied
```

Prefer a cached lookup by the authenticated email rather than weakening or expanding any auth
gate. Do not put analytics permission into a JWT; this app deliberately uses database sessions.
If the current Auth.js session already exposes the adapter user ID reliably, pin that behavior with
a test before using it. Otherwise, use the explicit DB lookup.

At identification:

- call `identify(distinctId)` only after permission is granted;
- use `$set_once` semantics where available for `signup_at` and `beta_cohort`;
- update only the coarse `role` property when necessary;
- do not create profiles for anonymous visitors (`person_profiles: 'identified_only'`).

On sign-out, call `posthog.reset()` before or as part of the client-side sign-out interaction so a
subsequent visitor on the same browser is never attributed to the previous account. Revoking
analytics permission must opt out/reset immediately and prevent initialization on the next render.

### 6.3 Initialization configuration

Use the current PostHog SDK's equivalent of this posture, verifying option names against current
official documentation:

```text
person_profiles: identified_only
autocapture: false
capture_pageview: history-change only, after identification/permission
capture_pageleave: false
capture_dead_clicks: false
capture_performance: false
disable_session_recording: true
disable_surveys: true
enable_heatmaps: false
```

Also disable automatic exception capture if the installed SDK version enables it by default. Error
tracking is not part of this sprint.

Use a `before_send`/equivalent sanitizer that returns `null` for any event violating the allowlist.
Analytics must be disabled when:

- project key is absent;
- host is absent/invalid;
- environment is not authorized;
- user is anonymous;
- legal acceptance is incomplete;
- analytics preference is not exactly `granted`.

### 6.4 Environment configuration

Create a dedicated BNOW PostHog project; never reuse the Scenefiend project.

Required public configuration:

- `NEXT_PUBLIC_POSTHOG_KEY`
- `NEXT_PUBLIC_POSTHOG_HOST` (`https://us.i.posthog.com` or the deliberately selected EU host)

Key absence is the kill switch. Do not add a second enable flag unless it has a concrete rollback
benefit beyond removing the key.

Recommended rollout:

- Development: key absent.
- Preview: key absent initially. If live-event verification requires Preview, use a separate test
  project/key, never the Production project.
- Production: add only after the privacy/version/permission flow is deployed and verified.

In PostHog project settings:

- disable IP capture;
- confirm autocapture and session recording are off at project level as defense in depth;
- restrict project membership;
- set a billing limit even though the beta is far below the free tier;
- record the chosen region and retention setting in the implementation note.

## 7. Data minimization and URL sanitization

Every event must pass through the same property allowlist. Event builders accept only declared
properties; no arbitrary `Record<string, unknown>` should reach PostHog from product components.

Globally forbidden properties and values:

- email, name, LinkedIn URL, IP, user agent;
- `q`, `question`, `query`, `search_text`, Ask text;
- claim/event text, entity names, person names, source names;
- full external URLs, Telegram handles, X handles;
- claim IDs, raw-document IDs, source IDs, database row IDs other than the internal user UUID used
  solely as PostHog `distinct_id`;
- auth/session/verification tokens;
- exact LLM prompt, response, or evidence content.

Pageview sanitization:

- strip all query parameters from `/ask`, `/search`, `/signin`, auth callbacks, magic-link/error
  routes, `/welcome/legal`, and any URL that can contain a token or user-provided text;
- strip fragments;
- normalize dynamic digest URLs to safe route properties while retaining coarse theater/date where
  useful;
- never send the full referrer if it contains a query string;
- include `environment=production` and canonical `site_domain=bnow.net`/project domain context;
- drop events from localhost, Preview, deployment URLs, and `/admin` in the Production project.

Use coarse buckets instead of revealing exact analytical behavior where detail is unnecessary:

- result count: `0 | 1-5 | 6-20 | 21+`
- evidence count: `0 | 1 | 2-5 | 6+`
- source count: `1 | 2-3 | 4+`
- digest age: `today | 1-7d | older`

## 8. Event contract

Only the following named product events ship initially. `$pageview` is permitted after identified
opt-in and sanitization; broad DOM autocapture remains off.

| Event | Emit when | Allowed properties | Do not emit when |
|---|---|---|---|
| `product_session_started` | Once per tab session after identify on an accepted subscriber surface | `role`, `beta_cohort`, `days_since_signup_bucket`, `entry_surface` | anonymous, admin route, preference not granted |
| `digest_viewed` | A digest detail page has successfully rendered to the user | `theater`, `digest_age_bucket`, `track_count_bucket` | loading/error/redirect |
| `evidence_opened` | User opens a previously closed evidence disclosure | `surface`, `theater`, `source_count_bucket`, `hedging_class` | disclosure closes or initializes already-open |
| `source_link_clicked` | User deliberately follows a source chip/link | `surface`, `theater`, `platform` | programmatic navigation/prefetch |
| `search_completed` | Search results or honest empty state render after a submitted query | `has_results`, `result_count_bucket`, `window_present` | page has no query or search errors before result |
| `ask_completed` | Ask action returns a final UI state | `state`, `evidence_count_bucket`, `retrieval_mode`, `window_present` | pending/retry transition; never include question |
| `signal_detail_viewed` | Accepted user sees gated signal detail/evidence | `theater`, `signal_type`, `evidence_count_bucket` | public teaser-only render |
| `feedback_initiated` | User clicks a feedback mailto/control | `surface`, `theater` when applicable | never call it submitted/sent; mailto delivery is unknowable |

Implementation notes:

- Use session storage or an in-memory session guard so `product_session_started` emits once per tab,
  not on every route.
- View events should emit once per navigation key, not on React re-render.
- `evidence_opened` listens to the disclosure's real open transition. Preserve native
  `<details>/<summary>` accessibility.
- Do not turn large server components into client components merely for analytics. Add tiny
  event-only client boundaries around the interaction or render-complete marker.
- `ask_completed` must instrument the existing server-action state transition without changing
  the paid GET/action architecture or causing re-execution.
- `search_completed` must not write `ask_usage`, call an LLM, or otherwise weaken Search's `$0`
  invariant.
- Existing Neon `ask_usage` remains authoritative for costs and exact outcome counts. PostHog is
  used to join Ask to the broader product journey.

## 9. Access-request attribution

PostHog collection begins only after identified permission, so acquisition attribution remains
first-party in Neon. Fix the current `source='access_form'` blind spot in the same sprint.

Add explicit nullable attribution fields to `subscribe_intents` through the next forward migration:

- `utm_source`
- `utm_medium`
- `utm_campaign`
- `landing_path`
- `referrer_host`

Do not store an arbitrary referrer URL or arbitrary query string.

Requirements:

- `/access` accepts only `utm_source`, `utm_medium`, and `utm_campaign` from its query string;
- trim, lowercase where appropriate, cap each value (for example 100 characters), and allow only a
  conservative set of characters;
- hidden form values are untrusted and revalidated in the server action;
- `landing_path` must be a known internal path, normally `/access`;
- `referrer_host` is hostname only, never path/query/fragment/credentials;
- retain `source='access_form'` for the route/channel and use the new columns for attribution;
- honeypot and one-hour dedupe behavior remain unchanged;
- do not echo attribution values to the requester;
- show safe attribution columns in `/admin/access` so qualified-request source can be reviewed;
- no PostHog identifier is needed for anonymous requesters.

This lets the operator join campaign → request → approved email/user in Neon and then use the
coarse `beta_cohort` in PostHog for post-login behavior without sharing email with PostHog.

## 10. Components and routes to inspect

The implementing agent must inspect current versions before editing; the list below reflects the
2026-07-14 structure and may have moved.

- Root/provider/identity:
  - `src/app/layout.tsx`
  - `src/lib/auth.ts`
  - `src/lib/session.ts`
  - `src/lib/gate.ts`
  - `src/components/site-header.tsx`
  - `src/components/site-header-view.tsx`
- Legal/permission:
  - `src/app/privacy/page.tsx`
  - `src/lib/legal/policies.ts`
  - `src/lib/legal/acceptance.ts`
  - `src/app/welcome/legal/*`
  - `src/app/account/page.tsx`
  - `src/db/schema.ts`
- Access attribution:
  - `src/app/access/page.tsx`
  - `src/app/access/access-form.tsx`
  - `src/app/access/actions.ts`
  - `src/app/admin/access/page.tsx`
- Product events:
  - `src/app/digests/[country]/[date]/page.tsx`
  - `src/components/claim-sources.tsx`
  - `src/app/search/page.tsx`
  - `src/app/ask/*`
  - `src/app/signals/page.tsx`
  - feedback-link components/usages
- Tests:
  - corresponding `*.test.ts` / `*.test.tsx`
  - migration tests and integration tests

## 11. Implementation sequence

### Workstream A — baseline and event specification

1. Confirm repository state and branch isolation.
2. Reconcile this event contract against the current UI and data flow.
3. Record any necessary event-name/property changes before wiring components.
4. Create the checkpoint with baseline gates and migration head.

### Workstream B — legal preference and forward migration

1. Add analytics-preference fields to `users` and attribution fields to `subscribe_intents` in
   schema.
2. Generate one forward migration from the current journal head; never hand-renumber an applied
   migration.
3. Add real-Postgres integration coverage for defaults, preference updates, old-row preservation,
   and nullable attribution.
4. Add optional legal/onboarding preference and Account-page update action.
5. Update the Privacy Notice and version constant after operator approval.
6. Prove that `unset` and `denied` users get no PostHog initialization.

### Workstream C — analytics core and provider

1. Add `posthog-js` at the current stable version.
2. Implement typed event builders, sanitizer, configuration, duck-typed client, identity helper,
   and provider.
3. Dynamically import the SDK only for granted, identified users.
4. Implement identify and sign-out/preference-reset behavior.
5. Add route/pageview redaction and production-only filtering.
6. Keep all analytics failures non-fatal.

### Workstream D — access attribution

1. Carry allowed UTMs from `/access` to the form.
2. Revalidate and persist attribution in the server action.
3. Show safe attribution in the admin review table.
4. Preserve honeypot, dedupe, notification, accessibility, and no-address-oracle behavior.

### Workstream E — product-event wiring

Wire events one surface at a time, committing each coherent group with focused tests:

1. product session and safe pageviews;
2. digest view, evidence open, source follow-through;
3. Search outcome;
4. Ask outcome;
5. gated Signals view;
6. feedback initiation.

Do not add speculative events beyond the approved contract merely because a component is already
being edited.

### Workstream F — PostHog project and dashboards

After event payloads are locally verified, configure the dedicated PostHog project and create:

1. **48-hour activation funnel**
   - `product_session_started`
   - `digest_viewed`
   - PostHog Action `first_value_event` grouping the approved first-value events
2. **Time to first value** from session start to `first_value_event`.
3. **Week-one stickiness**: distinct days with any approved product-activity event.
4. **Week-two retention**: activated cohort returning on days 8–14.
5. **Digest evidence engagement**: digest viewers → evidence opened/source clicked.
6. **Feature adoption trend**: digest, evidence, Search, Ask, Signals by unique user.
7. **Search outcomes**: has-results vs empty.
8. **Ask outcomes**: answered/insufficient/refused/error/limit, broken down by evidence bucket.
9. **Feedback initiation** by surface.

Save them to one `BNOW Private Beta` dashboard. Avoid alerts until there is enough traffic for a
meaningful threshold.

### Workstream G — verification, deploy, and handoff

1. Run all local gates and disposable-Neon integration tests.
2. Perform browser/network payload inspection with a test key/project.
3. Deploy code with the Production key absent and verify byte-equivalent no-analytics behavior.
4. Apply the forward migration through the normal reviewed migration process.
5. Confirm privacy/version/permission UI in production.
6. Add the Production PostHog public key/host only after steps 1–5 pass.
7. With operator authorization and an opted-in test account, perform one controlled product flow
   and inspect PostHog Live Events.
8. Verify that an unset/denied account produces zero PostHog network requests.
9. Write the final implementation note, correct standing state, and append the decision log only
   after deployment is proven.

## 12. Test plan

### Unit tests

- configuration disabled when either key or host is absent;
- non-Production environment disabled by default;
- every event builder returns only allowed keys and bucketed values;
- sanitizer removes `q`, questions, query strings, fragments, tokens, full referrers, and external
  URLs;
- sanitizer drops events containing forbidden keys;
- PostHog exceptions are swallowed without changing product results;
- identify uses internal UUID and never email;
- unset/denied preference never imports/initializes the SDK;
- granted preference initializes once;
- sign-out and revocation reset/opt out;
- product session emits once per tab session;
- view events emit once per navigation, not re-render;
- evidence event emits on open only;
- Ask event does not contain question/citation/source data and does not re-run Ask;
- Search event does not contain query text and preserves the no-paid-pipeline invariant;
- mailto event is named `feedback_initiated`, never `feedback_submitted`;
- UTM/referrer validation rejects overlong, credentialed, query-bearing, or malformed values;
- access dedupe/honeypot behavior remains unchanged.

### Integration tests

On a disposable Neon branch, with both database URLs deliberately pointed at that branch:

- forward migration applies after the current head;
- pre-existing users default to `analytics_preference='unset'`;
- preference grant/deny updates timestamp without modifying legal-acceptance history;
- old access-request rows remain valid;
- new attribution fields accept validated nullable values;
- no traceability trigger or intelligence table changes.

### Browser acceptance matrix

1. Anonymous landing/access:
   - no PostHog SDK/network request under identified-opt-in mode;
   - access request retains approved attribution fields in Neon;
   - no query or email reaches PostHog.
2. Signed in, preference unset:
   - full product works;
   - no PostHog SDK/network request.
3. Signed in, preference denied:
   - same as unset;
   - preference survives navigation and sign-in.
4. Signed in, preference granted:
   - PostHog initializes once;
   - internal UUID identifies the profile;
   - expected events appear exactly once;
   - payload inspection confirms no forbidden content.
5. Ask/Search:
   - questions/queries never appear in request URL sent to PostHog, event properties, or person
     properties;
   - Ask billing/usage rows remain exactly one per submitted action;
   - Search remains $0 and writes no Ask usage.
6. Sign out:
   - identity resets before subsequent anonymous navigation;
   - next user on the same browser is not merged into the previous profile.
7. Account preference reversal:
   - granting begins collection after explicit action;
   - denying immediately stops collection and resets the client.

## 13. Acceptance criteria

The sprint is complete only when all of the following are true:

1. PostHog is a dedicated BNOW project and its project-level privacy settings are recorded.
2. Analytics cannot initialize for anonymous, unaccepted, unset, denied, unconfigured, or
   unauthorized-environment sessions.
3. Identified events use only `users.id`; no email or user-provided intelligence content appears in
   captured payloads.
4. Autocapture, replay, heatmaps, surveys, dead clicks, pageleave, automatic errors, performance
   capture, and feature flags are off.
5. All eight approved event types emit according to their exact contracts and no others were added
   without documented approval.
6. Ask and Search behavior, costs, gates, and persistence remain unchanged.
7. Access requests store safe campaign attribution in Neon without weakening spam/dedupe/privacy
   controls.
8. The revised Privacy Notice and optional preference flow are deployed before the Production key
   is present.
9. The `BNOW Private Beta` PostHog dashboard contains the nine specified insights.
10. Typecheck, lint, unit tests, build, and disposable-Neon integration tests pass.
11. Browser/network inspection proves both positive capture and zero-request opt-out cases.
12. A rollback has been tested conceptually: removing `NEXT_PUBLIC_POSTHOG_KEY` and redeploying
    stops all collection without affecting the application or requiring a database rollback.

## 14. Explicit non-goals

- Session replay, heatmaps, surveys, experimentation, feature flags, error tracking, LLM
  observability, or PostHog data warehouse connections.
- Sending Ask/Search/claim/source content to PostHog.
- Replacing `ask_usage`, `provider_usage`, `cron_runs`, Vercel logs, or Neon as operational sources
  of truth.
- Building a home-grown product-event table in Neon.
- Purchasing Vercel Web Analytics Plus.
- Automated marketing email or CRM workflows.
- Advertising-pixel integrations or cross-site behavioral tracking.
- Group/company analytics; revisit only after BNOW has multi-user customer organizations.

## 15. Rollback and failure semantics

Primary rollback is configuration-only:

1. Remove `NEXT_PUBLIC_POSTHOG_KEY` from Production.
2. Redeploy.
3. Verify no PostHog script or event request appears.

The database preference/attribution columns and revised Privacy Notice remain; do not reverse an
applied migration. Analytics helpers must tolerate missing SDK/configuration indefinitely. A
PostHog outage, ad blocker, CSP block, or malformed response must lose only telemetry—not product
functionality.

## 16. Final handoff artifacts

The implementing session should leave:

- a dated implementation note under `docs/reviews/`;
- exact branch/commit/deployment and migration identifiers;
- before/after dependency and environment inventory;
- test counts and disposable-Neon branch evidence;
- sanitized example payloads for every event;
- browser evidence for granted and denied users;
- PostHog project privacy-setting checklist;
- links/names for the nine saved insights/dashboard;
- rollback instructions;
- unresolved legal/operator decisions;
- corrected `AGENTS.md`, `docs/OPEN-TASKS.md`, and `docs/PROGRESS.md` state only after production
  activation is actually verified.

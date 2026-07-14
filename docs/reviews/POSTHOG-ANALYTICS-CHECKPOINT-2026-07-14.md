# PostHog analytics workstream checkpoint — 2026-07-14

## Workstream identity

- Worktree: `/home/go/code/bnow.net-posthog`
- Branch: `codex/posthog-product-analytics`
- Fork point / initial HEAD: `24030835f76e1813c0b19ea00f9596de28c71fe0`
- Fork-point tag: `pre-posthog-product-analytics-20260714`
- Base: remote `main` after the analyst evidence-trail workstream
- Reserved browser port: `3014`

The primary checkout at `/home/go/code/bnow.net` remains owned by another workstream and was not
used for installation, generation, tests, or edits. This worktree has its own `node_modules` and a
gitignored copy of BNOW's `.env.local`. Scenefiend's PostHog public key was deliberately not copied:
it belongs to a different product, and no PostHog personal/admin token was present to provision a
dedicated BNOW project.

## Baseline

- Migration journal head: `0019_watery_the_professor`; `9999_claim_source_trigger.sql` remains last.
- `npm run typecheck`: green.
- `npm run lint`: green.
- `npm test -- --run`: **1,400 tests / 117 files** green.
- `npm run build`: green (Next.js 16.2.10 production build).
- Port `3014`: unclaimed at checkpoint time.

## Reconciled implementation contract

The implementation uses explicit optional consent, defaults to no collection, and bumps the
Privacy Notice to 1.1. A missing, malformed, or unchecked permission is `denied` at acceptance time;
an existing grant cannot survive a 1.1 re-acceptance unless the optional box is checked again.

The event allowlist contains ten custom events: the plan's eight events plus the two already
approved by the evidence-trail design (`claim_copied` and `digest_print_initiated`). Manual
`$pageview` and `$identify` are the only permitted PostHog system events. Every event uses closed,
coarse properties; no question/query, claim/source text, source URL, database content identifier,
email, or arbitrary UTM value may reach PostHog.

SDK initialization is permitted only for an accepted, signed-in user with preference exactly
`granted`, a dedicated key and valid PostHog Cloud host, Vercel Production metadata, and the exact
canonical browser hostname `bnow.net`. Localhost, Preview, deployment URLs, and `/admin` are denied.
Key absence is the rollback and the current state.

## Implementation checkpoint

The forward migration, legal preference, access attribution, consent-gated SDK boundary, ten
custom events, manual pageviews, minimized identity, payload sanitizer, and cross-tab reset are
implemented. Local unit/type/lint/build, fake-key bundle substitution, keyless browser checks, and
disposable-Neon integration gates are green. See
`docs/reviews/POSTHOG-ANALYTICS-IMPLEMENTATION-NOTE-2026-07-14.md`.

The exact next step is operator review of this branch, followed by the documented
migrate-before-deploy activation sequence with the Production public key still absent.

## Operator-blocked items

- Dedicated BNOW PostHog project, public project key, region, retention, project IP policy,
  project-level privacy switches, membership, and billing limit.
- Nine saved dashboard insights and positive Live Events verification.
- Production migration, deploy, environment changes, and activation.

Those items require the dedicated project/operator settings. Until then, code must remain
fail-closed for collection and no Scenefiend telemetry may be mixed into BNOW.

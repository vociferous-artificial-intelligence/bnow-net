# Roadmap 02 — integration landing: verify, merge, migrate, staged deploy

Lands the three reviewed-but-undeployed bodies of work — the cloud-model-routing branch,
the quality-foundation integration, and the conflict-evaluations integration — into
production in two soaked steps, with the deferred migrations generated on the real base.
This prompt is mostly verification and sequencing discipline; it builds almost nothing new.

## Read first

`AGENTS.md` · `docs/CURRENT-STATE.md` · `docs/OPEN-TASKS.md` · both programs' final
integration reports and ALL final independent review reports ·
`docs/reviews/QUALITY-FOUNDATION-INTEGRATION-2026-08-17.md` ·
`docs/reviews/CONFLICT-EVALUATION-INTEGRATION-2026-08-17.md` ·
`docs/reviews/CLOUD-MODEL-ROUTING-SEAMS-2026-08-17.md` · roadmap 01's completion note
(pricing reconciliation across branches) · every migration + journal file.

## Launch preconditions — verify, do not infer

1. Both programs returned a terminal status. For each: final independent reviews PASS (or
   PASS-WITH-MINORS with dispositions) on ONE exact integration SHA. Never infer
   completion from branch names, commit counts, or report existence — read the reviewer
   verdicts and confirm the SHAs match the branch tips.
2. If either program is `integration-blocked` / `review-gate-blocked` / unfinished:
   perform only the read-only status audit, report `base-not-ready` naming the exact
   unfinished gate, and stop.
3. Record whether `origin/main` advanced past the programs' bases; if so, follow the
   conflict program's three-way merge forecast rather than improvising.

## Authorization boundaries

Authorized, each as a separate operator-confirmed step: merges to `main` following the
programs' own proposed PR decomposition; generating and applying the deferred forward
migrations (additive only, 9999 last, prod backup branch first, migrate BEFORE deploy);
two production deploys with named rollback targets; removal of expired override envs;
release-checklist adoption. Not authorized: paid provider calls; enabling ANY new feature
flag; setting `MAP_MODEL` or adding registry models; editing either program's worktree
content beyond mechanical merge-conflict resolution (documentation EOF conflicts:
preserve both narratives chronologically; substantive runtime conflicts: stop and report).

## Sequence

### Step 1 — merge plan and migrations

- Produce a written merge plan from the programs' proposed PR decompositions; operator
  approves it before any merge.
- Reconcile roadmap 01's pricing fix across all branches (single source of truth wins).
- Generate the conflict workstream's deferred migrations on the actual integration base;
  prove uniqueness/idempotency on a disposable Neon branch, not with mocks.
- Full gates on the merged tree: typecheck, lint, full unit suite, production build with
  non-contact dummy config, full disposable-Neon integration suite, zero-provider-contact
  CLI smokes, the source scans both programs' final gates define (maxRetries: 0;
  reserve-then-meter ordering; no secrets/prose/paid results committed).

### Step 2 — deploy routing + quality foundation; soak

- Deploy from a plain clone or with `VERCEL_GIT_COMMIT_SHA` set (#78) after a clean-tree
  check; verify `/health` stamps the commit.
- `MAP_MODEL` stays unset; the non-baseline map activation lock stays engaged.
- Soak verification over ≥24h of scheduled runs: map cycles run on the durable lease
  (lease outcomes visible in `cron_runs.counts`; zero advisory-lock holders in
  `pg_locks`; #77 closed in OPEN-TASKS only on this evidence); funnel and recency
  reports run read-only against production; digests/validation byte-equivalent behavior
  wherever the programs promised default equivalence.

### Step 3 — deploy conflict surfaces feature-off; soak

- Default-identical proof: every conflict route returns `notFound()` before data access
  (bare GET and `RSC: 1`), no nav/sitemap/metadata leakage, current scoreboard unchanged,
  no new runtime DB dependency on the feature-off path.

### Step 4 — release hygiene closeout

- Codify the release checklist (#39/#78) in `docs/` and reference it from AGENTS.md's
  maintenance section within budget; remove the expired map-cap override envs; regenerate
  `VERCEL_TOKEN` (operator); update CURRENT-STATE.md in place; append ONE decision-log
  entry recording what became live.

## Review gate

Two fresh reviewers on the final pre-deploy tree: (1) safety/operations — migration
safety, lease/spend/metering regressions, deployment-default equivalence, secret
exposure; (2) methodology — that nothing in the merge silently enabled scoring paths,
snapshots, or models the programs left off. Fix BLOCKER/MAJOR; re-review; deploy only on
the reviewed SHA.

Return `implementation-pass / deploy-awaits-operator-confirmation` per step; final status
`landed / soaking` with exact deploy IDs, or `base-not-ready` / `review-gate-blocked`.

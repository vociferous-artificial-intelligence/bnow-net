# Coding-agent prompt — beta invite UX, attributed signals, and self-healing X ingestion

Work in `/home/go/code/bnow.net`. Read `AGENTS.md` completely before changing anything and obey
all standing rulings, especially source traceability, truth-in-UI, publication safety, fail-closed
spend controls, additive migrations, and standing-document maintenance. Preserve unrelated
working-tree changes. Use a fresh coding-agent session and an isolated branch/worktree from current
`origin/main`; do not carry the prior long OpenSanctions context into this work.

## Objective and operator decisions

Ship three coordinated private-beta improvements:

1. Clearly tell users that a magic sign-in link is single-use and must be opened in the browser
   where they want to use BNOW.NET. If their email client would open a different default browser,
   they should copy the unvisited URL from the email and paste it into their preferred browser.
2. Show accepted private-beta users the full qualifying signal detail, including named individuals,
   exact claims, hedging, and source links. Keep anonymous/crawler output at the existing safe teaser.
   Make the source-attribution limitation explicit in the Signals UI and Terms.
3. Make the live X feed self-recover from a parked watermark without repeatedly paying for the
   same fixed backlog, and alert the operator when X is unhealthy or recovers.

The operator has already made these decisions; do not reopen them as product questions:

- Production sign-in mode is **invite**.
- Accepted beta reviewers may see named-person signal evidence. The product reports what cited
  sources say; inclusion is not BNOW's endorsement, accusation, opinion, or independent assertion
  that a claim is true.
- Anonymous visitors must still receive no names, exact claims, source URLs, dollar figures, or
  target/flow lists from `/signals` server-rendered HTML.
- X means the existing third-party **api.twitterapi.io** adapter (`x_api`), not the official X API.
- Fixing X must remain non-lossy, insert-gated, lease-serialized, and spend-bounded.

## Current production state

- `SIGNIN_MODE=invite` was set in Vercel Production and read back on 2026-07-15.
- Existing eligibility is intentional: any existing `users` row, an `ADMIN_EMAILS` address, or an
  approved `subscribe_intents` request receives a real link. A pending access request does not.
- Five existing users were verified before the flip; zero requests were approved and one was
  pending. Do not alter this eligibility model or create users merely to grandfather them.
- Production was redeployed from main `426c627` as
  `dpl_DzTtLPHVCrqbDZsLKqag5bNmndz8`, READY and aliased to `bnow.net`. The application code is the
  already-tested OpenSanctions release plus later documentation commits; the environment change is
  the only functional delta in that deploy.
- Existing magic-link email text already says the link "works once" and expires in 24 hours, with
  Postmark link/open tracking disabled. The missing part is practical preferred-browser guidance
  and matching confirmation-page guidance.
- Accepted users already see exact claim text, hedging, and `ClaimSources` on `/signals`. The purge
  detector's `detail` intentionally omits the qualifying names because an earlier counsel decision
  was pending. That decision is now resolved by the operator in favor of showing names to accepted
  users with prominent attribution and uncertainty language.
- The Terms already warn that open-source reporting and automation can be false or mistaken and
  that source claims are not independently verified. Add the named-person rule explicitly instead
  of relying on readers to infer it.
- X historical recovery is complete. The remaining defect is steady-state recovery after a long
  pause: the five-page-per-batch ceiling makes the pass incomplete and correctly holds the
  insert-gated watermark, but every hourly retry starts from that old watermark and re-bills the
  same prefix. This was observed after an approximately eight-hour daily-cap pause.

Implementation and tests must make **zero paid production calls**. Do not manually invoke
twitterapi.io, LLM, OpenSanctions, or another paid provider while building or testing. A production
deploy is allowed only after the complete gate below passes. Do not activate a new numeric spend
allowance or run a manual catch-up without separate operator approval; ordinary scheduled X calls
remain under the already-configured X caps.

## Workstream A — magic-link one-use and preferred-browser guidance

Relevant files:

- `src/app/signin/page.tsx`
- `src/app/signin/page.test.tsx`
- `src/lib/email/magic-link.ts`
- `src/lib/email/email.test.ts`
- `src/lib/auth.ts` (`maxAge: 24 * 60 * 60`)
- `src/lib/auth-delivery.ts`

Update both the email and the `/signin?sent=1` confirmation. Recommended substance, adjusted for
good concise copy:

> This sign-in link can be used once and expires in 24 hours. Open it in the browser where you want
> to use BNOW.NET. If your email app uses a different default browser, copy the unvisited link and
> paste it into your preferred browser before opening it anywhere else.

Requirements:

- Say **single-use** or **used once**, not merely "secure link."
- Make the ordering unambiguous: copy the URL before it has been opened. Opening it in one browser
  consumes it; it cannot then be reopened in another browser.
- Do not claim the same-device restriction is stronger than it is. A user may copy an unvisited URL
  to another device/browser; the important rule is that only the first successful open works.
- Preserve the generic sent confirmation for invited and non-invited addresses. Do not create an
  invite-eligibility oracle.
- Preserve the 24-hour expiration, callback target, legal-acceptance redirect, and explicit
  `trackLinks: "None"` / `trackOpens: false` protection.
- Do not make the callback token multi-use and do not expose it to analytics, logs, or query
  instrumentation.
- If the sign-in page remains hard-coded English, do not expand this task into a partial i18n
  refactor; record the new copy in the existing native-review inventory if appropriate.

Tests must prove the email contains the callback URL verbatim, one-use/24-hour language, and the
copy-before-opening preferred-browser instruction; the sent page must communicate the same rule;
invite-ineligible and eligible requests must still produce the same browser response.

## Workstream B — full source-attributed signal detail for accepted invitees

Relevant files:

- `src/lib/analyst/signals.ts`
- `src/lib/analyst/signals.test.ts`
- `src/app/signals/page.tsx`
- `src/app/signals/page.test.tsx`
- `src/i18n/dictionaries.ts` and reviewed catalogs only as needed
- `src/app/terms/page.tsx`
- `src/lib/legal/policies.ts`
- legal page/policy/gate tests

### Access boundary

Keep the current three-state behavior:

1. anonymous: aggregate headline/evidence count only;
2. signed in but lacking current legal acceptance: the same teaser plus the acceptance prompt;
3. signed in with current legal acceptance: full detail, names, exact evidence claims, hedging,
   source links, copy actions, and existing analytics marker.

Do not remove `toPublicSignal`, weaken the accepted-user check, put gated values in anonymous HTML,
or make `/signals` entirely public. Preserve `robots.txt` posture and the data-layer boundary; CSS
hiding is not an acceptable substitute.

### Named-person detail

For the purge/elite-pressure detector:

- Retain every semantic-integrity safeguard: person-only entity kind, audited pressure roles/text,
  canonical identity folding, unique claim IDs, window and minimum-count thresholds, and the
  qualification that the automated cluster is not proof of a coordinated campaign.
- Include the display names of **all distinct qualifying canonical people** in accepted-user
  detail, deterministically ordered. Do not cap a small current list in a way that silently omits
  qualifying people. If a UI length safeguard is necessary, render the complete set in an expanded
  accepted-only block rather than dropping names.
- Choose one stable human-readable representative per canonical identity and test aliases so
  `Ali Khamenei` variants do not appear as three people.
- Keep names out of `headline`; `toPublicSignal` exposes that headline to anonymous users.
- Do not restore the old unsupported phrase "possible factional purge" or imply coordination as
  fact. A suitable detail shape is: reported pressure actions + qualifying names + claim count +
  automated-pattern/not-confirmed-campaign qualification + direction to the hedged source evidence.
- Exact evidence already appears below the detail. Preserve source URLs, hedging chips, dates, and
  the rule that a claim must have at least one raw-document source.

### Attribution/disclaimer

Add a plainly visible disclaimer on the accepted Signals view, close to the signal results, with
substance equivalent to:

> Named individuals appear because cited open sources identify them. BNOW reports and attributes
> those source claims; inclusion is not BNOW's endorsement, accusation, opinion, or independent
> assertion that a claim is true. Review the linked evidence, hedging, and source context.

Also add the same rule, in durable legal prose, to Terms §9. This is a material Terms change:

- bump `CURRENT_TERMS_VERSION` from 1.0 to the next version;
- set the Terms effective date to the actual production rollout date;
- update comments/tests and verify returning users are routed through re-acceptance;
- do not change Privacy 1.2 merely because Terms changes;
- preserve historical `policy_acceptances`; no update/delete/backfill and no migration should be
  required.

The UI notice supplements the Terms; it does not replace source-level hedging or the publication
guard. Do not weaken standing ruling 19 or broaden the detector to non-qualifying people.

Tests must prove:

- all qualifying canonical people appear once for an accepted user;
- aliases do not inflate or duplicate the name list;
- anonymous and unaccepted HTML contains none of those names, detail text, exact claims, or source
  URLs and performs no evidence query;
- accepted users still receive exact claims, hedging, and human-readable sources;
- the visible disclaimer and Terms contain the attribution/non-endorsement rule;
- the Terms-only version bump forces current acceptance without changing the Privacy version.

## Workstream C — self-healing X/twitterapi.io ingestion and alerts (#38 + #66)

Relevant files:

- `src/lib/adapters/x-api.ts`
- `src/lib/adapters/x-api.fetch.test.ts`
- `src/lib/adapters/x-gap-backfill.ts`
- `src/lib/adapters/x-gap-backfill.test.ts`
- `src/lib/usage/x-lease.ts` and tests
- `src/lib/usage/spend-guard.ts`
- `src/lib/ingest/run.ts`
- `src/app/api/cron/ingest/route.ts` and route tests
- `src/lib/email/send.ts`, `src/lib/feedback.ts`
- `scripts/x-gap-backfill.ts`
- `docs/reviews/X-GAP-RECOVERY-RUNBOOK-2026-07-13.md`

### Required recovery design

Do **not** solve this only by raising `maxPagesPerBatch`. Implement a budget-bounded, resumable,
cursor-complete automatic catch-up path that reuses/refactors the proven gap-backfill machinery.

Required behavior:

1. The scheduled `ingest:x` run reads the live `x_api.lastPollAt`. When it is older than a reviewed,
   environment-tunable park threshold (default should reflect the observed 4–8 hour failure
   boundary), it starts or resumes one fixed catch-up window `[oldWatermark, caughtUpTo)`.
2. Capture `caughtUpTo` once when creating the checkpoint. Do not move the upper boundary on each
   hourly retry, or the job may never finish.
3. Persist enough checkpoint state to resume the exact work after run-cap, daily-cap, HTTP failure,
   function timeout, or deployment restart: range, next batch, next cursor, counts/spend, and the
   exact account/batch roster. The current registry roster hash drifts within minutes; hash-only
   refusal is unsuitable for unattended recovery. Store a bounded public account snapshot (or an
   equivalently safe immutable roster reference) so a normal registry change cannot strand the
   checkpoint.
4. Follow each batch cursor to true exhaustion. Insert each page before checkpointing beyond it.
   A crash may re-fetch and re-bill at most the uncheckpointed page; content-hash dedupe absorbs
   duplicates.
5. All paid calls use the existing `x_api` SpendGuard instance and existing
   `X_SPRINT_USD_CAP`, `X_DAILY_USD_CAP`, `X_DAILY_REQUEST_CAP`, and `X_RUN_REQUEST_CAP`. A run must
   stop before another paid call when any guard or lease check refuses. Keep one documented,
   environment-tunable automatic-catch-up request limit no higher than `X_RUN_REQUEST_CAP`; do not
   invent an unbounded default.
6. Use the existing owner/TTL X lease for the entire paid/checkpoint/advance sequence. No steady
   poll, manual recovery, or second automatic recovery may spend concurrently.
7. Advance the live watermark to the fixed caught-up boundary only when every cursor is exhausted
   and every covered page has been inserted. Use compare-and-set semantics against the checkpoint's
   starting watermark; never move a newer watermark backward. The next ordinary poll's existing
   overlap covers the boundary.
8. If catch-up stops, leave the live watermark unchanged and preserve the checkpoint. The next
   scheduled run resumes from its saved batch/cursor instead of starting again at the first page.
9. If a completed checkpoint is encountered after a crash, finalize the compare-and-set without
   paid calls when safe. If the live watermark is already newer, mark it superseded/complete and
   never move backward.
10. Once caught up, return to the existing steady poll behavior. Preserve normal empty-but-valid
    watermark advancement, partial-document insertion, parser validation, attribution, and all
    current run statistics.

Keep the third-party/provider naming explicit in code and operator copy:
`api.twitterapi.io`, adapter/provider `x_api`, header `X-API-Key`; never call it the official X API.

### Alerting and recovery notices

Build the open #38 alert using existing operator email infrastructure. `FEEDBACK_EMAIL` is already
the production operator-notification destination; do not add a secret or email address to source.
Notification failure must not fail ingestion.

Maintain separate `provider_state` health state (no migration expected) with consecutive counts,
episode identity, last alert time, and recovery status. Alert on at least:

- any `pageTruncations > 0`, `budgetStops > 0`, `requestFailures > 0`, or unexpected
  `incomplete > 0` outside an intentional lease skip;
- a stale/parked live watermark or stopped automatic catch-up;
- repeated complete `fetched=0` polls across the configured account roster (use a conservative
  consecutive threshold so one valid quiet poll does not page the operator);
- a stuck checkpoint that makes no batch/cursor progress across repeated eligible runs.

Requirements:

- Send once per unhealthy episode with a cooldown, not once per hourly retry.
- Send one recovery notice after health resumes or catch-up completes.
- Include only safe operational fields: timestamps/age, deployment/job, requests/units/docs,
  counter values, checkpoint batch/cursor-present flag, and stop category. Never include API keys,
  auth headers, raw provider bodies, tweet contents, email lists, or `CRON_SECRET`.
- Record alert evaluation/result in `cron_runs.counts.x_api` even if `FEEDBACK_EMAIL` is missing or
  Postmark fails, so monitoring is auditable.
- A normal `lockSkips=1` while another valid X lease owner is working should not independently
  create alert spam; prolonged staleness or a stopped checkpoint still must alert.

### X tests

Add deterministic, no-network tests proving:

1. park detection creates a fixed range and immutable roster snapshot;
2. multi-page/multi-batch catch-up exhausts cursors, inserts before checkpoint, and advances the
   watermark only after global completion;
3. a guard stop, HTTP/parser/network failure, lost lease, insert failure, and simulated timeout
   preserve the next safe cursor and never advance the watermark;
4. the following invocation resumes mid-batch and does not re-fetch earlier checkpointed pages;
5. registry roster drift does not strand an active checkpoint;
6. completed/superseded checkpoint finalization never moves a watermark backward;
7. the same guard enforces steady and catch-up calls cumulatively within a run;
8. held lease and refused guard paths make zero provider calls;
9. normal healthy/empty steady polls retain existing behavior;
10. unhealthy alerts dedupe, honor cooldown, record delivery/missing-recipient/failure, and emit one
    recovery notice;
11. no secret or raw tweet/provider payload enters logs, alert text, or cron counts.

Use injected clocks, stores, lease driver, request function, inserter, and mailer. No test may read
the live `X_API_KEY` or make a paid call.

## Documentation and standing-state maintenance

When implementation is ready, correct standing text in place and append history:

- `AGENTS.md`: invite mode live; magic-link guidance shipped; accepted signals show names with
  source attribution while anonymous remains teaser-only; X self-recovery/alert status; current
  deploy after rollout.
- `docs/OPEN-TASKS.md`: close #40 only after copy is live; replace/close #58 only after names,
  disclaimer, Terms bump, and gate tests are live; close #38 and #66 only after a real scheduled
  recovery/healthy-poll sequence proves the production behavior.
- `docs/PROGRESS.md`: append implementation/test/deploy evidence and explicitly state paid-call
  count.
- Add a focused review note under `docs/reviews/` with access-boundary, legal-version, X state
  machine, alert, spend, and rollback evidence.

Do not rewrite historical review conclusions that were accurate when written; add dated status
updates where needed. Never edit an applied migration or delete historical usage/checkpoint rows.

## Verification gate

Before merge/deploy:

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:integration` if a Postgres behavior or query changed
- adversarial review of the anonymous Signals HTML and legal acceptance versioning
- fixture-only X recovery and alert tests proving zero network/paid calls

Then commit intentionally, push the branch, merge only after review, push `main`, and deploy
production explicitly (`git push` alone is not a reliable release step in this repository).

## Production rollout and proof

1. Re-read production env without printing secret values. Confirm `SIGNIN_MODE=invite`,
   `FEEDBACK_EMAIL` present, X key/caps present, and any new non-secret recovery threshold/limit
   values set before deploying code that requires them.
2. Deploy the tested main commit and verify the deployment is READY and aliased to `bnow.net`.
3. Verify `/health` 200/DB OK and scan runtime errors.
4. Verify `/signin` and the sent-state copy without requesting a link for an arbitrary address.
   Send one live email only to an operator-owned eligible test address if explicitly authorized;
   inspect that the URL is unrewritten and the browser guidance is present.
5. With an accepted operator account, verify Signals shows all qualifying names, exact hedged
   claims, sources, and the disclaimer. In a fresh anonymous session, verify none of those values
   appear in HTML. Verify the Terms version bump causes re-acceptance and Privacy remains 1.2.
6. Do not manufacture an X park or manually spend to prove catch-up. Observe scheduled runs. The
   code path is not production-closed until evidence includes either a naturally detected park
   that resumes from checkpoint to completion, or a separately authorized bounded staging/prod
   exercise with reconciled provider usage.
7. Prove alert episode deduplication and recovery with injected/unit tests; a live operator email
   test may use a non-paid synthetic health evaluator only if the implementation provides one and
   the operator authorizes it.
8. Record before/after X `provider_usage`, watermark, checkpoint, cron counters, and any alert
   delivery. Reconcile all paid calls; do not infer health from HTTP 200 alone.

Rollback:

- UI/legal regression: redeploy the prior known-good deployment. Remember that acceptance rows for
  a new Terms version remain append-only; do not delete them during rollback.
- X recovery regression: disable only the new automatic-catch-up flag if one is introduced, keep
  insert-gated steady polling and the existing lease, then use the proven manual gap runbook under
  separate spend approval. Never reset the watermark backward.
- Invite mode rollback is an operator choice: `SIGNIN_MODE=open` plus redeploy. Do not silently
  change it during a code rollback.

## Non-goals

- Do not expose Signals specifics publicly or remove legal acceptance.
- Do not label source claims as verified facts or weaken the publication-safety guard.
- Do not change the magic-link token model to multi-use.
- Do not change X providers, roster policy, pricing, caps, source reliability, map/reduce behavior,
  or OpenSanctions.
- Do not run entity cleanup #61 or the paid OpenSanctions rescore in this workstream.
- Do not combine the unrelated GramJS #69 or GitHub Actions #70 maintenance unless separately
  requested.

## Deliverable

Return the branch/commit/PR or merge commit, concise diff summary, full test evidence, deployment
ID and alias, zero/actual paid-call accounting, invite/signals/legal/X production proofs, rollback
instructions, and any residual item that prevents closing #38, #40, #58, or #66.

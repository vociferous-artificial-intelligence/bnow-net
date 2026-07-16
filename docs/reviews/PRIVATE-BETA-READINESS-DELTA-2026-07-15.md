# Private-beta readiness delta — 2026-07-15

This review reconciles every workstream merged after
`PRIVATE-BETA-READINESS-NOTE-2026-07-13.md`: the analyst-beta remediation, X historical
recovery/rescore, PostHog activation and Privacy 1.2, Postmark sender cutover,
OpenSanctions monthly accounting/fixed-cutoff rescore, and the final documentation
syncs. It is a release/readiness delta, not a repetition of the July 13 implementation
review.

## Verdict

**The application release is fully merged, pushed, and deployed.** There is no
unmerged code branch, dirty worktree, open pull request, failed current CI run, or
application commit waiting for production. Production serves application commit
`f9aaa9e`; after this audit, documentation-only main `426c627` was redeployed as READY
deployment `dpl_DzTtLPHVCrqbDZsLKqag5bNmndz8` at `bnow.net` to activate
`SIGNIN_MODE=invite`. No later application-code commit is waiting for production.

At audit start, `main` and `origin/main` were both `78e15b2`; this review's documentation
commit follows that baseline. The two commits after `f9aaa9e`
(`4a5b3cf`, `78e15b2`) are documentation-only status records, so rebuilding and
deploying them would not change the production application.

The private beta is operationally healthy, but it is not a claim that all debt is
closed. Operator decisions, one paid data operation, and four engineering safeguards
remain listed below.

## Release-state evidence

### Git and GitHub

- At audit start, `main == origin/main == 78e15b2`; working tree clean.
- All three worktrees are clean.
- `git branch --no-merged main` and `git branch -r --no-merged origin/main` return
  nothing. The apparent `codex/analyst-evidence-trail` worktree is already contained
  in `main`.
- GitHub reports zero open pull requests.
- CI for `78e15b2` completed successfully. The enforced pre-push gate also passed
  typecheck, lint, and 1,495/131 unit tests.

### Vercel and live application

- Project: `bnow-net`, team `vociferous`.
- Production: `dpl_ApFhadwyVNkAyyc9T8R4W7ghgPhu`, READY, target production,
  commit `f9aaa9e`.
- `https://bnow.net/health`: HTTP 200, DB OK, and build `f9aaa9e`.
- Last 24 hours of `cron_runs`: zero failed and zero unfinished rows for fast,
  Telegram web, Telegram MTProto, X, map, digest finalize/intraday, validate, enrich,
  and datadark jobs.
- Documents fetched in the last 24 hours: X 5,653; Telegram web 2,483; Telegram
  MTProto 1,259; RSS 1,157; GDELT 788.

Later 2026-07-15 invite update: Vercel reports
`dpl_DzTtLPHVCrqbDZsLKqag5bNmndz8` READY/production with aliases including `bnow.net` and
source commit `426c627`. Fresh WSL Chrome rendered `/health` as DB OK on that deployment/build
and `/signin` as expected without submitting the form. The runtime-error scan contained only the
already-tracked non-fatal GramJS #69 clusters.

### Live 390px Chrome smoke

WSL Chrome 150 was run directly against production with a 390×844 mobile viewport.
Every checked document had `scrollWidth == clientWidth == 390`.

| Route | Result |
|---|---|
| `/`, `/access`, `/signin`, `/privacy`, `/terms`, `/signals` | 200; expected heading; no horizontal overflow |
| `/pricing` | lands on `/access` |
| `/ask`, `/search`, `/entities` | land on `/signin` when anonymous |
| `/registry` | 404 when anonymous, as designed |
| anonymous `/signals` | no Graham/Khamenei/target-list/purge wording in visible text |

The signed-out mobile home also passed a visual screenshot inspection. The default WSL
Chrome profile has no valid BNOW session, so the signed-in home remains the honest #65
manual gap; no magic-link email was triggered during this audit.

## New finding: MTProto error-stream noise

Vercel groups recurring GramJS `CastError` messages for `channelId` and `accessHash`
under `/api/cron/ingest`. These are emitted by GramJS's TL type validator through
`console.error`; they are not thrown by the adapter in the observed runs.

Impact assessment:

- The latest 24 scheduled `ingest:mtproto` runs all returned `ok=true` with zero
  adapter/channel errors and inserted 1,259 documents.
- All 144 cached channel-state rows currently have `last_error IS NULL`.
- Therefore this is **not a present ingestion outage or data-loss signal**.
- It is still real debt: roughly two error lines per selected channel (about 80 per
  hourly run) pollute Vercel error telemetry and could hide a genuine incident.

Tracked as OPEN-TASKS #69. The coding review should determine whether the bundled
GramJS path is reconstructing peers as JavaScript numbers, preserve exact 64-bit
credentials, regression-test production-shaped peer values, and prove the error stream
is clean without suppressing unrelated errors.

## What remains, in order

### Operator decisions before expanding the beta

1. **Completed 2026-07-15:** production is `SIGNIN_MODE=invite`; a pre-flip read-only audit
   confirmed all five existing users remain eligible, while the one pending request remains
   blocked until approval. Environment readback and production deployment
   `dpl_DzTtLPHVCrqbDZsLKqag5bNmndz8` are verified.
2. Complete #65: one signed-in 390px homepage/account/legal/signals pass with a real
   accepted-user session.
3. **Decision completed; implementation pending (#40):** retain single-use links and tell users
   in the email and sent screen to copy the unvisited URL into their preferred browser before
   opening it elsewhere.
4. **Decision completed; implementation pending (#58):** accepted invitees see all qualifying
   names and cited evidence; anonymous visitors remain teaser-only. Add a visible source-claim
   disclaimer plus explicit version-bumped Terms language.
5. Review PostHog project membership and accept Privacy 1.2 on operator accounts. The
   PostHog billing limit is already configured.

The implementation handoff for items 3–4 and X safeguards #38/#66 is
`docs/prompts/2026-07-15-beta-invite-signals-x-reliability.md`.

### OpenSanctions paid workstream

1. Rerun the read-only entity-cleanup dry run (#61); the old 876→683 projection is stale
   because the current eligible population is 937.
2. Review and explicitly approve the cleanup, apply it transactionally, and perform the
   documented claim/source/orphan integrity checks.
3. Recount the cleaned eligible population and current calendar-month quota.
4. Obtain separate authorization for paid OpenSanctions calls.
5. Run the fixed-cutoff rescore serially to zero candidates and record before/after
   population, quota, spend, and integrity evidence.

### Engineering safeguards

1. #38: alert on repeated X `fetched=0`, `pageTruncations`, or `incomplete` runs.
2. #66: add the approved budget-bounded, resumable automatic X catch-up mode so a long pause
   cannot repeatedly rebill a fixed backlog; a larger page ceiling alone is insufficient.
3. #39: connect Git pushes to Vercel or adopt an explicit release checklist. The current
   audit confirms that pushes after `f9aaa9e` did not deploy automatically.
4. #69: remove the non-fatal GramJS peer-type error noise and prove exact 64-bit peer
   handling.

These safeguards should be scheduled promptly, but none represents an active outage in
the evidence above. #38/#66 are the highest operational-risk code work.

### Low-risk CI maintenance

- #70: GitHub's successful CI run annotated `actions/checkout@v4` and
  `actions/setup-node@v4` because their Node 20 action runtime is deprecated and is being
  forced onto Node 24. Upgrade the action majors in a workflow-only change and verify both
  jobs. This is not an application-runtime or current CI failure.

## Review recommendation

Do **not** repeat the entire July 13 implementation review from scratch. This delta
review covers every subsequent workstream and found the one previously untracked
production issue (#69). After the operator decisions and #65 are complete, run a short
final launch checklist: authenticated user journey, access approval, magic-link delivery,
legal acceptance, analytics consent/deny, signed-in mobile layout, and current cron/error
health. A new full architecture/code review is warranted only after another comparably
large feature tranche or before moving from controlled beta to a commercial launch.

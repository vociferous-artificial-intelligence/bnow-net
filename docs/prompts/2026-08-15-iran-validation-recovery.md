# Claude Code prompt — Iran validation recovery, ISW source refresh, and map-budget observability

## Execution profile

- **Agent:** Claude Code
- **Model:** **Claude Fable 5** (`claude-fable-5`)
- **Effort:** **ultracode** (maximum available). If the harness does not accept `ultracode`, use
  `max`; do not silently lower below `xhigh`.
- **Fallback:** Claude Opus at `max` effort only if Fable is unavailable. Record the fallback and
  why it occurred in the final report.
- **Working directory:** `/Users/go/code/bnow-net`
- **Recommended branch:** `claude/iran-validation-recovery-20260815`

This is a long-horizon production-recovery task. Work deliberately, keep an evidence ledger, test
each phase, and do not conflate code authorization with permission to spend money, mutate
production, change provider/account settings, deploy, push, or regenerate customer-visible data.

## First instructions — mandatory

1. Read `AGENTS.md` completely before taking any action. It is the binding persistent brain of the
   project. Then read:
   - `docs/CURRENT-STATE.md`
   - `docs/OPEN-TASKS.md`
   - `docs/PROGRESS.md` (recent entries first, then any referenced history)
   - `docs/DECISIONS.md` sections governing spend, map/reduce, validation, source reliability,
     publication safety, and production operations
   - `docs/TIME-MODEL.md`
   - `docs/reviews/MAP-SHADOW-RESULTS.md`
   - `docs/reviews/X-GAP-RECOVERY-RUNBOOK-2026-07-13.md` for the estimate-first / bounded-recovery
     operational pattern
2. Inspect `git status`, the active branch, `origin/main`, and the production commit before
   editing. Preserve every unrelated dirty or untracked file. The shared working tree was already
   dirty when this prompt was written; do not reset, clean, stash, overwrite, or commit someone
   else's work.
3. Prefer an isolated worktree from current `origin/main`. Do not deploy from the dirty shared
   tree. Do not assume local `main` equals production.
4. Write a short plan and maintain it as evidence changes. Start with read-only inspection.
5. Never print, paste, log, commit, or summarize secret values. Temporary production-env exports
   must live under an explicit `/private/tmp/...` path, be mode-restricted if possible, and be
   deleted before handoff.

## Authorization state — bounded unattended execution approved 2026-08-15

At the start of this task, the operator has authorized:

- read-only inspection of repository and production operational state;
- local code, tests, documentation, and dry-run estimates in an isolated branch/worktree;
- use of fixture/stub providers and a disposable Neon branch for tests;
- local commits on the isolated feature branch;
- **Production map-spend recovery within this exact envelope:**
  - increase the effective map all-time ceiling from $10 to **$40**;
  - temporarily increase `MAP_USD_CAP_DAILY` from $4 to **$20** for the weekend recovery window;
  - the elevated daily cap expires at the earlier of (a) recovery completion or
    **2026-08-17T13:00:00Z / 09:00 America/New_York on Monday**;
  - restore `MAP_USD_CAP_DAILY` to **$4** immediately when either condition is reached—do not leave
    the weekend allowance active for ordinary steady-state processing;
  - prefer an automatically expiring, test-pinned recovery override if it can be implemented
    cleanly without weakening the guard. Otherwise perform and verify the Vercel env rollback plus
    redeploy before final handoff; if the agent cannot guarantee rollback by the deadline, it must
    stop paid work early and restore $4 before exiting;
  - spend at most **$20.00 in new paid-provider charges attributable to this recovery**, measured
    from a timestamped `provider_usage` baseline immediately before the first paid action;
  - the $20 envelope covers map backlog, approved digest regeneration, validation matching, and
    bounded verification calls combined; it does not authorize Ask, OpenSanctions, X/twitterapi,
    or unrelated paid experiments;
  - stop before the next paid dispatch if settled usage plus active reservations would exceed the
    $20 envelope, even if a provider-side or environment cap would allow more;
- the Vercel Production env change needed to establish that ceiling and an env-only redeploy of the
  exact current production artifact, if that is the safest first recovery step;
- if raising shared `LLM_SPRINT_USD_CAP` would reopen an unrelated provider that was already parked
  at the old $10 ceiling or would create more than $1 of unrelated incremental exposure, implement
  a map-specific all-time cap instead (for example `MAP_SPRINT_USD_CAP=40`), set the new fail-closed
  env in **all Vercel environments before deploying code that reads it**, retain
  `LLM_SPRINT_USD_CAP=10` for unrelated providers, test it, and record the new cap in standing
  ruling 4 and the decision log;
- production database backup creation and the production writes strictly required for:
  - Iran ISW report/citation loading and registry materialization;
  - current-version Iran map backfill from 2026-07-30 through the last complete UTC day;
  - affected Iran military digest regeneration and validation reruns;
  - activating at most **six** reviewed sources from Workstream D that pass every source gate;
- up to **three production deployments** for this task: one bounded recovery/env redeploy, one
  fully tested code/source release, and one mandatory daily-cap restoration redeploy if automatic
  expiry is not implemented. A rollback deployment does not count against the three-release limit
  if a smoke test fails;
- pushing only the named feature branch and opening/updating a draft PR after all gates pass.
  **Do not merge or push directly to `main`.**

The agent may proceed unattended through those actions after completing the mandatory preflight
and gates below. It must stop and request new authorization if any limit would be exceeded, scope
expands beyond Iran validation recovery, a destructive cleanup becomes necessary, an estimate
materially exceeds the envelope, or safety evidence is ambiguous.

Still not authorized:

- increasing the effective map all-time ceiling above $40, the temporary map daily cap above $20,
  or leaving the daily cap above $4 after the weekend window;
- more than $20.00 of new recovery-attributable paid usage;
- paid Ask, OpenSanctions, X/twitterapi, sanctions rescore, unrelated LLM backfills, or analytics
  changes;
- merging/pushing `main`, deleting production data, weakening a spend/publication/traceability
  guard, or adding a source with unresolved legal, robots, provenance, or reachability status.

## Objective

Restore trustworthy Iran validation after the map pipeline silently exhausted its all-time OpenAI
backstop, prevent the same silent failure from recurring, refresh the stale ISW Iran citation
registry, evaluate and onboard the most useful newly prominent sources, map the backlog, regenerate
affected Iran digests, re-run validation, and prove the production result end to end. The bounded
unattended authorization above covers those actions; no additional pause is required while every
action remains inside its limits.

The desired outcome is not a manufactured score increase. It is:

1. current-version Iran source documents reliably reach `doc_claims`;
2. a cap refusal is unmistakably unhealthy and alerts once per incident;
3. same-day ISW Iran reports contribute URLs/citation metadata to the registry without persisting
   ISW prose;
4. newly prominent, reachable sources enter the correct Iran coverage lens with source fidelity;
5. historical digests are regenerated only from a complete, source-linked corpus and retain all
   publication-safety and thin-overwrite protections;
6. validation is rerun honestly and the before/after figures are reported, whether they improve or
   not.

## Confirmed production evidence — re-verify, do not merely trust

The following was established by read-only production audit on 2026-08-14. Reproduce the core
queries and record any drift before implementation:

### Deployment and code

- `bnow.net` currently runs Vercel deployment `dpl_GPNNsDBjuzsgJ7GKUfvdrbG3YMmC`, an env-only
  redeploy of commit `441ee09`.
- The relevant validation matcher did not change after July 23. Every Iran run in the audited
  window used `matcher=llm-majority`, `voteRounds=5`, and `takeawaysFiltered=0`.
- Production is behind `main`: the page-level authorization repair recorded in standing ruling 21
  is merged to `main` but was not part of `441ee09`. Do not accidentally deploy an unreviewed local
  tree while attempting an env-only recovery.

### Validation degradation

- Iran coverage on 2026-07-23 was 83.3% (5 agreements / 6 ISW takeaways).
- Period averages:
  - 2026-07-15..23: 60.4% coverage, 8.8 digest claims/day;
  - 2026-07-24..29: 37.7% coverage, 7.5 digest claims/day;
  - 2026-08-02..10: 23.2% coverage, 3.0 digest claims/day.
- July 23 was not a clean code-change boundary: July 26 and 27 still scored 66.7%. Treat normal
  daily topic variance separately from the hard operational failure below.

### Hard root cause

- The first persisted map budget stop was `2026-07-29T08:40:34.395Z`.
- The repeated reason is exactly:

  `llm: budget stop — openai_map: total spend $10.0083 >= cap $10`

- From July 30 through the audit, Iran continued receiving roughly 2,500–4,300 raw documents/day,
  but produced **zero** new Iran `doc_claims` on every day.
- At audit time, 396 hourly `job='map'` runs had recorded a `budgetStop`. They finished with
  `ok=true`, zero LLM calls, and zero new claims. This is the observability defect: a deliberate
  SpendGuard refusal preserved cost safety but masqueraded as job health.
- `LLM_SPRINT_USD_CAP` is the all-time backstop shared by paid LLM paths; `MAP_USD_CAP_DAILY` is the
  separate daily map rail. Do not replace the all-time backstop with an unbounded or daily-only
  policy.

### ISW citation-registry lag

- The newest Iran report with `parse_status='parsed'` and stored `source_citations` is 2026-07-03.
- Fifteen Iran reports from July 24 onward were present only as `parse_status='pending'` with
  `endnote_count=0` and `citation_count=0`.
- The validation path fetched and scored those reports but did not feed their endnotes into
  `source_citations` or refresh `source_theater_stats`.
- This lag is independently capable of starving registry-derived X/Telegram rosters of new Iran
  sources, even after map spending is restored.

### Newly prominent source sample

A respectful, rate-spaced parse of six official ISW Iran reports (July 20/23/27 versus August
2/6/10) found that the dominant mix remained X, Telegram, Reuters, ISW/CTP, and Shafaq. This was
not a wholesale source replacement. Newly prominent direct domains in the August sample included:

- `majalla.com` / `en.majalla.com` — 11 citations in the sample;
- `mehrnews.com` — 10;
- `sabanew.net` — 6;
- `presstv.co.uk` — 4;
- smaller candidates: `radiofarda.com`, `sanaacenter.org`, `964media.com`, `almasdaronline.com`,
  `alhadath.net`, `alaraby.co.uk`.

The registry knew most of these domains but had zero directly attributed Iran `raw_documents`
from them since July 15. That does not prove BNOW had no indirect coverage through X/Telegram;
measure overlap before adding feeds. `presstv.ir` is already configured as RSS and `mehrnews` has
a Telegram theater override, so avoid duplicate/canonical-split ingestion.

## Binding invariants

These are non-negotiable:

- Every paid-provider dispatch passes its existing `SpendGuard.tryReserve()` first and fails
  closed. Never bypass, weaken, catch-and-ignore, or locally counterfeit the guard.
- No ISW prose or full source text may persist or appear in user-facing output. ISW report URLs,
  endnote URLs, classifications, counts, scores, and derived signatures are allowed under the
  existing rules.
- Every persisted digest claim retains at least one `raw_document` link. Preserve application
  transactions and `9999_claim_source_trigger.sql`.
- Stub/fixture data never persists or renders as fact.
- Map extraction remains versioned. Every consumer filters through
  `src/lib/analysis/map-versions.ts`; never mix superseded extractor versions.
- Mapreduce remains K=5 with majority-gid fill. Do not lower votes or alter the validated reducer
  configuration.
- Every digest persist runs `guardPublishedEvents` before overwrite evaluation. Do not bypass the
  publication-safety or thin-regeneration guard. `FORCE_REGEN=1` is not a convenience flag.
- Arabic is not theater-routed by language. Any Arabic feed added for Iran coverage needs an
  explicit `countryIso2: 'ir'` coverage-lens decision and documentation.
- Applied migrations are immutable. Any schema change is a new additive migration; the claim
  source trigger remains last.
- Do not expose provider/model diagnostics, secret values, raw ISW text, or paid-query details to
  end users.

## Workstream A — reproduce and quantify before changing anything

Create a dated implementation/recovery note under `docs/reviews/` and keep an evidence table with
timestamps, queries, results, and mutation status.

Read-only checks must include:

1. Current deployment ID and `/health` commit stamp.
2. Exact values/presence—not secret values—of `LLM_SPRINT_USD_CAP`, `MAP_USD_CAP_DAILY`,
   `DIGEST_ENGINE`, `LLM_DISABLE`, and relevant map model/version envs in Production.
3. `provider_usage` totals for `openai_map` and every other provider sharing
   `LLM_SPRINT_USD_CAP`; confirm that raising the shared backstop cannot unexpectedly reopen a
   separate parked workstream.
4. First/latest `cron_runs.counts.budgetStop`, number of stopped runs, and last productive map run.
5. Current extractor version and latest per-theater/current-version `doc_claims` date.
6. Backlog by UTC day and theater:
   - raw documents eligible for map;
   - already mapped under the current extractor version;
   - exact/minhash mirrors;
   - no-track/short/stub exclusions;
   - remaining document-track pairs.
7. Dry-run `scripts/map-backfill.ts` estimate for Iran only, from 2026-07-30 through the last
   complete UTC day. If the script cannot constrain to Iran, fix that safely before using it;
   do not estimate or pay for unrelated theaters accidentally.
8. Digest/validation matrix for Iran from July 23 onward, including missing ISW publication days,
   prior claim count, coverage, agreement/isw-only/ours-only counts, and overwrite-guard risks.
9. ISW Iran report freshness: parsed/pending/failed counts, newest stored citation date, and
   citations per report.

Reconcile the modelled backlog cost against historical measured map cost. Present low/base/high
estimates and enough headroom for retries. The $40 all-time / temporary $20 daily ceilings are
maximum permissions, not spending targets; stop when the corpus is recovered even if headroom
remains.

## Workstream B — make map budget exhaustion visibly unhealthy

Relevant code includes:

- `src/app/api/cron/map/route.ts`
- `src/lib/analysis/map-worker.ts`
- `src/lib/usage/cron-run.ts`
- `src/lib/usage/llm-guard.ts`
- `src/lib/usage/spend-guard.ts`
- `scripts/map-backfill.ts`
- existing X health/recovery code as a design reference only:
  `src/lib/adapters/x-health.ts`, `src/lib/adapters/x-auto-catchup.ts`

Implement the smallest coherent design that satisfies all of these behaviors:

1. A total-cap or daily-cap refusal still prevents the next paid request absolutely.
2. A scheduled map run that cannot map because of a budget stop is not recorded as healthy. Use
   `cron_runs.ok=false` or an equally queryable failure/degraded state; do not hide the condition
   only inside free-form logs.
3. The route returns a safe, machine-readable classification and the accumulated numeric counts.
   Do not expose secrets or raw prompt/source content.
4. `scripts/map-backfill.ts` can distinguish:
   - a benign per-run request ceiling that should resume;
   - a daily-cap stop that should pause until the next UTC day;
   - an all-time backstop that requires operator intervention;
   - a transient provider/transport failure.
5. Add an episode-deduplicated operator alert for map unhealth and one recovery notice. Reuse the
   proven X alert semantics where appropriate: safe fields only, cooldown, no alert storm on every
   hourly cron. If email delivery is unavailable, persist the alert state/outcome visibly.
6. Add a freshness check by theater and current extractor version. Global map activity must not
   mask Iran being stale while Russia/Ukraine continue.
7. A budget-stopped run must not mark unmapped documents processed, advance a version checkpoint,
   or make a thin digest overwrite more likely.
8. Dry runs remain zero-write, zero-paid, and absent from `cron_runs` unless the operator explicitly
   approves a different audited convention.

Add focused unit tests for first stop, repeated stop/cooldown, recovery, per-run versus daily/total
classification, theater-specific staleness, safe alert payloads, route status/body, and backfill
driver behavior. Mutation-test the central assertion: force `budgetStop` and prove the job cannot
be recorded as healthy.

## Mandatory preflight 1 — cap and paid-recovery envelope

Before changing any cap or making a paid call, record in the review note:

- current all-time and daily cap values;
- settled usage and any active reservations for every provider affected by the shared backstop;
- remaining map backlog by day/theater/current extractor version;
- dry-run low/base/high cost estimate;
- whether shared `LLM_SPRINT_USD_CAP=20` is safe or a map-specific all-time cap is required to
  avoid reopening an unrelated parked provider;
- confirmation that normal `MAP_USD_CAP_DAILY` remains $4, the temporary effective value is at
  most $20, and the automatic/manual Monday restoration mechanism is ready before elevation;
- exact Vercel environment(s) to change;
- exact production artifact to redeploy for an env-only recovery, or the reviewed code commit if
  the observability fix will ship first;
- rollback and stop conditions;
- the timestamped provider-usage baseline from which the authorized $20 delta will be measured.

Do not pause merely to reconfirm the already-approved $40 all-time / temporary $20 daily / $20
incremental envelope.
Proceed automatically if every estimate and safety check fits. Stop only if the shared-cap audit
requires an unsafe expansion, the dry-run base estimate exceeds $16 (80% of the envelope), the
high estimate exceeds $20, the $4 restoration cannot be guaranteed, or another explicit stop
condition in this prompt fires.

## Workstream C — refresh ISW Iran citations automatically

Relevant code includes:

- `src/lib/validation/run.ts`
- `src/lib/validation/isw-extract.ts`
- `src/lib/isw/parse.ts`
- `src/lib/isw/urls.ts`
- `scripts/isw-fetch.ts`
- `scripts/isw-parse.ts`
- `scripts/isw-load.ts`
- `scripts/registry-materialize.ts`
- `src/lib/ingest/run.ts` registry-derived source selection

Design and implement an idempotent path so newly fetched Iran Updates do not remain permanently
`pending` with zero citations. Prefer reusing the existing parser/canonicalizer rather than adding
a second interpretation of ISW endnotes.

Requirements:

1. Parse report title/date, endnote count, and source URLs from the same fetched HTML already used
   for validation, or from a clearly scheduled companion job.
2. Upsert `isw_reports`, canonical `sources`, and `source_citations` idempotently using existing
   unique keys. Re-running a report must not duplicate citations.
3. Preserve full validation extraction for both sides while keeping ISW prose transient. Do not
   persist takeaway prose, endnote prose, or full report text. Existing derived keyword/toponym
   signatures may remain only within their current legal boundary.
4. Update `parse_status`, `endnote_count`, and `citation_count` honestly; partial parse failure must
   not be labelled parsed.
5. Refresh `source_theater_stats` and global aggregates safely after new citations. Avoid a
   destructive full-table window where reads can see empty stats; use a transaction, staging, or an
   incremental/idempotent alternative.
6. Ensure Iran-derived X/Telegram rankings use `ir` citations where intended. Do not change the
   ROCA-only MTProto default for Russia/Ukraine accidentally; if Iran needs its own ranked roster,
   add an explicit Iran path instead of weakening the RU/UA priority rule.
7. Respect host spacing, robots, fetch caching, custom user agent, retries, and bounded execution.
8. Add fixtures/tests for modern Iran Update HTML, multiple URLs per endnote, obfuscated URLs,
   canonical domains, parse failure, idempotent replay, theater stats, and the legal negative
   assertion that no ISW prose is stored.

For the historical gap, prepare and verify an idempotent runbook covering 2026-07-04 through the
latest available Iran report. Production loading/materialization may proceed under mandatory
preflight 2 when it remains inside the unattended authorization.

## Workstream D — evaluate and add high-value Iran/Gulf sources

Do not add every newly observed domain blindly. For each candidate, record:

- exact ISW citation count and dates after the registry refresh;
- outlet identity, ownership/state affiliation where relevant, language, and theater relevance;
- direct RSS/Atom, public Telegram, or public X endpoint;
- local and Vercel reachability, HTTP status, freshness, MIME/content validity, robots posture,
  rate limits, and whether the feed is a duplicate/mirror of an existing source;
- canonical `sourceKey`, reliability history, and expected source-attribution label;
- overlap with current X/Telegram/RSS documents;
- incremental documents/day and map-cost estimate;
- source-specific risk: state media, partisan claims, republishing, or unclear provenance.

Priority candidates to investigate:

1. Majalla (`majalla.com`, `en.majalla.com`)
2. Mehr News (`mehrnews.com`) — reconcile with existing `mehrnews` Telegram identity/pin
3. Saba News Yemen (`sabanew.net`) — a public RSS surface was observed; verify freshness and
   canonical domain
4. Shafaq (`shafaq.com`)
5. Radio Farda (`radiofarda.com`)
6. Sana'a Center (`sanaacenter.org`)
7. 964 Media (`964media.com`)
8. Al-Masdar Online, Al-Hadath, and Al-Araby as secondary candidates
9. PressTV: verify whether `presstv.co.uk` is merely the current domain/mirror of the already
   configured `presstv.ir` feed; do not double-ingest it

Add only sources that are fresh, reachable, legally/operationally appropriate, and materially
improve the ISW-aligned corpus. State-affiliated sources are allowed as attributed primary voices;
they are not treated as verified truth. Preserve hedging and source labels.

Implementation requirements:

- Put static RSS entries in `src/lib/ingest/config.ts` with explicit language, Iran coverage lens,
  stable canonical key, and human-readable name.
- For Telegram/X, prefer registry-derived selection after citation refresh. Curate only when the
  source is high-value and ranking mechanics would otherwise exclude it for a documented reason.
- Avoid canonical split between old/new domains and between direct, Telegram, and X identities.
- Tests must prove correct theater tagging, canonical source linkage, dedupe, adapter isolation,
  stub exclusion, and non-fatal handling of a dead/stale feed.
- Measure but do not manufacture production documents during tests.

## Mandatory preflight 2 — production citation load and source activation

Before writing citation/source data or activating feeds in production, record:

- historical report count and citation count to load;
- idempotency proof on a disposable Neon branch;
- exact source roster delta with include/reject reasons;
- expected daily document and map-spend increase;
- legal/robots/reachability results;
- migration status (prefer none; if additive migration is necessary, show it explicitly);
- deployment plan and rollback behavior;
- a final roster of no more than six activated sources, each passing every Workstream D gate.

Do not pause for another approval if the operation is idempotent, the backup exists, there is no
destructive cleanup or unresolved source risk, the roster contains at most six reviewed sources,
and the combined paid-work estimate remains inside the $20 envelope. Reject marginal candidates
rather than expanding scope. Stop for operator input if any candidate fails or ambiguously passes
a legal/robots/provenance gate.

## Workstream E — bounded production recovery under the pre-approved envelope

Use the approved cap and dollar ceiling exactly. Recovery sequence:

1. Take a production database backup branch before historical writes.
2. Read back the changed Vercel cap without printing secrets.
3. Redeploy only the explicitly approved artifact/commit. Verify deployment READY, alias, and
   `/health` stamp. Do not accidentally deploy the dirty worktree.
4. Run `scripts/map-backfill.ts` in dry-run mode again against the deployed artifact for
   `theater=ir`, 2026-07-30 through the last complete UTC day. Compare with the approved estimate.
   Abort if scope or estimate grows materially.
5. Apply oldest-first, bounded by both the operator budget and server-side guards. Stop immediately
   on an all-time stop, unexpected daily stop, provider failure, version drift, repeated no-progress,
   or cost variance outside the approved envelope.
6. After each day, verify current-version doc coverage, processed dispositions, source linkage,
   actual versus modelled spend, and no cross-theater spill.
7. Do not raise the cap a second time automatically. Return to the operator if the approved amount
   is insufficient.
8. When recovery finishes—or no later than 2026-08-17T13:00:00Z—restore the effective map daily
   cap to $4, redeploy if required, read it back without exposing other env values, and prove the
   next guard evaluation uses $4. Do not declare completion while the temporary $20/day allowance
   remains active.

## Workstream F — regenerate and revalidate honestly

Only after the map backlog and approved source/citation work are complete:

1. Inventory affected Iran military digests from 2026-07-30 forward.
2. Regenerate oldest-first through the normal `mapreduce` persist path.
3. Preserve the publication guard and thin-regeneration guard. If a regeneration is refused, record
   the reason and retain the prior digest. Do not set `FORCE_REGEN=1` without a report-specific,
   explicit operator decision.
4. Verify every claim has at least one source link and every consumer uses current extractor
   versions.
5. Re-run validation only on dates with a real same-day ISW Iran reference. Do not fabricate
   reports for publication gaps.
6. Record before/after for each date:
   - digest claims/events/source diversity;
   - coverage and at-publish coverage;
   - agreements, ISW-only items, and BNOW-only reported items;
   - thin-sourced rate and median lead;
   - matcher, vote rounds, takeaways, and LLM cost.
7. Manually review a bounded sample of agreements and misses for source fidelity. A higher numeric
   score is not success if matching became semantically looser.
8. Do not tune the matcher or reducer merely to increase this recovery's score. Any matcher change
   is a separate A/B-gated decision.

## Test and release gates

Before any authorized deploy:

- `git diff --check`
- TypeScript typecheck
- lint
- full unit suite
- targeted map budget/health/backfill tests
- targeted ISW parser/load/materializer tests
- targeted RSS/ingest/canonicalization tests
- real-Postgres integration tests on a disposable Neon branch
- production build
- browser verification against the production build for `/scoreboard`, Iran divergence detail,
  `/admin/ingest`, and any new admin health surface
- explicit proof that tests made zero paid-provider calls and zero production writes

Adversarial checks must include:

- remove/flip the budget-stop health classification and prove a test fails;
- rerun the same ISW report twice and prove citation counts do not grow;
- parse failure leaves the prior good registry state intact;
- a dead feed cannot break the fast ingest group;
- a source-domain alias cannot double-create or double-ingest one outlet;
- stale/superseded map versions do not enter regenerated digests;
- an empty/thin regeneration cannot overwrite a healthy digest;
- anonymous/gated response bodies do not leak privileged data, preserving ruling 21.

## Production smoke after the authorized release

Use safe GETs and read-only SQL first. Verify:

- `/health` serves the expected commit;
- the newest scheduled map run has `ok=true`, no `budgetStop`, positive progress when work exists,
  and current-version Iran claims;
- a deliberately fixture-driven/local budget-stop test is visible as unhealthy; do not manufacture
  a paid production failure;
- source citations extend beyond July 3 and recent Iran reports are honestly parsed;
- newly activated feeds insert attributed, correctly tagged documents without duplicates;
- regenerated Iran digests and scoreboard rows correspond to the intended dates;
- no 5xx, secret leakage, ISW prose persistence, stub facts, cross-theater corruption, or spend
  above the authorization;
- alert and recovery state is persisted; externally delivered email is only claimed if receipt is
  independently verified.

## Documentation and decision log

Correct standing text in place in:

- `AGENTS.md`
- `docs/CURRENT-STATE.md`
- `docs/OPEN-TASKS.md`

Append timestamped history to:

- the bottom of the `AGENTS.md` decision log;
- `docs/PROGRESS.md`;
- a new detailed `docs/reviews/IRAN-VALIDATION-RECOVERY-2026-08-15.md`.

Do not rewrite historical decision-log entries. Document:

- exact cap decision and authorization;
- actual recovery spend;
- deployment IDs and commits;
- backup branch and retention decision;
- dates mapped/regenerated/validated;
- source roster include/reject decisions;
- before/after score table;
- alert semantics and remaining observability gaps;
- rollback paths and unresolved debt.

## Required final handoff

Lead with the outcome, then provide:

1. **Root cause:** reconfirmed or revised, with evidence.
2. **Built:** files, behavior, migrations, and tests.
3. **Operational actions:** every cap/env/database/provider/deploy change, with authorization and
   exact bounded spend, including proof that the map daily cap returned to $4.
4. **Recovery results:** mapped documents/claims, regenerated digests, validation before/after.
5. **Sources:** evaluated, activated, rejected, and why.
6. **Safety proof:** spend guards, source traceability, publication guard, version filtering,
   ISW-prose exclusion, and zero-paid-test evidence.
7. **Production proof:** deployment, `/health`, cron state, browser checks, alert/recovery state.
8. **Remaining risks/debt:** especially cap ownership, registry scheduling, feed health, and any
   dates that could not be honestly regenerated or validated.
9. **Rollback:** code, environment, data, and source-roster rollback instructions.

Do not declare success merely because a cap was raised, jobs resumed, or coverage increased. The
task is complete only when the underlying corpus is current, the failure is visible and alerted,
the new source path is sustainable, affected outputs are safely rebuilt, and every production
mutation is reconciled to explicit operator authorization.

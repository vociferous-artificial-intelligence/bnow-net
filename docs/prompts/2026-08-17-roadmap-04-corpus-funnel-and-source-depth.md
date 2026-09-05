# Roadmap 04 — corpus funnel adjudication + registry recovery + source depth

The coverage lever. Uses the quality-foundation funnel to find WHERE eligible evidence
dies, restores the decayed RU citation registry, and adds sources steered by measured
lane misses instead of intuition. Also sets the standing X-concentration target (#42).

## Read first

`AGENTS.md` · `docs/OPEN-TASKS.md` #19 #42 #37 #76 #79 (verify none has moved) ·
`docs/reviews/EVIDENCE-QUALITY-OBSERVABILITY-2026-08-17.md` ·
`scripts/quality-funnel-report.ts` · `docs/reviews/IRAN-VALIDATION-RECOVERY-2026-08-15.md`
(the feed-probe method and citation-refresh design) · `src/lib/isw/load.ts` ·
`scripts/isw-refresh.ts` · `scripts/registry-materialize.ts` · `src/lib/ingest/config.ts`
· roadmap 03's lane-level miss table if available.

## Launch preconditions

Roadmap 02 landed (funnel report deployed). Roadmap 03's lane misses are the preferred
steering input; if 03 is still soaking, run Parts A–B now and defer Part C's selection
rationale until lane data exists.

## Authorization boundaries

Authorized with operator confirmation: the $0 RU citation drain and full registry
materialize (production writes, minutes-scale — #79's exact deliberately-deferred run);
up to **6** reviewed source activations (operator adjusts N at launch) using the proven
probe method; ingestion config commits + one deploy. Not authorized: paid LLM calls;
roster REMOVALS without an operator ruling; robots-gate bypasses (shafaq's section-feed
loophole stays closed — outreach only); schema changes (#37 gets a memo, not a
migration); touching X caps/watermarks/checkpoints.

## Part A — funnel adjudication (read-only)

Run the funnel report over the trailing ~21 days for ir and ru/ua, by adapter/platform/
language where supported. Produce a written verdict for EACH loss stage — map yield,
reduce rank/fed selection, voting, publication safety, citation attachment — stating
whether it materially drops non-X evidence, with counts. This resolves #19's standing
question ("is the lever feeds, lexicon yield, or reduce ranking?") with data. Reconcile
against the published-evidence X-share (IR ~73% at last measure). If the funnel shows a
CODE-side loss stage dominating, stop and write a targeted follow-up recommendation
before buying sources — do not proceed to Part C on autopilot.

## Part B — RU registry recovery ($0)

`npx tsx scripts/isw-refresh.ts --theater ru` + full `registry-materialize`. Verify: all
pending ru reports parsed or honestly failed; registry freshness advances to the newest
report; zero zombies; the registry-derived X/Telegram rosters re-anchor. Confirm the
validation-path auto-refresh keeps it current going forward (theater-agnostic hook
already live). Update #79.

## Part C — lane-steered source acquisition

- Selection: rank candidate sources by (lane-miss weight from roadmap 03) × (citation
  frequency in the ISW registry) × (reachability). Probe with the 2026-08-15 method:
  HTTP 200 + valid XML + fresh items + robots-clean + explicit theater lens pin.
- Activate up to the authorized count; verify first-pass ingestion attribution/tagging.
- Draft (do not send) the shafaq.com feed-permission outreach email for the operator
  (#76: 1,398 ir citations behind an explicit robots disallow).
- Re-probe the previously rejected set (majalla, almasdaronline, 964media, arabnews RSS)
  once each; record results either way.

## Part D — X-concentration target instrumentation

Make IR/RU/UA published-evidence X-share a standing, queryable output of the funnel
report (or a small read-only script if the dimension is missing), and record the
operator-chosen target (suggested: IR < 50% within this phase) in OPEN-TASKS #42.
No enforcement mechanism — measurement plus roster growth is the instrument.

## Part E — #37 assessment memo only

One page: does the conflict-union evidence show cross-theater claims structurally unable
to reach the correct benchmark because `country_iso2` is single-valued? If yes, scope the
N:M source→theaters design as a future prompt; if no, recommend continued per-channel
pins. No schema change here.

## Gates and completion

Standard gates (diff-check/typecheck/lint/unit; ingestion config changes get fixture
tests). One fresh reviewer: attack funnel misreading (counting documents where the loss
is claims, versions/mirrors double-counted), robots compliance, and lens-pin correctness.

`docs/reviews/CORPUS-FUNNEL-AND-SOURCE-DEPTH-<date>.md`: per-stage verdicts, registry
recovery evidence, activation list with probe results, X-share baseline + target, the
#37 memo, and a re-measurement date (~2 weeks) for coverage/thin-sourced deltas.
Status: `implementation-pass / re-measure-scheduled`.

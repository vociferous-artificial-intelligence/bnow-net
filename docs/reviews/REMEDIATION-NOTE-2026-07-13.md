# REMEDIATION-NOTE — 2026-07-13 (post-sprint code-review findings, seven fixes)

Starting commit `4357fd1` (clean worktree, main). Baseline gates verified before work:
1,279 tests / 105 files, typecheck, lint, `next build` all green. Every finding was
reproduced with a focused test before or alongside its fix. **Nothing deployed; no
production DB writes; no paid provider calls; no entity cleanup applied; no digest
regeneration; no migrations added; no env changes.**

## Summary (priority order)

| # | Finding | Verdict | Fix |
|---|---|---|---|
| 1 | Access requests treated as digest subscribers | CONFIRMED (P1) | Recipient policy module; subscribe_intents never selected; demo fallback removed |
| 2 | Dropped allegation survives in event title/summary | CONFIRMED (P1) | R1 drop now forces the event-prose rebuild |
| 3 | hasAttribution accepts unsafe declaratives | CONFIRMED (P1) | `hasGoverningAttribution` + title/summary rebuilt, never prefix-patched |
| 4 | Ask "citation stripping" only clears metadata | CONFIRMED (P1) | Deterministic answer replacement + evaluator rejects surviving `[cN]` |
| 5 | Year-only datadark periods falsely stale | CONFIRMED (P2) | Granularity-aware ranges aged from period END; invalid dates rejected |
| 6 | Entity cleanup not durable | CONFIRMED (P2) | persistDigest resolves canonical identity; plan doc corrected + sequenced |
| 7 | /trade provenance shows another job's fetch time | CONFIRMED (P2) | Shared cohort SQL + min/max window with range wording |

No finding was rejected. All seven reproduced exactly as described.

## Issue 1 — digest recipients (privacy / beta boundary)

**Root cause.** `scripts/email-digest.ts` selected `users ⋈ subscriptions UNION
subscribe_intents` with no status filter. Since the /access form inserts every beta
requester into `subscribe_intents` (`source='access_form'`, `request_status='new'`),
any manual run with live Postmark would have mailed a production intelligence digest
to unapproved strangers. Zero recipients fell back to `demo@bnow.net` — an external
address — with the same content. History check: the UNION came from the original
one-commit mailer (`4540fda`, file-outbox era); no doc ever ratified intents as digest
opt-ins (GTM/SETUP docs call them "waiting buyers" — interest capture, not delivery
consent). Approval of an access request grants SIGNIN_MODE=invite eligibility only.

**Fix.** New `src/lib/email/digest-recipients.ts`: `DIGEST_RECIPIENTS_SQL` reads ONLY
`users ⋈ subscriptions` (status included); pure `eligibleRecipients()` keeps
`status IN ('active','pending')` (matches the old comment, excludes
past_due/canceled), dedupes case-insensitively. The script sends NOTHING with zero
eligible recipients; `--to=addr` is the explicit operator override for test delivery.
Header comment (stale "RESEND_API_KEY" reference) rewritten.

**Tests (8, `digest-recipients.test.ts`).** SQL never references subscribe_intents;
new and approved requesters structurally excluded; active/pending included;
canceled/past_due excluded; case-insensitive dedupe; null/blank dropped; empty → [].

## Issue 2 — dropped allegation survived in event prose (ruling 19)

**Root cause.** The R1 drop branch `continue`d without setting
`hasDisputedAllegation`, so an event carrying a safe confirmed claim plus a dropped
single-doc allegation kept its ORIGINAL freeform title/summary — allegation included
("Refinery struck; governor arrested for corruption" survived verbatim).

**Fix.** A new `droppedAllegation` flag joins `hasDisputedAllegation` in triggering
R3; R3 now REBUILDS both title and summary via `deterministicCopy()` — the
representative (longest) retained claim's own text, hedging-labeled only when that
claim is disputed and unattributed (a confirmed representative passes plainly, never
mislabeled "Sources claim:"). Invariants preserved and test-pinned: confirmed-only
events reference-equal; zero-retained-claims events dropped; source links never
reassigned (claims are dropped whole); idempotent (second pass no-op, stats all
zero); telemetry counts only actual changes; guard-before-overwrite-verdict ordering
unchanged in `persistDigest`.

**Tests.** New describe "a dropped allegation cannot survive in the event's
title/summary": mixed confirmed+dropped rebuild (no "arrested"/"corruption"/name in
prose, confirmed claim byte-intact with its docIds), idempotency (reference-equal
second pass), wholly-unsafe event dropped, disputed non-allegation representative
gets the hedging label.

## Issue 3 — attribution had to govern, not merely occur (ruling 19)

**Root cause.** `hasAttribution` matched attribution words ANYWHERE, so the exact
production title — "US Senator Lindsey Graham died unexpectedly, with reports
suggesting his involvement in corruption schemes may have influenced the circumstances
of his death" — counted as "attributed" via the trailing "reports" and passed
untouched. The shipped fixture used the simplified "…dies amid corruption scandal"
title and did not pin the production shape (implementation note corrected).

**Fix.** Two layers, both structural: (a) event title/summary on allegation-bearing
events are now always REBUILT (issue 2's R3), so event prose is never accepted on the
strength of an incidental attribution word; (b) claim-level R2 uses new
`hasGoverningAttribution` — the first attribution marker must PRECEDE the first
allegation-lexicon match ("Russian state media claims X died" governs; "X died, with
reports suggesting…" and trailing "officials denied…" do not; text without allegation
content degrades to plain `hasAttribution`). Conservative by design: a false positive
adds a redundant label. Guard labels ("Sources claim:" at index 0) always govern →
no double-prefixing, idempotency preserved.

**Tests.** The verbatim production title+summary fixture (asserts the declarative
lead and "may have influenced" causation do not survive; output attributed;
idempotent); trailing-denial clause does not qualify a leading allegation;
already-labeled input reference-equal; `hasGoverningAttribution` unit cases.

## Issue 4 — Ask denial replacement + evaluator integrity

**Root cause.** `assembleV2`'s post-answer correction set `state='insufficient'`,
`citedClaimIds=[]` but left `answer` untouched; the UI renders `result.answer`
verbatim for insufficient results, so the Antarctic-style reply kept showing the
irrelevant claim summaries and literal `[c1]`/`[c2]` markers — while
`isNegativeAnswerHonest` credited the emptied metadata as honest.

**Fix.** The denial-led correction now also replaces the answer text with
`insufficientEvidenceCopy(currency)` — extracted from (and byte-shared with) the
relevance-boundary payload, so the two insufficient paths cannot drift; it names only
generic covered theaters/topics + data currency per SYSTEM_V2 rule 4 and contains no
citation syntax by construction. Kept truthful: provider stays `openai:<model>`,
`answerModel`/`rerankModel` and `usage`/`usageByStage` intact (the call was billed),
state `insufficient`, cited/related empty. Refusals still route to `refused` before
content parsing; mid-answer negation ("no reports of casualties") untouched
(`beginsWithDenial` anchor unchanged); the $0 relevant_count=0 short-circuit
unchanged. Evaluator: new `CITATION_SYNTAX_RE` — surviving `[cN]` in the answer text
forfeits honesty even with `citedClaimIds=0` and even on state `insufficient`.

**Tests.** Antarctic-shaped reply: replaced answer has no `[cN]`, none of the
irrelevant facts, denial-led, currency stated, usage/provider/model intact, and the
recalibrated evaluator scores the ACTUAL rendered text honest; the pre-fix payload
shape (empty metadata, citing text) now scores DISHONEST; eval-run fixtures updated —
the "pipeline's own correction" fixture is now the real replacement copy (the old one
still contained `[c1567]` and pinned the masking behavior); denial-family fixtures
de-cited so they test denial language alone.

## Issue 5 — datadark label granularity

**Root cause.** `parsePeriodLabel` mapped bare years to Jan 1. cbr-statistics
(periodRe `(20\d\d)`, cadence 45) polling "2026" on 2026-07-13 would read ~193 days
old > 2×45 → falsely stale (the sprint's own fix 2 created this time bomb; it would
have fired ~2026-04-01 each year). `Date.UTC` also rolled 31.02 into March.

**Fix.** `parsePeriodLabel` returns `ParsedPeriod {startMs, endMs, granularity}` — a
RANGE. Ordering (anomaly guard, extractPeriod best-candidate) compares `startMs`; AGE
is `periodAgeDays()` measured from the EXCLUSIVE END: a label that can still denote
the present is never stale, at any granularity, in any year. "2025" on 2026-07-13 is
~193d past its end → stale; the same label early in 2026 is within cadence slack.
Calendar validation round-trips the UTC date and rejects impossible dates. The
extraction regex was deliberately NOT changed: CBR is unreachable from this box, so a
"realistic fragment" for a new dd.mm.yyyy hub extraction could not be captured
honestly; the granularity rule makes the existing bare-year signal correct instead.
cadenceDays untouched.

**Tests.** Range/granularity parse shapes incl. year-end rollovers; current-year
bare label ok mid-year (and "2027" mid-2027 — correct next year); previous-year label
stale past 2× cadence, ok early in the following year; dated CBR publication ok;
17.09.2013 still stale; 31.02/30.02/31.04/29.02.2026 rejected, 29.02.2024 accepted;
older bare-year parse cannot overwrite a newer stored period (anomaly preserved);
all pre-existing evaluate/extractPeriod behavior green.

## Issue 6 — durable entity canonicalization

**Root cause.** `persistDigest` get-or-create matched by exact `(kind, name)`. The
cleanup plan's claim that "future persists fold at source" via reduce-time
canonicalKey was wrong on two counts: folding happens within one reduce batch (a
digest whose evidence carries only "Андрей Воробьёв" has nothing to fold against),
and representative-spelling voting can elect a raw variant. Either path recreates a
merged duplicate right after the operator applies the plan.

**Fix.** `resolveEntityId` in digest-persist.ts: a per-transaction cache of all
entities keyed by `(kind, canonicalKey(name))` (ORDER BY id — earliest row wins
deterministically while pre-cleanup duplicates coexist). A canonical hit reuses the
existing row — display name NEVER overwritten by a raw spelling — and appends a
differing raw spelling to `aliases` (deduped, same transaction). A miss inserts by
exact (kind, name) with the existing unique-index ON CONFLICT (same-spelling races
safe). Kind is part of the identity; ambiguous bare surnames have distinct canonical
keys, so they are never auto-merged at persist (surname folding remains a
cleanup-script-only rule). Empty canonical keys (degenerate names) bypass the cache.
**No migration** — schema untouched; a canonical unique index is impossible anyway
while canonicalKey (curated alias families) lives in TS. Documented residual: two
concurrent persists inserting two DIFFERENT new spellings of one NEW identity can
still race one duplicate pair — rare, converged by the cleanup script.
**`scripts/entities-cleanup.ts --apply` was NOT run.** ENTITY-CLEANUP-PLAN §4
corrected: the plan is durable ONLY behind a deploy of this code; OPEN-TASKS #61 now
carries that sequencing rule.

**Tests (6 new in digest-persist.test.ts).** Cyrillic variant reuses canonical row +
alias append with exact params; ё/е variants → same id; stored-spelling repeat is a
pure reuse (no insert, no alias write); Pavel Vorobyov gets its own row; bare
"Vorobyov" not auto-merged; same name different kind → separate row.

## Issue 7 — /trade provenance cohort

**Root cause.** `latestTradeFetch` ran `max(fetched_at) WHERE partner_code=643` with
no flow/reporter filter, while the page displays `getDivergence("X")`
(`partner_code=643 AND flow_code='X'`). The materials job upserts US IMPORT rows
(reporter 842, flow 'M') into the same table — Russia appears among its suppliers —
so its newer `fetched_at` could stamp the export page's "last fetched" date.

**Fix.** One exported `TRADE_COHORT_SQL` fragment (`FROM trade_flows WHERE
partner_code=$1 AND flow_code=$2`) now feeds BOTH `getDivergence` and the new
`tradeFetchWindow(flow)` (min+max fetched_at; null on empty cohort — never a borrowed
date). `latestTradeFetch` deleted (repo-local delete exception; sole caller was the
page). Wording via pure `fetchWindowLabel`: "last fetched YYYY-MM-DD" only when the
whole cohort shares one day, otherwise "fetched between A and B" — a lone refreshed
reporter can no longer overstate the rest of the dataset's freshness.

**Tests.** `run.test.ts` (8): a behavioral fake applies the parameterized WHERE like
Postgres would — the newer materials import row does NOT move the window, a newer
export row DOES, unrelated partners don't, empty cohort → null, and every query from
both functions is asserted to contain the shared fragment with params `[643,'X']`;
label wording pinned. `page.test.tsx` (+2): range and single-date wording rendered,
nothing when empty, cohort flow "X" passed (the old page mock silently swallowed the
new imports — made faithful).

## Verification

- Focused suites per issue: all green (runs shown per-issue above).
- `npm test`: **1321 tests / 107 files** green (baseline 1279/105; +42 tests, +2
  files; no test deleted — the eval-run fixtures that changed were pinning the
  masking defect itself, and each was replaced by a stricter assertion).
- `npm run typecheck` clean · `npm run lint` clean · `npm run build` clean.
- `next-env.d.ts` restored to its tracked state after the build (per instructions).
- git status: only the intentional implementation/docs changes (listed below).
- No deploy, no prod DB writes, no paid provider calls, no entity cleanup, no digest
  regeneration, no migrations, no env changes.

## Files changed

Implementation: `src/lib/analysis/publication-guard.ts`,
`src/lib/analysis/digest-persist.ts`, `src/lib/ask/answer.ts`,
`src/lib/ask/eval-run.ts`, `src/lib/datadark/check.ts`, `src/lib/trade/run.ts`,
`src/app/trade/page.tsx`, `scripts/email-digest.ts`; new
`src/lib/email/digest-recipients.ts`.
Tests: `publication-guard.test.ts`, `digest-persist.test.ts`, `ask.test.ts`,
`eval-run.test.ts`, `datadark.test.ts`, `src/app/trade/page.test.tsx`; new
`src/lib/email/digest-recipients.test.ts`, `src/lib/trade/run.test.ts`.
Docs: AGENTS.md (ruling 19 corrected in place + decision-log entry),
`docs/reviews/ENTITY-CLEANUP-PLAN-2026-07-13.md` (§4 durability corrected),
`docs/reviews/PRIVATE-BETA-READINESS-NOTE-2026-07-13.md` (§B/§D correction
annotations), `docs/OPEN-TASKS.md` (#61 sequencing), `docs/PROGRESS.md`, this note.

## Rejected recommendations (partial, with evidence)

- **Issue 5, "extract an actual dd.mm.yyyy publication date from the CBR hub page":
  not taken.** The CBR site is unreachable from this box (standing WSL2 DNS note), so
  a source-specific extraction change could only have been written against an
  invented fragment — exactly what the review told us not to do. The granularity fix
  makes the existing bare-year signal truthful and stays correct for any future
  year-only label; a fixture-backed hub extraction can follow once a real page
  capture exists.
- **Issue 6, new migration/schema field for canonical identity: not taken.**
  canonicalKey's curated alias families live in TS and cannot back a DB unique index
  without duplicating the logic in SQL; the application-level resolution meets every
  stated requirement without touching applied migrations, at the cost of the
  documented (rare, self-converging) concurrent-different-spelling race.

## Remaining operator actions (unchanged from the sprint note, plus sequencing)

1. **Deploy this remediation** before: applying the entity cleanup plan (#61 —
   now a hard prerequisite), any digest regeneration (Graham repair #62 benefits from
   the strengthened guard), and the X historical catch-up.
2. Entity cleanup `--apply` (operator-authorized, after the deploy).
3. Graham digest-row repair (#62), Postmark sender domain, SIGNIN_MODE flip decision,
   beta wording confirmation — all unchanged from the sprint note.
4. If a paid ASK eval gate re-run is wanted post-remediation: `scripts/ask-eval.ts`
   (~$0.15) — the honesty metric is now stricter, so prior scorecards are not
   comparable.

# Operator decision packet — 2026-08-28

Consolidated from the 2026-08-27/28 roadmap session. Ordered by deadline.
Nothing here was executed: every item below is an operator decision.

## 1. X all-time cap (#101) — decide within ~2 weeks

- Measured 2026-08-27: `x_api` **$57.84 of the $75 `X_SPRINT_USD_CAP`**
  (77.1%); 7-day burn **$1.15/day** → ~$17 headroom ≈ **15 days; estimated
  fail-closed exhaustion ~2026-09-11** (point-in-time projection — X volume is
  event-driven, ±several days).
- Consequence at the cap: `SpendGuard.tryReserve()` refuses and X ingestion
  STOPS (fail-closed by design; X-health alerts; watermarks preserve
  resumability, coverage degrades — X is the largest ru corpus arm).
- Options: **(a) raise to 150 (recommended** — ~3 months at current burn; the
  $2.50 daily cap remains the real brake); (b) raise to 100 (~5 weeks,
  revisit); (c) accept the stop. Execution when approved: env edit in all
  Vercel envs + redeploy; no code change.

## 2. #94 — expired map override pair (hygiene, no deadline)

- `MAP_USD_CAP_DAILY_OVERRIDE_USD` / `_UNTIL` confirmed (2026-08-27, read-only
  `vercel env ls`) still installed **in Production only**; expired-by-code
  since 2026-08-17T13:00Z — **removal changes no runtime behavior**.
- Plan when approved: `vercel env rm` both in Production → redeploy current
  build → verify `/health` + the next :40 map run + `env ls`.

## 3. Branch/register hygiene (register §9.4; no deadline)

- Refreshed inventory (2026-08-27): **19 remote branches fully contained in
  `main`** and deletable at leisure (plus this session's merged PR branches);
  keep: `codex/paddle-onboarding-page` (preservation), the LOCAL provenance
  parks (QF/conflict integration + audit branches, p0–p7 worktrees).
- `docs/designs/HUMAN-ADJUDICATION.md` is now carried onto `main` by this
  docs PR (register §9.4 item discharged).
- No deletions performed (remote-branch deletion not authorized).

## 4. npm vs pnpm + business documents (register §6; no deadline)

- Tracked reality: the repo is npm (`package-lock.json`; hooks/CI npm).
  **Recommendation: stay npm**; delete the stray untracked pnpm lockfiles in
  the primary checkout at your convenience (they are in your dirty checkout —
  untouched by this session).
- Business docs (GO-NO-GO register, outreach roster, roadmap prompts, modified
  PARTNER-STRATEGY, `claude/business-planning-20260817`): still outside
  `main`. **Recommendation: private non-engineering store**, not this repo.

## 5. QF-C paid-evaluation authorization (§6 gate — when you want the bake-off)

State after this session: harness + 10/11 hardening items landed (PRs
#31/#32); corpus-v2 drafts machinery-verified awaiting review; paid dispatch
remains IMPOSSIBLE (no `EVAL_*` env exists; multiple fail-closed preflights).
To authorize the first paid run, decide:
1. Candidate identities (+ the mandatory gpt-4o-mini baseline live run first,
   reps 3, ~$0.10–0.30 by estimate).
2. Caps BEFORE code reads them (ruling 4): `EVAL_USD_CAP_DAILY` (recommend 2)
   + `EVAL_DATABASE_URL` (disposable branch — production-host equality now
   refused by code) in every env.
3. Acceptance = the pre-registered gates.ts constants (no goalpost moves); a
   PASS only ever PROPOSES a registry entry.
4. Matrix cells: {fed 200,400} × {depth 1500,4000} on military cells +
   controls; capacity cells meaningful only after corpus-v2 lands.
Worst-case cost at 4o-mini-class prices: ~$1–3 for the full fixture matrix;
re-estimate per candidate at authorization time (`--capacity-matrix`).

## 6. Conflict evaluator (soak gates — the long pole)

Engineering done: gate-5's instruments (PR #33) + the full gate assessment.
Unavoidable operator items before any soak: 5 decision-log/register entries
(incl. the compound-attestation adjudication #12.3 and the snapshot-vs-
retrospective election), 2 legal reviews, labeller commitments (primary +
30-pair second labeller at κ ≥ 0.70), `EVAL_*` caps, the live-dispatch code
review, and 4 enablement posture decisions (robots pattern + page metadata,
evidence-route URL/ordinals, anonymous bySource buckets, the
`CONFLICTS_UI`⟷`FEATURE_AUTH_GATE` pair). Then the ≥21–35-day predeclared
soak. Buildable-next engineering (no authorization needed): W5–W12 per the
Phase-9 assessment (compound derivation module + transient measurement
harness, snapshot instruments, neutrality pins, render fixes) — ~2–3 days
across 2 focused PRs when scheduled.

## 7. Corpus-v2 review (unblocks the capacity matrix's meaning)

Drafts at the session scratchpad (`eval-corpus-v2/`): 26 cases,
machinery-verified, all-fictional, with 14 open questions and a required
contract cap raise (1,600 → 6,000 chars for capacity docs). Wants a
maintainer pass before committing as v2 datasets (which also carries hardening
item 6's heldout `mustNotMatch` pins and the numeral-instrument fixtures).

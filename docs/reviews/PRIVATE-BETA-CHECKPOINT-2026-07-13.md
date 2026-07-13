# PRIVATE-BETA-CHECKPOINT — 2026-07-13 (living checkpoint; deleted at merge)

Sprint prompt: `docs/prompts/2026-07-13-private-beta-readiness.md`. This file is the
resume point for a successor session: read `AGENTS.md`, the prompt, this file, then
`git log` on the branch — in that order — and continue from the next step below.

## Branch / worktree

- Branch `20260713-private-beta-readiness`, forked from `main` @ `95fe1a2`
  (tag `pre-private-beta-20260713`).
- Worktree: `.workstream/20260713-private-beta-readiness` (all work happens here).
- Primary checkout untouched (was clean at fork).

## Baseline (recorded before any change)

- Baseline commit: `95fe1a2` ("docs: sequence beta and provider recoveries").
- Gates in the worktree @ baseline: `npm run typecheck` clean · `npm run lint` clean ·
  `npm test` = **1147 tests / 97 files green** (3.85s).

## Workstream status

| WS | Status | Notes |
|----|--------|-------|
| A1+A2 pricing→/access + beta copy | not started | |
| A3 /access form + migration 0018 + notify | not started | |
| A4 SIGNIN_MODE invite gate | not started | |
| B publication safety guard | not started | |
| C Signals semantics | not started | |
| D Ask relevance boundary | not started | |
| E entity canonicalization | not started | |
| F responsive 390px + dropdown repro | not started | |
| G materials/datadark/provenance | not started | G1 migration numbered AFTER A3's |
| H gates/browser/docs/merge | not started | |

**Next step:** implement A1/A2 (nav + /access page + /pricing redirect + hero copy).

## Migrations generated so far

(none)

## Env vars added so far

(none) — planned: `SIGNIN_MODE=open` (plain/readable, all Vercel envs + .env.local)
before deploying A4 code.

## Pending operator decisions encountered

- Beta commercial-policy wording: using neutral fallback "No self-service purchase or
  card is required to request access" until operator confirms explicit "no charge".
- `SIGNIN_MODE=invite` flip: build only; do not flip production.
- Response-window promise on /access confirmation: none promised until operator sets one.

## Deviations from the prompt

(none)

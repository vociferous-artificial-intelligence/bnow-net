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
| A1+A2 pricing→/access + beta copy | DONE | nav access entry (signed-out only, CTA), /pricing 308→/access (page-level permanentRedirect, force-dynamic), src/lib/pricing DELETED, pricing.* i18n keys DELETED (ns swap pricing→access), hero badge+line+request CTA, account beta framing (both FEATURE_STRIPE branches tested), sitemap/seo swapped |
| A3 /access form + migration 0018 + notify | DONE | /access page+form+action (honeypot, 1h dedupe, LinkedIn https+linkedin.com-host-only validation, no raw errors), operator email via after() + FEEDBACK_EMAIL, /admin/access review list, access.* i18n ×7 catalogs (native review pending, inventory updated) |
| A4 SIGNIN_MODE invite gate | DONE | src/lib/auth-delivery.ts: open (default, pinned byte-identical, zero DB) / invite (users row OR ADMIN_EMAILS OR approved subscribe_intents; fail-closed on DB error; courtesy email w/o link; identical outward resolution). SIGNIN_MODE=open added to .env.local (both checkouts); Vercel envs at deploy time (H). Flip = operator decision. |
| B publication safety guard | DONE | publication-guard.ts (pure, idempotent) wired in persistDigest BEFORE overwriteVerdict (covers both engines; ordering test-pinned). Rules R1–R6: drop 1-doc disputed reputational person-allegations (ALLEGATION_MIN_DOCS=2); attribute allegation claims; deterministic copy on allegation events (model prose never survives); label wholly-disputed unattributed events; no wash; confirmed events byte-identical. finalizeEvents: corroboration promotion never confirms person-allegations (native-hedging ladder). Prompts strengthened (synthesis rules 5–7, legacy rule 7). Scoreboard: ours_only carries hedging (score.ts both paths); detail page 'BNOW-only reported item' + hedge for non-confirmed (oursOnlyPresentation in lib/validation/ours-only.ts, live-claim fallback for old runs); explainer copy updated en+uk. Graham regression fixtures green. NO production digests regenerated. |
| C Signals semantics | DONE | isPressureClaim (pure, audited): person-only (SQL boundary `e.kind='person'` + pure recheck), defendant/dismissed/accused/suspect qualify by role, target/subject/other only with procedural-pressure text (PRESSURE_ACTION_RE — verbs, not topic nouns: Graham death story excluded), acting parties never. Canonical-person counting via canonicalKey (Khamenei triple folds). Evidence = qualifying claims only. detail: role/count + 'Analyst review required', NO names, NO 'purge' conclusion (names only in accepted-user evidence w/ hedge+sources; partially addresses OPEN-TASKS #58(b)). headline format unchanged. Expect prod ir purge signal to disappear (candidates were junk — correct outcome). |
| D Ask relevance boundary | DONE | Rerank strict schema += required bounded relevant_count (ids stay minItems=maxItems=k, ruling 7); validated against surviving prefix; fail-open on malformed/absent. relevant_count=0 + rerankUsed → insufficient BEFORE the answer model (in answerFromEvidence so eval runner inherits; embed/rerank usage + rerankModel preserved; provider 'none'; denial-led copy). relevant prefix (floored ASK_RELEVANT_EVIDENCE_FLOOR=8) to answer stage. Post-answer correction: denial-LED 'answered' replies (beginsWithDenial, ≤30-char anchor) → insufficient + citations stripped + related omitted; refusals untouched. SYSTEM_V2 rule 4: insufficient answers cite NOTHING, generic theater/topic naming only. Evaluator: negative honesty now requires zero citations (Venezuela fixture deliberately flipped — documented). Rollback ASK_RELEVANCE_BOUNDARY=0. NO paid eval run (operator authorization absent — unit fixtures only; record honestly). |
| E entity canonicalization | DONE (apply = operator) | CYR ё→e fold + one conservative ALIAS_GROUPS entry ("andrei vorobev"→"andrei vorobyov"); all three observed spellings → one key; Pavel/Ivan Vorobyov don't merge (tested); ambiguous bare-surname pinned. Deterministic dry run RAN against prod (read-only): 763→578 entities (80 drops, 105 merges), 548 claim edges, ≤47 repointed, Vorobyov 2623+2624→2622, Dembitsky 2348→20. Plan committed at docs/reviews/ENTITY-CLEANUP-PLAN-2026-07-13.md — NOT applied (stop condition: operator approval required). Coordination note: apply BEFORE the X historical rescore + OpenSanctions rescore per the sprint's provider-recovery ordering. |
| F responsive 390px + dropdown repro | DONE | ROOT CAUSE CONFIRMED IN A REAL BROWSER: Chromium floors a flex-col body's stretched <main> at min-content (measured /trade 608px, /scoreboard 688px — even with its existing overflow wrapper — /datadark 456px at 390 viewport). Fix at the shared boundary: root layout wraps children in a plain block `w-full min-w-0 flex-1` div (footer stays pinned). Plus: ClaimSources chip max-w+truncate (worst offender), trade+datadark tables overflow-x-auto, ask-result break-words, signals/digest header rows flex-wrap, account email break-all, ask input min-w-0 + /ask id=main, theater dl rows flex-wrap, home main w-full min-w-0. BROWSER-VERIFIED via dev-only playwright-core (scratchpad, NOT in package.json) against dev server PORT=3013: 17 routes scrollWidth==clientWidth==390 incl. digest detail w/ prod data; mobile sheet opens, no overflow, body locked, 0 pageerrors. Signed-in home NOT browser-verifiable anon (needs session) — components class-pinned; operator eyeball item. F2: trusted pointer + focus paths PROVABLY keep menus exclusive (new tests); synthetic .click() double-open documented as non-reproducible by real input; NO global state added. |
| G materials/datadark/provenance | not started | |
| H gates/browser/docs/merge | not started | |

**Next step:** Workstream B — publication safety guard (synthesize.ts + scoreboard).
Gates at A4 completion: typecheck/lint clean, 1195 tests / 101 files green.

## Migrations generated so far

- `drizzle/0018_messy_lilith.sql` — subscribe_intents + linkedin_url/use_case/request_status/source (additive; journal idx 18, prevId chains 0017). NOT yet applied to prod.

## Env vars added so far

- `SIGNIN_MODE=open` added to `.env.local` (primary + worktree). NOT yet in Vercel —
  add plain/readable (`--no-sensitive`) to all three Vercel envs BEFORE deploy (H).
  Default-open in code means a missing env changes nothing.

## Pending operator decisions encountered

- Beta commercial-policy wording: using neutral fallback "No self-service purchase or
  card is required to request access" until operator confirms explicit "no charge".
- `SIGNIN_MODE=invite` flip: build only; do not flip production.
- Response-window promise on /access confirmation: none promised until operator sets one.

## Deviations from the prompt

(none)

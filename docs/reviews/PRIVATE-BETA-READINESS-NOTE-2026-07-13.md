# PRIVATE-BETA-READINESS — implementation note (2026-07-13)

Sprint prompt: `docs/prompts/2026-07-13-private-beta-readiness.md`. Branch
`20260713-private-beta-readiness` (fork `main` @ `95fe1a2`, tag
`pre-private-beta-20260713`), built in the isolated worktree
`.workstream/20260713-private-beta-readiness`. This note absorbs and replaces the
sprint checkpoint file (deleted in the same commit).

## Commits (branch, oldest first)

- `b2035e3` docs: sprint checkpoint (baseline)
- `8272b6f` db: extend subscribe_intents for beta access requests (**migration 0018**)
- `0239d35` access: public beta request page + operator notification + admin review
- `6c12e3c` beta: reposition public offer as private analyst beta
- `dd8c368` auth: invite-gateable sign-in behind SIGNIN_MODE (default open)
- `445ea61` digest: deterministic publication-safety guard + safer scoreboard framing
- `86c04b2` signals: semantic integrity for the purge detector
- `cfc69e7` ask: relevance boundary + honest negative controls
- `c78e356` entities: ё fold + Vorobyov alias family; cleanup plan for operator
- `e41b16b` layout: 390px overflow fix at the shared boundary + dropdown repro
- `a27325a` solutions: partner names, datadark latest-period, provenance (**migration 0019**)

Deployment identifiers: recorded in the AGENTS.md decision-log entry for this sprint
(the deploy happens after the merge; see "Rollback" below for the pre-sprint target).

## Gates

- `npm run typecheck` clean · `npm run lint` clean.
- `npm test`: **1279 tests / 105 files** green (baseline 1147/97; +132 tests, +8 files).
- `npm run test:integration`: green on a disposable Neon branch (3 files / 14 tests;
  branch created, migrated through 0019 + 9999, deleted).
- `npm run build`: clean.

## Migrations (both additive; ruling 5 intact; 9999 still last)

- `0018_messy_lilith` — `subscribe_intents` + `linkedin_url`, `use_case`,
  `request_status DEFAULT 'new' NOT NULL`, `source` (journal idx 18, prevId → 0017).
- `0019_watery_the_professor` — `trade_flows` + nullable `partner_name`
  (journal idx 19, prevId → 0018).
- Apply order at release: **migrate prod BEFORE deploy** (new code reads both columns;
  both are additive so old code is unaffected). Standing trap honored: any
  branch-targeted migrate run overrides BOTH `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.

## Env vars

- `SIGNIN_MODE=open` — new, plain/readable, to be present in all three Vercel envs +
  `.env.local` (already added locally) at deploy time. Default-open in code: a missing
  env changes nothing. **Flipping to `invite` is an operator decision (stop condition).**
- New behavior knobs with safe in-code defaults (no env required):
  `ASK_RELEVANCE_BOUNDARY` (default on; `0` = rollback),
  `ASK_RELEVANT_EVIDENCE_FLOOR` (default 8), `DIGEST_MIN_CLAIM_RATIO` etc. unchanged.
- No new SpendGuard cap envs (ruling 4 N/A — no new paid-provider call sites).

## What shipped, per workstream

### A — private-beta access journey
- **A1/A2:** nav `Pricing` → `Request access` → `/access` (signed-out only; signed-in
  nav carries NO commercial entry on desktop, mobile sheet, or CTA strip — the strip now
  renders the entry's own href, closing the hardcoded-route drift). `/pricing`
  308-redirects to `/access` and renders no price copy; `src/lib/pricing/` deleted;
  `pricing.*` i18n keys deleted across all 7 catalogs (required namespace `pricing` →
  `access`). Hero: restrained `Private analyst beta` badge + one collaborative line +
  `Request beta access` primary CTA; scoreboard CTA + DB-driven Live-now retained.
  Account: `Private analyst beta — active` only while checkout is disabled AND a real
  `status='active'` subscription row exists (both `FEATURE_STRIPE` branches tested);
  no-plan accounts point at `/access`. No dollar amounts or founding-subscriber copy
  remain anywhere (browser-verified on visible text).
- **A3:** `/access` — email (required, ≤200), optional LinkedIn URL (https-only,
  `linkedin.com`/true subdomains only, lookalikes/credentials/ports rejected, stored
  exactly as volunteered, NEVER fetched/scraped/enriched), optional use-case (≤1,000),
  visually-hidden honeypot (filled → generic success, no insert), 1-hour same-address
  dedupe with no existence oracle, no raw DB errors, accessible labels/hints/error
  summary/status. Insert: `plan_code NULL`, `source='access_form'`,
  `request_status='new'`. **Operator notification** via the email seam inside
  `after()` — fire-and-forget, only submitted fields, skipped when `FEEDBACK_EMAIL`
  unset; a genuinely new address always notifies. **Review surface:** `/admin/access`
  (newest-first list; approval SQL documented on-page:
  `UPDATE subscribe_intents SET request_status='approved' WHERE id=<id>`).
  Privacy: no new purpose/processor/automated LinkedIn collection was introduced —
  the current Privacy Notice's voluntary-submission coverage applies; **no policy bump,
  no re-acceptance.**
- **A4:** `SIGNIN_MODE` gate at the `deliverMagicLink` seam
  (`src/lib/auth-delivery.ts`). `open` (default) pinned byte-identical: any address,
  zero DB queries. `invite`: link only for an existing `users` row, an `ADMIN_EMAILS`
  address, or an approved `subscribe_intents` row; fails closed on DB error; uninvited
  addresses get a courtesy email pointing at `/access` with NO sign-in link and no
  eligibility detail; both outcomes resolve identically so the UI can't become an
  address oracle. End-to-end journey composes: request → `/admin/access` → one-field
  approval → magic link works.

### B — publication safety (digests + scoreboard)
`src/lib/analysis/publication-guard.ts`, wired inside `persistDigest` BEFORE the
thin-overwrite verdict (one choke point covers both engines and every script;
ordering test-pinned). Rules (fixtures reproduce the Graham defect verbatim):
single-doc disputed reputational person-allegations DROP (`ALLEGATION_MIN_DOCS=2`);
disputed person-allegation claims carry attribution in their own text; events bearing
one get deterministic copy (attributed title, summary REPLACED by the representative
claim text — freeform model prose, where speculative causation lives, never survives);
wholly-disputed events can't read as unqualified declaratives (attributed prose
passes); a confirmed subclaim never washes a disputed allegation; confirmed events
pass byte-identical. `finalizeEvents` recomputes the hedging ladder on NATIVE
(pre-promotion) values for person allegations — repetition ≠ confirmation for
defamation-grade content. Prompts strengthened on both engines (prompt = request,
guard = enforcement). Scoreboard: `ours_only` divergences freeze `hedging` at scoring
time; the detail page labels non-confirmed unmatched claims **"BNOW-only reported
item"** with the hedge shown (live-claim fallback for pre-guard runs); explainer copy
updated (en+uk). K=5 voting, majority-gid fill, map-version filtering, spend guards,
thin-overwrite protection untouched. **No production digests regenerated.**

**Audit of existing unsafe prod wording (read-only, 2026-07-13):** event **4008**
(ru, 2026-07-13) — *"US Senator Lindsey Graham died unexpectedly, with reports
suggesting his involvement in corruption schemes may have influenced the circumstances
of his death"* — plus claims **4413** (`claimed`, unattributed death+sanctions
framing) and **4414** (`claimed`, corruption-causation story, already self-attributed
to Russian state media). Under the new guard the regression fixtures prove this shape
cannot re-publish. **Repairing the stored rows is a separate operator-authorized step**
(regeneration is spend + overwrite-guarded; see "Production data repairs" below).

### C — Signals semantic integrity
Purge candidates must be PEOPLE (`e.kind='person'` at the query boundary AND recheck
in the pure, audited `isPressureClaim`); `role='target'` alone never qualifies (it
tags strike targets) — target/subject/other roles need procedural pressure semantics
in the claim text (arrest/detention/charges/prosecution/conviction/investigation/
dismissal/removal/sanction — verbs, not topic nouns, so the Graham death story is
excluded); acting parties (prosecutor/patron/appointee/free-text titles) never
qualify. Unique people counted by `canonicalKey` (folds the live Khamenei
triple-count). Evidence lists carry only qualifying claim ids. `detail` drops the
generated `Targets incl.:` name list and the `possible factional purge` conclusion for
role/count language + an explicit **"Analyst review required"** qualification — names
now appear ONLY in the accepted-user evidence disclosure with hedge + sources
(advances OPEN-TASKS #58; final named-person policy still awaits counsel). Expected
visible effect in prod: **the Iran purge signal disappears** (its candidates were
air bases, NATO, countries, courts and triple-counted spellings — junk by
construction); the ru signal shrinks to genuine prosecutions/dismissals.

### D — Ask relevance boundary + honest negative controls
Rerank strict schema now REQUIRES a bounded `relevant_count` (ids keep
`minItems=maxItems=k`, ruling 7); count validated against the surviving id prefix,
fail-open when malformed. A paid rerank reporting 0 relevant stops BEFORE the answer
model: state `insufficient`, zero citations, zero related claims, denial-led copy,
embed/rerank spend preserved in `usageByStage` (in `answerFromEvidence`, so the eval
runner inherits it). Positive counts pass only the relevant prefix (floored at 8) to
the answer stage. Deterministic post-answer correction: a reply that BEGINS with
recognized insufficient-evidence language persists/renders as `insufficient` with
citations stripped and related omitted (anchored ≤30 chars in, so genuine answers
noting "no reports of casualties" mid-text are untouched; provider refusals keep
`refused`). SYSTEM_V2 rule 4: an insufficient answer cites NOTHING and may only name
covered theaters/topics generically. Evaluator recalibrated: negative honesty now
requires zero surviving citations (the Venezuela cite-while-denying fixture
deliberately flips — that leniency hid the Antarctic defect; documented in the test).
**No paid eval run — operator authorization absent.** Unit fixtures cover the exact
Antarctic control, a second out-of-domain control, the Moscow known-answer shape, the
temporal window path, rollback (`ASK_RELEVANCE_BOUNDARY=0`), and fail-open. If the
operator wants the paid gate re-run: `scripts/ask-eval.ts` with caps set, ~$0.15.

### E — entity canonicalization
`CYR` map gains `ё → e`; ONE conservative alias entry folds the observed Vorobyov
family to `andrei vorobyov` (no universal Cyrillic merge). All three prod spellings →
one key; unrelated same-surname people provably don't merge; ambiguous bare surnames
stay untouched. `scripts/entities-cleanup.ts` dry run gains an affected-count summary.
**Deterministic dry run executed against prod (read-only): 763 → 578 entities
(80 drops, 105 merges); Vorobyov 2623+2624 → 2622; Dembitsky 2348 → 20.** Full plan:
`docs/reviews/ENTITY-CLEANUP-PLAN-2026-07-13.md` — **AWAITING OPERATOR APPROVAL,
nothing applied.** Sequencing honored: apply before the X historical rescore and the
OpenSanctions rescore (canonicalization changes the population OpenSanctions scores).

### F — responsive layout + dropdown exclusivity
Root cause CONFIRMED in a real browser: Chromium floors a flex-col body's stretched
`<main>` at min-content width — measured `/trade` 608px, `/scoreboard` 688px (despite
its existing overflow wrapper), `/datadark` 456px at a 390px viewport. Fix at the
shared boundary: the root layout wraps `{children}` in a plain block
`w-full min-w-0 flex-1` div (footer stays pinned), plus local fixes: ClaimSources
chips bound+truncate canonical-URL source keys (the worst offender on digest detail +
signals), trade + datadark tables scroll in their own `overflow-x-auto` containers,
`/ask` answers `break-words`, signals/digest event header rows wrap, account email
breaks, `/ask` input `min-w-0` (+ page gains `id="main"`), theater-card rows wrap.
**No global horizontal clipping.** Browser evidence
(`docs/reviews/VIEWPORT-390-EVIDENCE-2026-07-13.txt`, dev-only playwright-core in the
session scratchpad — NOT added to package.json): **17 routes measured
`scrollWidth == clientWidth == 390`**, including digest detail with prod data and the
gated pages under dev parity; mobile sheet opens overflow-free with body scroll locked
and 0 page errors. **Honest gap:** the SIGNED-IN home needs a real session and was not
browser-rendered; its components are class-pinned (`min-w-0`/`w-full`/wrap contracts) —
operator eyeball item below. F2: trusted pointer AND focus paths provably keep menus
exclusive (new tests incl. account/language menus); the two-open state reproduces ONLY
under synthetic `HTMLElement.click()` with no pointerdown and no focus move — pinned
in a documenting test; NO cross-instance global state added (per prompt, trusted input
does not reproduce the defect).

### G — solution-page data quality + provenance
- **G1:** `trade_flows.partner_name` (0019); parser carries `partnerDesc`; both
  fetchers request `includeDesc=true` (live preview responses historically omitted
  desc fields — every stored reporter_name is "842"; parser tolerates absence; only
  verifiable from Vercel egress — see operator checklist). Read path: stored name →
  deterministic M49 map covering all 193 prod-observed partner codes
  (`src/lib/trade/partners.ts`) → explicit `Partner code N`. The production `#682`
  ($44.8B Saudi crude), `#170`, `#368`, `#218`, `#566`, `#328`, `#376` all resolve;
  tested. Reporter/partner never swap (pinned). No prod backfill needed — the map
  resolves legacy rows at read time with exactly the values a backfill would write.
- **G2:** `extractPeriod` scans ALL matches and returns the LATEST comparable period
  (the CBR form-default `17.09.2013` scenario is fixture-pinned); staleness is the
  period's AGE vs the poll instant (first-seen-ancient → stale immediately — the
  ok/2013 contradiction is structurally gone, and the latent false-stale time bomb at
  ~2026-10-04 is defused); an older parse never overwrites a credible newer stored
  period (anomaly recorded to history WITHOUT bumping `last_changed_at`). The
  unsupported "series tend to go dark just before the numbers turn bad" is replaced
  with "suppression can be an analytical signal in itself, and should be corroborated
  with other evidence". **The stale prod `cbr-key-rate` row self-corrects on the first
  post-deploy daily cron** (09:00 UTC) — no manual repair; verify next morning.
- **G3:** both pages link the official UN Comtrade portal + documentation
  (`rel="noopener noreferrer nofollow"`, descriptive text), state
  reporter/flow/partner/HS/period + last-fetched date for reproducibility, keep the
  mirror-data caveat, drop the S&P/CEPR/KSE name-drops (no precise citation to link),
  and soften the uncited chokepoint share percentages.

## Browser acceptance matrix — results

| Check | Result |
|---|---|
| Signed-out desktop: badge, CTA→/access, nav entry | PASS (headless Chromium, dev server) |
| No dollar amounts / founding copy / registry promise (visible text) | PASS |
| /pricing → 308 → /access | PASS |
| Signed-out 390px: no document overflow; sheet accessible; access CTA | PASS (17 routes; sheet interaction test) |
| Access form behaviors | Unit/component-tested (valid/email/lookalike/honeypot/dedupe/raw-error/notify via seam). NOT exercised against the dev server — it points at PROD (a submission would write a real row + send a real email) |
| Sign-in gating: open byte-identical; invite allow/deny matrix; identical UI | Test-pinned (14 tests). Production stays `open` |
| Signed-in analyst surfaces | Gated pages verified under dev parity (anon + gate off); real-session pass = operator eyeball item |
| Digest safety | Unsafe prod wording identified (event 4008 + claims 4413/4414); regression fixtures prove the shape cannot re-publish; no spend, no regeneration |
| Signals contamination | Detector-level tests (NATO/courts/strike-target/alias/evidence-subset); prod signal change lands with deploy |
| Ask negative controls | Unit fixtures (no paid run authorized) |
| Solution pages: no #NNN, CBR consistency, source links | Tested + code-verified; CBR live page unreachable from this box — first post-deploy cron verifies |
| Console/network | 0 page errors on probed routes |

## Production data repairs — proposed, NOT applied

1. **Entity cleanup plan** (`ENTITY-CLEANUP-PLAN-2026-07-13.md`): operator approves →
   `npx tsx scripts/entities-cleanup.ts --apply` + integrity checks in the plan doc.
2. **Graham digest rows** (event 4008 / claims 4413, 4414 and the 07-12/07-13 ru
   digests): repair = regenerate those digest days AFTER this deploy (new guard
   active), guarded by existing caps + the thin-overwrite rule, comparing before
   replacing — or leave standing with the scoreboard now labeling the unmatched claims
   "BNOW-only reported item" with hedges. Operator decision; NOT bundled here.
3. **`cbr-key-rate` row**: self-corrects via the daily cron post-deploy (no action).

## Rollback

- Full: revert the merge commit, redeploy. Pre-sprint deploy target:
  `dpl_9CzgfnFhVDkLv6KJriBaa5oXhkmV` (aliased bnow.net, 2026-07-13 caps deploy).
- Migrations stay (additive; old code ignores the new columns).
- Scoped: `ASK_RELEVANCE_BOUNDARY=0` (ask boundary), `FORCE_REGEN=1` (persist guard
  override), `SIGNIN_MODE` stays `open` unless operator flips.

## Unresolved operator / counsel decisions

1. Beta commercial-policy wording: the explicit words "no charge" are NOT published —
   neutral fallback in place ("No self-service purchase or card is required to request
   access"). Confirm or keep.
2. `SIGNIN_MODE=invite` flip timing + confirm the grandfather set (= every existing
   `users` row + `ADMIN_EMAILS` + approved requesters).
3. Response-window promise on /access: none promised (change only if it will be met).
4. Named-person visibility on signed-in /signals (OPEN-TASKS #58): detail no longer
   names anyone; whether evidence quotes may keep names awaits counsel.
5. Entity cleanup plan apply (above).
6. Graham digest-row repair (above).
7. i18n: ~31 new machine-translated strings (access journey + scoreboard copy) await
   native review — inventory updated in `UK-NATIVE-REVIEW-2026-07-12.md`.

## Operator checklist (non-code beta-readiness, from the sprint prompt)

1. **Postmark sender domain is still scenefiend** — the magic-link email is an invited
   analyst's first impression; migrate before/at invitations (SETUP-NEXT-WEEK).
2. **X historical completeness (Jul 9–13) remains open.** Steady-state polling is live,
   but run `docs/prompts/2026-07-13-x-gap-catchup-rescore.md` AFTER this sprint's
   deploy. **Workstreams B and E are the gating dependencies and are: B — deployed
   with this sprint (publication guard active before any historical digest
   regeneration); E — code deployed, prod entity merge plan awaiting approval (apply
   it before the OpenSanctions rescore).** Then run
   `docs/prompts/2026-07-13-opensanctions-monthly-rescore.md` LAST. Neither provider
   recovery is complete; nothing here changed X/OpenSanctions caps, checkpoints,
   watermarks, or provider state, and no paid recovery calls were made.
3. Confirm beta wording (above), decide the invite flip (above), set the /access
   response-window promise (above).
4. First post-deploy checks: `/admin/access` reachable; a scheduled datadark cron
   corrects `cbr-key-rate`; the next monthly materials/trade pulls populate
   `partner_name` (verifies `includeDesc` live); /signals shows the recalibrated
   signals; eyeball the SIGNED-IN home at 390px on a phone (the one surface browser
   verification could not reach).

# BNOW.NET private-beta readiness and analyst-trust remediation

**Prepared:** 2026-07-13  
**Repository:** `/home/go/code/bnow.net`  
**Objective:** Reposition the public offer as a private analyst beta and remediate the signed-in trust, relevance, responsive-layout, and data-quality defects found in a real production analyst-session test.

## Instructions to the implementing agent

Read `/home/go/code/bnow.net/AGENTS.md` completely before acting. Its project invariants are binding.

Important authority note: the repository's current top-level agent role prohibits application coding by the research/orchestration Codex role. If you are a Codex session governed by that restriction, **do not modify application source**. Use this document to prepare or supervise a handoff to an authorized coding agent such as Gemini CLI, Claude Code, or an explicitly authorized engineering agent. If you are the authorized coding agent, implement the work below.

Do not begin by rewriting the product. Preserve the existing architecture, applied migrations, feature gates, spend guards, source-traceability trigger, legal-acceptance behavior, digest-engine rollback, and K=5 map-reduce synthesis invariant. Never edit or delete an applied migration. Add forward migrations only; `drizzle/9999_claim_source_trigger.sql` remains last.

Start with:

1. `git status --short` in the primary checkout and preserve any user changes.
2. Set up the isolated branch + worktree (next section) and do ALL subsequent work inside it.
3. Read `AGENTS.md`, `docs/PRODUCT-BRIEF.md`, `docs/OPEN-TASKS.md`, `docs/TIME-MODEL.md`, and the recent analyst-trust/legal notes under `docs/reviews/`.
4. Run the baseline gates inside the worktree: `npm run typecheck`, `npm run lint`, `npm test`.
5. Record the baseline commit and test counts in the checkpoint file (below) and, later, the implementation note.
6. Work in small commits or clearly separated patches. Do not deploy until all local gates and the browser acceptance story pass.

### Isolation: dedicated branch and worktree (mandatory)

The primary checkout at `/home/go/code/bnow.net` is shared — other agents may be working
there concurrently (this is a known hazard in this repo). Do not edit, build, or run
long-lived processes in it beyond the initial status check and the final merge.

- Branch: `20260713-private-beta-readiness`, created from current `main`. Tag the fork
  point `pre-private-beta-20260713` (repo convention).
- Worktree: `git worktree add .workstream/20260713-private-beta-readiness
  20260713-private-beta-readiness` — `.workstream/` is already gitignored and
  eslint-ignored for exactly this purpose. Work only inside that directory.
- Run `npm install` inside the worktree (`node_modules` is per-worktree) and copy
  `.env.local` from the primary checkout if local scripts need it (it is gitignored;
  never commit it).
- If you need `npm run dev`, use a non-default port (e.g. `PORT=3013`) so you cannot
  collide with another agent's dev server.
- Do not touch the other `.workstream/` checkouts or the `bnow.net-i18n` worktree.
- Migration coordination across agents: this sprint generates forward migrations (A3, G1).
  If another concurrently running branch also generates migrations, the journal `prevId`
  chain will conflict at merge time — resolve by regenerating this branch's migrations on
  top of merged `main` (the MERGE 2 entry in `AGENTS.md` is the worked example). Never
  renumber an applied migration.
- Merge to `main` happens from the primary checkout, `--no-ff`, only after all gates are
  green and `main` has been merged/rebased into the branch first if it moved. Remove the
  worktree (`git worktree remove`) after the branch is merged.

### Checkpointing and resumability (mandatory)

Assume the session can be cut off at any time (token/context limit). Work so that a fresh
agent with empty context can resume from the committed state alone.

- Maintain a checkpoint file on the branch: `docs/reviews/PRIVATE-BETA-CHECKPOINT-2026-07-13.md`.
  It records, at minimum: workstream status (done / in progress / not started, with the
  in-progress one's exact next step), last known-green commit, gates last run and their
  counts, migrations generated so far, env vars added and where, pending operator
  decisions encountered, and any deviation from this prompt. Update it at every commit —
  the checkpoint update rides in the same commit as the work it describes.
- Commit at every completed atomic unit with gates green for the touched area; never
  batch multiple workstreams into one commit. If a hard stop approaches mid-unit, commit
  what exists with a `wip:` prefix plus a checkpoint entry stating precisely what is
  unfinished — losing context is acceptable, losing work or leaving ambiguous state is not.
  `wip:` commits must be made green (or squashed) before merge to `main`.
- Resume protocol for a successor session: read `AGENTS.md`, this prompt, the checkpoint
  file, and `git log` on the branch — in that order — then continue from the checkpoint's
  next step. Do not redo completed workstreams; verify their state by running the gates,
  not by re-implementing.
- Before the merge, the final implementation note under `docs/reviews/` absorbs the
  checkpoint file's content; delete the checkpoint file in the same commit so the merged
  branch leaves one authoritative record.

### Coordination with provider recovery work (binding)

This sprint runs **before** the separately planned historical X recovery and OpenSanctions
fixed-cutoff rescore. It must not absorb either provider operation into this branch.

- X steady-state ingestion is live again, but the July 9–13 historical interval is not proven
  cursor-complete. The separate handoff is
  `docs/prompts/2026-07-13-x-gap-catchup-rescore.md`.
- Workstream B's deterministic publication guard must be implemented, deployed, and verified
  before the X handoff regenerates historical digests. Do not regenerate those digests here.
- Workstream E must be complete before either historical rescore: X regeneration can create
  entities, and canonicalization can change the population OpenSanctions should score.
- After this sprint is deployed, run the X recovery first. Establish the resulting stable entity
  population, then run
  `docs/prompts/2026-07-13-opensanctions-monthly-rescore.md` last.
- Do not change X/OpenSanctions caps, checkpoints, watermarks, accounting periods, or provider
  state in this sprint. Do not make paid recovery/evaluation calls merely to verify this work.
- Workstream H's handoff must report whether Workstreams B and E are deployed and ready for the
  later provider runbooks; it must not claim either provider recovery is complete.

## Product decision already made for this sprint

The public product should be presented as a **private analyst beta**, not as a high-priced self-service subscription.

The intended relationship is collaborative: help working analysts save time in their daily monitoring, learn where BNOW fails, and shape the workflow. The signed-in product should feel like their workbench, not a sales funnel.

Implement these positioning rules:

- Remove public price cards and all dollar amounts.
- Replace public `Pricing` navigation with `Request access`.
- Do not show `Pricing` or `Request access` in signed-in navigation.
- Add a restrained `Private analyst beta` marker on the signed-out landing hero.
- Replace `Become a founding subscriber` with `Request beta access`.
- Preserve the public validation scoreboard and its honest metrics.
- Do not restore analyst access to the admin-only source registry merely to satisfy old pricing copy.
- Do not enable Stripe.
- Do not describe current access as a purchase, subscription commitment, founding rate, or locked-in commercial offer.
- Make the beta private in fact, not only in copy: sign-in must be invite-gateable (Workstream A4). Today `src/lib/auth.ts` issues a magic link to any email address with no allowlist or invitation check, so relabeling the nav alone leaves the full gated product — including the paid Ask pipeline — open to anyone.
- Recommended beta commercial policy: no charge, no card, and no purchase obligation for the initial invited cohort. Before publishing the explicit words “no charge,” confirm this policy with the operator. If it is not confirmed, use the neutral wording “No self-service purchase or card is required to request access.”

Suggested public copy, subject to ordinary i18n treatment:

- Badge: `Private analyst beta`
- Primary CTA: `Request beta access`
- Supporting line: `Built with working analysts. We’re inviting a small group to test whether BNOW saves time in daily monitoring—and to tell us where it fails.`
- Access-page heading: `Request analyst beta access`
- Access-page introduction: `We’re onboarding a small group of analysts, researchers, journalists and risk professionals. Tell us what you monitor and we’ll follow up personally.`
- Expectation statement: `Beta access is for evaluation and workflow feedback. BNOW remains an analytical aid, not a sole source for operational decisions.`

Avoid startup-centric language such as “help shape the future,” “founding subscriber,” “exclusive opportunity,” or pricing scarcity. Make the benefit concrete and analyst-centered.

## Production findings this work must address

The test account was `gregoryoconnor@gmail.com`, role `analyst`, active `full_annual`, with current legal acceptance. The following paths were exercised in production: signed-in home, country coverage, digest/detail/source expansion, entity pages, Signals, Ask, Search, scoreboard/detail, pricing, trade, critical materials, data dark, account, desktop navigation, and 390px mobile navigation.

### Trust and editorial defects

1. A Russia digest elevated low-confidence attributed reporting into declarative BNOW copy:
   - Event summary: `US Senator Lindsey Graham died unexpectedly, with reports suggesting his involvement in corruption schemes may have influenced the circumstances of his death.`
   - Underlying claims were `claimed`, confidence approximately `0.47`, and included Russian state-media reporting.
   - The scoreboard repeated related items as `ours only (potential lead)`.
2. Signals purge evidence was semantically contaminated:
   - Russia purge evidence included drone strikes, territorial claims, and the Graham story.
   - Iran purge “targets” included NATO, the Israeli government, the Supreme Court of Israel, and whole countries alongside people.
3. One person appeared as three entities: `Andrey Vorobyov`, `Андрей Воробьев`, and `Андрей Воробьёв`.

### Ask defects

Three live questions were submitted:

1. Known answer: `Did Ukrainian drones strike the Moscow region on July 13, 2026, and were casualties reported?`
   - Central answer worked, but differing injury scopes should have been qualified.
2. Temporal: `What significant military developments in Ukraine has BNOW recorded since July 9, 2026?`
   - Date parsing and cited answer worked; geographic intent was somewhat loose.
3. Negative control: `What significant operational changes occurred at Antarctic research stations since July 9, 2026?`
   - The prose denied coverage, but then summarized and cited unrelated Ukraine/Iran evidence.
   - Ledger row was incorrectly `state='answered'`.
   - It retrieved 156 candidates, exposed 60 evidence rows, cited 8 irrelevant claims, and cost about `$0.01274`.

### Commercial, responsive, and data-quality defects

1. Public Full Analyst pricing promised `Source-registry explorer + reliability data`, while an analyst receives a real 404 at `/registry`.
2. At a 390px viewport the signed-in home became approximately 643px wide and horizontally scrolled. The root body is `flex flex-col`; the home `<main>` is a flex item with the default `min-width:auto`.
3. Critical Materials displayed unresolved partner labels such as `#251`, `#376`, and `#699`.
4. Data Dark marked the CBR key-rate series `publishing` while showing `17.09.2013` as the latest period.
5. Trade and Critical Materials name UN Comtrade in prose but provide weak click-through provenance for the displayed dataset/method.
6. A synthetic DOM `.click()` test left Coverage and Solutions open simultaneously. Treat this as a reproduction task first: a real pointer sequence fires `pointerdown`, which may already close the other menu. Do not change the dropdown solely on the synthetic result.

## Workstream A — private-beta access journey

### A1. Replace public pricing with access-request positioning

Preferred route design:

- Add a public `/access` page.
- Change signed-out navigation from `Pricing` → `/pricing` to `Request access` → `/access`.
- Omit that commercial entry entirely for signed-in users on both desktop and mobile.
- Make `/pricing` redirect to `/access` so old links and search results do not dead-end.
- Remove `/pricing` from `src/app/sitemap.ts`; add `/access`.
- Ensure `/access` has appropriate metadata and remains indexable. The redirecting `/pricing` route must not render old price copy.
- Update `canonicalSection` and relevant navigation tests without creating duplicate nav paths.
- In `src/components/site-header-view.tsx`, remove the hardcoded `/pricing` mobile CTA target. Render the actual CTA entry href so future route changes cannot drift.

Relevant files include:

- `src/app/pricing/page.tsx`
- new `src/app/access/page.tsx` and tests
- `src/lib/nav/site-nav.ts`
- `src/lib/nav/site-nav.test.ts`
- `src/components/site-header-view.tsx`
- `src/components/site-header-view.test.tsx`
- `src/app/sitemap.ts`
- `src/app/page.tsx` and `src/app/page.test.tsx`
- `src/i18n/dictionaries.ts` and `src/i18n/i18n.test.ts`

Keep an internal nav id if that minimizes churn, but comments and tests must no longer describe pricing as the commercial anchor. The rendered label and destination are the user-facing contract.

### A2. Public beta marker and analyst-centered copy

On the signed-out landing hero:

- Add a small, non-alarming badge above the heading: `Private analyst beta`.
- Replace the founding-subscriber CTA and request-access tertiary link with `/access` links.
- Add one short line explaining the collaborative beta; do not inflate the hero.
- Retain the scoreboard CTA and live-coverage truth.
- Do not add marketing copy to the signed-in home.

In signed-in chrome:

- No price/access CTA in desktop nav, mobile sheet, or analyst home.
- Account may say `Private analyst beta — active` while checkout is disabled, but entitlement logic must continue to use the actual subscription/role state. Do not rename database plan codes merely for presentation.
- If the Account page condition is based on `FEATURE_STRIPE=false`, test both flag branches. Never infer “beta” from missing Stripe IDs alone.

Update all shipped catalog entries consistently or use existing translated request-access keys where appropriate. Mark machine translations for native review in the existing review document; do not silently claim native quality.

### A3. Access-request form

The `/access` form should be short:

- Work email: required.
- LinkedIn profile or company-page URL: optional.
- `What do you monitor day to day?`: optional, concise textarea.
- Submit: `Request beta access`.
- Fallback contact: visible mailto using the existing operator/feedback address.

Do **not** scrape, fetch, enrich, preview, or validate the contents of a LinkedIn profile. Store only the URL voluntarily provided by the requester.

Use a forward migration, likely `0018_*.sql`, to extend `subscribe_intents` with explicit nullable fields rather than encoding structured data into `note`. Reasonable fields are:

- `linkedin_url text`
- `use_case text`
- `request_status text not null default 'new'`
- optionally `source text` if there is a real reporting need

`plan_code` should be `NULL` for a beta request. Preserve old rows and the existing FK. Update `src/db/schema.ts`. Never edit an applied migration.

Server-action requirements:

- Normalize and validate email; max 200 characters.
- LinkedIn is optional. If present, parse as HTTPS and allow `linkedin.com` or a true subdomain ending `.linkedin.com`; reject lookalike hosts, credentials, non-HTTPS schemes, and overlong input. Accept normal `/in/` and `/company/` URLs.
- Limit use-case text to a documented maximum, e.g. 1,000 characters.
- Add a visually hidden honeypot. A filled honeypot should produce a generic success without inserting.
- Deduplicate identical email submissions over a short interval without revealing whether an address already exists.
- Do not store IP address, user agent, LinkedIn page contents, or inferred profile data.
- On success, show a calm confirmation and expected response window. Do not promise a response time unless the operator can meet it.
- On failure, do not leak raw DB/provider errors.
- Keep the form accessible: labels, autocomplete attributes, described optional fields, focusable error summary, and success status.

Access requests must reach a human. Today nothing reads `subscribe_intents`; without a
notification path, beta requests are write-only rows nobody sees. On successful insert, send an
internal notification email to the operator (reuse `src/lib/email/send.ts` and the existing
operator/`FEEDBACK_EMAIL` address), fire-and-forget: a notification failure must not fail, slow,
or alter the requester's response. Include only the submitted fields. Additionally give the
operator a review surface: a minimal newest-first `subscribe_intents` list in the existing
admin console is preferred; at minimum, document the exact `sqlq` query in the implementation
note. The dedupe window must not suppress the operator notification for a genuinely new address.

The current Privacy Notice already covers information provided in subscription-interest forms and other voluntarily supplied information. Do not casually bump the policy version and force every analyst through reacceptance. Record in the implementation note that no new purpose, processor, or automated LinkedIn collection was introduced. Escalate to the operator/counsel if the implementation would do more than store the volunteered fields.

Add unit/component tests for valid submission, invalid email, LinkedIn lookalikes, optional LinkedIn, length bounds, honeypot, dedupe, DB insert shape, redirects/success state, and raw-error suppression. Add a real-Postgres integration test if the migration/test harness makes that proportionate.

### A4. Invite-gated sign-in (the actual "private" in private beta)

Verified current behavior: the magic-link provider in `src/lib/auth.ts` (`deliverMagicLink`,
`sendVerificationRequest`) issues a sign-in link to **any** email address. There is no
allowlist, invitation check, or role requirement at sign-in; `requireAcceptedUser()` enforces
authentication plus legal acceptance only. Renaming the nav to `Request access` therefore does
not make the beta private: any visitor can sign in, click through acceptance, and use the full
gated product — including the paid Ask pipeline, contained only by the per-user/global daily
caps.

Build the gate now behind a config switch; the operator decides when to flip it:

- Add a mode env such as `SIGNIN_MODE` with values `open` (default) and `invite`. Default
  `open` preserves current behavior byte-for-byte so the deploy itself changes nothing.
- In `invite` mode, issue a magic link only when the address is (a) an existing `users` row
  (grandfathers every current account), (b) on `ADMIN_EMAILS`, or (c) an approved beta
  request — recommended: `request_status='approved'` on the requester's `subscribe_intents`
  row, so the journey composes end-to-end: request via `/access` → operator approves with a
  one-field update → magic link works.
- Enforce server-side at the link-issuance seam (`deliverMagicLink` or a guard immediately
  around it), never in page UI.
- The sign-in UI must show the same generic “check your email” confirmation regardless of
  eligibility — do not create an oracle for whether an address is invited or registered. For
  an uninvited address, either deliver nothing or deliver a short courtesy email pointing to
  `/access`; never deliver a sign-in link.
- In `invite` mode the check fails closed (DB error → no link, generic UI); in `open` mode it
  adds no latency, queries, or failure modes.
- Tests: `open` mode unchanged (pin it); `invite` mode allows existing user / admin / approved
  requester and denies unknown addresses; allowed and denied produce identical UI responses;
  courtesy email (if implemented) contains no sign-in link and no eligibility detail.
- Set the env in all Vercel environments and `.env.local` (readable/plain, `--no-sensitive`)
  before deploying the code that reads it. Do not flip production to `invite` without the
  operator (stop condition below).

## Workstream B — publication safety for digests and scoreboard

This is the highest-risk engineering item. A prompt-only change is insufficient.

Primary files:

- `src/lib/analysis/synthesize.ts`
- `src/lib/analysis/synthesize.test.ts`
- `src/lib/analysis/digest-persist.ts`
- digest/scoreboard render paths under `src/app/digests/` and `src/app/scoreboard/`
- legacy provider/persistence path if it can publish the same unsafe shape

Requirements:

1. Strengthen `synthesisSystemPrompt` so titles, summaries, and claims preserve attribution and hedging—not just the persisted hedging enum.
2. Add a deterministic post-synthesis publication guard. Do not trust the LLM to comply.
3. For an event supported in whole or material part by `claimed`, `unverified`, or `unknown` groups:
   - It must not receive an unqualified declarative title or summary.
   - Speculative causation not present in the cited group text must not be added.
   - Named-person allegations involving death, criminality, corruption, prosecution, sanctions, health, or comparable reputational harm require explicit attribution and must never be labeled a BNOW-confirmed fact solely through synthesis.
4. Prefer safe deterministic copy for disputed events. A good default is to derive the displayed disputed-event copy from the representative group/claim text plus an explicit label such as `Sources claim:` or `Unverified reporting:` rather than use freeform model summary prose.
5. Do not let one confirmed subclaim “wash” unrelated disputed subclaims in the same event. Safety must be evaluated per published claim and for event-level prose.
6. Consider dropping, rather than polishing, a high-risk event that is both low-confidence and weakly corroborated. Make thresholds explicit and unit-tested.
7. Preserve doc IDs, claim-source links, hedging, claim type, and entity derivation from groups. Never let the model choose source IDs.
8. Preserve K=5 voting, majority-gid fill, map-version filtering, persistence thin-overwrite protection, and spend guards.
9. Make the scoreboard render the same hedging/attribution context. `ours only (potential lead)` must not visually turn a low-confidence allegation into an endorsed lead. Use safer wording such as `BNOW-only reported item` for non-confirmed claims and show the hedge.

Required regression fixtures:

- Reproduce the Graham scenario with low-confidence `claimed` groups and a model output that declaratively states death plus corruption causation. Assert that unsafe event copy cannot survive.
- A corroborated but still attributed official claim remains attributed.
- A genuinely confirmed multi-source event remains readable and is not needlessly prefixed as unverified.
- A mixed event cannot use the confirmed part to make a disputed named-person allegation declarative.
- Unknown gids and empty events continue to be handled as today.

Do not regenerate production digests as part of local implementation. After deployment, any repair/backfill must be separately planned, guarded by existing spend caps and overwrite rules, and compared against the existing digest before replacing it.

## Workstream C — Signals semantic integrity

Primary files:

- `src/lib/analyst/run.ts`
- `src/lib/analyst/signals.ts`
- `src/lib/analyst/signals.test.ts`
- `src/app/signals/page.tsx`
- `src/app/signals/page.test.tsx`

Fix the detector, not merely the presentation:

1. Purge/elite-pressure candidates must be people. Filter `entity_kind='person'` at the query boundary and recheck in pure logic.
2. `role='target'` alone is not evidence of prosecution/dismissal. A military strike target, government, organization, place, or generic actor must never qualify.
3. Introduce a pure, audited `isPressureClaim`-style predicate using available fields. Extend `PressureClaim` with at least entity ID, entity kind, claim text/type/hedging, and role as needed.
4. Qualifying evidence should be tied to actual detention, investigation, prosecution, dismissal, removal, sanction, or comparable elite-pressure semantics. Use conservative rules; ambiguous items should not create a signal.
5. Count canonical people by stable entity identity, not lowercased display name alone.
6. Evidence IDs must contain only claims that actually qualified the signal. The evidence expansion should therefore not include unrelated drone/territorial claims.
7. Until media/privacy counsel approves named-person framing, remove the generated `Targets incl.: ...` list from the high-level detail. Prefer role/count language plus an explicit `Analyst review required` qualification. Exact claim text can remain inside the accepted-user evidence disclosure with its hedge and sources.
8. Avoid the analytical conclusion `possible factional purge` unless the detector has evidence beyond a raw count. A safer beta label is `cluster of recent reported prosecutions/dismissals`.

Regression tests must include:

- organization/government/NATO/Supreme Court target edges are excluded;
- strike targets are excluded;
- a dismissed named official qualifies;
- a prosecution defendant qualifies;
- duplicate aliases do not inflate the unique-person count;
- the evidence list contains only qualifying claims;
- anonymous projection still contains no names or claim/source details;
- an accepted analyst still gets hedge and traceability for qualifying evidence.

## Workstream D — Ask negative controls and relevance

Primary files:

- `src/lib/ask/rerank.ts` and tests
- `src/lib/ask/types.ts`
- `src/lib/ask/answer.ts` and `src/lib/ask/ask.test.ts`
- `src/lib/ask/eval-run.ts` and eval tests
- `src/lib/ask/limits.ts` and ledger tests
- `/ask` rendering tests

The current listwise reranker must return exactly K IDs, which forces irrelevant evidence into negative-control answers. Preserve the exact-K robustness while adding an explicit relevance boundary.

Recommended design:

1. Extend the strict rerank schema to return:
   - `ids`: exactly K candidate IDs, still ordered and constrained as today (keep standing ruling 7's pinned `minItems`/`maxItems`);
   - `relevant_count`: integer from 0 through K, indicating how many IDs at the front are actually relevant to answering the question. Mark it required in the strict schema (strict structured outputs reject optional properties) and bound it with `minimum`/`maximum`.
2. Update the rerank prompt: relevant items must be first; `relevant_count=0` when none address the subject. This keeps the constrained-decoding underfill fix while allowing a genuine no-match result.
3. Validate and clamp/reject malformed counts. Unknown/duplicate ID protections remain.
4. If a paid rerank returns `relevant_count=0`, stop before the expensive answer model and return `state='insufficient'`, no citations, no related claims, and no user-visible irrelevant evidence. Preserve and log the already incurred embed/rerank usage.
5. If `relevant_count>0`, pass only the relevant prefix to the answer stage, subject to a calibrated minimum/maximum.
6. If reranking is skipped or degraded, retain fail-safe behavior. Do not introduce a vector-score cutoff without evaluating known-answer recall.
7. Add a deterministic post-answer state correction: when the answer begins with the product's recognized insufficient-evidence language, persist/render `state='insufficient'`, not `answered`. In that state, strip irrelevant inline citations and omit related-claim UI. Do not misclassify an actual provider safety refusal as insufficient.
8. Tighten `SYSTEM_V2`: an insufficient answer should not summarize or cite merely adjacent unrelated material. It may name covered theaters/categories in generic guidance, but should not turn unrelated retrieved claims into an answer.
9. Update the negative-honesty evaluator. An “insufficient” answer with irrelevant citations should no longer receive full credit merely because the denial phrase exists.

Required live-style regression questions:

- Exact Antarctic negative control above: `insufficient`, zero citations, zero related claims, no Ukraine/Iran event summary.
- A second out-of-domain negative control.
- Moscow known-answer control retains the relevant evidence and qualifies casualty-count scope when sources differ.
- July 9 temporal question retains the parsed window and relevant events.
- Existing curated known-answer recall/citation gates do not regress.

Run the existing Ask eval harness with spend caps explicitly set only if the operator authorizes paid evaluation. Unit fixtures first. Record cost and gate results honestly.

## Workstream E — entity canonicalization

Primary files:

- `src/lib/entities/canonicalize.ts`
- `src/lib/entities/canonicalize.test.ts`
- existing cleanup/audit scripts and review workflow

Requirements:

1. Add the missing Cyrillic `ё` normalization.
2. Add a conservative alias family for the observed Vorobyov spellings/transliterations. Do not attempt an aggressive universal Cyrillic-person merge in this sprint.
3. Add tests for all three observed spellings and ensure an unrelated similarly named person does not merge.
4. Produce a deterministic cleanup dry run and report affected entity/claim-edge counts.
5. Do not apply production entity merges automatically. LLM proposals remain propose-only under standing ruling 6. Present the deterministic production mutation plan for operator approval, then apply transactionally with before/after integrity checks if authorized.

## Workstream F — responsive layout and navigation behavior

### F1. Signed-in home at 390px

Likely root cause: `body` is a column flex container in `src/app/layout.tsx`, and the home `<main className="mx-auto max-w-5xl px-6">` is a flex item with intrinsic `min-width:auto`.

Requirements:

- Add the appropriate `min-w-0`/`w-full` constraints at the narrowest correct shared boundary.
- Do not paper over the issue with global horizontal overflow clipping.
- Ensure quick links, recent Ask links, theater cards, validation tiles, and long questions shrink/truncate/wrap intentionally.
- At 390 CSS pixels, `document.documentElement.scrollWidth <= clientWidth` on the signed-in home.
- Check `/ask`, `/search`, `/signals`, digest detail, account, and solution tables at the same width.
- Where wide data tables genuinely need horizontal scrolling, wrap the table locally in an accessible overflow container rather than widening the whole document.
- Keep the mobile sheet and focus trap behavior intact.

Unit tests should pin important class/layout contracts, but complete this work with a real browser viewport test and screenshots. Note the repo has no browser-automation harness today (Vitest + jsdom only): use a headless browser if the environment provides one (a dev-only Playwright install against `npm run dev` or a preview deploy is acceptable). If no browser is available, say so honestly in the implementation note, pin the layout contract at the DOM/class level, and hand the operator an explicit manual viewport checklist — do not claim visual verification that did not happen.

### F2. Dropdown exclusivity

Reproduce with trusted pointer and keyboard events first. The existing outside `pointerdown` listener may already close the first menu during a real click; synthetic `HTMLElement.click()` bypasses that event.

- If trusted user input reproduces two open desktop dropdowns, coordinate them so opening one closes the others, including account and language menus.
- Preserve WAI-ARIA behavior, Arrow/Home/End/Escape/Tab support, focus return, outside click, route-change close, and browser-Back behavior.
- If trusted input does not reproduce it, add/adjust the test to document why synthetic `.click()` is not an accurate defect reproduction and do not add unnecessary global state.

## Workstream G — solution-page data quality and provenance

### G1. Critical Materials country names

Primary files:

- `src/lib/materials/run.ts`
- `src/lib/materials/concentration.ts`
- `src/lib/materials/materials.test.ts`
- `src/app/critical-materials/page.tsx`
- Comtrade ingestion/schema as needed

Do not solve this by adding only the three currently visible magic numbers if the upstream API already supplies `partnerDesc`.

Preferred fix:

- Add a nullable `partner_name` field to `trade_flows` through a forward migration. Coordinate numbering with Workstream A3's `subscribe_intents` migration: generate both via `drizzle-kit` in the order they are actually created so journal `prevId`s chain correctly, and `9999_claim_source_trigger.sql` stays last.
- Persist and update the upstream Comtrade partner description during pull.
- Prefer the stored partner name on read; retain a deterministic M49 fallback map only for legacy/missing rows.
- Backfill known existing partner codes deterministically, with an explicit unknown label such as `Partner code 699` only as a last resort.
- Add tests proving the production-observed codes do not render as `#NNN`.
- Verify reporter and partner concepts are not accidentally swapped.

### G2. Data Dark latest-period correctness

Primary files:

- `src/lib/datadark/config.ts`
- `src/lib/datadark/check.ts`
- `src/lib/datadark/datadark.test.ts`
- `src/lib/datadark/run.ts`
- `src/app/datadark/page.tsx`

The CBR regex currently uses the first page match, which selected `17.09.2013`.

Requirements:

- Extract all candidate periods and select the latest comparable value, not the first markup occurrence.
- Support the configured date and Russian month/year shapes with pure parsing functions and fixtures.
- Make staleness depend on the age of the extracted period relative to the poll instant, not only whether the same string remained unchanged across multiple polls. A first observation of a 2013 period cannot be `ok` in 2026.
- Do not overwrite a credible newer stored period with an obviously older parse without recording the anomaly.
- Store enough history/reason detail for audit.
- Correct the current production row only through a reviewed data repair after the parser is deployed and verified.
- Replace the unsupported causal sentence `series tend to go dark just before the numbers turn bad` with more defensible beta copy such as `suppression can be an analytical signal and should be corroborated with other evidence`, unless a directly linked methodology supports the stronger statement.

### G3. Clickable provenance

- Add clearly labeled external source/methodology links to official UN Comtrade resources on Trade and Critical Materials.
- Where feasible, expose reporter, flow, HS code, period, and last-fetched timestamp so an analyst can reproduce the query.
- Link methodological inspirations only if the exact referenced material is known; do not name S&P/CEPR/KSE without a destination or precise citation.
- Preserve the warning that mirror data are estimates and lag.
- Review strong factual chokepoint prose (e.g. production/processing shares) and either cite it directly or soften/remove it.
- External links use safe `rel` attributes and descriptive accessible text.

## Workstream H — tests, browser verification, and production safety

Run, at minimum:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run test:integration` on a disposable Neon branch if schema changes are made
- `npm run build`

Browser acceptance matrix, authenticated and anonymous where applicable:

1. Signed-out desktop:
   - Private beta badge visible.
   - Request-access CTA and nav go to `/access`.
   - No dollar amounts, founding-subscriber copy, registry promise, or pricing cards in HTML.
   - `/pricing` redirects to `/access`.
2. Signed-out mobile at 390px:
   - No document-level horizontal overflow.
   - Access CTA works.
   - Mobile sheet remains accessible.
3. Access form:
   - Valid email-only request.
   - Valid optional LinkedIn URL.
   - Invalid/lookalike LinkedIn rejected.
   - Honeypot/dedupe behavior.
   - No raw errors or sensitive echo.
   - Operator notification sent on a genuine request (assert via the email transport seam in tests; a real delivery only with operator authorization).
4. Sign-in gating:
   - `open` mode byte-identical to today's behavior (pinned by test).
   - `invite` mode: existing user, admin, and approved requester each receive a working link; an unknown address receives no sign-in link; allowed and denied addresses see identical confirmation UI.
   - Verify on preview/local only — do not flip production `SIGNIN_MODE` without the operator.
5. Signed-in analyst:
   - No pricing/request-access link in header or mobile sheet.
   - Account shows analyst beta wording only under the intended feature/config condition.
   - Home, digest, Signals, Ask, Search, scoreboard, and account remain reachable after legal acceptance.
6. Digest safety fixtures and a non-paid production readback:
   - Existing unsafe wording is identified in an audit report.
   - New generation code cannot reproduce it from the regression fixture.
   - Do not spend or regenerate without explicit caps/authorization.
7. Signals:
   - No organization/country/strike-target contamination.
   - Evidence list is a true subset of qualifying claims.
8. Ask:
   - Antarctic negative control is insufficient with zero irrelevant citations/related claims.
   - Known/temporal controls still work.
9. Solution pages:
   - No `#NNN` partner labels in the tested current dataset.
   - CBR key-rate period/status no longer contradict each other.
   - Official source links work.
10. Console/network:
   - No uncaught exceptions, hydration errors, failed same-origin requests, or auth loops.

## Documentation and handoff requirements

Create a dated implementation note under `docs/reviews/` containing:

- commit/deployment identifiers;
- files and migrations changed;
- exact before/after screenshots or concise browser evidence;
- tests and counts;
- Ask eval results and paid cost, if any;
- production data repairs proposed/applied;
- rollback instructions;
- unresolved counsel/operator decisions;
- an updated `docs/OPEN-TASKS.md` status for existing items such as #57 and #58 plus newly discovered defects;
- corrections to standing `AGENTS.md` state if and only if deployment actually changes it, with an append-only decision-log entry.

Do not mark this sprint complete merely because the UI says beta. Completion means the commercial mismatch is removed, the request journey works end-to-end (request → operator sees it → approval → sign-in), the mobile overflow is fixed, the negative control is clean, Signals evidence is semantically constrained, and disputed digest content cannot be promoted into declarative BNOW prose by the regression fixture.

## Operator checklist (non-code beta-readiness, surface in the handoff note)

These are not code changes in this sprint, but they gate a credible first impression for
invited analysts. The implementation note must list them with current status:

1. **Postmark sender domain is still the scenefiend domain.** The magic-link email is the
   first thing an invited analyst receives; migrate the sender domain (SETUP-NEXT-WEEK) before
   or at the start of invitations.
2. **X steady-state ingestion resumed 2026-07-13, but historical completeness remains open.**
   The restart fetched 1,889 documents and the next scheduled poll advanced normally, but the
   July 9–13 gap was traversed by the old page-limited poller and is not proven cursor-complete.
   Do not run recovery from this sprint; surface the separate X catch-up/rescore handoff as a
   pre-invitation operational dependency.
3. **Confirm the beta commercial-policy wording** — explicit “no charge” vs the neutral
   fallback (see positioning rules).
4. **Decide when to flip `SIGNIN_MODE=invite`** and confirm existing accounts are the intended
   grandfather set (Workstream A4).
5. **Set the response-window promise** on the `/access` confirmation to something that will
   actually be met, or promise none.

## Stop conditions requiring operator or counsel input

Stop and request a decision before:

- publishing an explicit promise that beta access is free if that policy has not been confirmed;
- flipping `SIGNIN_MODE=invite` in production (build and test the mechanism now; the flip and the grandfather set are operator decisions);
- re-enabling analyst registry access;
- applying production entity merges or destructive data repairs;
- regenerating/replacing production digests;
- changing the legal operator identity;
- materially changing Privacy/Terms or bumping policy versions;
- adding LinkedIn scraping/enrichment;
- enabling Stripe, recurring billing, or new provider spend;
- deciding whether named-person purge signals may remain visible to signed-in users.

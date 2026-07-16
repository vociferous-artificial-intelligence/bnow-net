# Coding-agent handoff — analyst-experience quick wins

Recommended model: **Claude Opus 4.8**
Effort: **high**

Readiness baseline: #17's claim-linked OpenSanctions spend boundary is deployed from `be0ebf1`,
and the legal integration fixture correction is on main at `165c2b4`. The full gate is green:
1,542 unit tests / 134 files, 32/32 disposable-Neon integration tests / 7 files, typecheck, and
lint. #61/#41 remain operator-gated but do not block this presentation-only work.

## Role and scope

Implement only the approved presentation changes below. Preserve all BNOW invariants in
`AGENTS.md`. Do not modify ingestion, map/reduce analysis, validation scoring, source-reliability
calculation, claim traceability, publication safety, database schema/data, paid-provider behavior,
environment values, workflows, or deployment. Read
`docs/reviews/ANALYST-EXPERIENCE-PUNCH-LIST-2026-07-16.md` first.

Start from the clean, current `origin/main` after the documentation-readiness commit and use a new
`codex/`-prefixed branch or the operator's requested coding-agent branch. If the repository is not
clean, stop and identify the unexpected files rather than overwriting or committing them.

## Execution order and review boundaries

This prompt is one product workstream but **not one undifferentiated commit**. Implement it in two
reviewable passes on the same branch:

1. **Pass 1 — low-layout-risk cleanup:** Workstream A; Workstream B items 1, 3, and 4; Workstream C;
   Workstream E items 1–4. Run targeted tests and review the diff before continuing.
2. **Pass 2 — interaction/layout work:** Workstream B item 2; Workstream D; Workstream F. Run the
   full gate and browser/accessibility verification after this pass.

Do not let Pass 2 weaken or partially revert Pass 1. Separate commits are preferred so source-first
evidence, print interaction, or typography changes can be reviewed/reverted without restoring raw
provider, confidence, or First-seen metadata.

## Workstream A — labels and navigation

Files in scope:

- `src/lib/nav/site-nav.ts` and tests
- `src/i18n/dictionaries.ts` and i18n tests
- `src/components/site-header-view.tsx` and tests
- `src/components/quick-links-rail.tsx` and tests
- `src/lib/profiles/config.ts` and profile/page tests

Changes:

1. `All theaters` → `More countries` in every visible locale catalog. Obtain native review before
   claiming market-ready translation; machine/provisional translations must retain the existing
   review annotations/policy.
2. `Economic data suppression` → `Russia data opacity` in every visible locale catalog.
3. Render selector items as uppercase ISO 639-1 code plus native label (`EN — English`, etc.) in
   desktop and mobile. Preserve `selectorLocales()` market-priority order, hidden locales,
   `lang`/`dir`/`hrefLang`, current-state semantics, and bare `?set=` locale links.
4. Remove the word `digest` from signed-in home quick-link theater entries while keeping country
   and both date links unambiguous.
5. Digest profile framing: `view for:` → `Prioritize for:`. Rename English profile labels to
   `Standard`, `Military & security`, `Sanctions`, `Commodities`, `Compliance`. Do not change any
   weights or ranking behavior. If profile labels remain hardcoded rather than catalog-backed,
   document that i18n debt instead of expanding scope silently.

Acceptance:

- Route hrefs are byte-for-byte unchanged.
- RU/UA/IR remain the only promoted countries; `/countries` remains the final Coverage href.
- Desktop/mobile menu keyboard behavior and RTL direction remain green.
- No logo asset is added; `BNOW.NET` remains the wordmark.

## Workstream B — digest chrome and internal metadata

Files in scope:

- `src/app/digests/[country]/[date]/page.tsx` and tests
- `src/components/digest-print-actions.tsx` and tests
- `src/app/scoreboard/page.tsx` where an unused provider select can be removed

Changes:

1. Remove provider/model text from analyst/public rendering and update the digest test that
   currently expects it. Stop selecting `provider` where no consumer requires it.
2. Put digest title and one `Print / save PDF` disclosure in a responsive header action row. The
   disclosure contains `Brief` and `With full evidence`; it must be keyboard operable, have an
   accessible name/state, preserve existing analytics and `window.print()` modes, and not render in
   print output.
3. Add compact screen freshness using each persisted digest row's existing `created_at`,
   `digestStage()`, and ET formatters; do not invent or recompute dates. A country/date page can
   contain several tracks with slightly different generation times/stages: summarize at page level
   only when all displayed tracks share the same stage, otherwise show compact per-track metadata.
   Never label the whole page Final because only one track is final. If a reliable next-final time
   is not already available on the page, omit that promise rather than duplicating cron logic.
4. Remove raw claim-confidence decimals such as `conf 0.82` from analyst-visible screen, clipboard,
   and print output. Retain confidence values in storage, queries/ranking, internal analysis, and
   tests that protect those semantics. Do not replace the decimals with High/Medium/Low in this
   batch: no calibrated display thresholds have been approved.

Acceptance:

- Brief print remains the native/default concise print; full evidence remains opt-in.
- Print stylesheet and canonical URLs remain intact.
- No provider/model token appears in rendered digest, scoreboard, Ask, copied claim, or print HTML.
- No raw claim-confidence decimal appears in analyst-visible screen, copied, or printed output.
- Every digest header visibly states Intraday/Final, last updated time, and timezone using the
  existing canonical helpers.

## Workstream C — remove First-seen from analyst output

Files in scope:

- `src/components/claim-sources.tsx`
- `src/components/claim-evidence-trail.tsx`
- `src/components/claim-evidence-labels.ts`
- `src/components/claim-evidence-model.ts` only as needed for presentation sort types
- `src/components/claim-copy-model.ts`
- digest print appendix in `src/app/digests/[country]/[date]/page.tsx`
- all associated tests and visible locale keys

Changes:

1. Remove First-seen from the evidence summary, expanded table, sort options, copy/report plain and
   rich content, and print appendix.
2. Retain `ClaimSourceDoc.firstSeenAt`, DB `fetched_at`, time-model behavior, ranking fallback,
   validation timeliness, health/freshness, and internal auditability. This is presentation-only.
3. Remove now-unused visible strings if safe across catalogs; keep internal naming where needed.
4. Hide the sort label/select entirely when `docs.length === 1`; keep the single evidence row.

Acceptance:

- Rendered/copy/print tests prove “First seen” is absent.
- Publication remains honest: a missing `published_at` renders Unknown and never borrows
  `fetched_at`.
- Every claim retains and renders at least one safe source link when a safe URL exists.

## Workstream D — source-first evidence

Files in scope: evidence files in Workstream C and their tests.

Changes:

1. Expanded trail order: Source/channel, Published, Title/link, Platform, Reliability. It is
   acceptable—and preferred for width—to render Platform as a compact badge in the Source cell,
   yielding Source/channel, Published, Title/link, Reliability.
2. `RSS/news` → `News`.
3. Use actual title when present. For missing titles, use transport-aware copy: Open article, Open X
   post, Open Telegram post, Open procurement record, or Open source.
4. Keep all existing URL sanitization, `nofollow noopener`, new-tab behavior, source-click
   analytics, source identity, channel/platform diversity calculations, selection algorithm, and
   reliability visibility policy.
5. Keep chronological evidence sorting; do not conflate source-first columns with default sort.

Acceptance:

- No raw document IDs appear.
- Unsafe/data/javascript URLs never become anchors.
- Signed-in digest reliability remains visible; reduced/public policies remain unchanged.
- The evidence table/card does not force avoidable horizontal overflow at 390 px. If a full
  responsive conversion exceeds the quick batch, retain the tested overflow wrapper and record a
  follow-up rather than breaking layout.

## Workstream E — scoreboard and public health cleanup

Files in scope:

- `src/app/scoreboard/page.tsx` and tests
- `src/i18n/dictionaries.ts` and i18n tests
- `src/app/health/page.tsx` and tests, if absent add a focused page/helper test

Changes:

1. Scoreboard opening copy and caveat must follow the approved review text. Put summary metric cards
   and results before the long methodology. Put “How to read these numbers” in a semantic
   `<details>` after the summary/table or an equally accessible collapsed panel.
2. Preserve exact metric definitions, targets, thin-sourced naming, at-publish proxy warning,
   divergence safety labels, and the fact that RU/UA share the ROCA baseline/denominator.
3. Do not replace percentages in this batch.
4. Health page: remove only `isw_reports`, `validation_runs`, `users`, and `subscribe_intents` from
   public counts. Do not rename or reinterpret sources/raw_documents.
5. **Do not implement monthly scoreboard navigation in this batch.** It remains a separate
   post-beta-observation workstream; do not add `?month=`, change query boundaries, or alter page
   limits here.

Acceptance:

- Results are visible before methodology without JavaScript.
- Caveat is visible without expanding methodology.
- `/health` retains DB OK/DOWN behavior and ISO diagnostic timestamp.
- No user/access-intent/validation/report counts remain public.

## Workstream F — targeted readability pass

Files in scope for this pass only:

- signed-in home and its status/validation/quick-link components
- digest page and evidence/copy/print controls
- scoreboard index/detail
- header/mobile menu
- `src/app/globals.css` only for a documented shared token/rule, not broad overrides

Rules:

- Do not blindly replace every gray class repository-wide.
- Meaningful ordinary text must meet at least 4.5:1 against its actual light/dark background.
- Do not use `text-gray-400` for meaningful text on white.
- Core claim/summary text: at least 14 px, prefer 16 px. Metadata/controls: at least 14 px. Reserve
  12 px for short tertiary chips only.
- Preserve information density through spacing/disclosure, not low contrast.
- Amber/green remain semantic and always have a text/status label.
- Verify focus visibility, 200% zoom/reflow, keyboard menus/details, and 390×844 no-overflow.

## Feedback routing — do not bundle into the quick source change

Do not set `FEEDBACK_EMAIL=desk@bnow.net`. The variable is shared by analyst mailtos,
access-request notifications, and X health alerts. Prepare a separate design/change using
`DESK_EMAIL`, `HELLO_EMAIL`, `OPS_EMAIL`, and an explicitly named access-notification destination,
with safe fallbacks/migration order across all Vercel environments. No env change or outbound email
is authorized by this prompt.

## Required verification

1. Targeted component/page tests for every changed surface.
2. `npm run typecheck` (or repository canonical typecheck), `npm run lint`, `npm test`.
3. Build if the repository's normal gate requires it.
4. Browser verification at desktop and exact 390×844, light and dark; keyboard-only pass for
   header language menu, print disclosure, evidence details/sort, scoreboard methodology.
5. Adversarial diff review: translated-key completeness, no provider/First-seen/raw-confidence
   leakage, no unsafe source URL, no claim-source loss, no route drift, and no internal confidence
   or reliability semantic change.
6. Update living documentation and write a dated implementation review. Do not deploy without the
   operator's normal approval and green gate.

## Explicitly out of scope

- #17/#41/#61 OpenSanctions/entity work, cleanup, or paid rescore.
- #56 Facebook source migration, #69 GramJS investigation, and #14 calibration.
- Monthly scoreboard archive/navigation.
- Feedback environment splitting or outbound email.
- UTC/Local/ET preference, geographic blocking, entity-nationality routing, new logo/assets, or a
  new top-level product feature.

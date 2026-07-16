# Analyst-experience punch-list review — 2026-07-16

Source: operator notes attached to the 2026-07-16 review request. This is a read-only
product/source audit. No application source, production data, provider, environment,
workflow, or deployment was changed.

## Recommendation in one sentence

Keep the austere BNOW.NET wordmark and dense analyst-workbench character, but simplify every
signed-in surface around **scan → assess → verify → reuse**: readable primary text, explicit
freshness, source-first evidence, one compact action area, and no pipeline implementation detail.

## What should happen now

### Quick-win batch — approve

These are presentation changes with no schema, ingestion, ranking, LLM, paid-provider, or
production-data consequence.

### Readiness update — 2026-07-16

The active spend-safety prerequisite is complete: #17's claim-linked selection/count boundary is
deployed from `be0ebf1`, and `165c2b4` restored the full integration gate. Current baseline:
1,542 unit tests / 134 files, 32/32 disposable-Neon integration tests / 7 files, typecheck, and
lint green. #61 cleanup and the paid #41 rescore remain separately operator-gated, but neither
touches nor blocks this presentation-only batch. The implementation may begin from clean main.

The coding prompt intentionally divides the work into two reviewable passes: low-layout-risk copy/
metadata cleanup first, then evidence/print/readability interaction work. Monthly scoreboard
navigation remains out of scope for this batch.

1. Change Coverage's final item from **All theaters** to **More countries**. “More” alone is
   ambiguous; “theaters” is internal/intelligence vocabulary and needlessly martial for every
   buyer persona.
2. Keep the text-only **BNOW.NET** wordmark. Do not commission a logo now.
3. Rename Solutions' **Economic data suppression** item to **Russia data opacity**. It is shorter,
   states scope, and avoids making the user infer that `/datadark` is Russia-specific.
4. In the signed-in quick links, remove “digest”: render `Russia: 2026-07-16 · 2026-07-15`, etc.
5. Add ISO **language** codes to selector labels while retaining native names, e.g.
   `EN — English`, `UK — Українська`, `DE — Deutsch`. Keep the existing market-priority order;
   do not group by geography or alphabetize by country. `UK` here is ISO 639-1 Ukrainian, so the
   word Українська must remain beside it to avoid confusion with the United Kingdom.
6. Remove the analyst-visible provider/model string (`openai:gpt-4o-mini+mapreduce`). It currently
   renders beside each digest track. Ask already deliberately hides provider/model; scoreboard
   selects `d.provider` but does not render it.
7. Remove **First seen by BNOW** from every analyst-visible representation: claim summary,
   evidence sort choices, evidence table, clipboard/report payloads, and print evidence appendix.
   Retain `fetched_at` internally for freshness, timeliness, health, ranking fallback, and audits.
8. Hide evidence sorting when only one evidence document exists.
9. Make the evidence trail source-first: **Source/channel · Published · Title/link · Platform ·
   Reliability**. Keep chronological sorting available; column order and sort order are separate
   decisions. Rename `RSS/news` to **News**. Replace the generic “Open source document” fallback
   with **Open article**, **Open X post**, **Open Telegram post**, or **Open source**. If horizontal
   space is tight, put Platform as a compact badge beside Source instead of retaining a column.
10. Keep source reliability visible to signed-in analysts. The public/reduced registry already
    withholds ranked scores, while gated digest evidence shows them in context. That is the right
    boundary. Reliability transparency is in the product charter and the score alone is not the
    proprietary asset; the maintained corpus, calibration, history, and weighting system are.
    Improve comprehension later with a qualitative label/tooltip rather than removing the signal.
11. Consolidate printing into one title-adjacent **Print / save PDF** disclosure with two options:
    **Brief** and **With full evidence**. Keep both modes; they represent materially different
    analyst handoffs. Align it to the right of the digest title on wide screens and let it wrap
    below on narrow screens.
12. Replace **view for:** with **Prioritize for:** because profiles re-rank the same event set; they
    do not filter it. Shorten labels to **Standard**, **Military & security**, **Sanctions**,
    **Commodities**, and **Compliance**. The longer descriptions remain available as tooltips.
13. On `/health`, remove `isw_reports`, `validation_runs`, `users`, and `subscribe_intents` now.
    `sources` is the deduplicated registry count; `raw_documents` is the much larger ingested-item
    count, so their difference is expected.
14. On `/scoreboard`, put results before methodology: one short opening sentence, a visible
    country-baseline caveat, then the metric cards/table. Move “How to read these numbers” into a
    collapsed disclosure below the summary or a methodology panel/link.
15. Default the scoreboard to the current UTC calendar month, provide previous/next-month
    navigation, and treat earlier months as archive views. Do not hardcode July 1.
16. Keep percentages for scanning and add `matched / eligible` counts later if desired. A fraction
    is useful context but is not a replacement for the percentage trend.
17. Put a compact freshness line in every digest header: **Intraday** or **Final**, the last-updated
    clock time, and an explicit timezone. Use the existing digest stage and shared time-formatting
    helpers; do not duplicate cadence logic or infer a timestamp the page does not have.
18. Remove raw claim-confidence decimals such as `conf 0.82` from analyst-visible pages, copied
    output, and printed output while retaining the stored value internally. Like the provider/model
    string, an uncalibrated decimal exposes implementation detail and implies unjustified precision.
    Do not replace it with High/Medium/Low until thresholds are explicitly calibrated and defined.

### Copy recommended for the scoreboard

Opening:

> We compare each finalized BNOW country digest with the same-day top-line findings in ISW's
> assessment, showing what matched, what was missed, how early evidence appeared, and how strongly
> BNOW's claims were sourced.

Caveat:

> ISW's Russia assessment covers the wider Russia–Ukraine theater, while BNOW scores separate
> country digests. Coverage and divergence are therefore directional comparisons, not like-for-like
> measures of report completeness.

This caveat should appear above the figures, not only inside the current “Evidence available at
ISW publish” explanation.

## Accessibility and typography finding

The readability concern is valid. This is not a full WCAG audit, but the source contains a clear
risk:

- Tailwind v4 `text-xs` is 12 px and `text-sm` is 14 px. The analyst surfaces contain 135 `text-xs`
  and 138 `text-sm` uses across app/components.
- Tailwind gray-400 computes to approximately RGB 153/161/175. It is only **2.60:1 on white**, well
  below WCAG's 4.5:1 threshold for ordinary text. There are 92 `text-gray-400` uses; not every one
  is on white or carries meaningful text, so this calls for a targeted audit rather than a blind
  replacement.
- Gray-500 is approximately 4.84:1 on white, but only 4.09:1 on the near-black theme unless a
  suitable dark-mode override is present.

Recommended visual rule:

- Core claims and summaries: 16 px where practical, never below 14 px.
- Operational metadata and controls: 14 px.
- Reserve 12 px for genuinely tertiary chips or short labels, not paragraphs, instructions,
  evidence, feedback links, or metric explanations.
- Light mode secondary text: gray-600 or darker. Dark mode secondary text: gray-300/400. Verify
  every foreground/background pair rather than globally replacing a class.
- Preserve density through tighter spacing, compact tables, disclosures, and clear hierarchy—not
  faint text.

Larger readable type will not repel younger analysts. “Modern” comes from hierarchy, rhythm,
responsiveness, and information quality. Tiny low-contrast type communicates fragility, not
authority. Amber and green can remain useful semantic accents (claimed/caution and
confirmed/healthy), but should not become decorative brand colors and must never carry meaning
without a text label.

## Questions and decisions — answers

### Dates and times

Current behavior is **not local to Frankfurt**. Instants are stored in UTC; digest/claim/report
calendar buckets are UTC days; user-facing clock times render in `America/New_York` with an
explicit `ET` suffix. `/health` intentionally shows raw ISO UTC. The date in a digest heading is a
UTC bucket even though most visible wall-clock times are ET.

Do not make a silent localization change in this quick batch. Near term, keep ET for consistency
and label digest dates as UTC coverage buckets where ambiguity matters. The eventual analyst-grade
design should offer **UTC / Local / ET**, persist the preference, and always show the zone. UTC is
the most defensible shared default for a global intelligence product; Local is the convenience
choice. This needs a deliberate time-model change and regression pass, not a formatting tweak.

### Reliability ratings

Do not hide them from accepted analysts. Hiding the central trust signal would weaken the product
more than it would protect IP. Keep raw rankings out of anonymous/public registry views (already
the policy), retain in-context analyst scores, and consider `High · 0.82` plus an explainer to
reduce false precision.

### Copy controls

Keep **Copy for report** as the primary per-claim action and keep the remaining modes inside the
existing “More copy options” disclosure. This is already a sensible progressive-disclosure
pattern. Remove First-seen from copied evidence and use analytics to determine whether rarely used
secondary modes can later be deleted. Do not move these controls to page level: they operate on a
claim and belong beside it.

### Feedback addresses and forms

`desk@bnow.net` is a good analyst-facing name for corrections and source suggestions. Use
`hello@bnow.net` for general/commercial contact. However, **do not simply repoint
`FEEDBACK_EMAIL`**: that one environment variable currently receives digest/source feedback,
access-request notifications, and X-ingest health alerts. Split destinations first, for example:

- `DESK_EMAIL=desk@bnow.net` — analyst corrections/source suggestions.
- `HELLO_EMAIL=hello@bnow.net` — general contact.
- `OPS_EMAIL=...` — X health and other operational alerts.
- Keep access-request delivery explicitly assigned to the operator or a separate access address.

The access-request flow is already a form with honeypot and dedupe. For signed-in digest/source
flags, a small structured in-app form is worth doing after the quick cleanup because it can include
the digest URL/claim/source context. For public general contact, a form does not reduce spam unless
it also adds rate limiting/abuse controls; a role alias with provider spam filtering is the simpler
beta choice.

### Geographic blocking

Do not block Russia, China, Iran, North Korea, or similar countries as a product policy. It is easy
to evade, blocks legitimate analysts/journalists/researchers, creates a political/censorship signal,
and provides little protection against determined collection. Protect authenticated/admin
surfaces with access control, rate limits, bot/WAF rules, anomaly monitoring, and download/API
limits. Apply geographic rules only in response to a specific legal/sanctions obligation or a
measured abuse pattern, with counsel and an operator decision.

### Entity/country mismatch (Fedorov example)

This is data-quality investigation, not a quick entity-country hard filter. A Ukrainian official
can legitimately appear in a Russia digest when the event concerns Russia; nationality and digest
theater are different concepts. The correct QA rule is: when the principal named actor's country
differs from the digest theater, require an explicit theater link (location, target, counterparty,
or consequence), otherwise flag the event for review/exclusion. Longer term, store entity
affiliation/jurisdiction separately and complete multi-theater document/event tagging (#37).

## Defer or decline

- **Custom logo:** defer; the wordmark is adequate and distinctive.
- **Geographic grouping of languages:** decline; multilingual users scan language names/codes, not
  a debatable geopolitical taxonomy.
- **Reliability removal:** decline for accepted analysts.
- **Decorative amber/green CRT theme:** defer; use those colors only for semantic status until the
  accessibility pass is complete.
- **Global user-local times immediately:** defer pending an explicit UTC/Local/ET model.
- **Hard entity-nationality routing:** decline; cross-border intelligence would be damaged.
- **Profile applicability logic by country:** defer. Rename/explain profiles now; instrument usage;
  delete or specialize low-value profiles only after beta evidence.
- **Fractions instead of percentages:** hold, as requested.

## Additional analyst-first changes recommended

These were not explicit in the notes but have higher value than adding new modules.

1. **Make the evidence summary the scan target.** Keep `N documents · N channels · N platforms`,
   then the selected source chips. This is faster and more defensible than asking an analyst to
   parse a raw evidence table for every claim.
2. **Use “Prioritize,” not persona theater.** The profile system is a ranking lens, not a separate
   product. This prevents the inactive-looking Ukraine profile concern and reduces the temptation
   to add profiles that do not materially change results.
3. **Do not add another top-level feature.** Search is already reachable from signed-in quick links;
   Ask and Signals are top-level. The immediate job is making country → digest → evidence → copy/
   flag feel effortless.
4. **Measure task completion, not page views.** Existing events already cover evidence opening,
   source clicks, copy modes, and printing. Compare before/after rates with private-beta interviews:
   time to first source, evidence-open rate, claim-copy success, and false/unclear flag themes.

## Suggested sequence

### Pass 1 — approximately one focused engineering day

Provider/First-seen/raw-confidence removal; digest freshness line; navigation/quick-link/profile/
platform copy; single-item sort hiding; health-row removal; compact scoreboard opening/caveat/
methodology disclosure; tests and all visible locale catalogs.

### Pass 2 — approximately one to two focused engineering days

Source-first evidence layout; title-adjacent print disclosure; targeted contrast/type audit on home,
digest, evidence, scoreboard, and header/mobile menu.

### Pass 3 — after beta observation

Structured analyst flag form + split mail destinations; monthly scoreboard navigation; UTC/Local/ET
preference; cross-theater entity relevance QA; prune unused copy/profile modes using observed data.

## Verification basis

- Governing product/state: `AGENTS.md`, `docs/PRODUCT-BRIEF.md`, `docs/CURRENT-STATE.md`,
  `docs/TIME-MODEL.md`, `docs/OPEN-TASKS.md`.
- Current UI/source: nav/locale registry, home quick links, digest page, evidence/copy/print
  components, health page, scoreboard page, feedback routing, profile configuration, and relevant
  tests.
- Existing binding decisions preserved: transparent source reliability; ET display/UTC buckets;
  admin-only registry; Russia/Ukraine/Iran nav promotion; traceability; publication safety;
  public/reduced reliability policy.

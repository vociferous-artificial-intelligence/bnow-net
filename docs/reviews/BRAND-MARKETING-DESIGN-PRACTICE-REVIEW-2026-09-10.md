# Brand, marketing & design practice review — 2026-09-10

**Question:** does the approach followed in `docs/research/` (the 2026-09-07 competitor
teardown) and the surrounding business docs reflect best practice for rolling out a new
application, judged from the branding, marketing and design perspective?
**Scope:** documentation review only. No application code, migration, env, deploy, or
paid call. No business *decision* is made here — open decisions are surfaced and framed.
**Method:** read-only pass over `docs/research/competitors/**` (6 raw files + 14
screenshots), `GTM-STRATEGY.md`, `BUSINESS-PLAN.md`, `COMPETITIVE-AND-DEMAND.md`,
`PARTNER-STRATEGY.md`, `PRODUCT-BRIEF.md`, `NEXT-PHASE-PLAN.md`, `CURRENT-STATE.md`
(§1–§access), `README.md`, and the design-adjacent reviews (`DESIGN-FUNCTION-EVAL-2026-07-11`,
`NAV-RESTRUCTURE-REVIEW`, `IA-REFINEMENT-REVIEW`, `SIGNED-OUT-LANDING-CONTRAST-2026-07-16`,
`PRIVATE-BETA-READINESS-NOTE-2026-07-13`, `BUSINESS-DOCS-RECONCILIATION-2026-08-17`,
`POSTHOG-ANALYTICS-CHECKPOINT-2026-07-14`). Yardstick: the conventional rollout sequence
for a new B2B application — customer discovery → positioning → competitive validation →
brand identity → marketing surface → launch → measure — and the deliverables each stage
normally produces.

## 0. Verdict in one paragraph

The research itself is unusually rigorous desk research; the *approach* is out of sequence.
The product was built and put into private beta (2026-07-13/15) before any positioning was
validated, the competitive teardown arrived nine weeks later and is explicitly
"pre-redesign", and the single input every rollout playbook puts first — conversations with
real buyers — has not happened (`PARTNER-STRATEGY.md` banner: "No outreach attempt, response,
or deferral decision is recorded"; `GTM-STRATEGY.md` §6 step 2: "Not started"). No brand
identity, design system, persona, message hierarchy, funnel metric, or research synthesis
exists. The gap is not quality of work; it is that the work has been applied to product truth
and to *documenting* decisions rather than to market truth and to *making* the two decisions
(G1, packaging) everything downstream depends on. The fix is ordering plus a few weeks of
non-engineering work, not a rebuild.

## 1. What the research does well

| Practice | Evidence |
|---|---|
| Right questions for a design teardown | Three missions map to the standard rubric: IA/buyer journey & CTA destination; trust signals & tradecraft communication; visual language. 7 competitors in 3 groups (structured/API, advisory, cyber-adjacent). |
| First-hand capture, not inference | Pass 2 "actually visited and screenshotted for real" all 14 pages; Pass 1 text-fetch errors (Sayari palette, Janes stale campaign page) disclosed and corrected inline, not overwritten. |
| Sourced, tiered claims | Market files carry a URL per claim, a (a)–(d) confirmation scale, CONFIRMED/INFERRED labels, "Could Not Verify" lists, and query logs (73 queries in the pricing file). |
| Findings that contradict the baseline | Seerist AWS Marketplace list price "$75,000.00 per 12-month contract = $15,000 per named user per year" vs the baseline's "custom-quoted"; Oxford Analytica's Dow Jones deal closed 2025-03-31, "do not present … as new/2026 news"; Control Risks/Geospark "merger" flagged as a likely mischaracterisation. |
| Insights that land on the stated wedge | No competitor exposes a source-reliability grading scale or names ICD 203 (Sayari's "Calibrated Uncertainty" is the nearest); Recorded Future is the only one of seven with a visible **Pricing** nav item; Group 1a is 100 % demo-gated while Oxford Analytica runs a media-subscription "Start your free trial" motion. |
| Honest about staleness | Every file dated; time-sensitive items (S-RM close pending Sept 2026, Janes sale process, lapsed IDIQs) flagged. |

This is above the bar for an agency competitive audit. It should be kept and built on.

## 2. Where the approach departs from best practice

### F1 — Sequence is inverted: build → beta → research, with discovery absent

| Date | What happened |
|---|---|
| 2026-07-04 | PRODUCT-BRIEF (founding spec, "BBC Monitoring quality at 1/10 the price for the 150 countries nobody covers well") |
| 2026-07-06 | GTM / BUSINESS-PLAN / COMPETITIVE written; G1 and packaging opened |
| 2026-07-09 → 07-16 | Nav, IA, landing, contrast, mobile work shipped |
| 2026-07-13/15 | Private analyst beta live; `/pricing` → `/access` |
| 2026-08-17 | Reconciliation: beachhead swapped compliance → commodity for *engineering* reasons |
| 2026-09-07 | Competitor teardown ("pre-redesign") |
| 2026-09-10 | Zero recorded interviews, discovery calls, design partners, surveys, or LOIs |

Competitor research is the cheapest research and the least predictive: it reveals what
incumbents *say*, not what the buyer *needs to hear*. Done before any buyer conversation, the
coming redesign will be calibrated against competitors' marketing instead of customers'
language. The last recorded funnel snapshot (`CURRENT-STATE.md`, 2026-07-15 pre-flip audit) is
5 existing users, 0 approved requests, 1 pending — i.e. the beta has produced no market signal
to research against.

### F2 — Raw research with no synthesis or decision

All three design files end with a variant of "No strategic synthesis or recommendations below —
that comes later." `Claude outputs/2026-09-07-competitor-design-teardown/` contains only a
`.DS_Store`. Missing deliverables a brand/marketing lead would expect from a teardown:

- a positioning map (e.g. AI-speed vs human-expertise × data vs narrative — the raw material is present);
- a messaging-hierarchy comparison (headlines are quoted verbatim; value-prop layering and proof-point ordering are not analysed);
- a **BNOW self-assessment against the same three rubrics** — there is nothing to compare the competitors to;
- a unified competitor matrix — the design set (Seerist, Janes, Dataminr, Sayari, OxAn, Eurasia, RF) and the market set (RANE, Maplecroft, S-RM + overlaps) share only three vendors; Dragonfly is flagged as a comp and never covered;
- explicit "so we will …" conclusions.

Also absent from the teardown scope: pricing-page contents (RF's page is noted, never read),
SEO/keyword and domain analysis, social/content-presence audit, accessibility of competitor
palettes, mobile captures (all 1558×784 desktop), post-CTA demo/nurture flows, and any
product-UI teardown (no trial was requested where one is offered).

### F3 — Positioning has drifted without being re-decided or tested

Three positionings coexist: the brief's tier-3-country thesis (07-04); GTM's "Every number is
clickable to its evidence, and we publish our own accuracy" for compliance/commodity (07-06);
and the reconciliation's commodity/consultancy beachhead (08-17, because the compliance
feature "is currently not sellable or even visible"). None was tested with a buyer; the
founding thesis was dropped without rebuttal. G1 ("automated analyst aid vs analyst-verified")
and packaging ("Three incompatible price structures exist … none is decided") have been open
since 2026-07-06. Brand, message hierarchy, pricing page and redesign all flow from a settled
positioning; none can be briefed while the promise and the buyer are open.

Positioning is also feature-led: the three proof points are mechanisms (citation-derived
ratings, schema-enforced traceability, scoreboard). The buyer outcome ("an avoided bad
counterparty pays the subscription") appears once and is never developed.

### F4 — No brand identity, design system, or voice

Nothing in the repo defines a logo/wordmark, palette, type scale, tone, or component library.
The visual language is Tailwind v4 defaults plus Geist; `bg-blue-600` is asserted by a test as
"the CTA treatment"; colours are pinned per-site by class-string tests rather than tokens; no
shadcn/radix/CVA. "BNOW" has no stated meaning. The only brand-like principle is ruling 3
(truth-in-UI) — an engineering ruling, and a good one for this category, but not a brand
promise. The teardown found three of seven competitors using green accents and a
"terminal-readout" aesthetic; whether to join or avoid that is an identity decision nobody has
been asked to make.

### F5 — Design process is engineering audit, not design research

The July reviews are rigorous hygiene most startups skip: WCAG contrast measured in real Chrome
(48/48 checks agree with offline oklch maths), hand-built WAI-ARIA menu-button pattern, 17 routes
verified at 390 px, on-page counts verified against the DB. But: no usability session, no
interview, no card sort/tree test, no analytics review; signed-in mobile home "was not
browser-rendered … operator eyeball item"; i18n is 10 locales wide and "Machine-translated. Not
native-reviewed" with three empty catalogs. Accessibility-before-identity is the wrong order —
a redesign will reset the contrast work.

### F6 — Marketing surface lacks rollout-checklist basics

| Expected at private-beta stage | Status |
|---|---|
| Persona / buyer briefs | Do not exist (OPEN-TASKS #24) |
| Evidence memo, partner deck | "does not exist" (reconciliation) |
| Content cadence (weekly brief) | Gated on partner feedback → gated on outreach → not started |
| Funnel metrics (requests, approvals, activation, retention) | PostHog wired (opt-in, Privacy 1.1) but no number appears in any planning doc |
| Pricing / value anchor | Deleted (`/pricing` → `/access`); "no charge" wording undecided — while COMPETITIVE §1 lists published pricing as a low-cost differentiator and the teardown confirms only RF does it |
| Launch / PR plan, social, SEO beyond robots/sitemap, email nurture | None |
| Credibility stack (logos, testimonials, named advisors) | None; founding analyst circle is a plan |
| Public description | README stale (6,985 sources, "Launch theater: Russia + Ukraine", vercel.app URL, `/registry` as public) |

Resolved since July and *not* a finding: Postmark sender is `no-reply@bnow.net` with DKIM/SPF/DMARC
passing (2026-07-15); the "scenefiend" first-impression risk in the readiness note is closed.

### F7 — Effort ratio

Since 2026-07-06 the shipped list is long (X, MTProto, mirror-trade, critical materials, Ask v2,
ISW ME registry, i18n, match-safety, Paddle plan, WS-2/3/7). The market-facing list is empty.
`BUSINESS-PLAN.md` itself says "the binding constraints are credibility and distribution, not
code."

## 3. What best practice looks like from here (proposed sequence)

No decision is taken here; this is the order the rollout literature and the repo's own docs
imply. Each step is small; the point is that they are serial.

1. **Discovery (2–3 weeks, operator time, $0).** 8–12 conversations with commodity-desk and
   consultancy analysts (ICP #2/#3 — the sellable beachhead per 08-17). Record verbatim how
   they judge source reliability today, what "provenance" is worth, what they would stop
   paying for. Use `OUTREACH-ROSTER-2026-08-23` and the GO-NO-GO rulings on what a first email
   may claim. Output: a one-page discovery summary with quotes.
2. **Decide G1 and packaging** (OPEN-TASKS #12; open since 07-06) using discovery + the pricing
   research. Output: DECISIONS.md entries.
3. **Positioning statement (one page):** category, buyer, promise, three proofs, one line on
   why-not-Janes / why-not-Seerist, honest scoreboard framing (info-lead first, footnote the
   07-29→08-15 outage). Reconcile or formally retire the tier-3-country thesis.
4. **Synthesize the teardown** against that positioning: positioning map, message-hierarchy
   table, unified competitor matrix, BNOW self-assessment on the three rubrics, and the
   "what we do differently" list (candidates already visible in the raw files: publish
   pricing; name the tradecraft standard no competitor names; offer a real trial rather than
   demo-gating).
5. **Brand identity + tokens (minimal):** name rationale, palette, type, voice/tone (make
   truth-in-UI the first principle), token file replacing class-string tests. Decide on the
   terminal-readout aesthetic explicitly.
6. **Redesign public surface + `/access` flow** from 3–5; persona pages (#24); evidence memo;
   partner deck.
7. **Instrument before launch:** PostHog funnel (visit → `/access` → approved → first sign-in →
   first Ask/digest → week-2 return); add the counts to `STATUS-REPORT.md` cadence.
8. **Content engine** only after 1: weekly derived brief to the design partners, then public.

## 4. What to keep

- The research files as-is (rename nothing; they are correctly labelled raw) and the
  two-pass, disclose-your-errors method — apply the same method to the synthesis.
- The date/reconcile/decision-register discipline; it is well above the norm.
- Ruling 3 (truth-in-UI) as the seed of the brand voice.
- The WCAG/ARIA/390 px hygiene as acceptance criteria for the redesign, not as its input.

## 5. Proposed follow-ups (not actioned here)

- OPEN-TASKS: add "Competitor teardown synthesis + BNOW self-assessment" (Tier 1, depends on
  positioning statement); "Brand identity + design tokens" (Tier 2); "Funnel metrics in
  STATUS-REPORT" (Tier 2). Link #12 (packaging) and #24 (personas) as dependencies.
- README.md: refresh the stale product description and URLs.
- `Claude outputs/2026-09-07-competitor-design-teardown/`: currently empty — either populate
  with the synthesis or delete.

## 6. Correction — 2026-09-10 (same day)

F2 was written against the `main` checkout. The `docs/branding-strategy-20260909` worktree
holds four uncommitted synthesis drafts dated 2026-09-09 that F2 said did not exist:
`docs/research/branding_strategy.md` (position, anti-positioning, voice, identity brief),
`marketing_strategy.md` (narrative inventory N1–N10, ranked narrative stack, per-segment
message architecture), `information_architecture.md` (route inventory, gaps G1–G10, target
nav, build lists), `design_concepts.md` (competitor design D1–D5, principles F1–F6, directions
A–D with C recommended, five quick wins). They cite the raw teardown files by path, tag claims
`SAYABLE`/`ROADMAP`/`GATED`, and hand a short list of decisions back to the operator.

What stands: F1 (no buyer evidence — the drafts contain none, and say so: "BNOW has no
customers, no logos, no certifications, no partners and no press"), F3 (packaging, G1, naming,
category term all still `OPEN`), F4 in part (identity is a brief — typeface, colour values,
name rationale undecided), F6 and F7. The synthesis also skips launch and measurement
entirely (no KPIs, funnel, or success criteria for the redesign). The playbook at
`docs/playbooks/rollout/` formalises the sequence these drafts followed and adds the missing
discovery, decision, test, launch and measurement steps.

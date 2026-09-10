# BNOW.NET — Public Information Architecture

Strategy doc (2026-09-09). Phase 3 of the pre-redesign brand workstream: an evaluation of the
public-facing information architecture against the position and narratives set in Phases 1–2,
a gap analysis, and two prioritized build lists. Visual design and page-level copywriting are
out of scope.

> **Method.** The current-state map below was read out of the repository on the
> `docs/branding-strategy-20260909` worktree, not from memory or from the live site: route
> inventory from `src/app/**/page.tsx`, gating from each page's own guard calls, navigation
> from `src/lib/nav/site-nav.ts`, crawl policy from `src/app/robots.ts` and
> `src/app/sitemap.ts`, copy from `src/i18n/dictionaries.ts`, and history from
> `docs/reviews/IA-REFINEMENT-REVIEW.md` and `NAV-RESTRUCTURE-REVIEW.md`. Every structural
> claim in Part I is checkable against a named file.
>
> **Inherited constraints.** Phase 1 (`branding_strategy.md`) and Phase 2
> (`marketing_strategy.md`) bind this document: coverage is never restated as accuracy, no
> borrowed institutional authority, no implied analyst bench, no named-competitor comparison,
> and nothing ships that BNOW cannot evidence. Build items are marked `SAYABLE` (evidenced
> today), `ROADMAP`, or `GATED` (blocked on a named decision).

---

## 0. The finding in one paragraph

The public site is well-built and structurally honest — deliberate crawl policy, no
many-to-one nav redundancy, gated specifics withheld at the data layer rather than hidden in
CSS, an unusually careful truth-in-UI posture. It is also **organized around the product's
internals rather than around the argument the brand needs to make.** The navigation is a map of
what BNOW built (Coverage, Signals, Ask, Solutions, Validation); it is not a map of why anyone
should believe it. The consequence is concrete and measurable: the single strongest asset in
the company — the `/methodology` crosswalk against four named IC issuances, which Phases 1 and 2
both identify as the largest opening in the competitive set — **is reachable from nowhere on the
site.** It has no nav entry, no footer link, and no inbound internal link of any kind. It sits in
the sitemap and is otherwise an orphan. That is the shape of the whole problem: BNOW has the
proof and has not built the path to it.

---

# Part I — The current public surface

## 1. Route inventory

33 page routes. Gating read from each page's own guards.

| Route | Access | In nav? | In sitemap? | Own metadata? |
|---|---|---|---|---|
| `/` | public (adapts when signed in) | implicit | ✅ | ❌ |
| `/countries` | public | ✅ Coverage ▾ | ✅ | ❌ |
| `/countries/[iso2]` | public | ✅ (ru, ua, ir only) | ✅ per active theater | ✅ |
| `/scoreboard` | public | ✅ Validation | ✅ | ❌ |
| `/scoreboard/[country]/[date]` | public | — | ❌ | ❌ |
| `/signals` | public **teaser**; specifics gated at the data layer | ✅ Signals | ✅ | ❌ |
| `/trade` | public | ✅ Solutions ▾ | ✅ | ❌ |
| `/critical-materials` | public | ✅ Solutions ▾ | ✅ | ❌ |
| `/datadark` | public | ✅ Solutions ▾ | ✅ | ❌ |
| `/methodology` | public | **❌ NONE** | ✅ | ✅ |
| `/access` | public | ✅ CTA (signed-out only) | ✅ | ✅ |
| `/pricing` | 308 → `/access` | — | ❌ | ❌ |
| `/privacy`, `/terms` | public | footer | ✅ | ✅ |
| `/health` | public | footer | ❌ (robots-disallowed) | ❌ |
| `/conflicts`, `/conflicts/*` | **flag-gated** — `CONFLICTS_UI` unset everywhere, so 404 anonymously | ❌ | ❌ | ❌ |
| `/digests/[country]`, `/digests/[country]/[date]` | `requireAcceptedUser` | ❌ | ❌ | ❌ |
| `/ask`, `/search` | `requireAcceptedUser` | ✅ Ask (→ signin) | ❌ | ❌ |
| `/entities`, `/entities/[id]` | `requireAcceptedUser` + admin-only presentation | ❌ | ❌ | ❌ |
| `/registry`, `/registry/[id]` | `requireAdmin` | ❌ (dropped R5, 2026-07-12) | ❌ | ❌ |
| `/middle-east` | `requireAdmin` | ❌ | ❌ | ❌ |
| `/admin/*`, `/account`, `/signin`, `/welcome/legal` | auth/admin | — | ❌ | — |

**Per-page metadata exists on 6 of 33 routes** — `/access`, `/countries/[iso2]`,
`/methodology`, `/privacy`, `/terms`, `/welcome/legal`. Everything else, including the
homepage, `/countries`, `/scoreboard`, `/signals` and all three Solutions pages, inherits the
one static root title from `src/app/layout.tsx`: *"BNOW.NET — validated OSINT intelligence."*

## 2. Navigation as built

Six top-level entries (`src/lib/nav/site-nav.ts`):

```
Coverage ▾   Russia · Ukraine · Iran · More countries
Signals      /signals
Ask          /ask            (gated — signed-out clicks land on /signin)
Solutions ▾  Sanctions & trade evasion · Commodity & supply-chain risk · Russia data opacity
Validation   /scoreboard
Request access   /access     (CTA; signed-out only)
```

Footer, sitewide: `/health` · `/privacy` · `/terms` · `mailto:go@vociferous.nyc`. That is the
entire footer.

Two prior sprints did real work here and should not be re-litigated. `NAV-RESTRUCTURE-REVIEW.md`
introduced the grouped header; `IA-REFINEMENT-REVIEW.md` (2026-07-12) retired the "Product"
group, converted theater links from `#anchors` to real `/countries/[iso2]` pages, fixed the
3-vs-8 theater undersell, and added the deliberate `robots.ts`/`sitemap.ts` crawl policy. The
**URLs are frozen by contract** — that file's rule 1 is that nav restructuring renames labels,
never routes. Everything recommended below respects that.

## 3. What a signed-out visitor actually sees on the homepage

Hero (`home.tagline`): *"Transparent source reliability ratings for conflict-zone OSINT."*
Sub: *"Per-country intelligence feeds from open news, Telegram and social sources — scored for
reliability, fused into a daily digest, and validated every day against expert human analysis.
Every claim links to its evidence."*

Then a live-theater count, three feature cards — *Reliability, derived not asserted* ·
*Claims you can audit* · a validation card — and an Iran/Gulf card. The reliability card
**has no link**: its "explore the registry →" destination was removed on 2026-07-12 when the
source registry went admin-only, and the card kept its copy.

---

# Part II — Gap analysis

The brief asks whether there is too much information, too little, or the wrong kind. The answer
is **mostly the wrong kind, some too little, and one specific place with too much.** Ten gaps,
ordered by how much they cost.

### G1 — The best asset in the company is an orphan page `[wrong kind: misplaced]`

`/methodology` is 286 lines of requirement-by-requirement conformance against ICD 203, ICD 206,
ICS 206-01 and ICD 208, with per-row BUILT/PARTIAL/GAP status, a self-critical opening ("A
reviewer who wants to be useful should press on the PARTIAL and GAP rows"), and an explicit
account of the two things BNOW does that the standards do not require. Phase 1 §8/P3 calls this
"the single largest brand opening in the research." Phase 2 ranks it narrative #4.

It has **no path**. A repository-wide search for inbound links to the route returns exactly one
hit — its own entry in `sitemap.ts`. Not the header, not the footer, not the homepage, not
`/scoreboard`. A visitor reaches it only from a search engine or a direct link.

The `/scoreboard` case is the sharpest illustration. That page carries its own inline,
collapsed methodology disclosure (a native `<details>`, results-before-methodology, 2026-07-16)
— so a reader looking at the coverage number is *already* being handed a methodology
explanation, and is still given no route to the crosswalk that would answer the next four
questions they have.

It is also **styled as a legal document** — it renders through `LegalSection`/`LegalP`, the same
components as `/privacy` and `/terms`, opening with "← Back to BNOW.NET" like a policy page —
and it is **English-only**, while the rest of the public site ships seven locale catalogs. The
strongest marketing artifact in the business is dressed as a compliance notice and filed where
nobody walks.

### G2 — The IA is a map of the product, not of the argument `[wrong kind: structural]`

Coverage / Signals / Ask / Solutions / Validation is an accurate description of what was built.
It is a supply-side taxonomy. Phase 2's narrative stack is demand-side and reads in a different
order: *show your work* → *we publish our own score* → *fewer, better, cited* → *standards,
named* → *independent*.

Note what the current nav implies. "Validation" is one item of six, sitting fifth. Under the
Phase 1 position it is not a feature — it is half the reason to believe anything on the site.
Meanwhile "Ask" occupies a top-level slot and is fully gated, so for every signed-out visitor it
is a nav item whose only function is to produce a sign-in wall.

Sayari puts "Foundation" — ontology, world model — *above* Platform and Solutions precisely to
signal that it expects to be interrogated (Phase 2, A4). BNOW's equivalent proof surfaces are
scattered across a fifth-position link and an orphan page.

### G3 — There is no demonstration of the primary claim `[too little]`

Narrative #1 is "every claim arrives with its documents attached, because the database will not
accept one without them." **A signed-out visitor cannot see a single claim with its evidence.**
Digests are `requireAcceptedUser`. Entity pages are gated. The registry is admin-only. Signal
details are withheld at the data layer. The evidence panel — the actual product, and the thing
Phase 1 §12 nominates as the brand's signature device — has no public instance.

The site asserts the differentiator in prose on the homepage and never shows it. That is
precisely the failure mode Phase 2 §N9 identifies in Sayari, and BNOW is currently committing
it while holding the mechanism that would fix it.

### G4 — The reliability story dead-ends `[wrong kind: broken proof chain]`

The homepage card *"Reliability, derived not asserted"* — ~10,015 sources rated from ~351K
citations — is the second-best story BNOW has and has no destination, because `/registry` went
admin-only (R5, 2026-07-12). The gating decision was correct: the per-source reliability score
is withheld from non-privileged surfaces by `view-policy.ts`, and calibration is still gated by
OPEN-TASKS #14. But *"here is a number, and no, you may not look"* is worse than either showing
something or saying nothing. There is a middle path (P3 below) and nobody has built it.

### G5 — The main SEO landing page walls its own primary CTA `[wrong kind: funnel defect]`

`/countries/[iso2]` is public, indexed, has its own metadata, and is the per-theater destination
promoted in the nav. Its calls to action are *"Read the latest digest →"* and *"Browse the
digest archive →"*, rendered **unconditionally**, both pointing at `/digests/*`, which is
`requireAcceptedUser`. A signed-out visitor arriving from search on the highest-intent public
page clicks the primary CTA and is redirected to a sign-in screen — with no explanation of why,
and no route to `/access`.

### G6 — One conversion point, and it is a form rather than a page `[too little]`

`/access` is 86 lines: a title, a two-sentence intro, three fields, a submit button. The copy is
honest and well-judged ("No self-service purchase or card is required"; "BNOW remains an
analytical aid, not a sole source for operational decisions"). But it is the terminus of every
commercial path on the site — `/pricing` 308s into it, the nav CTA points at it — and it makes
no case. It does not say who the beta is for, what an accepted user gets, what happens next, or
why a busy analyst should spend ninety seconds on it. It asks for a decision it has not
supported.

### G7 — Nothing says who BNOW is `[too little]`

There is no `/about`, no company page, no contact page beyond a footer `mailto:`. Phase 2 §C3
identifies independence as an unoccupied narrative — three of the seven researched competitors
are owned or being acquired by an insurer, a payment network and a media conglomerate, and
literally nobody sells the alternative. BNOW has that story for free and no surface on which to
tell it. This also has a mundane cost: institutional buyers and methodology reviewers check
who they are dealing with, and finding nothing reads as absence, not modesty.

### G8 — Most of the public surface shares one title and description `[too little: SEO]`

27 of 33 routes have no `generateMetadata`. The homepage, the `/countries` index, `/scoreboard`,
`/signals`, `/trade`, `/critical-materials` and `/datadark` all present to a search engine as
*"BNOW.NET — validated OSINT intelligence."* These are the pages most likely to earn
long-tail queries in exactly the vocabulary the brand wants to own — sanctions evasion,
critical-materials chokepoints, source reliability, ICD 203. `/countries/[iso2]` already does
this properly and is the pattern to copy.

### G9 — Three Solutions modules tell one story and are presented as three `[wrong kind: framing]`

`/trade` (sanctions circumvention), `/critical-materials` (import-dependency chokepoints) and
`/datadark` (Russia suppressing its own statistics) are the site's only public, self-standing
analytical artifacts — and they are strong ones. They are filed as three unrelated items in a
dropdown. They share a single thesis worth naming: *seeing what a state is trying not to show
you, with the evidence attached.* As three menu entries they read as a feature list; as one
argument with three worked instances they read as a capability.

### G10 — Where there genuinely is too much: theater promotion is inconsistent `[too much]`

Eight theaters are `status = 'active'`; only ru/ua/ir are promoted in the nav, deliberately,
under standing ruling 15 (promoting theaters with 6–9 digests against ru/ua/ir's 34/23/28
overstates depth). That judgment is right. But the *sitemap emits all eight*, `/countries` lists
all eight, and the homepage's live count renders all eight — so the discipline holds in one
surface and not in the others. A visitor who follows the count into a 6-digest theater gets the
undersell's mirror image: an oversell. The nav is honest; the rest of the surface is not yet
aligned with it.

## Summary

| Verdict | Where |
|---|---|
| **Too little** | Public proof of the core claim (G3); the case for requesting access (G6); who BNOW is (G7); per-page metadata (G8) |
| **Wrong kind** | Methodology orphaned and styled as legal boilerplate (G1); nav organized by product internals rather than by argument (G2); reliability claim with no destination (G4); indexed landing pages whose CTA is a wall (G5); three modules presented as a feature list (G9) |
| **Too much** | Shallow theaters surfaced inconsistently against the nav's own honesty rule (G10) |

---

# Part III — The target public IA

A structure, not a design. It keeps every existing route (URLs are frozen) and changes what is
promoted, what is linked, and what exists.

```
Coverage ▾        Russia · Ukraine · Iran · All theaters
Evidence ▾   NEW  How it works · Methodology · Scoreboard        ← the argument, promoted
Analysis ▾        Sanctions & trade evasion · Critical materials · Russia data opacity
Signals           /signals
About        NEW  /about
Request access    /access  (CTA, signed-out only)
```

Four moves, each traceable to a Phase 1/2 conclusion:

1. **Promote the argument into its own group.** "Evidence" carries the demonstration page, the
   methodology crosswalk and the scoreboard together. This is Sayari's infrastructure-first move
   (Phase 2, A4), and it puts narratives #1, #2 and #4 in one place a reviewer can find.
2. **Rename "Validation" → the Evidence group, and "Solutions" → "Analysis."** Labels change,
   routes do not. "Solutions" is category-standard filler; "Analysis" is what those three pages
   contain.
3. **Drop "Ask" from signed-out navigation.** A top-level item that only produces a sign-in wall
   spends the most valuable slot on the page to deliver a rejection. Keep it in signed-in nav.
4. **Add "About."** One page, carrying the independence story and the operator's name.

The footer expands from four links to a real sitemap-in-miniature — and is the right home for
the reserved social-proof slots in Part V.

---

# Part IV — Build ASAP (strictly prioritized)

Ordered 1 through 8. Each item names what it fixes, the narrative it serves, its dependency, and
its honesty constraint. Effort is rough operator-days.

### 1. Link `/methodology` — header, footer, homepage, scoreboard  `SAYABLE` · ~0.5d
Fixes **G1**. The page already exists and is good. This is four link insertions and the highest
return-per-hour item on the list by a wide margin. Add it to the new Evidence group, to the
footer, to the homepage feature row, and to `/scoreboard` (a reader looking at the coverage
number is exactly the reader who should be handed the crosswalk).
*Constraint:* none. Do this first, this week, independent of everything else.

### 2. `/evidence` — the public worked example  `SAYABLE` · ~3–4d
Fixes **G3**, the single largest gap. One real, published claim, shown whole: the assertion, its
source documents with titles and dates, its ICD 203 likelihood band with the published
percentage range, its separately-labelled corroboration-derived confidence, the generated source
descriptors, and the copyable citation. Then, beneath it, the mechanism in plain words — the
deferrable constraint trigger, and the fact that a cited document cannot be deleted while the
citation exists.

This is Phase 2's A3 (worked example as marketing copy) fused with B1 (mechanism instead of
adjective), and it is the page that makes BNOW's whole position visible in one screen. It is the
new homepage hero destination and the first slide of every deck.
*Constraint:* one hand-picked, well-corroborated, non-sensitive claim from a live theater,
refreshed on a stated cadence — presented as an example, never as "today's intelligence." It
must not become an ungated digest.

### 3. Fix the `/countries/[iso2]` walled CTA  `SAYABLE` · ~0.5d
Fixes **G5**. Make the digest links conditional on session state. Signed-out visitors get a
truthful line — the digest is for accepted beta users — plus a link to `/evidence` (see the
sample) and `/access` (request access). Turns the site's best-indexed landing page from a
dead end into the funnel it should already be.

### 4. Per-page metadata for the seven public pages that lack it  `SAYABLE` · ~1d
Fixes **G8**. Homepage, `/countries`, `/scoreboard`, `/signals`, `/trade`,
`/critical-materials`, `/datadark`. `/countries/[iso2]` and `/methodology` already do it
correctly; copy the pattern.
*Constraint:* titles use the Phase 1 register — mechanism, not adjective — and no number
without a date.

### 5. Rebuild `/access` into a page that makes the case  `SAYABLE` · ~1–2d
Fixes **G6**. Keep the form and its honest copy; put an argument above it. Who the beta is for,
what an accepted user gets, what the review process is and roughly how long it takes, what BNOW
is not. Link `/evidence` and `/methodology` from it, because a reader hesitating over the form
is a reader who wants one more proof point.
*Constraint:* no pricing (packaging is `OPEN` — BUSINESS-PLAN §4.1). No implied analyst bench
(`G1` decision undecided). No urgency or scarcity framing.

### 6. Nav restructure — the Evidence group, the label changes, drop signed-out Ask  `SAYABLE` · ~1d
Fixes **G2**. Depends on items 1 and 2 existing first, so the new group has something to hold.
Labels only; routes frozen.
*Constraint:* new nav labels need all seven shipping locale catalogs (`site-nav.test.ts`
enforces this — a missing translation is a test failure, not a stray English word).

### 7. `/about` — independence, plainly  `SAYABLE` · ~0.5d
Fixes **G7**. Short. What BNOW is, who runs it, no parent company and no investor whose
portfolio the findings could embarrass, how to make contact, and where the methodology lives.
*Constraint:* Phase 1 §5.6 and §12 — state independence once, plainly; do not turn it into a
slogan, and do not imply a team that does not exist.

### 8. Expand the footer into a real one  `SAYABLE` · ~0.5d
Currently four links. It should carry Coverage, Evidence (methodology · scoreboard ·
`/evidence`), Analysis, About, Request access, Privacy, Terms, status, contact — and the
reserved slots in Part V. Cheap, and it is the structural home for everything BNOW will add over
the next year.

**Sequence note.** Items 1, 3, 4, 7 and 8 are all sub-day and independent — they can ship in one
pass. Item 2 is the substantive build and should start immediately in parallel, because items 5
and 6 are both materially better once it exists.

---

# Part V — Build over time

## A. Pages and features, roughly in order

| # | Item | Serves | Notes |
|---|---|---|---|
| 9 | **`/how-it-works`** — collection → extraction → claim → citation → validation, as one diagram with each stage linked to its proof | Narrative #1, #3 | The explanatory companion to `/evidence`'s single instance. Joins the Evidence group |
| 10 | **Analysis hub page** — one thesis, three worked instances | G9 | *Seeing what a state is trying not to show you.* Turns three menu entries into one capability |
| 11 | **Weekly derived brief + archive** | Phase 2 §Channel notes | GTM §4's list-builder and the voice's proving ground. Needs an owner before it needs a page — a weekly publication is the first thing to slip at one operator |
| 12 | **Self-serve product tour** (`ROADMAP`) | Phase 2, A5 | Recorded Future's "See it in action" as *primary* hero CTA. Converts curiosity without spending operator time or opening the access queue |
| 13 | **Public source-registry view — descriptors without scores** | G4 | Closes the dead end honestly: show the narrative ICS 206-01 descriptor, the citation volume and date span, the hedging distribution and the registry status. Withhold the numeric reliability score, exactly as `view-policy.ts` does today. `GATED` on OPEN-TASKS #14 for anything score-shaped |
| 14 | **Divergence review** (`ROADMAP`, decision needed) | Phase 2, B5 | A published record of where BNOW disagreed with the benchmark and who was right. Strategically strong, operationally exposed — it publishes the days BNOW was wrong. Needs an explicit decision, not a drift |
| 15 | **Theater-depth honesty pass** | G10 | Align `/countries`, the homepage count and the sitemap with the nav's own standing-ruling-15 discipline: label depth per theater rather than counting all eight as equivalent |
| 16 | **Localize `/methodology`** | G1 | English-only today against seven shipping catalogs. Lower priority than linking it, higher than it looks — the ICD/ICS vocabulary is exactly what a non-US institutional reader searches for |
| 17 | **Per-claim citation export / API docs page** (`ROADMAP`) | ICP #3, consultancies | ICD 208's "output a customer can reuse" row is `PARTIAL`; there is no public API. When it exists, its documentation is a marketing surface, not just a reference |
| 18 | **`/pricing` restored** (`GATED`) | Phase 2 §C, Part V.1 | Currently a 308 to `/access`, correctly. When packaging freezes (BUSINESS-PLAN §4.1 / OPEN-TASKS #12), publishing a price is brand-consistent and category-differentiating — only Recorded Future does it. A "we show our work" brand that hides its price has a tonal contradiction |

## B. Reserved slots — social proof BNOW does not have yet

BNOW has no customers, no logos, no certifications, no partners and no press. That is the
correct state for an invite-only beta with one operator, and the site should not pretend
otherwise — Phase 1 §5.5/§5.6 forbid borrowed authority and implied endorsement, and Phase 2 §C3
turns their absence into the independence narrative.

What the IA can do now is **reserve the slots**, so that when each asset arrives it lands in a
place already designed for it instead of being wedged in. Each slot below names its trigger — the
condition that fills it — so nobody has to guess whether it is time.

| Slot | Where it goes | Fills with | Trigger to build |
|---|---|---|---|
| **S1 — Validator quotes** | `/methodology`, below the crosswalk; secondary placement on `/about` | Named methodology reviewers who have actually pressed on the PARTIAL/GAP rows | First reviewer completes PARTNER-STRATEGY §6 and consents to be named. **This is the first social proof BNOW will plausibly have** — it costs no revenue and the outreach motion is already unblocked and unstarted |
| **S2 — Design-partner logos** | Homepage, one row below the fold; `/about` | Beta accounts that consent to be named | ≥3 consenting accounts. Fewer than three reads as thinner than nothing |
| **S3 — Case studies / worked outcomes** | New `/customers` index; teaser card on `/evidence` | Quantified, checkable outcomes — Sayari's pattern (Phase 2, A3), anonymized by role and sector if needed | First design partner with a describable result. Anonymized-but-specific ("a Tier-1 commodity desk") beats named-but-vague |
| **S4 — Compliance badges** | Footer, right column; `/about` | SOC 2 Type II or equivalent | An enterprise deal requires it. Sayari's SOC 2 is the only formal certification in the entire competitive set — genuinely differentiating when real, and forbidden to imply before |
| **S5 — Press & citations** | `/about`, "In the press"; footer link | Coverage, and third-party citations of BNOW data | First citation. Note that ICP #6 (journalists, NGOs, researchers) is a low-ARPU segment whose **payment is citations** — this slot is that segment's ROI made visible |
| **S6 — Data & integration partners** | Analysis hub; `/about` | Named data partners | First partnership. Do not list vendors BNOW merely consumes as though they were partners |
| **S7 — Named analysts** | `/about`, "Who we are" | Real analyst bios | **`GATED` on the `G1` decision** (HUMAN-SETUP-TODO §13, open since 2026-07-06). Until that resolves, no analyst-bench implication anywhere on the site — Phase 1 §5.6. Note the negative example in the research: Eurasia Group's entire pitch is access to named experts and its own site shows no analyst headshots |
| **S8 — Awards / recognition** | Footer only | Whatever arrives | Do not chase. Low signal for this buyer |

**Rule for every slot: build the container empty, ship it hidden, and render it only when it has
real content.** An empty "Trusted by" band with three grey rectangles is worse than no band, and
it is the exact tonal failure a provenance brand cannot afford.

---

# Part VI — What not to build

- **A blog.** The proof surfaces are the marketing (Phase 2). A weekly derived brief with an
  archive is a publication; a blog is a content obligation that one operator will not meet.
- **A resources / gated-whitepaper library.** Category-standard, and it inverts the brand: it
  trades information for an email address on a site whose whole argument is that it shows you
  things.
- **A named-competitor comparison page.** Explicitly ruled out in Phase 2 §C6 — it elevates
  them, invites a response BNOW cannot absorb, and contradicts the calm register.
- **A chat widget with a named AI persona.** Two of seven competitors have one; both read as
  sales furniture, and it directly undercuts "the model is infrastructure" (Phase 2, C2).
- **A public status/uptime marketing page.** `/health` already exists, is correctly
  robots-disallowed, and is a diagnostic — not a trust asset at this stage.
- **Un-gating `/conflicts`.** Flag-gated and dormant by design. It is a product decision, not
  an IA one.

---

# Part VII — Open decisions this raises

1. **Does `/evidence` show a live claim or a frozen exemplar?** Live is more convincing and
   carries an ongoing accuracy obligation on a public page. Frozen is safer and can go stale —
   note that Oxford Analytica's product screenshot is frozen at "Wednesday, June 11, 2025," an
   own-goal for a currency-based pitch. Recommendation: live, from a completed digest, with an
   explicit "example claim, published [date]" label and a stated refresh cadence.
2. **Does the public registry view (item 13) ship before calibration resolves?** The descriptors
   are `BUILT` and presentable; the score is not. Shipping descriptors-without-scores is
   defensible and closes G4, but it needs an explicit ruling that it does not front-run
   OPEN-TASKS #14.
3. **Divergence review — yes or no** (item 14). The strongest available proof of character and
   the most exposed. Decide deliberately.
4. **Who owns the weekly brief** (item 11). Cadence is a commitment; a missed week on a
   published archive is more damaging than never starting.
5. **`/pricing` restoration** (item 18) — downstream of the packaging freeze, which is the
   operator's decision. Carried forward unresolved from Phases 1 and 2.

---

## Sources

**Read from the repository for the current-state map**
- `src/app/**/page.tsx` (33 routes; gating from each page's own guard calls) ·
  `src/lib/nav/site-nav.ts` (nav model, `LIVE_THEATERS`, `SECTION_ROUTES`) ·
  `src/components/site-footer-view.tsx` · `src/app/robots.ts` · `src/app/sitemap.ts` ·
  `src/app/layout.tsx` (the single static title) · `src/app/pricing/page.tsx` (308 → `/access`) ·
  `src/app/methodology/page.tsx` · `src/app/countries/[iso2]/page.tsx` ·
  `src/i18n/dictionaries.ts` · `src/lib/registry/view-policy.ts` ·
  `src/lib/conflicts/feature.ts` (`CONFLICTS_UI`)
- `docs/reviews/IA-REFINEMENT-REVIEW.md` (2026-07-12 — nav redundancy, theater ground truth,
  signals gating boundary, crawl policy, i18n contract) ·
  `docs/reviews/NAV-RESTRUCTURE-REVIEW.md` · `docs/reviews/SIGNED-OUT-LANDING-CONTRAST-2026-07-16.md`

**Strategy inputs**
- `docs/research/branding_strategy.md` (Phase 1 — position, anti-positioning, identity direction)
- `docs/research/marketing_strategy.md` (Phase 2 — narrative stack, adopt/improve/counter,
  channel notes)
- `docs/GTM-STRATEGY.md` (§1 positioning and scoreboard honesty, §2 ICPs, §4 channels, §6 launch
  sequence, §7 gaps `G1`–`G5`) · `docs/BUSINESS-PLAN.md` (§4.1 packaging) ·
  `docs/METHODOLOGY-TRADECRAFT.md` (the crosswalk behind `/methodology`) ·
  `docs/PARTNER-STRATEGY.md` (§6 validator outreach — the S1 trigger) ·
  `docs/CURRENT-STATE.md` · `docs/OPEN-TASKS.md` (#12 packaging, #14 reliability calibration) ·
  `docs/HUMAN-SETUP-TODO.md` (§13 — the `G1` verification-tier decision behind S7)

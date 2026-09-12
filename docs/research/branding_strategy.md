# BNOW.NET — Branding Strategy

Strategy doc (2026-09-09). Phase 1 of the pre-redesign brand workstream: market position,
competitive branding analysis, and brand voice/identity recommendations. Marketing execution
and visual design are deliberately out of scope and follow in later phases.

> **Evidence base.** Competitor material is the 2026-09-07 teardown in
> `docs/research/competitors/` — `design/raw-visual-branding.md` (7 companies, 14 live
> screenshots, two-pass verified), `design/raw-ia-navigation.md`, `design/raw-trust-signals.md`,
> and `market/raw-research-pricing.md`, `market/raw-research-mna.md`, `market/raw-research-janes.md`.
> BNOW's own position is taken from `PRODUCT-BRIEF.md`, `BUSINESS-PLAN.md`,
> `COMPETITIVE-AND-DEMAND.md`, `GTM-STRATEGY.md`, `METHODOLOGY-TRADECRAFT.md`,
> `PARTNER-STRATEGY.md` and `CURRENT-STATE.md` (production verified through 2026-09-03).
>
> **Claim discipline.** This document inherits the repo's truth-in-UI posture. Anything
> asserted here as a *sellable* claim is one BNOW can evidence today. Anything aspirational is
> marked `ROADMAP`. Anything unresolved is marked `OPEN`. Coverage is never restated as
> accuracy (`src/lib/conflicts/product-copy.ts`).

---

## 0. The one-paragraph answer

BNOW's competitors have converged on two brand postures — **"trust our analysts"** (Eurasia
Group, Oxford Analytica, Janes) and **"trust our AI"** (Dataminr, Recorded Future, Seerist) —
and every one of them asks the buyer to take the output on faith, because none of them exposes
the reasoning. Sayari is the only company in the set attacking that seam, and it attacks it
with *language* ("calibrated uncertainty," "every output is scored, sourced, and explainable")
rather than with an enforced mechanism. BNOW's brand should occupy the position neither camp
can claim without rebuilding their product: **the intelligence product that shows its work and
publishes its own score.** Not "more accurate" — nobody can prove that, and BNOW explicitly
does not claim it. *Auditable.* The brand promise is that a buyer, a regulator, or a hostile
reviewer can check us, and that we make checking easy. That is a claim about character, not
capability, which is why it survives contact with a small team, a thin corpus, and a coverage
number we would rather be higher.

---

# Part I — Market position

## 1. Where BNOW actually sits today

Honest starting inventory, because a brand built on auditability cannot begin with a flattering
inventory.

| Dimension | Position as of 2026-09-09 |
|---|---|
| Product stage | Invite-only private analyst beta. `/pricing` 308-redirects to `/access`. No public purchase path. |
| Live theaters | 3 (RU, UA, IR) of 8+ scaffolded |
| Registry | ~10,015 materialized sources · ~351K citations · 1,608 benchmark reports |
| Published metric | Key Takeaway benchmark coverage; **+14.7h median information lead**; run-avg coverage **~17.5%** (~31% nonzero-day; Iran comparable-day 43.5% post-2026-08-15 recovery) |
| Team | 1 operator |
| Platform COGS | ~$190–250/mo, hard-capped |
| Packaging | **OPEN** — three incompatible models live in the docs (BUSINESS-PLAN §4.1 / OPEN-TASKS #12) |
| Compliance surfaces | Admin-only pending OpenSanctions commercial rights |

Two things follow for the brand. First, **BNOW cannot win on scale, breadth, headcount, logos,
or heritage** — every competitor beats it on all six and will for years. Second, **BNOW can win
on verifiability today**, at current size, with no new hires, because verifiability is a
property of how the system is built rather than how big it is. A one-person company with a
database constraint that makes an uncited claim impossible has something a 400-person
consultancy does not, and cannot easily retrofit.

The brand strategy is therefore to compete on the one axis where being small is not a handicap,
and to be conspicuously honest about the axes where it is.

## 2. The category map

The teardown grouped seven competitors three ways. That grouping is also a brand map, because
each cluster shares a rhetorical strategy.

**Cluster A — structured / API-deliverable** (Seerist, Janes, Dataminr, Sayari; plus RANE,
Verisk Maplecroft, Kpler, Kharon from the earlier landscape work). Sell a *system*. Brand on
scale numbers and AI architecture. Buyer is a security-operations or compliance function.
Price gated behind a demo, with one exception (see §6, P4).

**Cluster B — advisory houses** (Oxford Analytica, Eurasia Group; S-RM). Sell *people*. Brand
on heritage, named principals, and access. No dashboard, no schema, no AI language. Oxford
Analytica has been absorbed into Dow Jones and no longer has an independent visual brand at
all; S-RM is mid-acquisition by AXA XL (announced 2026-08-06, expected to close end of
September 2026).

**Cluster C — cyber-adjacent** (Recorded Future). Sells *speed and autonomy*. The most
technically literate brand in the set — the only one naming external industry standards (MITRE
ATT&CK, YARA/Snort/Sigma) rather than only proprietary marks.

**BNOW is none of these, and that is the opportunity.** It has Cluster A's delivery mechanism
(structured claims, API-shaped, machine-collected), Cluster B's analytical ambition (assessment,
not just alerting), and Cluster C's standards literacy (ICD 203 / ICD 206 / ICS 206-01 / ICD
208 crosswalk) — but its actual differentiator sits on an axis none of the three competes on.

## 3. The unoccupied position

Plot the category on two axes:

- **X — how the work is done:** human analyst ← → machine
- **Y — how much of the reasoning is exposed:** conclusion only ← → full evidence chain

Every competitor sits along the bottom edge. Eurasia Group is bottom-left (pure human, pure
conclusion: "unfettered access to analysts," and a methodology disclosure consisting of the
phrase "quantitative methodologies," unelaborated). Dataminr and Recorded Future are
bottom-right (pure machine, pure conclusion: "99.5% accuracy," "50+ proprietary LLMs," no
sourcing standard anywhere). Seerist and Janes sit in the middle of the bottom edge, both
selling *verification as a brand word* — Seerist's "Verified Events," "80% of events verified";
Janes' "verified and validated by our teams of analysts, not AI filters" — without publishing
what verification means or letting anyone check it.

Sayari is the only company that has climbed any distance up the Y axis, and it is the closest
brand analog in the entire set. It is worth studying precisely: "Every output is scored,
sourced, and explainable," "When the AI doesn't know something, it says so," and — most
strikingly — probabilistic hedging language ("Likely exposure: Roughly Even Chance to Likely")
that is structurally Words-of-Estimative-Probability without naming ICD 203. Sayari has found
the same seam BNOW is aiming at.

**But Sayari's version is rhetoric; BNOW's can be mechanism.** Sayari asserts explainability in
marketing copy. BNOW enforces it in the schema: a deferrable constraint trigger
(`drizzle/9999_claim_source_trigger.sql`) rolls back any transaction that commits a claim
without a source link, and the `claim_sources → raw_documents` foreign key is `ON DELETE no
action`, so a cited document cannot be deleted while the citation exists. That is a difference
a technical buyer can be shown, and it is defensible in a way a tagline is not.

**Position statement (recommended):**

> **BNOW.NET is conflict intelligence that shows its work.** Every claim links to the documents
> behind it, every source carries a descriptor derived from how an expert benchmark actually
> cited it, and we publish our own daily score against that benchmark — including the days it
> goes badly.

## 4. The three proof points, and their honest status

The brand rests on three claims. Each must be sayable without a footnote that undercuts it.

| # | Claim | Status | How it is said |
|---|---|---|---|
| 1 | **Claim→source traceability is enforced, not promised** | `BUILT` | Strongest asset. Say it plainly, name the mechanism, invite inspection. No competitor discloses anything schema-enforced. |
| 2 | **Source standing is derived, not asserted** | `BUILT` (descriptor) / `OPEN` (calibration) | Say: descriptors are generated from a named benchmark's own citation and hedging behaviour, labelled as generated, and explicitly *not* an independent audit. Do **not** say "reliability rating" as a headline number — the score is withheld from non-privileged surfaces (`src/lib/registry/view-policy.ts`) and calibration is gated by OPEN-TASKS #14. |
| 3 | **We publish our own accuracy** | `PARTIAL` — needs precise wording | Lead with the *information lead* (+14.7h median) and with **the act of publishing at all**. Coverage run-avg ~17.5% is below the brief's ≥80% roadmap target and must be framed as corpus-depth trajectory, never as accuracy. Any published series footnotes the 2026-07-29→08-15 map-worker outage as a scored-history discontinuity. |

Claim 3 is the brand's hardest and most valuable move. **The number is weak; publishing it is
the point.** A methodology reviewer who finds the coverage gap disclosed inside our own memo is
a stronger validator than one who has to discover it (PARTNER-STRATEGY reconciliation note,
2026-08-17). Handled well, the weak number becomes the proof of the character claim: nobody
fakes a scoreboard that says 17.5%.

## 5. Anti-positioning — what the brand must refuse

A position is only real if it forbids things. These are binding.

1. **Never claim accuracy.** BNOW measures *coverage* against a benchmark that reads many of
   the same open sources. Agreement is not independent confirmation. The frozen contract name
   is "Key Takeaway benchmark coverage."
2. **Never use "verified" as an unqualified brand word.** It is the single most crowded word in
   the category — Seerist, Janes and RANE all use it as a label with no disclosed mechanism.
   Using it puts BNOW in a claim contest it wins only by being checkable, so the checkable
   thing (the evidence chain) should carry the message instead.
3. **No breathless crisis framing.** Existing decision of record: *"current, sourced, validated
   — the three brand words — and no breathless war framing (a provenance brand sells calm)"*
   (BNOW-NEXT-FEATURES-PLAN, 2026-07-12). Endorsed and extended in §11.
4. **Sell geography, not named crises.** A named-crisis product has a built-in expiration; a
   regional product inherits the next crisis (PRODUCT-BRIEF §6.5). This is a churn argument, but
   it is also a brand argument: crisis-chasing brands read as opportunistic to institutional
   buyers.
5. **No borrowed institutional credibility.** No government seals, no NATO/agency crests, no
   implied endorsement. Cluster A leans hard on these; BNOW has none and faking the register
   (dark ops-center visuals, targeting reticles, "military-grade") would read as costume.
6. **No named-analyst pretence.** Eurasia Group's entire pitch is access to named experts, and
   its own site shows no analyst headshots. BNOW currently has one operator and no analyst
   tier (`G1` is still the open decision — HUMAN-SETUP-TODO §13). Do not imply a bench.

## 6. Risks to this position

| Risk | Assessment | Mitigation |
|---|---|---|
| "Auditable" is a feature, not a category — buyers may not shop for it | Real. Compliance buyers do (audit defensibility is ICP #1's decisive feature); commodity buyers shop for speed | Lead with the buyer's decision, close with auditability as the reason to trust the answer (§13) |
| A larger vendor copies the language cheaply | Sayari already has, rhetorically | Stay mechanism-first: publish the enforcement detail and the scoreboard. Copy is cheap; a running public score is not |
| The coverage number invites attack | It will | Disclose first, in our own words, with the trajectory and the outage footnote. Never let a reviewer find it |
| Position depends on an unresolved analyst tier (`G1`) | Gates the premium tier, Paddle AUP category, and first hire | Brand as *automated with disclosed limits* today. Do not pre-sell a verified tier |
| Category consolidation (AXA XL/S-RM, Dow Jones/Oxford Analytica, Mastercard/Recorded Future) | Validates the category; nobody has moved onto this wedge | Watch for a strategic acquirer bolting "explainability" onto an incumbent |

---

# Part II — How the competition brands itself

## 7. The evidence

Seven companies, homepage + product page each, screenshotted live 2026-09-07 (14 captures in
`docs/research/competitors/design/competitor-screenshots/`). The teardown ran two passes and its
second pass **corrected** the first on two companies — Sayari's palette (assumed dark, actually
warm cream) and Janes' live pages (the first pass hit a stale campaign variant). Colour and
typography claims below are the screenshot-verified pass.

| Company | Visual register | Palette | Display type | Primary trust device | Psychological pitch | Primary CTA |
|---|---|---|---|---|---|---|
| **Seerist** | Ops-center SaaS | Near-black `#0B0E13` + kelly/signal green; one amber promo band | Grotesque sans + monospace small-caps "terminal readout" | 13-logo wall incl. NATO, ODNI, US IC, Dept. of War; "400+ organizations," "25% of the Fortune 100" | Fusion: human pedigree × AI speed × institutional validation ("50,000 analyst hours, queryable in 30 seconds") | Book a Demo |
| **Janes** | Military-industrial / heritage; the only site using real operations-room photography as its hero | Black, white, grey + burnt orange | Heavy sans headlines, all-caps nav; HUD corner-bracket motif framing headings | "500,000+ analyst hours/year"; explicit anti-AI stance | Heritage authority + human-verification-over-AI | BOOK A DEMO (orange, highest-contrast element in the nav) |
| **Dataminr** | Glossy enterprise SaaS; light body, dark navy nav; AI Platform page flips to a dark hero | Light + dark navy + periwinkle/indigo | Clean modern sans | Scale + government contracts ("100+ U.S. government agencies," a $318M DoW contract); named AI chat persona "Lumi" in site chrome | Purest AI-speed pitch in the set — "know first, act faster" | Request a demo |
| **Sayari** | Elegant editorial / publishing | Warm cream/parchment + navy + amber/ochre | **Serif/slab display — the only serif in the set** | SOC 2 Type II; In-Q-Tel named as "the CIA's venture arm"; named government contracts; four quantified case studies | Trustworthy/explainable AI as a wedge against generic LLMs; loss-aversion for accountable buyers | Request a Demo |
| **Oxford Analytica** | None of its own — Dow Jones house template end to end | Dow Jones white/navy/green | Slab-adjacent serif display | Blue-chip client names (World Bank, European Commission, G7 governments); "founded 1975" | Heritage + curated-brief efficiency; anxiety framing ("your passport to global risk mitigation") | Request a trial / Subscribe |
| **Eurasia Group** | Traditional consulting, visibly dated (~2015–18 conventions) | Royal/indigo blue; moody night-globe hero | Bold condensed all-caps + atmospheric lowercase serif | One named individual (Ian Bremmer) + flagship "Top Risks" report | Purest bespoke-human-access pitch; zero AI framing | Get In Touch / Read the report |
| **Recorded Future** | Clean corporate SaaS, least "cyber-dramatic"; near-empty hero, no imagery | Light grey/white + navy; duo-tone shard graphic with a red half | Clean modern sans | Six fully attributed named customers; heavy ®/™ on proprietary capabilities | Speed + autonomy ("machine speed," "31 minutes," "before it matters") | **"See it in action"** as the *primary* hero CTA (self-serve tour) · Watch trailer · ROI calculator · **"Pricing" in primary nav** |

## 8. Five patterns worth naming

**P1 — The category is cold, and its two available accents are taken.** Green carries the
"security operations" signal (Seerist's kelly/signal green on near-black; the Dow Jones green
on the Oxford Analytica page); everything else splits between navy, royal/indigo and
periwinkle, which read as generic enterprise B2B. Sayari's warm cream/amber and Janes' burnt
orange are the only genuinely distinctive palettes in the set — and Sayari's is distinctive
precisely because it is *warm*, in a category that otherwise defaults to cold.

> *Verification note.* `raw-visual-branding.md` describes Janes' logomark as a third instance of
> green "more subtly"; the live screenshot (`janes-product.jpg`) shows it as **orange**, matching
> the same file's own Janes section. The green count is two of seven, not three. Correct the raw
> file when it is next touched.

**P2 — Serif is unclaimed, and it is the right register for a judgment product.** Sayari is the
only competitor using a serif display face, and the teardown's own read is that this is what
makes the site scan as "publishing/legal-tech" rather than "SaaS dashboard." That matters
because BNOW's product is closer to a *finished analytic product* (dated, archived, addressable,
BLUF-ordered per ICD 208) than to a monitoring console. A serif-led identity would be
category-legible, differentiated from five of seven competitors, and honest about what the
product actually is. It also quietly signals the thing BNOW most wants signalled: this is a
document with a citation apparatus, not a dashboard with an alert badge.

**P3 — Everyone claims rigour; almost nobody names a standard.** Across seven companies:
Recorded Future names MITRE ATT&CK and YARA/Snort/Sigma (cyber-detection frameworks, not
analytic ones). Sayari uses estimative-probability language without naming its source. The other
five name **nothing** — no confidence taxonomy, no source-reliability scale, no citation
standard, no published methodology. Eurasia Group's total methodology disclosure across two
pages is the phrase "quantitative methodologies." Oxford Analytica's is "robust methodologies
and impartial analysis."

> **This is the single largest brand opening in the research.** BNOW has a
> requirement-by-requirement crosswalk against four named public IC issuances — ICD 203, ICD
> 206, ICS 206-01, ICD 208 — with a per-row `BUILT`/`PARTIAL`/`GAP` status, a public
> `/methodology` page, and a drift test holding the page to the document. **No competitor in the
> research set publishes anything comparable.** Naming the standards is free, checkable, and
> immediately separates BNOW from six of seven.

**P4 — Price is gated everywhere except one place.** Recorded Future alone carries a "Pricing"
item in primary navigation; every other competitor routes price through a sales conversation.
The pricing research found real numbers anyway — Seerist's AWS Marketplace SKU at $75,000/yr for
five named users ($15,000/user/yr), Janes' G-Cloud band of £5,000–£10,000,000/yr, Eurasia
Group's seven-year Canadian federal series holding steady at CAD ~$185K–226K/yr — which means the
gating buys secrecy from *buyers* while procurement records tell anyone who looks. Published
pricing at any tier is therefore a real, low-cost differentiator (COMPETITIVE-AND-DEMAND §1),
and it is *brand-consistent*: a company whose whole pitch is "we show our work" that hides its
price has a tonal contradiction on its hands. **This is currently `OPEN` — packaging is
undecided (BUSINESS-PLAN §4.1) — and the brand argument should be entered into that decision.**

**P5 — Two of seven are hiding their owners, and one has been erased.** Recorded Future has been
Mastercard-owned since December 2024 and uses none of it as public trust collateral. Oxford
Analytica went FiscalNote → Dow Jones (announced 2025-02-24, closed 2025-03-31, $40M for Oxford
Analytica and Dragonfly Intelligence combined) and has no independent brand presence left — the
page is Dow Jones's template, with a Dow Jones chat agent, and "Oxford Analytica" survives as a
product-line name. S-RM is being taken to 100% by AXA XL (announced 2026-08-06). The read for
BNOW: **independence is becoming scarce in this category, and it is not currently being sold by
anyone.** An independent, self-funded, no-parent-company posture is a differentiator available
today at zero cost — and it pairs naturally with the auditability claim (nobody's balance sheet
shapes what we publish).

## 9. The axis everyone else is fighting on — and why not to join

The set contains a genuine, explicit argument. Janes: *"Janes data is verified and validated by
our teams of analysts, not AI filters."* Dataminr, opposite corner: 50+ proprietary LLMs,
multi-modal→generative→agentic AI, a named AI persona in the site chrome, and almost no
human-in-the-loop language at all. Seerist splits the difference and sells "speed and trust" as
a combination.

**BNOW should not take a side.** Both positions are claims about *inputs*, and both ask the buyer
to trust the vendor's characterization of its own process. BNOW's position is about *outputs*:
whatever produced this claim, here are the documents, here is the estimative band with its
published percentage range, here is the corroboration count, and here is our score against a
named benchmark. That reframes the argument from "whose process do you trust" to "which vendor
lets you check" — a question BNOW wins and both camps lose.

Practical consequence: **do not market the LLM.** The model is infrastructure. The category's
AI-forward brands are already indistinguishable from one another, and the IC's stated anxiety
(IARPA BENGAL) is precisely that LLMs are attractive but untrusted. Leading with AI capability
walks into that anxiety; leading with traceability answers it.

## 10. Steal / avoid

**Steal:**
- **Sayari's "Same Query. Two Very Different Answers" module** — a side-by-side of a generic-AI
  non-answer against a sourced, cited one. This is the single most transferable device in the
  research, and BNOW's version is stronger because the sourced side is clickable.
- **Oxford Analytica's Global Risk Monitor "History" tab** — an explicit rationale-for-change
  log beside any composite score. Already flagged as a build item; it is also a brand asset,
  because "why did this move" is the auditability promise applied to a number.
- **Recorded Future's "See it in action"** — a self-serve product tour sitting between "read
  marketing" and "book a call," and notable because they made it the *primary* hero CTA rather
  than a fallback. Compatible with an invite-only beta; converts curiosity without spending
  operator time.
- **Sayari's worked example as marketing copy** — a specific, named, checkable entity chain
  rather than an abstract capability claim.
- **Seerist's monospace/terminal texture, used sparingly** — a legitimate way to signal
  data-density in type without adopting the dark ops-center costume.

**Avoid:**
- Dark ops-center chrome, glowing globes, network-node abstractions, targeting reticles — the
  category's visual clichés, and dishonest for a product that is a cited document.
- Government seals and agency crests (see §5.6).
- A named AI chat persona. Two of seven have one; both read as sales-bot furniture, and for
  BNOW it would undercut the "the model is infrastructure" stance.
- Unsourced scale numbers as hero copy ("1M data sources," "500,000 analyst hours"). BNOW's
  numbers are smaller and real; using the same rhetorical form invites the comparison BNOW loses.
- Stock imagery of silhouetted executives, and undated mockup screenshots (Oxford Analytica's
  product shot is frozen at "Wednesday, June 11, 2025" — an own-goal for a currency-based pitch).

---

# Part III — Brand voice and identity

## 11. Voice: six principles

The existing decision of record — **current, sourced, validated**, and "a provenance brand sells
calm" — is correct and is retained as the core. The principles below operationalize it.

**V1 — State the mechanism, not the adjective.**
Adjectives are what the category already sells, and they are unfalsifiable. Mechanisms are
checkable, which is the whole brand.
- ✗ "Rigorously verified intelligence you can trust."
- ✓ "A claim cannot be saved without a source document — the database refuses the transaction."

**V2 — Volunteer the limit in the same breath as the claim.**
Every strong statement carries its own boundary. This is not hedging; it is the product's
central differentiator performed in prose, and it is what makes the strong half believable.
- ✗ "Validated daily against expert analysis."
- ✓ "Scored daily against ISW's published assessments — which read many of the same open sources
  we do, so agreement is corroboration, not independent confirmation."

**V3 — Calm register. No urgency theatre.**
The subject matter supplies the stakes; the writing should not add any. Competitors sell the
3AM call and the 90-minute deadline. BNOW sells the opposite feeling: the thing you can hand to
your compliance officer without flinching.
- ✗ "Know first. Act faster. Before the window closes."
- ✓ "A median 14.7-hour lead on the benchmark's publication, measured and published."

**V4 — Estimative language is house style, not decoration.**
The product already computes ICD 203 likelihood bands with published percentage ranges and a
separately labelled corroboration-derived confidence level. **Marketing prose should use the
same vocabulary as the product.** When the site says "likely," it should mean the band. This
makes the brand voice and the data model the same object — a consistency no competitor has,
since none of them has the bands at all.

**V5 — Name the standard.**
Where a claim maps to ICD 203, ICD 206, ICS 206-01 or ICD 208, name it. It is free, checkable,
and six of seven competitors cannot follow. Corollary: never name a standard BNOW does not
actually meet, and keep the public crosswalk's `PARTIAL` and `GAP` rows visible — a crosswalk
that is all `BUILT` is not credible, and ours is honestly not.

**V6 — Write for an analyst, not a buyer persona.**
Analysts buy from analysts (BUSINESS-PLAN §1). The reader is a compliance officer, a trading-desk
researcher, or a consultancy analyst who will personally be embarrassed if they cite something
that turns out to be thin. Write to the person who will be blamed. That reader rewards
precision, dates, caveats and specificity, and is actively repelled by the category's standard
register.

### Register test
Before publishing any brand copy, three questions:
1. Could a competitor's marketing team write this sentence about their own product? If yes,
   it is category noise — cut or replace with a mechanism.
2. Does it contain a number without a date, a source, or a definition? Fix or delete.
3. Would it survive a hostile methodology reviewer reading it beside `/scoreboard`? If not, the
   copy is ahead of the product; fix the copy.

## 12. Identity direction

Full visual design is Phase 3. What follows is the brief it should be executed against, derived
from the position rather than from taste.

- **Register:** *analytic publication*, not monitoring console. The product is a dated, archived,
  addressable, BLUF-ordered document with a citation apparatus. The identity should look like
  something with footnotes.
- **Type:** a **serif or slab-serif display face** paired with a highly legible sans for
  interface and data, and a monospace reserved for identifiers, timestamps and hashes. This
  differentiates from five of seven competitors (P2), matches the product's actual nature, and
  gives the evidence chain a typographic home. Multilingual coverage is a hard constraint, not a
  nicety — the product ships en/uk/de/ar/ja/pl/fr, so the type system must handle Cyrillic,
  Arabic and CJK without falling back to a different personality.
- **Palette:** light-first and *warm-neutral*, against a category that defaults to cold navy,
  near-black and signal green (P1). One restrained accent, deliberately **not** kelly green,
  periwinkle, or burnt orange — those are taken. Reserve a second, quieter colour exclusively for
  evidence/provenance affordances so that "this is checkable" acquires a consistent visual
  signature across surfaces.
- **The signature device is the evidence chain itself.** Where competitors put an abstract globe,
  BNOW puts a real claim with its documents attached, its likelihood band, its corroboration
  count, and its copyable citation. It is the product, it is honest, and no competitor can show
  the equivalent because they do not have it. This should be the hero, on the homepage and in
  every deck.
- **No dark hero, no globe, no nodes, no reticles.**
- **Independence, stated quietly** — an unowned, self-funded posture, said once and plainly, not
  worked into a slogan (P5).

## 13. Messaging architecture

One position, four entry points. The decisive feature leads; auditability closes.

| ICP | Lead with | Close with |
|---|---|---|
| **Commodity / trading desks** (executable beachhead today) | Supply-shock signal: strike feed, trade-evasion divergence, procurement — and the measured information lead | "…and every number clicks through to the documents, so your risk committee can check it" |
| **Political-risk consultancies** (force multiplier) | Our data as *their* raw layer — API, entity dossiers, citations they can quote in their own reports | "…provenance that survives their client's scrutiny, because it survives ours" |
| **Bank / MNC compliance** (`OPEN` — gated on OpenSanctions rights) | Audit defensibility: the evidence chain holds up in an examination | "…enforced at the database, not by review" |
| **Government / MOD / MFA** (`ROADMAP`) | The ICD 203/206/ICS 206-01/208 crosswalk and the published benchmark loop | "…including the rows where we're `PARTIAL`, and why" |

The **weekly derived brief** (GTM §4) is the voice's proving ground: it is where V1–V6 either
hold up under real analytical content or do not. It should ship before any brand refresh, because
the refresh should be designed around copy that has already been tested on readers.

## 14. What this document does not decide

Surfaced deliberately, not resolved here:

1. **Published pricing (`OPEN`).** The brand argues for transparency at some tier; the packaging
   decision (BUSINESS-PLAN §4.1 / OPEN-TASKS #12) is the operator's and gates Paddle, checkout,
   and any priced outreach. §8/P4 is an input to it, not a substitute.
2. **The analyst-verified tier (`G1`, open since 2026-07-06).** Whether BNOW brands as
   *automated with disclosed limits* or *automated then analyst-verified* changes the voice's
   confidence ceiling, the premium tier, the Paddle AUP category and the first hire. Until
   decided, all brand copy assumes the former.
3. **Whether "BNOW.NET" is the name to build on.** The domain is live, the wordmark is in the
   header, and the name is not descriptive of conflict intelligence. Renaming is cheap now and
   expensive after enterprise contracts — worth an explicit decision rather than a default.
4. **Whether to name the benchmark publicly in brand copy.** Naming ISW/CTP is honest and
   specific; it also anchors BNOW to a comparison and to another organization's cadence.
5. **The category term.** "Conflict intelligence," "geopolitical OSINT," "auditable
   intelligence" — the product docs use several. One should win.

---

## Sources

**Internal (this repository)**
- `docs/research/competitors/design/raw-visual-branding.md` — 7 companies, palettes, typography,
  14-screenshot manifest (two-pass, live-verified 2026-09-07)
- `docs/research/competitors/design/raw-ia-navigation.md` — navigation, CTAs, product specificity
- `docs/research/competitors/design/raw-trust-signals.md` — trust devices, methodology language,
  psychological pitch
- `docs/research/competitors/design/competitor-screenshots/` — 14 live captures
- `docs/research/competitors/market/raw-research-pricing.md` — deal sizes, contract ceilings,
  the Seerist AWS SKU, the Eurasia Group NRCan series
- `docs/research/competitors/market/raw-research-mna.md` — AXA XL/S-RM, Control Risks/Seerist/
  Geospark, Oxford Analytica ownership chain
- `docs/research/competitors/market/raw-research-janes.md` — Janes product architecture,
  UK MOD contracts, IBM/watsonx, Montagu ownership and reported sale interest
- `docs/PRODUCT-BRIEF.md`, `docs/BUSINESS-PLAN.md`, `docs/COMPETITIVE-AND-DEMAND.md`,
  `docs/GTM-STRATEGY.md`, `docs/METHODOLOGY-TRADECRAFT.md`, `docs/PARTNER-STRATEGY.md`,
  `docs/CURRENT-STATE.md`, `docs/BNOW-NEXT-FEATURES-PLAN-2026-07-12.md`

**Enforcing code referenced**
- `drizzle/9999_claim_source_trigger.sql` · `drizzle/0000_superb_ultimates.sql`
  (`ON DELETE no action`) · `src/lib/tradecraft/descriptor.ts` ·
  `src/lib/tradecraft/estimative.ts` · `src/lib/tradecraft/crosswalk.test.ts` ·
  `src/lib/registry/view-policy.ts` · `src/lib/conflicts/product-copy.ts` ·
  `src/lib/analysis/publication-guard.ts`

**Standards**
- ICD 203 Analytic Standards · ICD 206 Sourcing Requirements · ICD 208 Maximizing the Utility of
  Analytic Products · ICS 206-01 Citation and Reference for PAI/CAI/OSINT.
  Index: https://irp.fas.org/dni/icd/index.html

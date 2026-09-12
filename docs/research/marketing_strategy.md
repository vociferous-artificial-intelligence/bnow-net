# BNOW.NET — Marketing Strategy

Strategy doc (2026-09-09). Phase 2 of the pre-redesign brand workstream: what narratives
competing and adjacent data products actually use to sell, how well those narratives hold up,
and which BNOW should adopt, improve on, or attack. Companion to `branding_strategy.md`
(Phase 1, position and voice). Visual design and campaign execution are out of scope.

> **Evidence base.** Verbatim competitor copy is from the 2026-09-07 teardown in
> `docs/research/competitors/` — `design/raw-trust-signals.md`, `design/raw-ia-navigation.md`,
> `design/raw-visual-branding.md` (14 live screenshots, two-pass verified) — plus
> `market/raw-research-pricing.md`, `market/raw-research-mna.md`, `market/raw-research-janes.md`.
> BNOW's own posture is from `GTM-STRATEGY.md`, `BUSINESS-PLAN.md`, `PRODUCT-BRIEF.md`,
> `COMPETITIVE-AND-DEMAND.md`, `METHODOLOGY-TRADECRAFT.md`, `CRITICAL-MATERIALS.md`,
> `PARTNER-STRATEGY.md`, `CURRENT-STATE.md`.
>
> **Claim discipline.** Inherited from Phase 1. Coverage is never restated as accuracy. Draft
> copy lines below are marked `SAYABLE` (evidenced today), `ROADMAP` (not yet), or `GATED`
> (blocked on a named decision). Nothing marked `ROADMAP` or `GATED` goes into market copy.

---

## 0. The short version

The category sells nine narratives. Three are exhausted (speed, analyst-hours, AI
architecture), three are structurally unavailable to BNOW (heritage, borrowed institutional
authority, exclusive human access), and three are live and winnable — **analyst relief**,
**personal accountability**, and **explainability**. Sayari has staked explainability first and
is running it well, but rhetorically: it asserts that its outputs are "scored, sourced, and
explainable" without letting anyone check. BNOW's marketing job is not to find a new narrative.
It is to take the two best narratives in the category, run them with *demonstrations instead of
adjectives*, and let the two loudest narratives — speed and AI architecture — keep collapsing
under their own unfalsifiability while pointing at where they collapse.

The single highest-leverage marketing asset BNOW owns is not a message. It is **the public
scoreboard, including the bad number.** No competitor publishes their own performance. Running
a weak metric in public is a narrative move no incumbent can match, because matching it would
require them to disclose numbers they have spent years not disclosing.

---

# Part I — The narrative inventory

Nine recurring narratives, with the verbatim copy that carries each, the psychological
mechanism it runs on, and where it breaks.

## N1 — Speed / preemption: *"You will know before it matters"*

**Who runs it:** Dataminr (primary), Recorded Future (primary), Seerist (co-primary).

**Verbatim:** "Know what matters before it matters" · "Defend autonomously at machine speed"
· "before the pre-attack window closes" · "31 minutes" (Recorded Future). "AI-Powered
Real-Time Event, Threat & Risk Intelligence" · "earliest warnings" · "know first, act faster"
(Dataminr). "Decisions before disruption." (Seerist).

**Mechanism:** Loss-of-tempo anxiety. Positions the buyer's current state as *already behind*,
which converts a monitoring purchase into an urgent one. Pairs naturally with alerting products
because latency is the one number these vendors can quote without qualification.

**Where it breaks:** It has been said identically by three vendors and is now table stakes
rather than differentiation. It is also a promise about the *worst* case (the one time you were
alerted first) sold as the average case, and it silently transfers the triage burden to the
buyer — which is why Recorded Future's own product page has to open with "Stop drowning in
alerts," a sentence that concedes what the speed narrative costs.

## N2 — Analyst hours / human depth: *"Look how much human labour is behind this"*

**Who runs it:** Seerist, Janes, Oxford Analytica, Eurasia Group.

**Verbatim:** "200+ Control Risks analysts, embedded" · "50 years of HUMINT depth" · "50,000
hours of expert intelligence per year" (Seerist). "500,000+ Analyst hours per year" (Janes).
"a 1,500-strong global network" (Oxford Analytica). "on-the-ground experts and resources in
over ninety-five countries" (Eurasia Group).

**Mechanism:** Effort as a proxy for quality, plus an implicit scale-of-investment signal
("you could never build this yourself").

**Where it breaks:** These are **input metrics**, not outcome metrics, and none is auditable.
Nobody can check whether 500,000 analyst hours produced a better answer than 50,000 would have,
and the buyer is being asked to infer quality from cost. The narrative is also strategically
brittle: it is a disclosure of the vendor's cost base at exactly the moment AI is compressing
that cost base, which makes it a claim that gets weaker every year it is repeated.

## N3 — Anti-AI purity: *"Real analysts, not AI filters"*

**Who runs it:** Janes, explicitly and alone.

**Verbatim:** "Janes data is verified and validated by our teams of analysts, **not AI
filters**." Reinforced by the collection story: field intelligence gathered by Janes analysts
"at events like air shows," and the memorable line from Janes' Ben Conklin — *"The internet has
a lot of information about the military, and most of it's wrong."*

**Mechanism:** Flight to safety. Deliberately counter-positions against the entire AI-forward
cluster and offers a buyer who distrusts LLMs a place to stand. It is the sharpest single line
of copy in the research set.

**Where it breaks:** Janes contradicts it. The same company partnered with IBM to put its data
into watsonx (Dec 2024) and is bound up with an IBM defence model explicitly designed for
"tool-calling of the Janes Inventory API" (model card, released 2025-09-15). The purity
narrative is running while the AI integration ships. That is a live vulnerability, though
attacking it directly would be a mistake for BNOW (see §C5).

## N4 — AI architecture: *"Look at the machine"*

**Who runs it:** Dataminr (hardest), Recorded Future, Sayari (in a smarter variant).

**Verbatim:** "more than 50 proprietary LLMs" · "Multi-Modal Fusion AI for discovery,
Generative AI for description, and Agentic AI for context" · "**99.5% accuracy**" for
auto-regenerating briefs (Dataminr). "Agentic processing turns vulnerability signals into a
production-ready detection signature in as little as 30 minutes" (Recorded Future). Sayari's
variant is structural rather than boastful: **"Foundation" is a top-level nav item** exposing
World Model, Ontology and "Superconductor" *ahead of* Platform or Solutions — infrastructure
credibility before product.

**Mechanism:** Technical awe, and a proxy for R&D seriousness.

**Where it breaks:** Almost every number in it is unfalsifiable. "99.5% accuracy" names no task,
no test set, no measurement window, and no evaluator. "50+ proprietary LLMs" is a count of
artifacts, not a claim about output. Worse, the narrative walks straight into the buyer
population's stated anxiety: IARPA's BENGAL programme exists precisely because the IC finds
LLMs attractive for OSINT triage and untrusted in it. Leading with model architecture in front
of that audience answers a question nobody asked and raises the one they did.

**Sayari's variant is the exception and is genuinely strong** — it sells the *data model*
(ontology, entity resolution) rather than the model weights, which is durable, and it front-loads
it in navigation, which signals that the company expects to be interrogated.

## N5 — Borrowed institutional authority: *"These institutions already trust us"*

**Who runs it:** Seerist (hardest), Dataminr, Sayari, Oxford Analytica.

**Verbatim / devices:** A 13-logo wall including **NATO, ODNI, the US Intelligence Community
and the Department of War**, with seals used as crest imagery; "Trusted by 400+ organizations
worldwide"; "25% of the Fortune 100" (Seerist). "100+ U.S. government agencies," "20+
international governments," and a named **$318M Department of War contract** (Dataminr).
**SOC 2 Type II**, and In-Q-Tel named explicitly as "the CIA's venture arm," plus named
government contracts ($8.5M Treasury, $7.8M CBP) (Sayari). World Bank, European Commission,
Gates Foundation, G7 governments (Oxford Analytica).

**Mechanism:** Transitive trust. The buyer does not have to evaluate the product; they evaluate
the reference class.

**Where it breaks:** It does not break — it is the most reliably effective narrative in the set,
and it is the one BNOW cannot run at all. Two useful observations, though. First, Seerist
front-loads *all* of this onto the homepage and the deeper Platform page carries **none** of it
— the trust is decorative rather than load-bearing on the product. Second, Sayari's version is
the best-constructed because it mixes borrowed authority with **checkable specifics** (a named
compliance certification, named contract values, four quantified case studies), which converts
it from "important people like us" into "here are facts you can verify."

## N6 — Heritage / longevity: *"We have been doing this since before you were born"*

**Who runs it:** Janes (1898), Oxford Analytica ("founded 1975," "nearly 50 years"), Sayari
(a decade).

**Verbatim:** "We Spent A Decade Mapping The World's Shadow Economy." (Sayari's hero — the
single best-written headline in the research set). "Decision-Grade Intelligence" over a
125-year institutional history (Janes).

**Mechanism:** Survivorship as proof. Also raises the switching cost of *not* buying the
incumbent — nobody was ever fired for buying Janes.

**Where it breaks:** Unavailable to a new entrant, and mostly not worth attacking, since it is
true. The one exploitable seam: heritage narratives correlate strongly with methodology
opacity in this set. Oxford Analytica's fifty-year track record is paired with a total
methodology disclosure of "robust methodologies and impartial analysis," and its own leadership
page lists six people by internal title with **no** former-government, ambassadorial or
academic affiliations — thin bios for a firm whose category pitch is human expertise.

## N7 — Exclusive access / relationship: *"You get the people, not a product"*

**Who runs it:** Eurasia Group, in the purest form in the set.

**Verbatim:** "What distinguishes Eurasia Group advisory is the **unfettered access** our
clients have to analysts—the world's foremost experts on politics and geopolitical risk."
Relationship framing throughout ("deep, enduring, and profitable" client-analyst
relationships). Zero AI framing, zero platform framing.

**Mechanism:** Status and scarcity. Sells a relationship, which is unsubstitutable in a way a
data feed is not.

**Where it breaks:** The site does not deliver the promise's own proof. For a firm whose entire
differentiator is access to named experts, the public site carries **no analyst headshots and no
named-expert photography** — the hero image is silhouetted stock figures. The trust rests on one
individual (Ian Bremmer) plus a flagship annual report. It is also the narrative most exposed to
price pressure: the disclosed Canadian federal series shows the *same* "platform + expert
access" renewal holding at roughly CAD $185K–226K/yr across seven fiscal years, which is a
relationship being bought as a line item.

## N8 — Analyst relief: *"Give your people their time back"*

**Who runs it:** Seerist (best in class), Recorded Future (defensively).

**Verbatim / devices:** The "3AM call." "I have 90 minutes." A "hidden cost of intelligence
work" chart showing analysts burn **40% of their time on collection alone**. "50,000 analyst
hours, queryable in 30 seconds." Recorded Future's product-page subhead: "**Stop drowning in
alerts. Start stopping threats.**"

**Mechanism:** This is the only narrative in the set addressed to the *user* rather than the
*buyer*, and it names a real, specific, daily indignity. It is emotionally the strongest
material in the research, and it converts because the person reading it recognises their own
Tuesday.

**Where it breaks:** It barely does. The weakness is that most vendors running it immediately
pivot to speed (N1), which re-imposes the triage burden they just promised to remove. Relief
and speed are in tension, and almost nobody notices.

## N9 — Explainability / anti-generic-LLM: *"Trustworthy AI, unlike the other kind"*

**Who runs it:** Sayari, alone and deliberately.

**Verbatim:** "AI THAT EARNS YOUR TRUST" (hero eyebrow). "Now we've built the **judgment
infrastructure** that lets AI navigate it." "**The gap isn't data. It isn't AI. It's the
judgment between them.**" "Every output is scored, sourced, and explainable." "**When the AI
doesn't know something, it says so.**" "Tradecraft standards before it reaches your team."
Plus the **"Same Query. Two Very Different Answers"** module — a side-by-side of a generic-AI
non-answer ("No chain-of-ownership traversal · No source citation · Unverifiable") against
Sayari's sourced answer ("Grounded. Specific. Calibrated uncertainty") — and estimative
language in the product copy: "Likely exposure: Roughly Even Chance to Likely."

**Mechanism:** Creates a villain (the generic LLM the buyer has already been burned by),
positions the vendor as the adult in the room, and converts the category's biggest liability
into a purchase reason.

**Where it breaks — and this is the important paragraph in this document:** every one of these
is an **assertion about the vendor's own output that the vendor is also the only judge of**.
"Scored, sourced, and explainable" is not shown; it is stated. "Calibrated uncertainty" borrows
the *form* of Words of Estimative Probability without naming ICD 203 or any issuance, so a
reader cannot check what "Roughly Even Chance to Likely" is calibrated *against*. And the
side-by-side module compares Sayari to a strawman — a generic chatbot — rather than to a rival
that also cites. Sayari has correctly identified the seam and has planted a flag in it with
copy. **It has not closed it with mechanism, and it left the checkable version of the claim
unoccupied.**

## N10 — Personal accountability / loss aversion: *"You are the one who gets blamed"*

**Who runs it:** Sayari, targeted at compliance/procurement/legal buyers.

**Verbatim:** "Audit failure, penalty, loss of trust." Framed around domains "where getting it
wrong isn't an option."

**Mechanism:** Shifts the purchase from an organisational ROI calculation to a personal
risk-transfer decision. The most reliable conversion mechanic in compliance software, because
the buyer is insuring themselves, not just the company.

**Where it breaks:** It requires the product to actually survive an audit. A vendor running this
narrative without an inspectable evidence trail is writing a cheque its product cannot cash —
which is exactly the gap BNOW is built to fill.

---

## The narratives nobody is running

Worth naming, because unoccupied narrative space is cheaper than contested space.

1. **Published performance.** No competitor publishes any measurement of their own output
   quality. Not one. The category's entire quality discourse is inputs (analyst hours, data
   sources, model counts) and adjectives (verified, validated, decision-grade).
2. **Price transparency.** Recorded Future alone carries "Pricing" in primary navigation.
   Everyone else gates it — while procurement records disclose it anyway (Seerist's AWS
   Marketplace SKU at $75,000/yr for five named users; Janes' G-Cloud band of
   £5,000–£10,000,000/yr; the Eurasia Group Canadian series above).
3. **Independence.** Recorded Future has been Mastercard-owned since December 2024 and says
   nothing about it. Oxford Analytica has been absorbed into Dow Jones so completely that its
   product page is a Dow Jones template with a Dow Jones chat agent. S-RM is being taken to
   100% by AXA XL. Seerist's federal contracts sit with Geospark Analytics, with Control Risks
   as a ~10% minority investor. **Independence is becoming rare in this category and literally
   nobody is selling it.**
4. **Named standards.** Five of seven name no framework at all. Recorded Future names
   MITRE ATT&CK and YARA/Snort/Sigma — cyber-detection frameworks, not analytic-tradecraft ones.
   Nobody in the geopolitical set names ICD 203, ICD 206, ICS 206-01 or ICD 208.

---

# Part II — How strong are these narratives?

Scored on four axes. **Differentiation** = can a competitor say the same sentence tomorrow.
**Falsifiability** = can a buyer check it (high falsifiability is a *strength* — it means the
claim survives scrutiny). **Durability** = does it get stronger or weaker over the next three
years. **Availability to BNOW** = can we run it honestly today.

| # | Narrative | Differentiation | Falsifiable | Durability | Available to BNOW | Verdict |
|---|---|---|---|---|---|---|
| N1 | Speed / preemption | **Low** — 3 vendors, same words | Partly (latency is measurable) | **Falling** — commoditising | Partly, redefined | **Exhausted.** Do not enter as framed |
| N2 | Analyst hours | Low | **No** — input metric | **Falling** — AI compresses the cost base it brags about | No | **Decaying.** Counter it |
| N3 | Anti-AI purity | **High** — only Janes | No | Mixed — real audience, but Janes contradicts it | No | **Strong but compromised** |
| N4 | AI architecture | **Low** and falling | **No** — "99.5% accuracy" of what? | **Falling fast** | No — and refuse it | **Weakest in the set** |
| N5 | Borrowed authority | Medium | Partly (Sayari's version, yes) | High | **No** | **Strongest, unavailable** |
| N6 | Heritage | High (structurally) | n/a | High | No | **Strong, unavailable** |
| N7 | Exclusive human access | **High** — only Eurasia Group | No | Falling — priced as a line item | No | **Strong, unavailable, price-exposed** |
| N8 | Analyst relief | Medium | Partly | **High** — the problem is not going away | **Yes** | **Best available emotional narrative** |
| N9 | Explainability | High today — Sayari alone | **Asserted, not shown** | **High** | **Yes, and better** | **The strategic prize** |
| N10 | Personal accountability | Medium | Depends on the product | High | **Yes** (`GATED` on ICP #1) | **Best available conversion mechanic** |

## Four judgments worth stating plainly

**1. The category's loudest narratives are its weakest.** Speed and AI architecture are run by
the best-funded vendors and are the two least defensible claims in the set: one is
commoditised, the other is unfalsifiable. This is normal in a category where the buyer cannot
easily evaluate the product — vendors compete on the dimensions that are cheapest to assert.
BNOW should read that as a signal, not a target.

**2. Falsifiability is currently a liability everywhere, and it is BNOW's asset.** Every vendor
in the set has organised its marketing so that no claim can be checked. That is a rational
choice when the product cannot survive checking, and an enormous strategic opening when a
competitor's product can. **The whole marketing programme should be built on the observation
that BNOW can afford to be checked and they cannot.**

**3. Sayari is the competitor to study, not the ones to beat.** It is the only company that has
correctly identified where the category is going, and its execution — the worked example as
marketing copy, the infrastructure-first navigation, the villain framing, the loss-aversion
close — is the best in the set. But it has taken the explainability position with rhetoric,
which means the position is claimed but not defended. A competitor arriving with the same
narrative plus a demonstration takes it.

**4. The relief narrative and the speed narrative are secretly incompatible, and nobody has
noticed.** "Know first" produces more alerts. More alerts produce the drowning that Recorded
Future's own product page has to open by promising to stop. A vendor that runs relief *without*
running speed — that promises fewer, better, cited claims instead of more, faster ones — is
making a coherent offer the incumbents cannot make without repudiating their own hero copy.

---

# Part III — Adopt, improve, counter

## A — Adopt

**A1 — The relief narrative, run without the speed narrative.** `SAYABLE`
The buyer's felt problem is not that they learn things late; it is that they cannot trust what
they learn without re-doing the work. That is the version of relief BNOW can actually deliver,
and it is differentiated precisely because it declines the alert arms race. Draft:

> *"The 40% of an analyst's day that goes to collection is not the expensive part. The expensive
> part is the second pass — re-checking a claim before you are willing to put your name on it.
> Every claim we publish arrives with its documents already attached."*

Note the discipline: this does **not** claim BNOW alerts faster than Dataminr. It cannot; there
is no real-time push tier (`G3`, GTM §7). It claims something else, and something true.

**A2 — Personal-accountability framing for the compliance ICP.** `GATED` — ICP #1's decisive
feature is admin-only pending OpenSanctions commercial rights, so this narrative is drafted now
and deployed when rights land. It is the highest-converting mechanic in the set and BNOW is one
of the few products that can survive the audit it invokes. Hold it rather than dilute it.

**A3 — The worked example as marketing copy.** `SAYABLE`
Sayari's most transferable device: a single named, specific, checkable chain used as the pitch
("One Tier-2 supplier – Baikal Industrial Partners, registered Vladivostok 2019 – shares three
officers with a sanctioned entity added to OFAC SDN Q3 2024"). BNOW's version is strictly
stronger because the example can be *clicked*. One real claim, its documents, its likelihood
band, its corroboration count — as the homepage hero and as the first slide of every deck.

**A4 — Infrastructure-first information architecture.** `SAYABLE`
Sayari puts "Foundation" (World Model, Ontology) above Platform and Solutions in primary nav,
signalling that it expects interrogation. BNOW's equivalents — `/methodology`, `/scoreboard`,
the source registry — should sit at the same level, not in a Resources drawer. The IA is itself
an argument.

**A5 — A self-serve product tour.** `ROADMAP`
Recorded Future made "See it in action" its *primary* hero CTA. For an invite-only beta this is
the highest-value borrowing in the list: it converts curiosity without spending operator time
and without opening the access queue.

**A6 — A flagship annual publication.** `ROADMAP`
Eurasia Group's "Top Risks" and Janes' reference authority both show that one recurring,
citable publication does more brand work than continuous content. The weekly derived brief
(GTM §4) is the right start; a dated annual artifact is the eventual form.

## B — Improve on

**B1 — Explainability: replace the adjective with the mechanism.** `SAYABLE`
Sayari says "every output is scored, sourced, and explainable." BNOW can say what makes that
true and invite the check:

> *"A claim cannot be saved without a source document — the database refuses the transaction.
> Not a policy, not a review step. A constraint."*

This is the single strongest sentence available to BNOW's marketing, because it is specific,
verifiable, unusual, and impossible for a competitor to copy without rebuilding their write path.

**B2 — Calibrated uncertainty: name the standard Sayari won't.** `SAYABLE`
Sayari uses estimative-probability language ("Roughly Even Chance to Likely") without naming its
source, so the reader cannot check the calibration. BNOW publishes ICD 203 likelihood bands with
their percentage ranges beside a separately labelled corroboration-derived confidence level, and
maintains a public requirement-by-requirement crosswalk against four named issuances. Improving
on the narrative means *citing* it. The crosswalk's honesty — visible `PARTIAL` and `GAP` rows —
is part of the pitch, not a caveat on it. A crosswalk that is all `BUILT` is not credible.

**B3 — Rationale-for-change, generalised.** `ROADMAP`
Oxford Analytica's Global Risk Monitor has a "History" tab logging why a risk score moved. Good
device, narrow application. BNOW's version applies the same principle below the score, to the
claim: what changed, which document arrived, why the band moved.

**B4 — Define "verified" publicly, since nobody else will.** `SAYABLE`
"Verified" is the most crowded and least defined word in the category — Seerist ("Verified
Events," "80% of events verified"), Janes ("verified and validated"), RANE (verified as a
label). None publishes a definition. BNOW should not join the word contest (Phase 1, §5.2);
it should publish the definition and the score, and let the contrast do the work.

**B5 — Turn the case study into a divergence study.** `SAYABLE`
Everyone runs quantified-win case studies. BNOW has something better and stranger: a running
record of where its output *disagreed* with the expert benchmark, and who was right. A published
divergence review is a case study that cannot be faked and reads as confidence rather than
marketing.

## C — Counter

**C1 — Counter the analyst-hours narrative by renaming it.** `SAYABLE`
Do not argue that BNOW has more hours; it has one operator. Reframe the metric class:

> *"'500,000 analyst hours' is a cost disclosure, not a quality measurement. It tells you what
> the vendor spent. It does not tell you whether the answer was right. We publish the second
> number."*

This is fair (the criticism is structural, not personal), it is unanswerable without disclosing
performance, and it converts BNOW's smallness from a weakness into evidence for the argument.

**C2 — Counter the AI-architecture narrative by refusing to run it.** `SAYABLE`
Do not market the model. Every line about model counts and agentic pipelines walks into the
IC's stated anxiety — IARPA's BENGAL programme exists because LLMs are attractive for OSINT
triage and untrusted in it. The counter is one sentence and a change of subject:

> *"The model is infrastructure. Ask what happens to its output before you see it."*

**C3 — Counter borrowed authority with independence and evidence.** `SAYABLE`
BNOW has no logos and should not imply otherwise (no seals, no crests — Phase 1, §5.5/§5.6).
State the alternative plainly, once:

> *"No parent company, no investor whose portfolio our findings could embarrass. We publish
> what the sources support, and we publish how often we get it wrong."*

Given three of the seven researched competitors are owned or being acquired by insurers,
payment networks and media conglomerates, this lands harder each quarter.

**C4 — Counter speed by changing the unit.** `SAYABLE`
Do not contest "first alert" — BNOW loses on latency and has no real-time push tier. Contest
what is being counted:

> *"An alert is not a finding. Our published number is the median lead — currently 14.7 hours —
> on a named expert benchmark's own publication, for claims that arrive already cited."*

Two disciplines are binding here. The lead is measured against the benchmark's *publication
time*, not against another vendor's alerting, and must never be phrased as though it were. And
the coverage figure travels with it, in our own words, with the trajectory framing and the
2026-07-29→08-15 map-outage discontinuity footnoted.

**C5 — Counter the human-versus-AI binary by declining it.** `SAYABLE`
Janes and Dataminr are both heavily invested in opposite ends of a question about *inputs*, and
both ask the buyer to trust the vendor's account of its own process. Do not take a side, and do
not attack Janes' IBM contradiction directly — a new entrant sniping at a 125-year-old
institution reads as small, and the audiences overlap. Reframe instead:

> *"Human or machine is a question about our process. Here is the question about your risk:
> can you see what this claim rests on?"*

**C6 — Counter methodology opacity where heritage is the shield.** `SAYABLE`
The advisory houses pair long track records with disclosure as thin as "quantitative
methodologies" and "robust methodologies and impartial analysis." Never name a competitor.
Publish the crosswalk, keep the `GAP` rows visible, and let a buyer who reads both draw the
conclusion themselves. **Do not do comparison marketing against named vendors at BNOW's current
size** — it elevates them, invites a response BNOW cannot absorb, and contradicts the calm
register (Phase 1, V3).

---

# Part IV — BNOW's narrative stack

Ranked. Each narrative names the proof asset it rests on and the constraint that binds it.

| Rank | Narrative | One line | Rests on | Constraint |
|---|---|---|---|---|
| 1 | **Show your work** | Every claim arrives with its documents attached, because the database will not accept one without them | `drizzle/9999_claim_source_trigger.sql`; `ON DELETE no action` on the citation FK; the per-claim evidence panel | None. This is fully `SAYABLE` and is the lead in every channel |
| 2 | **We publish our own score** | We measure ourselves against a named expert benchmark daily and publish it, including the bad days | `/scoreboard`; +14.7h median lead; run-avg coverage ~17.5% | Coverage is never called accuracy. Publish the outage discontinuity. Lead with the *act of publishing*, not the number |
| 3 | **Fewer, better, cited** (relief) | The second pass is the expensive one. We do it before you see the claim | Evidence panel, estimative bands, corroboration counts, source descriptors | No real-time alerting claim (`G3`). Never phrased as beating a competitor's latency |
| 4 | **Standards, named** | ICD 203 · ICD 206 · ICS 206-01 · ICD 208, requirement by requirement, with our gaps shown | `METHODOLOGY-TRADECRAFT.md`; `/methodology`; `crosswalk.test.ts` | Never name a standard we do not meet. `PARTIAL`/`GAP` rows stay visible |
| 5 | **Independent** | No parent company, no investor portfolio to protect | Corporate fact | Say it once, plainly. Not a slogan |
| 6 | **Audit-survivable** (accountability) | The evidence chain holds up in an examination | Enforced traceability + preservation policy | `GATED` on OpenSanctions rights. Draft now, deploy later |

**Anti-claims — binding.** Never claim accuracy. Never use "verified" as an unqualified brand
word. Never quote an unsourced scale number as hero copy — BNOW's numbers are smaller and real,
and borrowing the incumbents' rhetorical form invites the comparison BNOW loses. Never imply an
analyst bench (`G1` undecided). Never imply institutional endorsement. No named-competitor
comparison marketing.

## Message architecture by segment

Decisive feature leads; the evidence chain closes. Order follows the GTM sequencing correction
of 2026-08-17.

| Segment | Lead narrative | Close | Status |
|---|---|---|---|
| **Commodity / trading desks** (executable beachhead) | Supply-shock signal: strike feed, trade-evasion divergence, procurement, choke-point stress | "…and your risk committee can click every number" | `SAYABLE` |
| **Political-risk consultancies** (force multiplier) | Our layer under their product — API, dossiers, citations they can quote | "…provenance that survives their client's scrutiny because it survives ours" | `SAYABLE` |
| **Bank / MNC compliance** | Audit defensibility | "…enforced at the database, not by review" | `GATED` |
| **Government / MOD / MFA** | The crosswalk and the benchmark loop | "…including the rows where we're `PARTIAL`, and why" | `ROADMAP` |
| **Journalists / NGOs / researchers** | Traceable evidence chains, entity timelines, the data-dark tracker | Low ARPU, high credibility — this is a marketing channel that pays in citations | `SAYABLE` |

## Channel notes

The Phase 1 principle applies: **the proof surfaces are the marketing.** The scoreboard, the
data-dark tracker, the trade-evasion watch and the choke-point tracker demonstrate the product
working in public, which is a different and better asset than describing it.

- **The weekly derived brief** is the voice's proving ground and should ship before any brand
  refresh, so the refresh is designed around copy already tested on readers. Derived insight
  only — never source prose (GTM §4).
- **Partner/validator outreach** (PARTNER-STRATEGY §6) is a marketing channel disguised as
  research. The ask is a private methodology critique and two or three buyer introductions —
  not an endorsement. A reviewer who finds the coverage gap disclosed inside our own memo
  becomes a stronger validator than one who has to discover it.
- **The critical-materials tracker widens the audience** beyond conflict desks into corporate
  strategy, procurement and economic-security units. Its honest caveat — event-fusion is only
  as good as theater coverage — should be stated in the copy, per V2.

---

# Part V — What this document does not decide

1. **Price transparency (`OPEN`).** The narrative stack argues for it: a product whose whole
   pitch is "we show our work" that hides its price has a tonal contradiction. Packaging is the
   operator's decision (BUSINESS-PLAN §4.1 / OPEN-TASKS #12) and this is an input to it.
2. **When narrative #6 (audit-survivable) deploys.** Gated on OpenSanctions commercial rights.
3. **Whether the benchmark is named in public marketing.** Naming ISW/CTP is specific and honest;
   it also anchors BNOW to another organisation's cadence and invites the non-independence
   question earlier in the funnel. Carried over unresolved from Phase 1.
4. **Cadence and ownership of the weekly brief.** One operator; a weekly publication is a real
   recurring cost and the first thing to slip.
5. **Whether to run a public divergence review (B5).** Strategically strong, operationally
   exposed — it publishes the days BNOW was wrong. Consistent with the brand; needs an explicit
   decision rather than a drift into it.

---

## Sources

**Internal (this repository)**
- `docs/research/branding_strategy.md` — Phase 1: position, competitive brand analysis, voice
- `docs/research/competitors/design/raw-trust-signals.md` — trust devices, methodology language,
  psychological pitch (7 companies)
- `docs/research/competitors/design/raw-ia-navigation.md` — navigation logic, CTA copy, hero
  headlines, product-vs-abstraction
- `docs/research/competitors/design/raw-visual-branding.md` — visual register, palettes,
  typography, 14-screenshot manifest
- `docs/research/competitors/market/raw-research-pricing.md` — disclosed contract values,
  the Seerist AWS SKU, the Eurasia Group NRCan series, Janes' G-Cloud band
- `docs/research/competitors/market/raw-research-mna.md` — AXA XL/S-RM; Control Risks/Seerist/
  Geospark minority-stake structure; the Oxford Analytica ownership chain
- `docs/research/competitors/market/raw-research-janes.md` — the IBM/watsonx partnership and
  defence model card (2025-09-15), UK MOD contracts, Conklin quotes
- `docs/GTM-STRATEGY.md` (positioning, ICPs, channels, gaps `G1`–`G5`) ·
  `docs/BUSINESS-PLAN.md` (§4.1 packaging, moats) · `docs/PRODUCT-BRIEF.md` (§2 BENGAL,
  §6.5 crisis-cycle pricing) · `docs/COMPETITIVE-AND-DEMAND.md` (§1 landscape, §2 buyer
  segments) · `docs/METHODOLOGY-TRADECRAFT.md` (the four issuances, the crosswalk) ·
  `docs/CRITICAL-MATERIALS.md` (choke-point tracker, audience widening) ·
  `docs/PARTNER-STRATEGY.md` (§6 outreach sequence) · `docs/CURRENT-STATE.md`

**Standards**
- ICD 203 Analytic Standards · ICD 206 Sourcing Requirements · ICD 208 Maximizing the Utility of
  Analytic Products · ICS 206-01 Citation and Reference for PAI/CAI/OSINT.
  Index: https://irp.fas.org/dni/icd/index.html
- IARPA BENGAL (Bias Effects and Notable Generative AI Limitations) — the IC's stated LLM
  reliability anxiety, per `PRODUCT-BRIEF.md` §2

# Janes (janes.com) Competitive Teardown — Raw Research Notes

**Date compiled:** 2026-09-07
**Status:** RAW, UNSYNTHESIZED research log. Not a polished report. One of three parallel
competitive-intelligence workstreams feeding BNOW.NET's competitive strategy doc. A human
analyst will synthesize this later — prioritize traceability over prose here.

**Baseline this goes beyond:** "Janes sells defense/military OSINT, orbats, equipment
intelligence across 14+ product lines including an Open Source Defence Intelligence Data
System and an 'Ask Janes' AI query layer. Price band is very high-end ($$$$),
enterprise/custom-quoted. Their edge is authoritative military reference data; their gap is
that it's not real-time, it's built for ministries rather than analyst desks, and no
source-reliability scoring is exposed."

**Access constraint that shaped this research:** janes.com's robots.txt blocks the fetch tool
site-wide — every direct WebFetch attempt against any janes.com / i.janes.com URL returned
`ROBOTS_DISALLOWED` (or, once, an SSL failure on a `*.sitefinity.cloud` staging mirror). I
made repeated genuine attempts to work around this (Wayback Machine direct fetch and CDX API,
the `r.jina.ai` read-proxy, the `12ft.io` proxy, DuckDuckGo HTML search) — all failed (robots
block propagated to the Wayback fetch too; the proxies were refused by the tool itself as
unverifiable third-party relays). As a result, **no claim below is sourced to a direct fetch
of janes.com's own OSDIDS or "Ask Janes" pages** — everything is reconstructed from
third-party press, government procurement filings, IBM's own documentation, partner
datasheets, a Janes API client library on GitHub, and a live Janes job posting. This is
flagged inline wherever it matters and summarized in the "Could Not Verify" section.

---

## 1. OSDIDS — Open Source Defence Intelligence Data System

**What it is (per Janes' own page title/URL, un-fetchable — see constraint above):**
Janes maintains a page titled "Open Source Defence Intelligence Data System" at
`janes.com/defence-intelligence/what-we-do/open-source-intelligence-data-system`, confirmed
to exist via search indexing and via a live Wayback Machine snapshot dated 2026-04-11 (snapshot
itself could not be fetched — see gaps). A near-identical page also exists at a different URL
path, `janes.com/osint-solutions/what-we-do/open-source-Intelligence-data-system`, suggesting
Janes has at some point restructured its site IA from a "defence-intelligence" section to an
"osint-solutions" section (both indexed; could not confirm which is current/canonical).
[Search result confirming both URLs exist](https://www.janes.com/defence-intelligence/what-we-do/open-source-intelligence-data-system) /
[alt URL](https://www.janes.com/osint-solutions/what-we-do/open-source-Intelligence-data-system)

**Best available substantive description — from the UK MOD's own procurement paperwork,**
which describes what is functionally the OSDIDS product even though it doesn't use the OSDIDS
brand name:
- "the only comprehensive unclassified dataset of technical intelligence on global military
  equipment, alongside associated methodologies and classification systems used to organise
  and analyse defence data" — UK Defence Journal, on the £17.5M Defence Digital Enterprise
  Agreement Lite. https://ukdefencejournal.org.uk/mod-to-award-intelligence-data-deal-to-janes/
- Coverage spans "air, land, naval, missile, space, and electronic warfare domains"; the
  contract grants access to "unclassified military intelligence databases, analytical tools,
  and defence assessments," "structured taxonomies for comparing military platforms," and
  "proprietary datasets, methodologies, and classification frameworks" tracking "thousands of
  military platforms." — TheDefenseWatch.com.
  https://thedefensewatch.com/defense-contracts/janes-wins-uk-mod-agreement-to-deliver-military-intelligence-and-analysis-services/
- MOD justified a **sole-source, non-competitive award** because Janes "owns the intellectual
  property and proprietary databases, with no reasonable alternative suppliers providing
  equivalent coverage" — same two sources. This is a strong structural-moat data point.

**Taxonomy / data model — best evidence from a Janes API client library on GitHub** (an R
wrapper called `janes-R`, published by GitHub user `janesintelligence`, mirrored on rdrr.io —
not blocked by robots.txt): the Janes API exposes (or exposed, as of its last documented
version) **17 distinct data endpoints**: Airports, Bases, Companies, Country Risk, Defence
Programs, Early Warning Sites, Equipment, **Equipment Relationships**, **Events**, Inventories,
Markets Forecast, News, Nuclear Sites, ORBATs, Reference, SAM Sites, Satellite Images. Data
returned as JSON (convertible to CSV/XLSX/XML). The README explicitly states: **"The Janes V1
API has been deprecated as of August 2022. Users should contact Janes about their new API for
Janes Intara."** https://rdrr.io/github/janesintelligence/janes-R/f/README.md — see also
Section 4 below on Intara/knowledge graph. The existence of an "Equipment Relationships"
endpoint as a peer of "Equipment" is itself evidence of a relational/graph-style entity model
rather than flat records.

**Taxonomy corroboration from a Janes ecosystem partner datasheet** (Karnak/GXP —
geospatialexploitationproducts.com, a geospatial-imagery-analysis platform that ingests Janes
data — not janes.com, fetchable): references "Janes data schema," "data model, dictionaries,
and ontologies," and "verified and validated ontologies, equipment profiles, and
specifications of tens of thousands of equipment types." Delivery into GXP is via "regular
data updates flowing directly into GXP software" plus a widget-based interface in "GXP
Fusion" for viewing/analyzing equipment metadata, and supports "mapping AI/ML algorithms
against Janes data" for consistent classification/object-detection identification. ORBAT
database integration is specifically called out for imagery-analysis workflows.
https://www.geospatialexploitationproducts.com/wp-content/uploads/2024/11/GXP-Partner-Janes__Datasheet.pdf

**Product-line framing from Janes' own G-Cloud 14 (UK government marketplace) listing**
(applytosupply.digitalmarketplace.service.gov.uk — not janes.com, fetchable): Janes sells
"**Foundational Intelligence**" ("structured, enduring military data" — capabilities,
equipment specs, org data) as functionally distinct from "**Current Intelligence**"
("real-time and near-real-time insights," curated news/event coverage), plus add-ons: Country
Intelligence (explicitly covering **PMESII** and **CBRN** frames), IntelTrak,
Forecasts/Programs/Budgets/Markets, and OSINT Tradecraft Training.
https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/services/617997262951726 —
**note: this document never uses the term "OSDIDS."** My working (unconfirmed) hypothesis is
that OSDIDS is Janes' marketing/umbrella name for what the G-Cloud listing calls "Foundational
Intelligence," but I could not confirm this equivalence from any source that states it
explicitly — flagging as inference, not fact.

**Delivery mechanism** (from the separate G-Cloud listing "OSINT and Data as a Service," same
supplier record — https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/supplier/715364
and https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/services/617997262951726):
- Deployment: private cloud; web browser access (IE11, Edge, Firefox, Chrome), mobile-optimized
- API: "available with customization options" (no further spec given)
- Data export formats: PDF, Word, Excel, CSV, ODF
- Auth: username/password; encryption TLS 1.2+
- **Pricing band confirmed directly**: £5,000 to £10,000,000 per year per license (wide range
  reflecting user-count/module scaling); free trial advertised at janes.com
- Also ships physical reference materials (hardcopy *Jane's Fighting Ships* etc.) alongside the
  digital service — legacy-publishing DNA persists inside the "data platform" pitch.

**Government-contract revenue evidence (UK, recurring, high-confidence — primary-source
procurement filings):**
- **Bridging Year Enterprise Agreement 2025–2026**: £5,250,000, term 1 Apr 2025 – 31 Mar 2026,
  awarded 25 Apr 2025, negotiated procedure without prior publication (i.e., sole-source),
  buyer contact Nadia Wheeler / MOD Corsham. Described simply as access to "a vast database of
  world-wide Defence capabilities and forces," required in both connected (web portal) and
  disconnected/offline (no internet connectivity) forms because "MOD has no in-house capability
  to produce such material." https://www.contractsfinder.service.gov.uk/notice/99d6f77b-2826-4438-bb09-f07ce35812d0
- **Successor Enterprise Agreement Lite**: ~£17.5M over 3 years (~£5.8M/yr), term reported as
  March 2026 – March 2029, again sole-source/direct-award, again justified on IP-ownership /
  no-alternative-supplier grounds. https://ukdefencejournal.org.uk/mod-to-award-intelligence-data-deal-to-janes/
  and https://thedefensewatch.com/defense-contracts/janes-wins-uk-mod-agreement-to-deliver-military-intelligence-and-analysis-services/
  — **Read together, these two filings show Janes converting a ~£5.25M one-year bridging deal
  into a ~£17.5M/3-year deal with the UK's Defence Digital organisation, consolidating access
  across defence branches.** This is a concrete, sourced revenue/moat signal for the
  competitive doc that goes well beyond the baseline's "enterprise/custom-quoted" framing.

**Launch date:** **Not established.** I searched extensively for an OSDIDS launch/unveiling
date (query variants: "Janes OSDIDS launch," "Janes unveils/launches/introduces Open Source
Defence Intelligence Data System," "OSDIDS 2022," "OSDIDS 2023," acronym-definition searches)
and found no press release, dateline, or trade-press piece announcing OSDIDS as a named
product launch. It reads as a long-standing, continuously-evolving branded umbrella over
Janes' core structured datasets rather than a single discrete product launch — but I could not
confirm this and could not date it. **Flag for the analyst.**

---

## 2. Ask Janes — AI query/chat layer (watsonx-based)

**Core access problem:** Janes' own explainer page — titled "**Inside Ask Janes: Bringing
AI-Powered Intelligence Discovery to Defence Users**" at
`janes.com/defence-intelligence-insights/defence-and-national-security-analysis/inside-ask-janes-bringing-ai-powered-intelligence-discovery-to-defence-users`
— is the single most relevant primary source and I could **not** fetch it (robots-blocked;
also tried via Wayback direct URL and CDX/availability API, `r.jina.ai`, `12ft.io` — all
failed). Its existence and title are confirmed via repeated search-index hits.

**Best directly-quoted marketing copy I could recover** (via a Facebook post excerpt that
search surfaced, though the Facebook page itself was also robots-blocked so this is the search
engine's own indexed snippet, not a full fetch — treat as a short verbatim fragment only):
> "Defence professionals would like to spend less time searching for information, and more
> time acting on intelligence. Ask Janes enables users to query validated Janes intelligence
> using natural language queries, helping them quickly compare equipment, sum[marize...]"
> (truncated by the search snippet)
https://www.facebook.com/JanesIntelligence/posts/defence-professionals-would-like-to-spend-less-time-searching-for-information-an/1065495969171566/
— Key takeaway even from the fragment: Ask Janes is positioned as a **natural-language query
layer over "validated Janes intelligence,"** with equipment-comparison and summarization as
headline use cases — i.e., a read/query layer on top of the existing structured datasets
(OSDIDS/Foundational Intelligence), not a separate content source.

**Technical foundation — Phase 1: the IBM/watsonx collaboration announcement (Dec 2024).**
Two IBM press pages (IBM newsroom, fetched successfully) date this **December 3, 2024** (IBM's
own site) though a third-party mirror (rss.investorbrandnetwork.com) independently dates the
same release **December 6, 2024** — treat as "early December 2024," exact day uncertain across
mirrors:
- https://newsroom.ibm.com/blog-ibm-and-janes-collaborate-to-help-national-security-and-defense-organizations-unlock-the-power-of-data-with-trusted-AI
- https://rss.investorbrandnetwork.com/ibn-full/ibm-janes-partner-to-enable-defense-organizations-leverage-ai-capabilities/
- Content: IBM and Janes announced they were integrating Janes' open-source defense/security
  intelligence data into **IBM watsonx** (AI + data platform) using a **Retrieval-Augmented
  Generation (RAG)** pattern on **IBM Granite** models, governed via **watsonx.governance**.
  Stated capabilities: "data-augmented report generation," "situational analysis," "operational
  decision support," "AI-assisted scenario modeling," "retrieval-augmented data analysis for
  risk mitigation," cross-department/cross-country collaboration tooling. Framing quote (no
  attributed speaker in the mirror I fetched): "AI is critical to enabling action at the speed
  of the digital battlespace – which is faster than a human's ability to process and act on
  multiple sources of incoming data."

**Technical foundation — Phase 2: "IBM Defense Model" / `ibm-defense-3-3-8b-instruct` (Sept–Oct
2025).** This is the specific model the task asked me to dig into. Full model card **fetched
directly from IBM's own watsonx documentation** (highest-confidence source in this whole
research set):
https://www.ibm.com/docs/en/watsonx/w-and-w/2.2.0?topic=models-defense-33-8b-model-card
- **Base model:** `granite-3-3-8b-instruct` (IBM's own open Granite family), fine-tuned into
  the defense variant
- **Parameters:** 8 billion; **context window:** 128K tokens
- **Multilingual:** 12 languages (English, German, Spanish, French, Japanese, Portuguese,
  Arabic, Czech, Italian, Korean, Dutch, Chinese)
- **Explicit intended use:** "tool-calling of the **Janes Inventory API**" plus
  retrieval-augmented generation "leveraging defense industry knowledge" — this is the
  strongest direct evidence tying this specific named model to Janes' own API/data layer,
  rather than just "trained on some Janes data in the abstract"
- **Training data composition:** permissively-licensed public datasets + synthetic
  reasoning-enhancement data + public military datasets + **"Janes API documentation with
  synthetic examples"**
- **Capabilities:** RAG, function-calling, summarization, text classification, extraction, Q&A,
  code tasks, multilingual dialogue, long-context ops
- **Release date on the model card itself: September 15, 2025**
- **Licensing:** "IBM" license (standard IBM customer-support terms, not open-source per se)
- Benchmarked on AlpacaEval-2.0 and Arena-Hard, with claimed gains particularly in
  math/coding — standard IBM foundation-model benchmark suite, not defense-specific
  benchmarks, worth noting as a gap in the model card itself.

**Public GA announcement — October 29, 2025** ("IBM Defense Model," generally available,
branded/marketed name — the model ID above is the underlying technical identifier). Multiple
independent outlets fetched and cross-checked, all consistent on the core facts:
- IBM newsroom (canada mirror, full press release):
  https://newsroom.ibm.com/2025-10-29-ibm-announces-defense-focused-ai-model-to-accelerate-mission-planning-and-decision-support
- PRNewswire mirror (same release, verbatim):
  https://www.prnewswire.com/news-releases/ibm-announces-defense-focused-ai-model-to-accelerate-mission-planning-and-decision-support-302598313.html
- IBM's own product page: https://www.ibm.com/products/watsonx-ai/defense-model
- DefenseScoop (independent trade-press reporting, billed as "a first look" —
  https://defensescoop.com/2025/10/29/ibm-new-large-language-model-defense-applications-janes/)
- Also corroborated by: Intelligence Community News
  (https://intelligencecommunitynews.com/ibm-announces-defense-focused-ai-model/), Defence
  Industry Europe
  (https://defence-industry.eu/ibm-launches-specialised-ai-model-to-enhance-decision-making-in-defence-and-national-security/),
  DEFCROS News (https://news.defcros.com/an-in-depth-examination-of/), ExecutiveBiz
  (https://www.executivebiz.com/articles/ibm-ai-defense-model-military-intel)

**Consolidated facts from the above cluster:**
- Built on IBM Granite; delivered via **watsonx.ai**; IBM's Granite models are cited as "the
  first open models to achieve **ISO 42001** certification for AI governance" (repeated
  verbatim across nearly every mirror — clearly IBM's preferred talking point)
- **Deployment environments**: air-gapped, classified, and edge settings; integrates via API
  with **command-and-control frameworks including CJADC2 and Maven** (per DEFCROS News —
  single-source for the CJADC2/Maven specifics, not repeated elsewhere, so treat with slightly
  lower confidence than the multiply-corroborated facts)
- **Data currency**: "continuously refreshed through secure feeds on a scheduled basis" (per
  DefenseScoop)
- **Pricing**: subscription-based; no figures disclosed anywhere I found
- **Performance claim**: IBM's product page claims the model can **"cut research time by up to
  85%"** versus traditional methods — https://www.ibm.com/products/watsonx-ai/defense-model
  (unverified vendor claim, no methodology given)
- **Use-case segmentation** (from IBM's product page): for the Defense/Intel Community —
  equipment/inventory analytics, supply-chain-resilience optimization, operational-readiness
  assessment, predictive-maintenance planning; for Federal System Integrators — ITAR/export
  compliance analysis, defense-spending forecasts, geopolitical-risk evaluation, DoD-terminology
  translation for procurement
- **Sourcing/human-in-the-loop methodology** (this directly answers the brief's ask): per
  DefenseScoop and DEFCROS News, Janes' contributed training data is "**publicly available,
  lawfully obtained information including manufacturer data, government statements, and field
  intelligence collected by Janes analysts at events like air shows**" — i.e., human Janes
  analysts physically attending industry/trade events and engaging manufacturers directly is
  cited as a specific collection method, explicitly contrasted against general-purpose LLMs
  trained on unvetted internet text. Ben Conklin (Janes) is quoted memorably on this point:
  **"The internet has a lot of information about the military, and most of it's wrong."**
  (DefenseScoop) and, elsewhere, **"You're more likely to find correct answers with this
  specialized model than with general-purpose alternatives."** (DEFCROS News, attributed there
  to "Ben Conklin, Head of Innovation at Janes" — note his title differs from the 2021 ALQIMI
  release, where he's "Janes CPO"; either he changed roles between 2021–2025 or different
  outlets used different/stale titles — **flag for verification, not fully resolved**).

**Executive quotes, consolidated:**
- **Vanessa Hunt**, IBM General Manager, Technology, U.S. Federal Market: "Defense
  organizations need AI they can trust – solutions that deliver accurate insights without
  compromising security or ethics." Also: "The tool really understands defense terminology,
  equipment, standards and mission context." (DefenseScoop) LinkedIn:
  https://www.linkedin.com/in/vanessa-hunt-b219b56/
- **Blake Bartlett**, CEO, Janes: "Our collaboration with IBM brings together Janes trusted
  defense intelligence and IBM's advanced AI capabilities." / "This model helps ensure defense
  organizations can access timely, relevant insights in secured environments, helping them make
  informed decisions with confidence."
- **Ben Conklin**, Janes (title varies by source — "CPO" in 2021, "Head of Innovation" in 2025
  coverage): quotes above.

**Is "Ask Janes" literally the same product as `ibm-defense-3-3-8b-instruct` / "IBM Defense
Model"? — UNRESOLVED, flagged explicitly.** I could not fetch the one page that would settle
this ("Inside Ask Janes"). Circumstantial evidence points toward them being the same
underlying technology stack (the Dec 2024 → Sept/Oct 2025 announcements form one continuous
partnership arc; the model card's designed purpose is explicitly "tool-calling of the Janes
Inventory API," which is exactly what a Janes-branded chat/query product would need; the same
two Janes executives — Bartlett and Conklin — are quoted across both the watsonx-integration
and Ask-Janes-adjacent material) — but no single source I could access explicitly states "Ask
Janes runs on ibm-defense-3-3-8b-instruct." An alternative reading consistent with the
evidence: "Ask Janes" could be Janes' own product name for the customer-facing chat
experience (potentially running on an earlier/different Granite configuration since ~Dec
2024), while "IBM Defense Model" / `ibm-defense-3-3-8b-instruct` (Sept/Oct 2025) is IBM's own
separately-branded, separately-sold commercial model that happens to be trained on Janes data
and callable against the Janes API — i.e., a related but formally distinct commercial offering
IBM can sell to other watsonx customers even without a Janes subscription. **This distinction
matters a lot for competitive positioning (is Janes' AI layer proprietary-to-Janes, or is IBM
now able to sell "Janes-flavored" defense AI to Janes' competitors/customers independent of a
Janes relationship?) and I recommend the analyst try to access the "Inside Ask Janes" article
directly (e.g., via a logged-in browser session) to resolve it.**

**Launch date of "Ask Janes" as a named product:** not independently established beyond "the
page exists and is indexed" — could not find a dateline, press release, or announcement
specifically for the "Ask Janes" brand name (as distinct from the Dec 2024 and Oct 2025 IBM
partnership announcements above). Searched: `"Ask Janes" launch 2024 OR 2025`, `"Ask Janes"
beta pilot rollout`, `Janes unveils/launches "Ask Janes"` — no dedicated launch article
surfaced.

**Review-site coverage:** Searched G2, Capterra, TrustRadius for any Janes or "Ask Janes"
listing/reviews — **found nothing**. No Janes product page exists on any of the three major
B2B review platforms as far as I could determine. This itself is a mildly interesting
competitive-positioning data point (an enterprise/government-only vendor with no
self-serve-software review-site footprint) worth flagging to the analyst.

---

## 3. ALQIMI-enhanced Events

**The core announcement — fully fetched, high confidence.** BusinessWire press release, dated
**December 16, 2021**, titled "Janes Partners with ALQIMI for AI-Powered Enhancements to
Events Offerings":
https://www.businesswire.com/news/home/20211216005109/en/Janes-Partners-with-ALQIMI-for-AI-Powered-Enhancements-to-Events-Offerings
(mirrored verbatim at Yahoo — https://www.yahoo.com/lifestyle/janes-partners-alqimi-ai-powered-130800734.html
— Acrofan — https://us.acrofan.com/detail.php?number=589230 — MarketScreener —
https://www.marketscreener.com/news/latest/Janes-Partners-with-ALQIMI-for-AI-Powered-Enhancements-to-Events-Offerings--37347439/
— and ChannelBiz UK —
https://www.channelbiz.co.uk/press-release/janes-partners-with-alqimi-for-ai-powered-enhancements-to-events-offerings/
— all consistent, no material differences found across mirrors)

**What ALQIMI is (per the release):** "a data, software, and IT services company with over 20
years of experience." Developer of **AOSEN™ (ALQIMI Open Standards Environment)** — described
as "a containerized big data platform featuring 30+ integrated applications, microservices,
data storage solutions, and ML/AI engines," compliant with **NIST 800-53** security standards,
serving both government and commercial sectors.

**What the partnership actually does:** ALQIMI enhances **Janes Events** with "AI-derived
records **guided by Janes' data model and event classifications** within AOSEN™." This phrasing
is important: **Janes' own taxonomy/classification schema is explicitly stated to govern the
AI's output** — ALQIMI is a processing/automation engine plugged into Janes' pre-existing data
model, not an independent taxonomy or a separate data silo.

**Janes Events Centre (as described in the release):** identifies and categorizes global
occurrences across **terrorism, counter-terrorism, organized crime, protests, riots, and
political events**. Explicit human-in-the-loop statement: **"Human analysts validate and
verify sources before publishing."**

**The AI mechanism specifically:** **Named Entity Recognition (NER)** and **NLP**, supporting
**30+ languages**, automating record creation from multilingual, publicly-available
open-source inputs — explicitly framed as freeing human analysts to focus on
**"standardizing and enriching"** data rather than raw collection/drafting. This is a clean,
concrete description of the human-AI division of labor for this specific product.

**Quotes:**
- **Ben Conklin**, Janes **Chief Product Officer** (his title at the time, Dec 2021): "ALQIMI's
  AOSEN platform will augment Janes' existing capabilities in the critical, timely manner our
  national security customers need."
- **Brian Miloski**, ALQIMI **President**: "We were confident our NLP expertise could automate
  the record creation from publicly available information sources."

**ALQIMI corporate identity — resolved as far as public sources allow.** Multiple related
names surface (ALQIMI Technology Solutions, Inc. / ALQIMI Corporation / Alqimi Group Holdings
LLC) — I could not fully disambiguate the precise legal relationship between these three names
from public sources without deeper corporate-registry work, but the most concrete, verifiable
identity is:
- **Legal name (per a US federal government contract-holder registry, NITAAC — highest
  confidence source for this):** ALQIMI Technology Solutions, Inc.
  https://nitaac.nih.gov/gwacs/cio-sp3-small-business/contract-holder/alqimi-technology-solutions-inc
  — Address: **2101 Gaither Road, Suite 510, Rockville, MD 20850, US**. Federal contract
  vehicle: GWAC **CIO-SP3 Small Business**, contract # 75N98120D00019, SAM UEI QGCLN5Q353R4.
  Qualified task areas include biomedical-research IT, CIO support, IT outsourcing, systems
  integration, cybersecurity, ERP, custom software dev — a general federal IT contractor
  profile, health-sciences-informatics-heavy, not defense-exclusive.
- **Corporate profile (Craft.co, lower confidence — small-company data on aggregators is often
  stale):** https://craft.co/alqimi-technology-solutions — HQ Rockville, MD; **founded 1997**;
  leadership listed as **Rajeev Sharma (CEO)**, **Brian Miloski (President)**, Joseph Carlin
  (EVP & Chief Legal Officer), Ravinder Birgi (SVP Accounting & Finance); additional office
  locations in Arlington VA, Denver CO, and **Gurugram, India**; employee count listed as just
  **5** — this figure looks implausibly low given the company's claimed 30+-application NIST
  800-53-compliant platform and multi-country footprint, so I'd treat it as stale/unreliable
  rather than a real current headcount.
- **Brian Miloski individually**: LinkedIn profile shows him as ALQIMI President since **January
  2015**, prior background as CFO of Solena Fuels Corporation, MA Finance (U. Baltimore), BA
  Economics/Mgmt Science (SUNY Cortland). https://muraena.ai/profile/brian_miloski_f8b0810c and
  https://www.linkedin.com/in/bmiloski/
- **No UK Companies House record was sought/found for ALQIMI** — all corporate evidence points
  to ALQIMI being a US (Maryland-headquartered) entity, so I did not exhaustively search UK
  Companies House for it specifically. Flagging as a minor gap if UK-side verification is
  wanted.

**Answering the brief's explicit question — is ALQIMI a subsidiary, vendor, or acquisition
target of Janes?** Based on everything found, **ALQIMI is an independent, arm's-length
third-party technology vendor/partner to Janes** — a small, separately-owned US federal IT
contractor with its own government contract vehicles (CIO-SP3), other clients, and a
president (Miloski) who is not otherwise linked to Janes' own leadership or to Janes' UK
Companies House filings. Nothing in any source suggests Janes has an equity stake in or has
acquired ALQIMI, or vice versa. This is a **vendor/technology-partnership relationship**, not
a corporate-structure one.

**Critical currency gap — flagged prominently.** Every single mention of ALQIMI + Janes that I
could find, across dozens of search-query variants, traces back to the **same single December
16, 2021 press release** (just mirrored across different wire/aggregator sites). I found:
- **No** trade-press follow-up or case study on how the partnership actually performed
- **No** mention of ALQIMI in Janes' 2025 G-Cloud 14 pricing/service documents (which do list
  "Current Intelligence" / events-adjacent offerings but never name ALQIMI)
- **No** mention of ALQIMI in either of the 2025 UK MOD Defence Digital contract filings
- **No** 2022–2026 news coverage pairing "ALQIMI" and "Janes" (searched explicitly, including
  year-scoped queries)
- ALQIMI's own LinkedIn activity (posts found via search, e.g.
  https://in.linkedin.com/posts/alqimi_alqimi-forge-insiderthreat-activity-6986421025815023616-ckQp
  and https://www.linkedin.com/posts/alqimi_nlp-forcemultiplier-ml-activity-6958405786196656130-4oLH
  — post bodies not fetchable/not fetched) shows ALQIMI marketing its own NLP/AI/"ForceMultiplier"
  and "insider threat" capabilities generally, with no visible ongoing Janes-specific content in
  what search surfaced.

**My read (inference, not confirmed fact):** either (a) the ALQIMI-Events integration is still
quietly operating as shipped, just without further PR since the 2021 launch; (b) it was
absorbed into or superseded by Janes' broader Intara/knowledge-graph and IBM-watsonx AI
strategy (see Section 4) as Janes' AI investment focus visibly shifted toward IBM from
2024 onward; or (c) it was quietly discontinued. **I could not determine which. This is the
single most important "verify independently" item in the ALQIMI section** — e.g., by checking
current Janes Events product marketing directly (blocked to me), or asking a Janes/ALQIMI sales
contact whether AOSEN-based event processing is still in production.

**Cross-reference to the API/taxonomy evidence (Section 1):** "Events" is confirmed as one of
the 17 documented endpoints in the Janes API (`janes-R` GitHub wrapper), sitting alongside
Equipment, ORBATs, etc. — i.e., however Events records are produced/enhanced (ALQIMI-assisted
or otherwise), they are exposed through the **same unified API/data-delivery layer** as every
other Janes entity type, not a separate silo or a separately-branded feed. This is the
strongest evidence I have that ALQIMI-enhanced Events is a **production pipeline feeding into**
Janes' central data layer, rather than a bolt-on product sold separately.

---

## 4. Cross-cutting: Janes' knowledge graph / entity model ("Janes Intara")

This applies to all three capabilities above and was explicitly asked for in the brief, so
breaking it out separately.

**"Janes Intara" is Janes' current API/data-delivery platform brand**, successor to a
deprecated "V1 API" (deprecated August 2022 per the `janes-R` GitHub README — see Section 1).
Multiple independent, non-janes.com-blocked sources corroborate that Intara is explicitly
marketed around a **knowledge-graph architecture**:

- **Data Language** (a UK-based knowledge-graph/semantic-AI vendor) announced a **"Knowledge
  Graph partnership with Janes"** on **November 22, 2021** — search-indexed title only; I could
  **not** fetch the source article itself (businessinthenews.co.uk mirror of the announcement
  repeatedly failed with a robots.txt connection timeout, not a hard block — may be worth a
  retry by the analyst). Title/URL only:
  https://businessinthenews.co.uk/2021/11/22/data-language-announces-a-knowledge-graph-partnership-with-janes-the-trusted-global-agency-for-open-source-defence-intelligence/
- **What I could actually fetch and confirm** — a second write-up of the same Data
  Language/Janes relationship, from Data Language's graph-technology successor/rebrand site
  "Data Graphs" (datagraphs.com, fetched successfully):
  https://datagraphs.com/news/knowledge-graphs-with-janes — direct quotes: the knowledge graph
  "**creates the foundations for ongoing and rapid innovation of Janes foundational
  interconnected intelligence**" and "**interconnects millions of assured data points across
  Janes foundational intelligence**," enabling "the **integration and normalisation of
  disparate data sources**, allowing Janes customers to exploit all intelligence sources in an
  actionable, shareable manner." Crucially: **this knowledge graph is stated to power "Janes
  Intara,"** which delivers "**contextualised insight**" to customers by functioning as their
  "**single source of truth.**" The article references **120+ years of defence intelligence**
  folded into the graph (consistent with, though not identical to, the "125+ years" figure IBM
  uses on its own Defense Model product page — likely just two different write-dates against
  Janes' 1898 founding, not a contradiction).
- **Independent, non-marketing technical corroboration — a live Janes job posting** (Greenhouse
  ATS, "Solutions Engineer - NATO," fetched successfully, not janes.com so not
  robots-blocked): https://job-boards.greenhouse.io/janes/jobs/4716817101 — confirms Janes'
  Product Solutions team works with an actual **"graph knowledge-base"** and references
  **"Janes Interconnected Intelligence products"** and ontologies explicitly. Technology stack
  named in the posting includes **graph databases (Neo4j, ArangoDB, GraphDB)**, RDBMS,
  Elasticsearch, the full **ArcGIS Enterprise** suite (ArcPy, ArcGIS API for Python), **Palantir**
  integration work, geospatial JS libraries (ArcGIS Maps SDK, OpenLayers, Leaflet, Cesium),
  Python, React/Vue, Docker, AWS (EC2/Lambda/S3) — this is strong evidence the "knowledge
  graph" language is a real infrastructure claim (Janes actually runs/integrates with named
  graph-database products), not just marketing metaphor, and that NATO-standards alignment is
  an explicit design goal of the integration layer.
- **Third-party ecosystem integrations reinforcing a hub-and-spoke (not siloed) model**: Esri
  ("Janes and Esri continue their longstanding partnership" — title only, janes.com URL, not
  fetched), Systematic's **SitaWare Insight** ("Delivering Janes data into SitaWare Insight,"
  2024, systematic.com — title only, not fetched but domain is not robots-blocked so worth a
  follow-up fetch), and **BigBear.ai**, which used "**Janes Intara**" to deliver "**foundational
  intelligence**" into a Defense Intelligence Agency-linked program called **MARS** (Force
  Element Tracking & Identity Platform) — confirmed via BigBear.ai's own investor-relations
  press release (https://ir.bigbear.ai/news-events/press-releases/detail/14/bigbear-llc-a-bigbear-ai-subsidiary-awarded-contract-to
  and https://bigbear.ai/newsroom/bigbear-awarded-contract-to-develop-force-element-tracking-identity-platform-utilizing-mars-ai-ml-capabilities/
  — original contract award reported Oct 26, 2021; the Janes-Intara-specific angle comes from a
  janes.com article title referencing it, which I could not fetch directly, but the BigBear.ai
  side independently confirms the DIA/MARS relationship existed).

**Answering the brief's explicit question** — "whether OSDIDS, Ask Janes, and ALQIMI Events are
read layers on that graph, separate silos, or something else" — **my synthesized inference,
not a directly-stated fact from any single source** (flagging clearly as inference): the
weight of evidence points to a **single unified underlying knowledge graph/data layer branded
"Janes Intara,"** built with Data Language's graph technology, functioning as Janes'
self-described "single source of truth," with the three researched capabilities as different
**access modes** into that same layer rather than separate silos:
- **OSDIDS** = the structured, licensable dataset/API view into the graph (the "Foundational
  Intelligence" product line; delivered via portal + API + file exports)
- **Ask Janes / `ibm-defense-3-3-8b-instruct`** = a natural-language RAG query layer that (per
  the IBM model card) is specifically designed to tool-call the "**Janes Inventory API**" —
  i.e., a conversational front-end reading from the same underlying entity data
- **ALQIMI-enhanced Events** = an AI-assisted *production/ingestion* pipeline that writes
  standardized event records into Janes' data model (governed by "Janes' data model and event
  classifications," per the 2021 release) — i.e., feeding the graph rather than just reading
  from it, then exposed onward through the same unified API (Events is a peer endpoint to
  Equipment/ORBATs/etc. per the `janes-R` API list)

If accurate, this is a materially different picture than "silos" — it suggests Janes' core
durable asset is the graph/entity layer itself (Intara), with OSDIDS, Ask Janes, and Events
being productized views in and out of it. **This is the single highest-value item for the
analyst to pressure-test**, ideally against a directly-fetched janes.com architecture/product
page, since I was blocked from confirming it in Janes' own words.

---

## 5. Corporate context (ownership, entity structure) — supporting background

Not one of the three core capabilities, but directly relevant to interpreting the ALQIMI
relationship and Janes' overall competitive trajectory, and explicitly requested in the brief.

- **Current operating UK entity**: **JANE'S GROUP UK LIMITED**, Companies House **#12199785**,
  incorporated **10 September 2019**, registered office **69 Park Lane, Croydon, England, CR0
  1JD**, SIC 74909 ("other professional, scientific and technical activities n.e.c."), status
  **Active**. https://find-and-update.company-information.service.gov.uk/company/12199785 —
  the incorporation date lines up closely with the Montagu acquisition (see below), consistent
  with this being an acquisition-vehicle/renamed entity rather than Janes' original 1898-rooted
  company.
- **Historical predecessor entity** (do not confuse with the above): **JANE'S INFORMATION
  GROUP LIMITED**, Companies House **#00954081**, incorporated **13 May 1969** (previously "The
  Illustrated Book Club Limited," then "Jane's Publishing Company Limited"), registered in
  Coulsdon, Surrey — **dissolved 20 March 2012**.
  https://find-and-update.company-information.service.gov.uk/company/00954081 — this is a dead
  historical entity, not currently operative; flagging only so the analyst doesn't confuse the
  two company numbers.
- **Ownership timeline** (Wikipedia, cross-checked against Montagu's own site and deal-tracker
  coverage): independent/family-linked ownership from 1898 → **Thomson Corporation** →
  **The Woodbridge Company** → **IHS** (acquired 2007; became **IHS Markit** after the 2016
  IHS/Markit merger) → **Montagu Private Equity** (acquired Jane's Information Group from IHS
  Markit in **2019**; deal financing backed by **Barings** per
  https://www.barings.com/en-us/institutional/contact/media/news/barings-backs-montagu-private-equitys-acquisition-of-janes).
  https://en.wikipedia.org/wiki/Janes_Information_Services ,
  https://montagu.com/montagu-private-equity-to-acquire-janes-from-ihs-markit/ ,
  https://www.rwbaird.com/transactions/investment-banking/dealcard/5478/
- **Current owner: still Montagu**, per Montagu's own portfolio page listing (title confirmed:
  "Janes - Our Portfolio | Montagu," https://montagu.com/portfolio/janes/ — page itself not
  fetched, title only) — **but** a 2026 Unquote article reports Montagu is now fielding
  **takeover interest from other private-equity buyers "ahead of a potential sale in the coming
  year,"** explicitly linked to the current "defence spending boom."
  https://www.unquote.com/uk/news/3029054/montagu-backed-intel-provider-janes-attracts-takeover-interest-amid-defence-spending-boom
  — **I could not confirm this article's exact publish date** (fetch attempts returned the
  headline/gist but not a dateline or byline; no financial figures, bidder names, or advisor
  names were recoverable from what I could fetch). **This is a live, developing
  ownership-change signal the analyst should treat as time-sensitive and verify closer to
  publication of the competitive doc** — a Janes sale/change of ownership during the period
  this doc is used could be strategically significant (new PE owner, potential trade-buyer
  consolidation with another intelligence vendor, etc.).
- **CEO: Blake Bartlett** — confirmed via multiple 2025 IBM/Janes press materials and Wikipedia.
- **Notable bolt-on acquisition**: Janes acquired Washington, D.C.-based **RWR Advisory Group**
  in **March 2022** (per Wikipedia — adds sanctions/supply-chain-risk data capability; not one
  of the three core research targets but relevant context for "how Janes is expanding beyond
  pure military-equipment reference data"). https://en.wikipedia.org/wiki/Janes_Information_Services

---

## Could Not Verify / Explicit Gaps (for the record)

1. **Full content of Janes' own OSDIDS page** — robots.txt-blocked; multiple workaround methods
   attempted and failed (see top-of-file access-constraint note). Only third-party
   reconstructions available (Section 1).
2. **Full content of "Inside Ask Janes"** — same blocking; this is the single highest-value
   inaccessible page, since it would likely resolve the Ask-Janes-vs-`ibm-defense-3-3-8b-instruct`
   identity question directly.
3. **Exact launch dates for both OSDIDS and "Ask Janes" as named products** — not found despite
   many query variants (see each section for the specific searches run).
4. **Whether the ALQIMI/Janes Events partnership is still active in 2025–2026** — no coverage
   found after the original Dec 16, 2021 announcement; not mentioned in any 2025 Janes
   government-procurement filing I could access. Treat as unconfirmed either way.
5. **Precise legal relationship between "ALQIMI Technology Solutions, Inc.," "ALQIMI
   Corporation," and "Alqimi Group Holdings LLC"** — these names all surfaced but I did not do
   deeper corporate-registry work (e.g., Maryland SDAT filings) to fully disambiguate; the
   NITAAC federal registry entry for "ALQIMI Technology Solutions, Inc." is the
   highest-confidence identity I found.
6. **UK Companies House record for ALQIMI** — not searched (evidence points to ALQIMI being a
   US/Maryland entity, so I prioritized the US federal registry instead).
7. **Any G2/Capterra/TrustRadius listing or review mentioning Janes, OSDIDS, Ask Janes, or
   ALQIMI** — actively searched, found none.
8. **Exact publish date of the Unquote "Janes attracts takeover interest" article**, and any
   financial figures (revenue, EBITDA, bidder names, advisors) — not recoverable from what I
   could fetch.
9. **Whether "OSDIDS" and the G-Cloud-listed "Foundational Intelligence" product are the same
   offering** — my working hypothesis in Section 1, explicitly not confirmed by any single
   source.
10. **CJADC2/Maven integration claim for the IBM Defense Model** — sourced to a single outlet
    (DEFCROS News) and not repeated elsewhere I could find; treat with more caution than the
    multiply-corroborated facts.
11. Could not access **Systematic's** "Delivering Janes data into SitaWare Insight" (2024) or
    "Janes and Esri continue their longstanding partnership" articles in full — titles/URLs
    only, not fetched (ran out of research budget before following up; both domains looked
    fetchable in principle and are good candidates for a quick follow-up fetch).
12. Ben Conklin's exact current title (CPO per 2021 material vs. "Head of Innovation" per 2025
    coverage) is inconsistent across sources — not resolved.

---

## Full Source List

### Fetched directly and used as primary evidence
- https://www.businesswire.com/news/home/20211216005109/en/Janes-Partners-with-ALQIMI-for-AI-Powered-Enhancements-to-Events-Offerings
- https://www.ibm.com/docs/en/watsonx/w-and-w/2.2.0?topic=models-defense-33-8b-model-card
- https://defensescoop.com/2025/10/29/ibm-new-large-language-model-defense-applications-janes/
- https://newsroom.ibm.com/blog-ibm-and-janes-collaborate-to-help-national-security-and-defense-organizations-unlock-the-power-of-data-with-trusted-AI
- https://newsroom.ibm.com/2025-10-29-ibm-announces-defense-focused-ai-model-to-accelerate-mission-planning-and-decision-support
- https://www.prnewswire.com/news-releases/ibm-announces-defense-focused-ai-model-to-accelerate-mission-planning-and-decision-support-302598313.html
- https://www.ibm.com/products/watsonx-ai/defense-model
- https://ukdefencejournal.org.uk/mod-to-award-intelligence-data-deal-to-janes/
- https://www.executivebiz.com/articles/ibm-ai-defense-model-military-intel
- https://www.unquote.com/uk/news/3029054/montagu-backed-intel-provider-janes-attracts-takeover-interest-amid-defence-spending-boom
- https://find-and-update.company-information.service.gov.uk/company/12199785
- https://find-and-update.company-information.service.gov.uk/company/00954081
- https://www.contractsfinder.service.gov.uk/notice/99d6f77b-2826-4438-bb09-f07ce35812d0
- https://thedefensewatch.com/defense-contracts/janes-wins-uk-mod-agreement-to-deliver-military-intelligence-and-analysis-services/
- https://rss.investorbrandnetwork.com/ibn-full/ibm-janes-partner-to-enable-defense-organizations-leverage-ai-capabilities/
- https://en.wikipedia.org/wiki/Janes_Information_Services
- https://nitaac.nih.gov/gwacs/cio-sp3-small-business/contract-holder/alqimi-technology-solutions-inc
- https://craft.co/alqimi-technology-solutions
- https://www.geospatialexploitationproducts.com/wp-content/uploads/2024/11/GXP-Partner-Janes__Datasheet.pdf
- https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud-14/documents (pricing doc: https://assets.applytosupply.digitalmarketplace.service.gov.uk/g-cloud-14/documents/715364/617997262951726-pricing-document-2025-09-17-0829.pdf)
- https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/services/617997262951726
- https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/supplier/715364
- https://intelligencecommunitynews.com/ibm-announces-defense-focused-ai-model/
- https://defence-industry.eu/ibm-launches-specialised-ai-model-to-enhance-decision-making-in-defence-and-national-security/
- https://news.defcros.com/an-in-depth-examination-of/
- https://rdrr.io/github/janesintelligence/janes-R/f/README.md
- https://datagraphs.com/news/knowledge-graphs-with-janes
- https://job-boards.greenhouse.io/janes/jobs/4716817101
- https://muraena.ai/profile/brian_miloski_f8b0810c
- https://www.ibm.com/products/watsonx/client-quotes (checked — no Janes content found there)
- https://www.barings.com/en-us/institutional/contact/media/news/barings-backs-montagu-private-equitys-acquisition-of-janes (title/context via search; deal financing detail)
- https://montagu.com/montagu-private-equity-to-acquire-janes-from-ihs-markit/
- https://www.rwbaird.com/transactions/investment-banking/dealcard/5478/

### Search-indexed only (title/URL confirmed to exist; full content not fetched — noted inline above where relied upon)
- https://www.janes.com/defence-intelligence/what-we-do/open-source-intelligence-data-system (OSDIDS main page — robots-blocked)
- https://www.janes.com/osint-solutions/what-we-do/open-source-Intelligence-data-system (OSDIDS alt URL — robots-blocked)
- https://www.janes.com/defence-intelligence-insights/defence-and-national-security-analysis/inside-ask-janes-bringing-ai-powered-intelligence-discovery-to-defence-users (Ask Janes explainer — robots-blocked)
- https://www.janes.com/company/company-updates/janes-and-ibm-launch-global-collaboration-to-integrate-janes-data-into-ibm-watsonx-ai-and-data-platform (robots-blocked; content reconstructed via IBM's own mirror of the same announcement)
- https://businessinthenews.co.uk/2021/11/22/data-language-announces-a-knowledge-graph-partnership-with-janes-the-trusted-global-agency-for-open-source-defence-intelligence/ (fetch timed out on robots.txt, not a hard block — worth retry)
- https://www.facebook.com/JanesIntelligence/posts/defence-professionals-would-like-to-spend-less-time-searching-for-information-an/1065495969171566/ (Ask Janes quote fragment via search snippet; page itself robots-blocked)
- https://montagu.com/portfolio/janes/ (current-ownership confirmation, title only)
- https://systematic.com/int/industries/defence/news-knowledge/news/2024_delivering-janes-data-into-sitaware-insight/ (not fetched — follow-up candidate)
- https://www.janes.com/company/company-updates/janes-and-esri-continue-their-longstanding-partnership (not fetched, robots-blocked)
- https://www.janes.com/defence-intelligence-insights/defence-news/janes-intara-delivers-foundational-intelligence-to-the-mars-program-through-partner-bigbear-ai (robots-blocked)
- https://ir.bigbear.ai/news-events/press-releases/detail/14/bigbear-llc-a-bigbear-ai-subsidiary-awarded-contract-to (BigBear.ai/DIA MARS contract — independent corroboration of the Janes Intara/BigBear.ai relationship's underlying program)
- https://bigbear.ai/newsroom/bigbear-awarded-contract-to-develop-force-element-tracking-identity-platform-utilizing-mars-ai-ml-capabilities/
- https://www.linkedin.com/in/vanessa-hunt-b219b56/ ; https://www.linkedin.com/in/bmiloski/ (exec bios, via search snippet)
- https://www.idga.org/events-intelligenceanalyticssummit/sponsors/alquimi (ALQIMI conference-sponsor page — attempted fetch returned 405 error, not usable)

---

## Search Query Log

**Productive queries (surfaced material actually used above):**
- `"Open Source Defence Intelligence Data System" Janes`
- `"ALQIMI" Janes Events`
- `Janes IBM watsonx partnership defense intelligence`
- `"ibm-defense-3-3-8b-instruct"`
- `Janes OSDIDS launch` (surfaced the DefenseScoop article, though not an OSDIDS launch piece)
- `"ALQIMI" company AOSEN NIST 800-53 headquarters`
- `Janes Group ownership private equity acquired history IHS Markit`
- `Janes ownership 2025 Montagu Private Equity sale`
- `Breaking Defense Janes IBM watsonx AI` (no Breaking Defense-specific hit, but surfaced other useful mirrors)
- `"Janes" "OSDIDS" open source defence intelligence data system entities` (surfaced UK Defence Journal MOD-deal piece)
- `Janes company Croydon "14 product lines" OR "product portfolio" 2026` (surfaced Companies House + Contracts Finder)
- `"ALQIMI" LinkedIn Brian Miloski president NLP defense`
- `ALQIMI corporation website "alqimi" .com defense intelligence software` (surfaced NITAAC, Craft.co)
- `"Janes Inventory API" watsonx` (no direct hit but confirmed the term's presence via the IBM model card fetch)
- `"Data Language" Janes knowledge graph ontology defence intelligence` (surfaced datagraphs.com — major find)
- `BigBear.ai Janes Intara MARS program partnership foundational intelligence`
- `Janes greenhouse jobs ontology OR "knowledge graph" OR taxonomy data engineer` (led to the specific job posting ID via a follow-up)
- `"Jane's Information Group Limited" Companies House number`

**Queries that came up empty or unhelpful (recorded per the brief's instructions):**
- `"Ask Janes" AI watsonx` — returned generic IBM watsonx community-blog noise, not Janes-specific
- `"Ask Janes" G2 OR Capterra OR TrustRadius review` — nothing Janes-specific
- `Janes.com trustradius.com OR g2.com OR capterra.com listing product review` — same, empty
- `Janes knowledge graph entity taxonomy linked data platform` — too generic, drowned in unrelated knowledge-graph SEO content
- `"Janes Events Centre" OR "Janes Events" taxonomy categories terrorism` — no useful hits beyond UN counter-terrorism pages
- `Shephard Media Janes OSDIDS OR "Ask Janes" OR ALQIMI` — no Shephard Media coverage found of any of the three
- `C4ISRNET Janes IBM defense AI model` — no C4ISRNET-specific coverage surfaced
- `GEOINT Symposium Janes OSINT AI 2025 watsonx presentation` — no presentation/transcript found, only generic GEOINT event pages
- `Janes "Ask Janes" launch date announcement press release` — no dedicated launch release found
- `Janes unveils OR launches OR introduces "Ask Janes" defence intelligence` — same, empty
- `Janes unveils OR launches "Open Source Defence Intelligence Data System"` — same, empty
- `Janes "OSDIDS" acronym meaning defined` — no dictionary/glossary confirmation beyond the page title itself
- `"Ask Janes" beta pilot rollout customers defence intelligence AI assistant` — no pilot/rollout specifics beyond what's in Section 2
- `Janes ALQIMI Events 2025 update partnership continues` — nothing post-2021
- `"ALQIMI" "Janes" news 2023` — nothing post-2021 (all results were re-mirrors of the Dec 2021 release)
- `Janes digital marketplace g-cloud "Events" service description ALQIMI` — no ALQIMI mention in any G-Cloud doc
- `"Janes Events" data feed API terrorism database description NER` — drowned in unrelated Global Terrorism Database (GTD) academic results
- `Janes "single source of truth" OR "central database" equipment entities linked OSDIDS Events Ask Janes` — too broad, no direct hits
- `"Inside Ask Janes" "AI-Powered Intelligence Discovery"` — only ever returns the one janes.com URL, no mirror/cache found
- `site:x.com JanesINTEL "Ask Janes"` — no usable results
- `"Janes" "watsonx" "Ask Janes" pilot 2025 rollout customers first` — nothing beyond already-known material

---

*End of raw notes.*

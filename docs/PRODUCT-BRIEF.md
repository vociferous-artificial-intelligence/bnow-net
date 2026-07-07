# OSINT Country-Feed Intelligence Product
## Research Findings, Market Analysis & Build Brief

**Prepared for:** Gregory (go@vociferous.nyc)
**Date:** July 4, 2026
**Status:** Handoff brief for project builder — sufficient to begin Phase 0 implementation
**Classification:** Internal / business-confidential

---

## 1. Executive Summary

This brief documents research into publicly available OSINT and news-analysis benchmarks, a concept for mining ISW/Critical Threats daily assessments to build a reliability-rated source registry, and a product thesis: **country-level information feeds (traditional news + social/Telegram sources, reliability-rated) with an automated analysis layer, validated against expert human analysis.**

Key conclusions:

1. Sufficient public data exists (historical corpora + live feeds) to build and continuously validate an automated OSINT analysis system without any proprietary data purchases.
2. ISW's ~1,500 daily Russian Offensive Campaign Assessments since Feb 2022 constitute a free, expert-curated source registry and reliability-labeling dataset hiding in plain sight — their citations and hedging language are the training/validation asset.
3. The market is real (~$9–21B OSINT market, Recorded Future sold at ~$300M ARR for $2.65B) but bifurcated: Russia/China coverage is crowded; tier-2/3 country coverage (e.g., Tanzania) is thin everywhere and commercially underserved.
4. A government anchor customer (State/DoD/IC) changes the revenue slope from a ~$2–5M ARR niche business to something larger, and the Russia validation harness is precisely the demo asset that wins such a contract.
5. Crisis-driven demand decays (~5-month interest window after acute phase); pricing must be designed around the full crisis cycle — annual discounts, a cheap standby tier, and regional bundles rather than named-crisis products.

The recommended build sequence: **Phase 0** ISW citation-mining pilot (weeks) → **Phase 1** Russia/Ukraine ingestion + analysis MVP → **Phase 2** validation harness scoring system output against ISW/EUvsDisinfo → **Phase 3** productization and expansion to a second region (Gulf recommended).

---

## 2. Strategic Context

Two government documents frame the opportunity:

- **DoD/DoW Artificial Intelligence Strategy (Jan 2026)** — signals sustained department-level investment in AI for intelligence analysis and decision support; procurement demand for validated AI analysis tools is growing.
- **IARPA BENGAL (Bias Effects and Notable Generative AI Limitations)** — an IC research program specifically about LLM bias, hallucination, and reliability failures on noisy, multilingual intelligence text. BENGAL's existence confirms the IC's core anxiety: LLMs are attractive for OSINT triage but untrusted. **A system that ships with a continuous, quantified validation harness against expert human analysis directly answers this anxiety** — that is the differentiator, not the LLM itself.

---

## 3. Research Findings: Available Data & Benchmarks

### 3.1 OSINT / analyst-task benchmarks

| Resource | Contents | Use |
|---|---|---|
| OSINTbench (github.com/ccmdi/osintbench) | LLM OSINT tasks: geolocation, attribution, investigation | Model capability testing |
| "Evaluating LLM Reliability in OSINT Investigations" (2026) | Synthetic multi-source dataset: social posts, Pastebin, WHOIS, Telegram, news | Timeline reconstruction, attribution, hallucination testing |
| CyberThreat-Eval | Expert-annotated CTI tasks, analyst-centric metrics | Cyber-angle evaluation |
| OSINT CTI chatbot eval (arXiv 2401.15127) | Annotated Twitter CTI dataset | Threat-awareness testing |

### 3.2 Geopolitical event data (the classic OSINT corpora)

| Resource | Contents | Currency |
|---|---|---|
| **GDELT** | 200M+ geolocated CAMEO-coded events from global news since 1979; GKG covers 65 languages incl. machine-translated Russian and Chinese sources | **Live — updates every 15 min, free** |
| **ICEWS** | Curated event data 1995→; standard benchmark splits (ICEWS14/18/05-15) | Historical; POLECAT is successor |
| **ACLED** | Global conflict event data, human-curated | **Live — weekly updates; Ukraine Conflict Monitor** |

### 3.3 Russian-language corpora

| Resource | Contents |
|---|---|
| Lenta.ru dataset | ~700–800K articles, 1999–2018 |
| RIA Novosti corpus | ~1M state-agency articles 2010–2014; standard for Russian headline gen and IR benchmarks |
| Gazeta / Russian summarization dataset | Russian news + summaries |
| **VoynaSlov** | 38M posts, Russian state + independent media on Twitter/VK around 2022 invasion; built for information-manipulation detection |

### 3.4 Chinese-language corpora

| Resource | Contents |
|---|---|
| THUCNews | 740K Sina news articles, 14 categories |
| CNewSum | 304K articles + human summaries with adequacy/deducibility annotations (useful for hallucination testing) |
| Xinhua corpora / CNewsTS | ~406K state-media articles; hierarchical topics + summaries |

### 3.5 Disinformation / influence operations

| Resource | Contents | Currency |
|---|---|---|
| **EUvsDisinfo** | ~19,700 debunked pro-Kremlin disinformation cases with disproofs, 15 languages | **Live — updated weekly** |
| Twitter/X Information Operations archive | 56M+ posts from state-linked campaigns (Russia, PRC, 18 state actors) | Static (2018–2021) |
| MuMiN | 21M tweets, 12.9K fact-checked claims, 41 languages | Static |
| MediaFutures fake-news dataset index | Curated catalog of fake-news datasets | Index |
| LiveFact | Time-aware fake-news benchmark resisting training contamination | Rolling |

### 3.6 Summarization benchmarks

Multi-News (56K multi-doc article/summary pairs), CNN/DailyMail, XSum, MLMD-news (multilingual multi-doc). Use for the summary-generation layer.

### 3.7 Live expert analysis (validation baselines)

| Source | Cadence | Value |
|---|---|---|
| **ISW / Critical Threats daily Russian Offensive Campaign Assessments** | Daily since Feb 2022 | Closest public analog to finished intelligence; time-aligned with same open sources the system ingests |
| ACLED analytical reports | Weekly/monthly | Event-level ground truth + expert reads |
| EUvsDisinfo case disproofs | Weekly | Per-narrative expert judgments |
| China Media Project, MERICS, Jamestown China Brief | Ongoing | Expert reads on Chinese state-media framing |

**Gap identified:** no single public benchmark covers the full intelligence cycle (collation → assessment → estimative judgment). The composite approach — static corpora for build/test, live feeds + live expert analysis for continuous validation — is the design answer.

---

## 4. Core Concept: Mining ISW as a Source Registry

### 4.1 The insight

Each ISW daily assessment carries dozens to ~200 endnote citation URLs — heavily Telegram (t.me) links (Rybar, Two Majors, WarGonzo, DeepState, Russian MoD, Ukrainian General Staff), plus X accounts, geolocation threads, and state media. Scraping ~1,500 reports (Feb 2022 → present) yields **hundreds of thousands of citations deduplicating to a few thousand distinct sources**, with citation frequency and recency revealing which sources ISW trusts enough to keep citing.

### 4.2 Two free labeled datasets inside the corpus

1. **Hedging language = reliability labels.** ISW systematically distinguishes "geolocated footage confirms" / "a Kremlin-affiliated milblogger claimed" / "ISW cannot independently verify." Extracting the caveat attached to each citation produces a labeled dataset of expert source-reliability judgments — effectively their internal Admiralty-code ratings expressed in prose. This trains the reliability-weighting layer.
2. **Citation survival = source-decay signal.** Sources cited in 2022 but dropped by 2024 (discredited, captured, went dark) map decay patterns the system should learn to detect autonomously.

### 4.3 Practicalities

- Archive lives at understandingwar.org (criticalthreats.org mirrors Russia reports). Plain HTML with endnote lists; extraction is parsing work.
- Scraping for internal research and source analysis is defensible; republishing ISW text is not. The derived artifact is the *source registry*, not their prose.
- **Validation caveat:** the system will ingest many of the same sources ISW reads, so agreement is not fully independent validation. Track divergences and their causes explicitly; divergence analysis is itself a product feature.

### 4.4 Pilot (Phase 0 deliverable)

Pull a stratified sample of ISW reports across all four years → extract/dedupe citation URLs → first-cut source registry with per-source frequency, platform mix, first/last citation dates, and hedging-language statistics. This validates the full-scrape investment in about a week of effort.

---

## 5. Validation Architecture

Build/calibrate on static corpora → run live feeds through the system daily → score outputs against same-day expert analysis.

- **Input feeds (live):** GDELT slices (RU/CN-origin media), Telegram public channels (full history backfillable via official API — Telethon/TDLib, no login to target channels needed), RSS from state media (TASS, RT, Xinhua, Global Times, People's Daily), curated X account list (API cost constrains breadth — a few hundred accounts, not firehose), ACLED events.
- **Expert baselines:** ISW daily (Russia), EUvsDisinfo weekly (narratives), ACLED weekly (events), China Media Project / MERICS (China framing).
- **Scoring dimensions:** event coverage (did the system surface what ISW reported?), assessment agreement/divergence, source-reliability calibration (does the system's weighting match ISW's hedging?), hallucination rate (BENGAL-relevant), timeliness (hours ahead/behind expert publication).
- **BENGAL-style composite test set:** RIA/Xinhua (state framing) + Lenta/independent outlets (contrast) + EUvsDisinfo (labeled narrative ground truth).

This harness is simultaneously the QA system, the government-sales demo asset, and a publishable credibility artifact.

---

## 6. Market Analysis

### 6.1 Landscape

- **OSINT market:** ~$9–21B in 2026 (estimates vary by scope), growing 15–25%/yr.
- **Ceiling reference:** Recorded Future — ~$300M ARR, 1,900 clients incl. 45 governments, acquired by Mastercard for $2.65B (~6.5× revenue). Took 15 years and deep government entrenchment.
- **Incumbents by tier:**
  - *Canonical country feeds:* BBC Monitoring — 180 countries, 2,800 local sources, 100+ languages, regional/global subscriptions, API/FTP. Government-anchored for 80+ years.
  - *Enterprise risk platforms:* Seerist (country stability scores; feeds Bloomberg's geopolitical risk scores), Dataminr, Babel Street, Factiva. Typically $35–150K/org/yr.
  - *Country-specialist newsletters:* Sinocism (China), Meduza/Faridaily (Russia) — proof individuals pay $15–100/mo for curated single-country coverage.

### 6.2 The gap

Russia/China coverage is crowded — every vendor covers them. **Tier-2/3 countries are thin everywhere:** minimal local-language social monitoring, one analyst covering a whole region, a couple of licensed newspapers. Yet buyers exist: extractives/energy with in-country assets, commodity traders, political-risk insurers/underwriters, due-diligence firms, NGOs/international orgs, embassies, and smaller governments' own foreign ministries who cannot afford Seerist-class tooling. Demand per country is niche, but **the marginal cost of adding country #40 to an LLM pipeline is now low — that is the new economics.**

The "isn't this trivial now" perception: collection and translation are nearly free; the value has moved to (a) source discovery — knowing which 30 Telegram channels and radio stations matter in a country, (b) access to closed networks, (c) reliability rating of unvetted sources, (d) persistence through censorship/domain churn, (e) accountable analysis. **The defensible asset is a maintained, reliability-rated source map per country — not the scraper.**

### 6.3 Government anchor: pros and cons

- *For:* one State/DoD/IC contract = $1–10M+/yr; validates for all other buyers; funds coverage breadth. Entry routes below prime scale: SBIR/STTR, DIU, GEC-type pilots at $100–500K.
- *Against:* 12–24 month sales cycles; FedRAMP/compliance costs; risk of becoming a services shop shaped by one customer.
- *Pitch asset:* "our system's daily output vs. ISW's, scored over six months" — credible to GEC, State/INR, or a combatant command OSINT cell.

### 6.4 Revenue scenarios

Per-seat/contract norms: Factiva-class ~$3–5K/seat/yr; Dataminr/Seerist-class $50–150K/org/yr.

| Stage | Customer mix | MRR |
|---|---|---|
| Beachhead (yr 1–2) | 10–20 mid-market subs at $1–3K/mo + 1–2 pilots | $25–75K |
| Established niche (yr 2–4) | 40–60 enterprise/NGO at $2–5K/mo + 1 gov pilot | $150–350K |
| With gov anchor | Above + one $3–5M/yr contract | $400–800K |
| Recorded-Future-shaped outcome | Hundreds of orgs, multiple govs | $2M+ (rare) |

Non-anchor path is a solid $2–5M ARR business; the anchor contract changes the slope. *(Planning estimates, not projections.)*

### 6.5 Crisis-cycle pricing strategy

Acute media/executive attention to a regional crisis runs 6–12 weeks; budget-holder interest lasts one budget cycle — **~5 months** after the acute phase is the planning number. Design for revenue per customer across the full crisis cycle (spike → decay → dormancy → next spike), not snapshot MRR.

1. **Annual-only with monthly as the premium option** — annual at effectively 40–50% off monthly rate; a 5-month monthly churner still yields ~70% of annual price.
2. **Standby tier** ($300–500/mo) — weekly digests + indicator tracking between crises; one-click upgrade to full feed at pre-agreed pricing. Converts churn into downgrade. Matches how buyers think: the shipping-line security director never stops caring about Hormuz, they stop justifying $4K/mo.
3. **Bundle geography, not crisis** — sell "Gulf," not "the Hormuz situation." A named crisis has built-in expiration; a regional product inherits the next crisis and re-acquires lapsed standby customers at near-zero CAC.
4. **No surge pricing** — poisons renewals. Instead treat each crisis spike as a 6-week window to convert monthlies → annuals and standbys → full tier.

---

## 7. Product Definition

### 7.1 The product

Per-country (and per-region-bundle) intelligence feeds combining traditional news, state media, and social sources (Telegram, X, local platforms), each source carrying a **transparent reliability rating**, with an automated analysis layer producing:

- Daily situation digest (events, claims, narrative shifts) with per-claim sourcing and confidence
- Narrative/disinformation tracking (EUvsDisinfo-style case detection)
- Source-reliability dashboard (new sources, decaying sources, coordinated behavior flags)
- Alerting on indicator thresholds
- API/feed delivery for enterprise integration

Positioning: **"BBC Monitoring quality at 1/10 the price for the 150 countries nobody covers well, with transparent source reliability ratings"** — while using Russia (crowded but validatable) as the build-and-prove theater.

### 7.2 Country tiers

**Tier 1 — flagship, analyst-grade (build first, crowded but validatable):**

- Russia (launch country — full validation harness vs. ISW)
- China (second flagship — state-media framing analysis; CMP/MERICS baselines)
- Iran
- Ukraine (paired with Russia coverage)

**Tier 2 — strategically significant, moderately covered (differentiation begins here):**

- Saudi Arabia, UAE, Qatar, Israel, Turkey, Egypt
- India, Pakistan, Indonesia, Vietnam, Philippines, Taiwan
- Nigeria, South Africa, Ethiopia, Kenya
- Brazil, Mexico, Venezuela, Colombia
- Poland, Serbia, Belarus, Kazakhstan, Azerbaijan, Armenia, Georgia
- North Korea (special case: thin sources, high demand)

**Tier 3 — long tail, thin coverage, underserved (the structural gap):**

- East Africa: Tanzania, Uganda, Rwanda, DRC, Mozambique, Somalia, Sudan/South Sudan
- Sahel/West Africa: Mali, Burkina Faso, Niger, Chad, Guinea, Senegal, Côte d'Ivoire
- Central Asia: Uzbekistan, Turkmenistan, Tajikistan, Kyrgyzstan, Mongolia
- Southeast Asia: Myanmar, Cambodia, Laos, Bangladesh, Sri Lanka
- Latin America: Ecuador, Peru, Bolivia, Haiti, Central America (Guatemala/Honduras/El Salvador/Nicaragua)
- MENA periphery: Libya, Yemen, Algeria, Tunisia, Jordan, Lebanon, Iraq

Tier-3 economics: one pipeline, low marginal cost per country; buyers pay during elections, coups, resource disputes — exactly when incumbent coverage fails.

### 7.3 Regional bundles (the sellable SKUs)

| Bundle | Countries | Anchor buyers | Crisis drivers |
|---|---|---|---|
| **Gulf / Red Sea** | Saudi, UAE, Qatar, Oman, Bahrain, Kuwait, Yemen, + Iran overlay | Shipping/maritime, energy, insurers, sovereign funds | Hormuz/Bab el-Mandeb incidents, Iran escalation |
| **Eastern Europe / Black Sea** | Ukraine, Russia, Belarus, Poland, Baltics, Moldova, Romania | Defense, NATO-adjacent gov, ag traders, insurers | War developments, energy infrastructure |
| **East Asia / Taiwan Strait** | China, Taiwan, Japan, S. Korea, N. Korea, Philippines | Semiconductors, manufacturing, defense, finance | Strait tensions, DPRK tests, SCS incidents |
| **East Africa** | Tanzania, Kenya, Uganda, Ethiopia, Somalia, DRC, Rwanda, Mozambique | Mining, energy (LNG), NGOs, dev-finance | Elections, insurgencies (Cabo Delgado, al-Shabaab), resource disputes |
| **Sahel / West Africa** | Mali, Burkina Faso, Niger, Nigeria, Chad, Senegal, Côte d'Ivoire | Extractives (uranium, gold), NGOs, EU-adjacent gov | Coups, Wagner/Africa Corps activity, jihadist expansion |
| **Caucasus / Central Asia** | Georgia, Armenia, Azerbaijan, Kazakhstan, Uzbekistan + stans | Energy (pipelines), logistics (Middle Corridor), gov | Nagorno-Karabakh aftermath, Russia-China influence competition |
| **Andean / Northern LatAm** | Venezuela, Colombia, Ecuador, Peru, Bolivia, Haiti | Energy, mining, security firms, migration-focused NGOs | Political instability, cartel/gang dynamics, elections |
| **South / Southeast Asia** | India, Pakistan, Bangladesh, Myanmar, Sri Lanka, Indonesia, Vietnam | Manufacturing/supply chain, finance | India-Pakistan tensions, Myanmar civil war, elections |

Bundle pricing sketch: full bundle $2–5K/mo enterprise; standby $300–500/mo; single country à la carte at ~40% of bundle; global (all bundles) $10–15K/mo.

---

## 8. Build Plan

### 8.1 Phase 0 — ISW pilot & source registry (Weeks 1–3)

**Goal:** validate the citation-mining thesis before committing to full build.

- Scrape stratified sample (~100–150) of ISW/CT daily assessments across Feb 2022–present; then full archive (~1,500 reports) if sample confirms structure.
- Parse endnotes: extract citation URLs, dedupe, classify by platform (t.me / x.com / state media / gov / other).
- Extract hedging language adjacent to each citation (sentence-level context) → first-cut reliability labels (confirmed / claimed / unverified / assessed).
- **Deliverables:** source registry v0 (few thousand sources: URL, platform, frequency, first/last cited, hedging distribution); feasibility memo; go/no-go for Phase 1.
- Effort: 1 engineer, 2–3 weeks.

### 8.2 Phase 1 — Russia/Ukraine ingestion & analysis MVP (Months 1–4)

**Ingestion layer:**

- Telegram collector (Telethon/TDLib): top ~200 channels from Phase 0 registry; backfill history; continuous polling.
- RSS/scrape collectors: TASS, RT, RIA, Lenta, Meduza, Ukrainian outlets, MoD statements.
- GDELT slice consumer (15-min RU/UA events + GKG).
- Curated X list (100–300 accounts from registry; budget-capped API usage).
- ACLED weekly event pulls.

**Processing pipeline:**

- Normalize → dedupe (cross-platform near-duplicate detection) → machine translate → entity/event extraction (actors, locations, CAMEO-style event types) → claim extraction with source attribution → reliability weighting from registry → narrative clustering.

**Analysis/product layer:**

- Daily automated situation digest (structured: events, claims, assessments, per-claim confidence + sources).
- Source dashboard: activity, reliability trends, new/decaying sources.

**Storage:** event store (Postgres + vector index), raw archive (object storage), source registry as first-class versioned dataset.

- Effort: 2–3 engineers + 1 analyst-in-the-loop, ~3–4 months.

### 8.3 Phase 2 — Validation harness (Months 3–6, overlaps Phase 1)

- Daily automated comparison: system digest vs. same-day ISW assessment (event coverage, agreement/divergence, timeliness).
- Weekly: narrative detections vs. EUvsDisinfo new cases; events vs. ACLED.
- Hallucination audit: every system claim must trace to a source document; measure unsupported-claim rate (BENGAL-relevant metric).
- Divergence review workflow (analyst adjudicates: system wrong / ISW wrong / both defensible) — adjudications feed back as training data.
- **Deliverable:** running scoreboard + 3–6 month validation report → the government-sales demo asset.

### 8.4 Phase 3 — Productization & second region (Months 6–12)

- Multi-tenant delivery: web app, daily email/API feed, alerting.
- Pricing tiers implemented (standby / full / annual).
- **Second region: Gulf bundle** (recommended — clearest commercial buyers, recurring crisis cycle, Arabic-language pipeline extends naturally from the multilingual foundation). Source-discovery sprint per country: local outlets, Telegram/WhatsApp-adjacent channels, key X accounts, radio/TV where monitorable.
- Repeatable "new country playbook": source discovery → registry seeding → 30-day calibration → launch. Target marginal cost per Tier-3 country: <2 analyst-weeks + compute.
- Begin gov pipeline: SBIR/DIU applications using Phase 2 validation report.

### 8.5 Team & rough budget

| Phase | Team | Duration |
|---|---|---|
| 0 | 1 engineer | 2–3 weeks |
| 1–2 | 2–3 engineers, 1 analyst, PT PM | 4–6 months |
| 3 | +1 engineer, +1 analyst, PT sales/BD | 6 months |

Year-one cash need roughly $600K–1.2M depending on salaries/location; main variable costs are X API access, translation/LLM inference, and analyst time.

### 8.6 Key risks

1. **Platform access:** X API pricing constrains breadth (mitigate: curated lists, Telegram-first). Telegram ToS/access could tighten.
2. **Validation contamination:** system reads ISW's own sources; agreement ≠ independence (mitigate: divergence analysis as first-class feature; secondary baselines — ACLED, EUvsDisinfo).
3. **LLM hallucination/bias (BENGAL):** mandatory claim-to-source traceability; unsupported-claim rate as a tracked KPI.
4. **Legal/ToS:** scraping for internal analysis defensible; never republish source prose; registry + derived analysis is the product. Sanctions exposure when handling Russian state-media content — get counsel review.
5. **Churn:** crisis-cycle decay (mitigate: standby tier, regional bundles, annual pricing — §6.5).
6. **Crowded flagship:** Russia/China feeds face incumbents; the wedge is validation transparency and then Tier-3 breadth, not head-to-head Russia coverage.

### 8.7 Success metrics

- Phase 0: registry ≥2,000 deduped sources with hedging labels; parse rate >90% of endnotes.
- Phase 2: event coverage ≥80% of ISW-reported events surfaced same-day; unsupported-claim rate <2%; timeliness within ±6h of ISW publication.
- Phase 3: 10 paying design partners; 1 government pilot in procurement pipeline; new-country onboarding ≤2 analyst-weeks.

---

## 9. Reference Links

**Framing documents**
- DoD AI Strategy (Jan 2026): media.defense.gov/2026/Jan/12/2003855671/-1/-1/0/ARTIFICIAL-INTELLIGENCE-STRATEGY-FOR-THE-DEPARTMENT-OF-WAR.PDF
- IARPA BENGAL: iarpa.gov/images/PropsersDayPDFs/BENGAL/BENGAL_Presentation_-_10242023.pdf

**Expert baselines**
- ISW: understandingwar.org · Critical Threats: criticalthreats.org
- ACLED: acleddata.com · Ukraine Conflict Monitor: acleddata.com/monitor/ukraine-conflict-monitor
- EUvsDisinfo database: euvsdisinfo.eu/disinformation-cases

**Data & benchmarks**
- GDELT: gdeltproject.org · OSINTbench: github.com/ccmdi/osintbench
- Lenta.ru dataset: github.com/yutkin/Lenta.Ru-News-Dataset
- VoynaSlov: arxiv.org/abs/2205.12382 · CNewSum: arxiv.org/abs/2110.10874
- Multi-News: aclanthology.org/P19-1102 · EUvsDisinfo (Mendeley): data.mendeley.com/datasets/yhdtkszvgp/3
- MediaFutures dataset index: mediafutureseu.github.io/fakenewsdatasets.html

**Market**
- BBC Monitoring: en.wikipedia.org/wiki/BBC_Monitoring
- Seerist: seerist.com · Babel Street: babelstreet.com
- Recorded Future / Mastercard: paymentsdive.com/news/mastercard-recorded-future-acquisition-cybersecurity-banking-card-payments/726914
- OSINT market sizing: mordorintelligence.com/industry-reports/open-source-intelligence-market · gminsights.com/industry-analysis/open-source-intelligence-osint-market

---

*Prepared from research conducted July 4, 2026. Market figures are planning estimates drawn from public sources, not audited projections.*



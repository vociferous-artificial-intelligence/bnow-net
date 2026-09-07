# BNOW.NET — Competitive Intelligence Raw Research: Enterprise Pricing, Deal Sizes & Contract Ceilings

**Research date:** 2026-09-07
**Status:** RAW, UNSYNTHESIZED research log. One of three parallel research missions feeding a raw-notes file for later synthesis into BNOW's competitive strategy doc. This is a sourced research log for fact-checking — not a polished report. Do not treat anything here as final until cross-checked.
**Scope:** Undisclosed enterprise pricing, deal sizes, and contract ceilings for six geopolitical/defense risk-intelligence vendors: RANE, Control Risks/Seerist, Verisk Maplecroft, Oxford Analytica, Eurasia Group, S-RM.

## How to read this document
- **CONFIRMED** = an actual disclosed dollar figure from a primary or well-corroborated secondary source (government contract record, SEC/press filing, public price list).
- **INFERRED/ESTIMATED** = back-of-envelope or indirect (e.g., a secondary source's own estimate, a threshold implied by procedure type).
- Every figure carries a source URL and a date. Contract/award **dates are noted separately from today's date (2026-09-07)** so staleness is visible at a glance — several contract periods below have already lapsed.
- Currency is called out explicitly wherever it isn't USD (several of the best findings here are CAD or GBP, from non-US government disclosure portals).

## Methodology & data-access notes
- USAspending.gov's own pages are a JS-rendered single-page app — direct WebFetch on `usaspending.gov/award/...` or `.../recipient/...` URLs returned empty metadata shells every time. Workaround: hitting the underlying public JSON API directly (`api.usaspending.gov/api/v2/awards/<id>/`) worked reliably and is the source for all USAspending-derived figures below. The API's POST-only search endpoints (`spending_by_award`, etc.) could not be used since WebFetch is GET-only.
- HigherGov, GovTribe, RepVue, and PitchBook all paywall past a free-tier teaser; where a HigherGov page did render a useful summary (the Seerist IDIQ), it's flagged as a secondary/derived source (it appears to source from FPDS) rather than primary.
- Several fetches failed outright: robots.txt blocks (insidermedia.com, f6s.com), 403s (opengovus.com, repvue.com), and 400s (one SmartRecruiters job posting) — each noted individually where relevant so the analyst can retry manually if it matters.
- FPDS.gov itself was not separately queried beyond what USASpending (which mirrors FPDS contract data) already surfaced — a reasonable proxy but noted for transparency.
- Canada's Open Government contract portal (search.open.canada.ca) and the UK's Find a Tender / Contracts Finder turned out to be unexpectedly productive for two vendors (Eurasia Group, Verisk Maplecroft) that have essentially no US federal footprint — included even though they're outside the original US-agency-focused brief, because they're real, dated, sourced dollar figures the baseline doc doesn't have.

---

## 1. RANE

**Baseline already confirmed:** Worldview retail <$8/wk Basic, $31/wk+ Essential. Enterprise API tiers (Core/Geo/Threat Intelligence) custom-quoted. One federal deal on record: $250k/yr via USAspending.gov.

### 1.1 CONFIRMED — Treasury contract, full primary-source detail
- **Amount: $250,000.00** (award/obligation amount = potential/ceiling value; no options beyond base)
- Contract number (PIID): **20342925P00001**
- Awarding agency: Department of the Treasury → Bureau of the Fiscal Service (ARC DIV PROC SVCS – DENALI)
- **Period of performance: December 18, 2024 – December 17, 2025**
- Description: "Strategic Planning Report Services"
- NAICS 519290 (Web Search Portals and All Other Information Services); PSC DA10 (SaaS)
- Source: https://api.usaspending.gov/api/v2/awards/CONT_AWD_20342925P00001_2036_-NONE-_-NONE-/ (page-equivalent: https://www.usaspending.gov/award/CONT_AWD_20342925P00001_2036_-NONE-_-NONE-)
- **Flag for analyst:** the amount here ($250k) exactly matches the baseline's already-known figure. This may be the *same* underlying deal now documented with a primary-source contract number and exact dates, or a same-sized renewal of an earlier task order — I can't tell which without knowing the baseline doc's original citation. **Also note the period of performance ended December 17, 2025 — over 8 months before today's date. I searched for a FY26 follow-on/renewal award under RANE Network Inc. and did not find one in USAspending; worth a fresh USAspending search closer to publication in case one has since posted.**

### 1.2 CONFIRMED (existence only, amount undisclosed) — a second, distinct federal customer: US Army War College
- Requirement: RANE Worldview (Stratfor) access for US Army War College faculty/students — "strategic forecasting, geopolitical intelligence, analysis of global defense," situation reports across 7 regions, plus podcast content.
- Solicitation number: **W91QF024Q6007** ("RANE Worldview Access FY24")
- Awarding office: MICC Carlisle Barracks (Army Mission & Installation Contracting Command)
- Sources Sought notice issued June 6, 2024, response deadline June 14, 2024; explicit government intent to sole-source to RANE Network, Inc. (full-and-open competition technically allowed)
- **Amount: not disclosed.** HigherGov's own annotation estimates "likely under $250,000" based on Simplified Acquisition Procedures threshold — this is the secondary source's inference, not a confirmed figure.
- I could not find a corresponding USAspending.gov award record confirming this was actually awarded, or for how much — only the Treasury contract (§1.1) surfaced there under RANE Network Inc.
- Source: https://www.highergov.com/contract-opportunity/rane-worldview-access-fy24-w91qf024q6007-r-39cf8/
- **Significance:** even without a dollar figure, this establishes a second identifiable federal customer beyond Treasury, which the baseline doc doesn't have.

### 1.3 Background only — not a current RANE figure
- Stratfor (whose content underlies RANE Worldview) reportedly held contracts with 13 federal departments per reporting on the 2013 Stratfor email leak. This predates RANE's ownership of the Stratfor brand by years and should **not** be read as a current RANE data point — included only as color.
- Source (headline/snippet only, not fetched in full): https://www.pressreader.com/canada/montreal-gazette/20131216/281724087366117

### Searched, found nothing
- **GSA Schedule / eLibrary / Advantage:** no listing found for RANE or RANE Network under any query tried.
- **G2 / Capterra / TrustRadius:** no RANE-specific product page surfaced.
- **Job postings (OTE/quota/ACV):** RANE has a RepVue company page and active listings on Glassdoor/Indeed/SimplyHired, but RepVue blocked the fetch (403) and no snippet from any other source disclosed OTE, quota, or ACV figures.
- **RANE's own pricing pages** (Core Intelligence Subscribe, Risk Intelligence Subscribe, API Solutions) explicitly withhold enterprise pricing — every path routes to a demo-request form, no tier dollar amounts shown anywhere on-site.
- F6S has a RANE listing but is blocked by robots.txt.

---

## 2. Control Risks / Seerist

**Baseline already confirmed:** platform is enterprise, custom-quoted, nothing more specific known. Task hint: hunt Seerist Federal (govt version) via Space Force/USAF SBIR.

**This is the richest vendor in this research pass.**

### 2.0 Relationship clarified: Control Risks does not own Seerist outright
Control Risks took a **10% equity stake** in Geospark Analytics (the company that built "Hyperion," later rebranded "Seerist") on **June 30, 2021**. The investment dollar amount was **not disclosed**. This is a strategic-investment/product-integration partnership (joint roadmap, client advisory panel), not full ownership — Control Risks appears on Seerist's own site as a "partner." All federal contracts below are held by **Geospark Analytics, Inc.** (d/b/a **Seerist Federal**), not by Control Risks Ltd directly.
Source: https://www.prnewswire.com/news-releases/control-risks-announces-strategic-investment-in-geospark-analytics-harnessing-the-power-of-collaborative-intelligence-301323518.html

### 2.1 CONFIRMED — the Space Force SBIR Phase III IDIQ (the hinted-at award)
- Contract number: **FA254420D0001**
- **Ceiling/potential value: $95,000,000**
- Vehicle: firm-fixed-price IDIQ, 5-year ordering period
- Awarded **September 2, 2020**; ordering period end **September 1, 2025** (already lapsed as of today, 2026-09-07 — worth checking for a recompete/follow-on)
- Awarding agency: Department of the Air Force / U.S. Space Force (orders require prior coordination with the USSF acquisition office — a notable "gatekeeper" restriction on this vehicle)
- Initial obligation at award: $200,000 (FY2020 O&M funds)
- Program: SBIR Phase III commercialization of the "Hyperion" predictive-analytics/threat-forecasting platform — this is the same product now branded Seerist.
- Sources: https://seerist.com/newsroom/geospark-analytics-awarded-a-nearly-95-million-contract-from-the-u-s-space-force-to-bring-the-power-of-hyperion-to-the-entire-u-s-federal-government ; https://www.govconwire.com/2020/09/geospark-analytics-books-potential-95m-space-force-idiq-to-commercialize-predictive-ai-tech/ ; https://www.highergov.com/idv/FA254420D0001/

### 2.2 CONFIRMED, CRITICAL NUANCE — actual utilization is far below the $95M headline
Per HigherGov's tracking of the same IDIQ (FA254420D0001), which appears to source from FPDS:
- **Total obligated to date: $5,716,439** (≈6% of the $95M ceiling)
- Potential value of existing task orders: $14,305,764
- Total backlog: $8,589,326
- **Takeaway for the strategy doc: "$95M" is a 5-year ceiling on an IDIQ vehicle, not money actually spent. Realized federal revenue under this vehicle looks to be in the roughly $5.7M–$14.3M range** as of HigherGov's last data refresh (exact as-of date not shown on the rendered page — treat as approximate and re-verify close to publication).
- Source: https://www.highergov.com/idv/FA254420D0001/ (secondary/derived source — free-tier page, deeper award-by-award drilldown was paywalled)

### 2.3 CONFIRMED — a real, PUBLIC (non-custom-quoted) price point via AWS Marketplace
This directly contradicts the baseline's blanket "custom-quoted" characterization, at least for an entry tier:
- SKU: "Seerist License (5)" — minimum 5 named users, inclusive of X (Twitter) API access
- **Price: $75,000.00 per 12-month contract = $15,000 per named user per year** at the minimum-commitment tier
- Additional AWS infrastructure costs may apply; "private offers" available for custom/volume licensing beyond the listed SKU
- Source: https://aws.amazon.com/marketplace/pp/prodview-rwny7yfqed4ey

### 2.4 CONFIRMED — NGA relationship expanded, no dollar figure disclosed
- National Geospatial-Intelligence Agency: a 5-year contract (signed ~September 28, 2022) expanding an existing relationship to add GIS/location-intelligence data services (Esri as partner/subcontractor for the GIS layer).
- No dollar figure in the press release.
- Source: https://seerist.com/press-release/national-geospatial-intelligence-agency-expands-contract/

### 2.5 CONFIRMED — additional undisclosed-value military engagements (2025)
- Announced September 30, 2025: "two new enterprise-level agreements with the U.S. government" — one with an unnamed "U.S. Military Service," one with an unnamed "U.S. Military Command." Zero dollar figures, contract numbers, or vehicle names disclosed anywhere in the release.
- Source: https://seerist.com/press-release/seerist-selected-as-standard-osint-capability-for-u-s-military-service-and-scales-enterprise-use-at-military-command/

### 2.6 Confirms the "Seerist Federal" entity the task asked about
- "Seerist Federal" = a registered DBA of **Geospark Analytics, Inc.** (UEI: QH3TRKAQMND9; HQ 11440 Commerce Park Dr Ste 350, Reston, VA).
- Corroborated via a live Glassdoor job listing with employer name literally "GEOSPARK ANALYTICS DBA SEERIST FEDERAL" (Senior Revenue Operations Analyst req) and via Seerist's own seerist-federal/ page. Direct SAM.gov entity page fetch was blocked (403).
- Sources: https://www.glassdoor.com/job-listing/senior-revenue-operations-analyst-geospark-analytics-dba-seerist-federal-JV_IC5017436_KO0,33_KE34,72.htm?jl=1010056845741 ; https://seerist.com/seerist-federal/

### 2.7 Federal sales channel: Carahsoft
- Seerist sells to public sector via Carahsoft, the standard federal IT reseller/aggregator. The Carahsoft product page lists no pricing or GSA contract number — "Request a Quote" only.
- Source: https://www.carahsoft.com/seerist

### Searched, found nothing
- GSA eLibrary/Advantage: no direct listing under "Seerist," "Control Risks," or "Geospark."
- G2: product page exists — **11 reviews, 4.7/5 average — no pricing disclosed, no reviewer cost comments.** https://www.g2.com/products/seerist/reviews
- Capterra: "Contact vendor for pricing," free trial available, no tiers disclosed. https://www.capterra.com/p/10011418/Seerist/
- No Seerist/Geospark sales-role job posting with OTE/quota/ACV language surfaced in the time available (only the ops-analyst role above did).
- Control Risks itself (the consultancy, distinct from Seerist/Geospark) has no SBIR footprint and no direct USAspending/SAM.gov hits under its own name — consistent with Control Risks touching the U.S. government only via its Seerist stake rather than as a direct federal contractor in its own right, at least within what this search surfaced.

---

## 3. Verisk Maplecroft

**Baseline already confirmed:** enterprise, custom-quoted, nothing more specific known.

### 3.1 CONFIRMED — a real, dated UK government contract
- Vendor: Verisk Maplecroft (legal entity: **Maplecroft.Net Ltd**)
- **Value: £121,750**
- Awarding body: UK Foreign, Commonwealth & Development Office (FCDO)
- Procurement type: restricted procedure, above threshold
- Awarded October 2, 2020; **contract period October 5, 2020 – March 31, 2022** (~18 months) → implies a rough run-rate of **~£81,000/year** for this specific engagement
- Description: "risk management" services (foreign economic-aid-related services category)
- Source: https://www.contractsfinder.service.gov.uk/Notice/431977fc-f891-40c2-8b7c-bdcee943487f (published 10 Dec 2020)
- **Caveat: this is now 4+ years old and a single data point** — treat as a reference for one specific "risk management services" government engagement, not necessarily representative of a standard enterprise SaaS/platform subscription price.

### 3.2 CONFIRMED but HISTORICAL/BACKGROUND ONLY — not current pricing, do not conflate with deal-size data
- Verisk Analytics acquired Maplecroft for **£20.25 million**, announced **December 8–9, 2014** (~11 years before today).
- This is an M&A/acquisition price, not a customer contract value — included only because the baseline had literally nothing and it's genuine, well-corroborated background on the business's history and scale at time of sale.
- Deal described as "expected to be neutral to adjusted EPS in 2015"; Maplecroft was folded into Verisk's Decision Analytics/Specialized segment. No standalone Maplecroft revenue figure was disclosed at the time.
- Sources: https://www.globenewswire.com/news-release/2014/12/08/1890695/0/en/Verisk-Analytics-Inc-Acquires-Maplecroft.html ; https://www.insuranceerm.com/news-comment/verisk-analytics-acquires-maplecroft-for-20-25m.html (Bloomberg also carried this — "Verisk Buys U.K.'s Maplecroft for Geopolitical Risk Analytics" — title-confirmed via search but the article itself is paywalled and wasn't opened)

### Searched, found nothing
- USAspending.gov / SAM.gov: no hits under "Verisk Maplecroft." (Verisk Analytics as a whole is a large NASDAQ-listed company (VRSK) with many subsidiaries and government-adjacent products — a targeted search narrowed by NAICS/contract type might surface something the plain-name search didn't; not attempted given time budget — **flagged as an open avenue**.)
- GSA Schedule: no listing found.
- G2/Capterra: no Maplecroft-specific product page found anywhere. G2's "Verisk" seller page lists 12 Verisk products (Xactimate, ClaimXperience, XactRemodel, BuildFax, etc.) — all property/insurance-claims tools, none Maplecroft/political-risk related, no pricing disclosed on any of them. https://www.g2.com/sellers/verisk
- Job postings: one live requisition found — **"Commercial Director, Maplecroft (Singapore)"** on Verisk's SmartRecruiters career site — but the page fetch failed (400 error) in the time available. **Worth a manual follow-up:** https://jobs.smartrecruiters.com/Verisk/743999732919276-commercial-director-maplecroft-singapore-
- Verisk's 10-K filings were located on SEC EDGAR (multiple years, 2016–2025) but not read line-by-line for Maplecroft/"Specialized Business Solutions" segment revenue in the time available — **flagged as an open avenue**; as a public company, some segment-level disclosure almost certainly exists, it just wasn't mined here.
- UK Contracts Finder / Find a Tender: attempted broader site-restricted searches for more Maplecroft contracts beyond §3.1; nothing additional surfaced (search noise only).

---

## 4. Oxford Analytica

**Baseline already confirmed:** subscription, gated, price not public at all, nothing more specific known.

**This is the single biggest surprise of this entire research pass.**

### 4.1 CONFIRMED, MAJOR — Oxford Analytica has been sold, and a real dollar figure is attached
- Oxford Analytica (bundled together with **Dragonfly Intelligence**, another security-intelligence vendor) was divested by **FiscalNote Holdings, Inc. (NYSE: NOTE)** to **Dow Jones** (a division of **News Corp**, NASDAQ: NWSA) for **$40,000,000 total** — a combined price for both companies together; no per-company split disclosed anywhere found.
- Deal **announced: February 24, 2025**
- Deal **completed/closed: March 31, 2025**
- News Corp disclosed it expects a **$4 million tax benefit** from the transaction.
- Context figure (NOT Oxford-Analytica-specific — do not conflate): Dow Jones's own Risk & Compliance division generated "nearly $300 million in revenue" in fiscal year 2024, growing 16% year-over-year. That's the size of the acquiring division as a whole, not what Oxford Analytica/Dragonfly contribute to it.
- Stated rationale: proceeds paid down FiscalNote's senior term loan debt (CEO cited >60% cumulative paydown in the prior year); FiscalNote is refocusing on its core "Policy" platform (4,000+ policy customers).
- **Flag for the strategy doc: as of March 31, 2025, Oxford Analytica's ultimate owner is Dow Jones/News Corp, not FiscalNote. If BNOW's competitive doc still lists FiscalNote as the owner, it's out of date. This also places Oxford Analytica inside the same corporate family as other Dow Jones Risk & Compliance products (and as Dragonfly Intelligence, another OSINT/security-intelligence competitor) — a materially different competitive lens than treating it as a standalone boutique.**
- Sources (well corroborated across 5+ independent outlets, primary seller announcement + trade press):
  - https://fiscalnote.com/newsroom/fiscalnote-announces-definitive-agreement (primary — seller's own announcement)
  - https://www.stocktitan.net/news/NWSA/dow-jones-completes-acquisition-of-dragonfly-intelligence-and-oxford-kin871pkwb60.html (completion confirmation + the $300M/16% context figure)
  - https://www.tipranks.com/news/the-fly/fiscalnote-to-divest-oxford-analytica-dragonfly-to-dow-jones-for-40m
  - https://www.prnewswire.com/news-releases/dow-jones-to-acquire-dragonfly-intelligence-and-oxford-analytica-from-fiscalnote-302382897.html (title-confirmed via search, not opened directly)
  - https://www.citybiz.co/article/677326/dow-jones-acquire-dragonfly-intelligence-and-oxford-analytica-from-fiscalnote-holdings-for-40-million/ (title-confirmed via search, not opened directly)
  - Also indexed: MarketScreener and BusinessWire coverage of the same $40M figure (title-confirmed via search only)

### 4.2 Original 2021 FiscalNote acquisition price: NOT disclosed
- FiscalNote announced its acquisition of Oxford Analytica on **February 17, 2021**. Neither FiscalNote's own release nor its GlobeNewswire syndication discloses a purchase price.
- PitchBook has a company profile (likely containing deal-value estimates) but it sits behind PitchBook's paywall — not accessible via this research. https://pitchbook.com/profiles/company/460242-37
- Source checked: https://www.globenewswire.com/news-release/2021/02/17/2177151/0/en/Oxford-Analytica-Acquired-by-Global-Technology-Firm-FiscalNote.html

### 4.3 Ruled out — a USAspending.gov "ANALYTICA LLC" contract is NOT Oxford Analytica
- USAspending contract CONT_AWD_2032H822F00171 ($3,905,198.40; IRS via GSA Federal Acquisition Service; Sept 2022–Mar 2024; "Data Science-Machine Learning Consulting Services") is held by an entity called **"ANALYTICA LLC"** at 3 Bethesda Metro Center, Bethesda, MD.
- This is almost certainly an unrelated US data-science consultancy that happens to share a similar name — **not** Oxford Analytica Ltd (a UK company). Flagging explicitly so this figure doesn't get mistakenly reused as an Oxford Analytica data point downstream.
- Source: https://api.usaspending.gov/api/v2/awards/CONT_AWD_2032H822F00171_2050_47QTCB21D0289_4732/

### Searched, found nothing
- No subscription list price found anywhere — the Daily Brief's institutional pricing remains fully gated.
- GSA Schedule / UK Contracts Finder / Find a Tender: no clean hits under "Oxford Analytica" (UK tender site-searches returned unrelated noise — University of Oxford construction/procurement listings, not the company).
- G2/Capterra/TrustRadius: no product listing found — plausible given Oxford Analytica sells research/advisory rather than conventional SaaS.
- Job postings: two live FiscalNote-era postings found (Sales Development Representative – UK remote; Advisory Associate) but neither discloses quota, OTE, or comp figures — both just say "competitive remuneration."
  - https://startup.jobs/sales-development-representative-oxford-analytica-uk-remote-fiscalnote-2968903
  - https://startup.jobs/advisory-associate-oxford-analytica-fiscalnote-3959296 (found via search snippet only, not fetched)
- **Given the Dow Jones acquisition closed only ~18 months before today, new Oxford-Analytica-branded postings may now sit on Dow Jones/News Corp careers infrastructure rather than FiscalNote's — this pass searched under the FiscalNote framing and did not re-search under "Dow Jones Oxford Analytica" job postings. Worth a follow-up.**

---

## 5. Eurasia Group

**Baseline already confirmed:** advisory retainer, custom-quoted; legacy Global Political Risk Index (GPRI) appears dormant; nothing more specific on pricing known.

**A genuinely strong, multi-year recurring price series turned up — from a foreign (Canadian) government, not US.**

### 5.1 CONFIRMED, STRONG — a 7+ year recurring contract relationship with a Canadian federal department
Natural Resources Canada (NRCan) has repeatedly contracted with Eurasia Group for geopolitical research/platform access since at least 2017. Every figure below is individually sourced from Canada's Open Government contract-disclosure portal and was fetched and confirmed directly (all amounts **CAD**):

| Period | Amount (CAD) | Description | Source |
|---|---|---|---|
| Jan–Mar 2017 | $24,999.00 | "Consultation services" | [C-2016-2017-Q4-00458](https://search.open.canada.ca/contracts/record/nrcan-rncan%2CC-2016-2017-Q4-00458) |
| May 2017–Mar 2018 | $185,517.60 | "Strategic briefing in the oil sector" (mgmt. consulting) | [C-2017-2018-Q1-00236](https://search.open.canada.ca/contracts/record/nrcan-rncan%2CC-2017-2018-Q1-00236) |
| Sep 2018–Sep 2019 | $186,383.99 | "Access to Eurasia Group's research platform and experts" (political/country/regional/energy-sector analysis) | [C-2018-2019-Q2-00354](https://search.open.canada.ca/contracts/record/nrcan-rncan%2CC-2018-2019-Q2-00354) |
| Jul–Aug 2019 | $13,162.10 | "Payments made in accordance with authorities" (likely a supplemental/close-out payment tied to the row above) | [C-2019-2020-Q2-00217](https://search.open.canada.ca/contracts/record/nrcan-rncan%2CC-2019-2020-Q2-00217) |
| Nov 2019–Nov 2020 | $225,939.53 | "Consulting Services" | [C-2019-2020-Q3-00341](https://search.open.canada.ca/contracts/record/nrcan-rncan%2CC-2019-2020-Q3-00341) |
| Mar 2021–Mar 2022 | $188,112.71 | "Data and database access services" | [C-2020-2021-Q4-00552](https://search.open.canada.ca/contracts/record/nrcan-rncan%2CC-2020-2021-Q4-00552) |
| **Feb 2024–Mar 2025** | **$224,495.95** | "Geopolitical Research – Analysis and Insights" (scientific consulting) — **most recent term found** | [C-2023-2024-Q4-00415](https://search.open.canada.ca/contracts/record/nrcan-rncan,C-2023-2024-Q4-00415) |

**Pattern: excluding the two small outlier/supplemental payments, the ~12-month "platform + expert access" renewal has held remarkably steady in the ~$185,000–$226,000 CAD/year band across seven fiscal years (2017 through the term ending March 2025)** — roughly **$135,000–$165,000 USD/year** at typical CAD:USD rates over that period (approximate; not a precise conversion). **This is the strongest single recurring-price data series found anywhere in this research pass, for any of the six vendors**, and it lands squarely in the "large institutional retainer" range the baseline doc's characterization implies.

- **Caveat:** NRCan is one disclosed customer — a mid-sized G7 government science/energy department. This should not be read as Eurasia Group's typical *corporate* client price, which plausibly runs materially higher for large multinational retainers. Treat as one confirmed, well-documented reference point, not an average.
- **One coincidental near-miss ruled out:** a similarly-dated NRCan contract record (C-2020-2021-Q4-00594, $24,295.00 CAD, Mar–May 2021, "environmental scan and forecast for Earth Observation") is actually held by **"LES SERVICES EUROCONSULT,"** an unrelated vendor — **not** Eurasia Group. Excluded from the table above; noted here so it isn't mistakenly reused.

### 5.2 Confirmed context: no evidence of active US federal contracts
- USAspending.gov searches for "Eurasia Group" return only an unrelated organization, "Eurasia Foundation" (a separate US nonprofit/NGO, distinct from Eurasia Group the political-risk consultancy) — ruled out as a false match.

### Searched, found nothing
- GSA Schedule: none found.
- UK Contracts Finder / Find a Tender: no clean Eurasia Group hits (search noise only).
- G2 / Capterra / TrustRadius / Gartner Peer Insights: no product listing found — consistent with Eurasia Group selling advisory retainers and a research portal rather than self-serve SaaS.
- Job postings (Glassdoor, Indeed, ZipRecruiter, Comparably, CareerBliss): several listings exist (e.g., "Director, Japan Client Services," Tokyo — explicitly described as selling "retainer-based relationships and tailored consulting projects") but none disclose quota, OTE, commission, or ACV figures.
- No $ figure found for Citi Private Bank's specific arrangement to redistribute the Global Political Risk Index to its clients — the partnership itself is confirmed (via Eurasia Group's own site) but carries no disclosed payment terms.

---

## 6. S-RM

**Baseline already confirmed:** Global Security Insight is enterprise subscription, custom-quoted, nothing more specific known.

### Findings: none. This is the weakest vendor in this research pass by a wide margin.

Genuinely came up empty across all five search angles despite substantial, repeated effort. Documenting exactly what was tried, per the task's instructions:

- **US federal (USAspending.gov / SAM.gov / FPDS.gov):** no hits under "S-RM" in any phrasing tried. Plausible explanation: S-RM is a UK-headquartered corporate-intelligence/cyber-risk consultancy likely serving private-sector (and possibly UK-government) clients rather than US federal agencies — an absence of evidence that's at least consistent with the business's apparent client base, not necessarily a search failure.
- **UK government (Contracts Finder / Find a Tender):** multiple site-restricted searches attempted; no clean S-RM hits surfaced. Search noise dominated by unrelated results containing the letters "S-RM" or "RM" (e.g., "Resource Management" procurement notices, "RM" framework-agreement numbers).
- **GSA Schedule:** none found.
- **Ownership / corporate structure:** attempted to identify a parent company or PE owner (as an indirect scale/context signal) — no clear result surfaced in the time available.
- **G2 / Capterra / TrustRadius:** no product listing found for "Global Security Insight" or S-RM generally.
- **Job postings:** an S-RM Glassdoor UK salary-aggregation page exists (glassdoor.co.uk/Salary/S-RM-London-Salaries) but wasn't fetched in the time available; no OTE/quota/ACV language surfaced in any search snippet across LinkedIn, Indeed, Glassdoor, or RepVue queries. S-RM's own live careers page returned "no positions found for the selected filters" at time of search (this may well be a JS-rendering artifact of a client-side filter rather than literally zero open roles — worth a manual re-check rather than taking at face value).
- **Press/analyst commentary:** nothing beyond generic company-overview aggregator listings (LinkedIn, ZoomInfo, CB Insights) with no pricing content.

**Recommendation for the analyst:** if S-RM pricing intelligence matters a lot to the strategy doc, the next-best untried angles are: (a) a direct UK Companies House accounts pull for turnover trend as an indirect scale signal (not attempted here — this research checked for the *existence* of that data but didn't pull the actual filing), (b) checking UK MOD/Home Office framework-agreement supplier directories specifically (distinct from and not indexed the same way as Contracts Finder), and (c) browsing G2/Capterra's "cyber risk intelligence" or "corporate intelligence" category pages manually rather than searching by exact product name, in case "Global Security Insight" is listed under a different or bundled name.

---

## Cross-vendor summary table (confirmed $ figures only, at a glance)

| Vendor | Figure | Type | Date | Primary source |
|---|---|---|---|---|
| RANE | $250,000 | US federal contract (Treasury) | PoP Dec 2024–Dec 2025 | usaspending.gov (API) |
| RANE | <$250,000 (secondary source's estimate, unconfirmed) | US federal (Army War College) | FY2024 solicitation | highergov.com |
| Seerist / Geospark | $95,000,000 ceiling; **$5.7M obligated to date** | US federal IDIQ (Space Force) | Awarded 2020; ordering period through Sep 2025 | seerist.com; highergov.com |
| Seerist | $75,000/yr (min. 5 users → $15,000/user/yr) | Public list price, AWS Marketplace | Current | aws.amazon.com |
| Verisk Maplecroft | £121,750 (~£81k/yr run-rate) | UK federal contract (FCDO) | Oct 2020–Mar 2022 | contractsfinder.service.gov.uk |
| Verisk Maplecroft | £20,250,000 | Historical M&A price (Verisk buys Maplecroft) — background only, not deal pricing | Dec 2014 | globenewswire.com |
| Oxford Analytica (+ Dragonfly, bundled) | $40,000,000 | M&A price (FiscalNote → Dow Jones) | Announced Feb 2025; closed Mar 31, 2025 | fiscalnote.com; stocktitan.net |
| Eurasia Group | $185,000–$226,000 CAD/yr, recurring across 7 renewal cycles | Canadian federal contract (NRCan) | 2017–2025 | search.open.canada.ca |
| S-RM | — none found — | — | — | — |

---

## Full source list

### RANE
1. https://api.usaspending.gov/api/v2/awards/CONT_AWD_20342925P00001_2036_-NONE-_-NONE-/ — primary, $250k Treasury contract detail
2. https://www.usaspending.gov/award/CONT_AWD_20342925P00001_2036_-NONE-_-NONE- — same award, SPA shell (no data rendered)
3. https://www.highergov.com/contract-opportunity/rane-worldview-access-fy24-w91qf024q6007-r-39cf8/ — Army War College sources-sought notice
4. https://www.pressreader.com/canada/montreal-gazette/20131216/281724087366117 — Stratfor federal footprint, background only
5. https://www.repvue.com/companies/RANEnetwork — blocked, 403
6. https://www.highergov.com/awardee/rane-network-inc-12684987/ — paywalled beyond free teaser
7. https://www.ranenetwork.com/core-intelligence-subscribe — no pricing shown
8. https://www.ranenetwork.com/solutions/api — no pricing shown
9. https://www.f6s.com/software/rane-risk-intelligence-platform — blocked, robots.txt

### Control Risks / Seerist
10. https://seerist.com/newsroom/geospark-analytics-awarded-a-nearly-95-million-contract-from-the-u-s-space-force-to-bring-the-power-of-hyperion-to-the-entire-u-s-federal-government
11. https://www.govconwire.com/2020/09/geospark-analytics-books-potential-95m-space-force-idiq-to-commercialize-predictive-ai-tech/
12. https://www.highergov.com/idv/FA254420D0001/ — the $95M ceiling / $5.7M obligated breakdown
13. https://www.highergov.com/awardee/geospark-analytics-inc-10007452/ — paywalled beyond free teaser
14. https://api.usaspending.gov/api/v2/recipient/3895d23c-8730-53af-774d-0df43ed555b3-C/ — partial data ($60k shown, likely incomplete/stale rollup)
15. https://seerist.com/press-release/national-geospatial-intelligence-agency-expands-contract/
16. https://seerist.com/press-release/seerist-selected-as-standard-osint-capability-for-u-s-military-service-and-scales-enterprise-use-at-military-command/
17. https://www.prnewswire.com/news-releases/control-risks-announces-strategic-investment-in-geospark-analytics-harnessing-the-power-of-collaborative-intelligence-301323518.html
18. https://aws.amazon.com/marketplace/pp/prodview-rwny7yfqed4ey — the $75k/yr public price
19. https://www.carahsoft.com/seerist
20. https://www.glassdoor.com/job-listing/senior-revenue-operations-analyst-geospark-analytics-dba-seerist-federal-JV_IC5017436_KO0,33_KE34,72.htm?jl=1010056845741
21. https://seerist.com/seerist-federal/
22. https://opengovus.com/sam-entity/QH3TRKAQMND9 — blocked, 403
23. https://www.g2.com/products/seerist/reviews
24. https://www.capterra.com/p/10011418/Seerist/
25. https://www.sbir.gov/awards/206063 — false lead, this is a Gotenna Inc award, unrelated to Geospark/Seerist

### Verisk Maplecroft
26. https://www.contractsfinder.service.gov.uk/Notice/431977fc-f891-40c2-8b7c-bdcee943487f — the £121,750 FCDO contract
27. https://www.globenewswire.com/news-release/2014/12/08/1890695/0/en/Verisk-Analytics-Inc-Acquires-Maplecroft.html
28. https://www.insuranceerm.com/news-comment/verisk-analytics-acquires-maplecroft-for-20-25m.html
29. https://www.insidermedia.com/news/south-west/129558-global-risk-firm-maplecroft-sold-20m — blocked, robots.txt (corroborated via #27/#28 instead)
30. https://www.g2.com/sellers/verisk
31. https://jobs.smartrecruiters.com/Verisk/743999732919276-commercial-director-maplecroft-singapore- — fetch failed (400), not yet reviewed

### Oxford Analytica
32. https://fiscalnote.com/newsroom/fiscalnote-announces-definitive-agreement — primary, $40M divestiture
33. https://www.stocktitan.net/news/NWSA/dow-jones-completes-acquisition-of-dragonfly-intelligence-and-oxford-kin871pkwb60.html — completion confirmation
34. https://www.tipranks.com/news/the-fly/fiscalnote-to-divest-oxford-analytica-dragonfly-to-dow-jones-for-40m
35. https://www.prnewswire.com/news-releases/dow-jones-to-acquire-dragonfly-intelligence-and-oxford-analytica-from-fiscalnote-302382897.html — title-confirmed via search only
36. https://www.citybiz.co/article/677326/dow-jones-acquire-dragonfly-intelligence-and-oxford-analytica-from-fiscalnote-holdings-for-40-million/ — title-confirmed via search only
37. https://www.globenewswire.com/news-release/2021/02/17/2177151/0/en/Oxford-Analytica-Acquired-by-Global-Technology-Firm-FiscalNote.html — 2021 acquisition, no price disclosed
38. https://pitchbook.com/profiles/company/460242-37 — paywalled, not accessed
39. https://api.usaspending.gov/api/v2/awards/CONT_AWD_2032H822F00171_2050_47QTCB21D0289_4732/ — ruled out, unrelated "Analytica LLC"
40. https://startup.jobs/sales-development-representative-oxford-analytica-uk-remote-fiscalnote-2968903
41. https://startup.jobs/advisory-associate-oxford-analytica-fiscalnote-3959296 — found via search snippet only

### Eurasia Group
42. https://search.open.canada.ca/contracts/record/nrcan-rncan%2CC-2016-2017-Q4-00458
43. https://search.open.canada.ca/contracts/record/nrcan-rncan%2CC-2017-2018-Q1-00236
44. https://search.open.canada.ca/contracts/record/nrcan-rncan%2CC-2018-2019-Q2-00354
45. https://search.open.canada.ca/contracts/record/nrcan-rncan%2CC-2019-2020-Q2-00217
46. https://search.open.canada.ca/contracts/record/nrcan-rncan%2CC-2019-2020-Q3-00341
47. https://search.open.canada.ca/contracts/record/nrcan-rncan%2CC-2020-2021-Q4-00552
48. https://search.open.canada.ca/contracts/record/nrcan-rncan,C-2023-2024-Q4-00415 — most recent, $224,495.95 CAD
49. https://search.open.canada.ca/contracts/record/nrcan-rncan%2CC-2020-2021-Q4-00594 — ruled out, different vendor ("Les Services Euroconsult")
50. https://www.eurasiagroup.net/careers/director_japanbd_tokyo

### S-RM
51. https://www.s-rminform.com/careers/open-positions — "no positions found"
52. https://www.glassdoor.co.uk/Salary/S-RM-London-Salaries-EI_IE1673585.0,4_IL.5,11_IM1035.htm — found via search, not fetched

---

## Full query log (chronological, including empty/unproductive queries)

**Round 1 — federal contract databases, all six vendors:**
1. `site:usaspending.gov "RANE Network"` → found RANE recipient profile + one award page
2. `site:usaspending.gov Seerist` → no direct hits (noise)
3. `Seerist Space Force SBIR award` → found the $95M press release + unrelated SBIR.gov award
4. `Seerist USAF contract Control Risks` → found NGA press release, Control Risks partner page, federal page
5. `site:usaspending.gov "Verisk Maplecroft"` → no direct hits
6. `site:usaspending.gov "Oxford Analytica"` → found "ANALYTICA LLC" award (later ruled out)
7. `site:usaspending.gov "Eurasia Group"` → no direct hits (Eurasia Foundation is a different org)
8. `site:usaspending.gov "S-RM" intelligence risk` → no hits

**Round 2 — following up leads via API + more targeted searches:**
9. `"Geospark Analytics" SBIR sbir.gov award` → good background list of press coverage
10. `"Geospark Analytics" OR Seerist SAM.gov contract award IDIQ` → found USAspending recipient profile, GovTribe, GovconGiants
11. `RANE Network usaspending.gov contract award amount` → confirmed same award page
12. `"RANE Network" GSA schedule contract number` → no GSA hits
13. `Seerist GSA schedule GSA Advantage contract` → no hits, generic GSA-guide noise
14. `"Control Risks" GSA schedule contract number MAS` → no hits, generic noise
15. `RANE Network account executive OTE quota job posting` → found RepVue, Glassdoor, Indeed listing pages (no numbers in snippets)
16. `Seerist account executive OTE quota job posting LinkedIn` → generic OTE-definition noise
17. `"Verisk Maplecroft" account executive OR "business development" OTE quota job` → found Glassdoor/SmartRecruiters postings

**Round 3 — G2/Capterra/reviews + more federal:**
18. `"Seerist" OR "Geospark Analytics" account executive salary Glassdoor OR Indeed OR LinkedIn quota` → found "Seerist Federal" DBA confirmation via Glassdoor
19. `Geospark Analytics Seerist highergov contract awards list` → found the IDIQ page + NGA press release
20. `"S-RM" "G2" reviews pricing Global Security Insight` → no S-RM hits, unrelated "Insight Assurance"/"Insight Consulting" G2 pages
21. `"Verisk Maplecroft" G2 reviews pricing OR Capterra` → no hits, generic Verisk Maplecroft news
22. `"Oxford Analytica" subscription price cost "per year" OR "annual"` → no pricing, background/briefing-book links only
23. `"Eurasia Group" G2 OR Capterra reviews pricing "Global Political Risk Index"` → found Citi Private Bank GPRI partnership mention (no price)
24. `"Eurasia Group" account director OR "business development" salary OTE quota job` → job listing pages only, no figures

**Round 4 — Control Risks/Geospark relationship, RANE federal history:**
25. `"Control Risks" Seerist investment OR acquired OR "strategic partnership" Geospark` → found the 10% stake PRNewswire release
26. `site:sam.gov "Geospark Analytics" OR "Seerist"` → found Carahsoft, opengovus, GovTribe, GovconWire merge article
27. `Growjo "Oxford Analytica" revenue employees` → found Owler/PitchBook/ZoomInfo/Tracxn profile links (not opened, mostly paywalled)
28. `"Verisk" GSA schedule contract number "Maplecroft" OR "Verisk Analytics"` → no GSA hits
29. `"S-RM" federal government contract OR "S-RM" usaspending OR sam.gov` → no hits, generic SAM.gov guidance noise
30. `"Eurasia Group" federal contract OR grant State Department OR USAID` → found the $22M unrelated USAID Europe/Eurasia contract award (different meaning of "Eurasia," not the company) and Eurasia Foundation grant (also unrelated)

**Round 5 — more G2/GSA, RANE/Seerist reviews:**
31. `"Seerist" G2 reviews pricing tier` → found the actual G2 Seerist page, Capterra, GetApp, Techjockey listings
32. `"RANE" OR "RANE Network" G2 reviews pricing Worldview` → no G2 hit; found F6S and HigherGov RANE listing instead
33. `"Control Risks" Seerist federal SBIR Phase III OTA "other transaction"` → generic SBIR/OTA explainer noise, no vendor-specific hits
34. `"S-RM" GSA schedule OR "government contract" security consulting` → no hits, generic GSA-consultant-services noise
35. `"Verisk Maplecroft" OR "Verisk" federal contract usaspending "political risk"` → found Chambers profile, Verisk SRCC catastrophe model press release (unrelated to contract pricing)

**Round 6 — HigherGov/AWS/Carahsoft drilldown, more job postings:**
36. `site:gsaelibrary.gsa.gov RANE OR Seerist OR "Control Risks" OR "Verisk" OR "Eurasia Group"` → no hits, only Control Risks Wikipedia/CB Insights noise
37. `"S-RM" business development director salary OR OTE job posting London OR "New York"` → found S-RM Glassdoor UK salary page (not fetched)
38. `"Verisk Maplecroft" sales director OR "business development" job posting quota target` → found the Singapore Commercial Director posting
39. `"Oxford Analytica" business development OR sales OR subscriptions job posting salary` → found the SDR and Advisory Associate FiscalNote postings
40. `SBIR.gov "Geospark Analytics" firm awards list` → found correct SBIR.gov firm profile page + press coverage of 3rd SBIR award
41. `FiscalNote 10-K OR investor "Oxford Analytica" revenue ACV subscription` → surfaced the divestiture announcement (first sighting of the $40M figure)
42. `FiscalNote annual report "Oxford Analytica" acquisition price 2021` → surfaced Crunchbase/Mergr/GlobeNewswire/PrivSource + the $40M divestiture articles

**Round 7 — chasing the Dow Jones/Oxford Analytica divestiture, Verisk 2014 deal, S-RM ownership:**
43. `"Eurasia Group" job posting "business development" OR sales salary OTE Comparably OR Glassdoor` → mostly noise (unrelated "Eurasia" companies)
44. `"Dow Jones" "Oxford Analytica" "Dragonfly" acquisition $40 million details` → confirmed the $40M figure across many outlets
45. `FiscalNote 10-K "assets held for sale" OR "discontinued operations" Oxford Analytica Dragonfly revenue 2024` → surfaced FiscalNote's own closing announcement + SEC EDGAR 10-K link (not opened line-by-line)
46. `Maplecroft acquired by Verisk 2015 price million` → found the £20.25M acquisition price (multiple sources)
47. `"S-RM" private equity ownership OR investment OR funding round` → no clear ownership hit; mostly S-RM's own PE-client-services marketing pages
48. `site:g2.com s-rm-inform OR "S-RM"` → no relevant G2 product hits

**Round 8 — RepVue, Eurasia Group careers, SAM entity registrations:**
49. `RepVue "Eurasia Group" OR "S-RM" OR "Verisk Maplecroft" sales` → no RepVue-specific hits, generic Verisk/Maplecroft news noise
50. `"Eurasia Group" careers job posting "Business Development" site:eurasiagroup.net` → found the Japan Client Services Director posting
51. `opengovus.com OR sam.gov "Control Risks" entity registration CAGE` → no direct hits, generic SAM.gov registration-guide noise
52. `opengovus.com "Eurasia Group" OR "S-RM" OR "Verisk Maplecroft" entity registration` → no direct hits

**Round 9 — closing RANE/Analytica LLC threads, Verisk 10-K, S-RM ownership:**
53. `"RANE Network" contract award second OR another usaspending.gov CONT_AWD` → no second RANE award found (led to the W91QF Army lead later)
54. `PitchBook OR Mergr "FiscalNote" "Oxford Analytica" 2021 deal value million` → confirmed PitchBook has a profile (paywalled) but no visible price
55. `"Eurasia Group" university library subscription price OR procurement contract` → no direct hit (unrelated "Eurasia Academic Publishing Group" noise)
56. `"S-RM" owner OR "parent company" acquired private equity Bowmark OR Levine` → no confirmed S-RM ownership hit
57. `site:opengovus.com "S-RM" OR "Eurasia Group" OR "Control Risks" OR "Verisk Maplecroft"` → no direct hits
58. `"Eurasia Group" contract value OR retainer "$" thousand OR million disclosed` → **found the Canada Open Government contracts search — the key lead for §5.1**

**Round 10 — RANE tier pricing, Army War College lead, Canada contracts:**
59. `"RANE" "Core" OR "Geo" OR "Threat Intelligence" API tier pricing enterprise` → found RANE's own subscribe/API pages (no pricing) and the **W91QF024Q6007 Army War College lead**
60. `"W91QF024Q6007" RANE Worldview Stratfor contract award` → confirmed HigherGov contract-opportunity page + found more Canada NRCan contract noise (unrelated matches)
61. `"Eurasia Group" NRCan contract 2020 OR 2021 OR 2022 site:search.open.canada.ca` → found 5 additional NRCan contract record URLs
62. `"RANE" W91QF Army contract usaspending.gov Worldview` → confirmed HigherGov page again; no separate USAspending award found

**Round 11 — UK Contracts Finder push, S-RM final attempts, RANE final attempts:**
63. `site:contractsfinder.service.gov.uk "S-RM" OR "Control Risks" OR "Verisk Maplecroft" OR "Oxford Analytica"` → **found the Verisk Maplecroft £121,750 FCDO notice**
64. `"S-RM" Companies House accounts turnover revenue UK filing` → no direct S-RM Companies House hit, generic filing-guidance noise
65. `"S-RM" "Global Security Insight" subscription price cost annual` → found S-RM's own GSI product/login pages, no pricing
66. `"Verisk Maplecroft" UK government contract Contracts Finder OR "Find a Tender"` → generic navigation-page noise, no new contract hits

**Round 12 — closing UK tender searches, final SBIR/API checks:**
67. `site:find-tender.service.gov.uk "Maplecroft"` → no additional hits beyond §3.1
68. `site:find-tender.service.gov.uk OR site:contractsfinder.service.gov.uk "S-RM"` → no genuine S-RM hits (all false-positive "RM" noise)
69. `site:find-tender.service.gov.uk OR site:contractsfinder.service.gov.uk "Control Risks Group" OR "Control Risks Limited"` → no genuine hits (generic "risk management" noise)
70. `site:find-tender.service.gov.uk OR site:contractsfinder.service.gov.uk "Oxford Analytica"` → no genuine hits (University of Oxford noise)
71. `site:find-tender.service.gov.uk OR site:contractsfinder.service.gov.uk "Eurasia Group"` → no genuine hits
72. `"Control Risks" sbir.gov company awards` → confirmed no Control Risks SBIR footprint
73. `"RANE" Army War College OR "Carlisle Barracks" contract award usaspending W91QF` → no confirmed post-award USAspending record found for the W91QF024Q6007 solicitation

**Direct API/page fetch attempts of note (not WebSearch queries, but worth logging given how much depended on them):**
- `api.usaspending.gov/api/v2/awards/CONT_AWD_20342925P00001.../` → **success**, RANE $250k detail
- `api.usaspending.gov/api/v2/awards/CONT_AWD_2032H822F00171.../` → **success**, ruled out "Analytica LLC"
- `api.usaspending.gov/api/v2/recipient/3895d23c-.../` → partial success, $60k figure (likely incomplete)
- `api.usaspending.gov/api/v2/recipient/22b66188-...-P/` and `-R/` → failed (empty/400)
- `api.usaspending.gov/api/v2/search/spending_by_award_count/` → failed, 405 (endpoint requires POST, WebFetch is GET-only)
- Plain `usaspending.gov/award/...` and `/recipient/...` page URLs → consistently returned empty JS-SPA shells with no data; the API route above was the workaround used throughout

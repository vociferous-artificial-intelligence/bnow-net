# Russia Data Roadmap — analytical depth beyond the frontline

Living document (started 2026-07-06). What data classes deepen Russia analysis, what
each one signals, its status in our pipeline, and who pays for it. Companion to
docs/NEW-COUNTRY-PLAYBOOK.md; implementation priorities at the bottom.

## 0. Already ingesting (baseline)

Frontline OSINT (70+ telegram channels, registry-ranked) · courts/prosecutions layer
(Mediazona, Baza, SOTA, VChK-OGPU*, Ostorozhno) · investigative (Verstka, Insider,
Novaya-Europe, IStories via registry) · regional/ethnic-republic layer (Idel.Realii,
Kavkaz.Realii, Sibir.Realii, Azatliq-Tatar, Radio Svoboda — via TG mirrors) ·
semi-official (Gladkov, Kadyrov, Synehubov auto-selected) · incident tracking (ASTRA)
· business press (RBC, Kommersant*). (*where reachable)

## 1. State-published data — and the "going dark" signal

Russia has classified **400+ statistical indicators since early 2025** ([RuSecrets](https://rusecrets.com/articles/more_than_400_statistical_indicators_have_been_classified_in_russia_since_the_beginning_of_the_year)):
monthly demographics suspended July 2025 ([Moscow Times](https://www.themoscowtimes.com/2025/07/07/rosstat-stops-publishing-monthly-population-data-amid-war-deaths-demographic-crisis-a89696)),
oil/gas output suspended through April 2026 ([TASS](https://tass.com/politics/1943461)),
customs detail, CBR reserves composition, crime statistics (4-EGS), disability counts
([Moscow Times](https://www.themoscowtimes.com/2025/08/01/russia-limits-access-to-key-economic-and-demographic-data-amid-downturn-concerns-a90068), [Worldcrunch](https://worldcrunch.com/focus/russia-ukraine-war/disappearing-data-how-russia-has-been-buried-key-wartime-statistics/)).

**Product insight: the classification events themselves are a leading indicator.** A
"data-dark tracker" (which series vanished, when, before which bad news) is cheap to
build — scrape publication calendars, alert on omissions — and is a signal no one
else productizes. Carnegie flagged the pattern early ([Secret Economy](https://carnegieendowment.org/russia-eurasia/politika/2022/07/secret-economy-what-hiding-the-stats-does-for-russia?lang=en)); [cedarus.io](https://cedarus.io/research/russian-statistics) maintains a reliability hazard map worth mirroring.

Still published and machine-readable (each = one adapter):

| Source | What | Signal |
|---|---|---|
| **MinFin monthly budget execution** | oil&gas vs non-oil revenues, deficit | fiscal strain, sanction bite — commodity desks care |
| **CBR** | rates, M2, banking sector aggregates, FX interventions | credit stress, capital flight |
| **zakupki.gov.ru** (state procurement) | tenders: fortifications, drone parts, prosthetics, military graves | capability + losses + regional strain BEFORE announcements — highest-value single build |
| **pravo.gov.ru** (official decree gazette) | presidential ukaz stream | **numbering-gap technique**: classified decrees leave visible gaps in the public sequence — a countable secrecy index |
| **kremlin.ru / government.ru** | Putin & PM schedules, meeting attendance | protocol order + absence tracking (see §3) |
| **Fedresurs** | bankruptcies, asset encumbrances | who is being squeezed before it's news — feeds the entity graph |
| **sudrf.ru / court card indexes** | case filings by name | prosecution pipeline earlier than press coverage |
| **MinAg / grain union** | harvest, export quotas | food-as-leverage + FX earnings; agriculture is still published because it's a success story |
| **RZD freight loadings** (monthly) | coal/steel/cargo volumes | honest industrial proxy while Rosstat degrades |
| **Rosstat (residual)** | CPI weekly, regional wages | still usable; treat per cedarus hazard map |

## 2. Oligarch & asset intelligence

Direction: track the *pressure* on elites (our entity graph) **and** their *response*
(asset movements, relocations, divestments — international footprint).

- **[OpenSanctions](https://www.opensanctions.org/)** — structured, API, free tier;
  entity-resolves persons/companies across OFAC/EU/UK lists. **Wire into the entity
  graph** so BNOW entities auto-link to sanction status + aliases. Cheapest big win.
- **[OCCRP Russian Asset Tracker](https://www.occrp.org/en/project/russian-asset-tracker)** +
  Aleph — mansions/yachts/jets per oligarch, sourced. Use as static enrichment layer
  (attribution: OCCRP), refresh quarterly.
- **Yachts**: AIS via MarineTraffic/VesselFinder (paid APIs) — port calls of
  sanctioned-owner vessels ([how-to, NPF](https://nationalpress.org/topic/ukraine-tracking-russian-oligarch-yachts-sanctions/), [WaPo](https://www.washingtonpost.com/technology/2022/03/10/russian-oligarch-yacht-tracking/)).
  Equasis (free registry) for ownership chains. **Jets**: ADS-B Exchange (community,
  unfiltered) — movement alerts for known tail numbers.
- **UK Companies House API (free)** + corporate registry diffs — directorship
  resignations/transfers of RU-linked entities.
- **Sanctions-list diffs** (OFAC SDN / EU / UK OFSI publish machine-readable updates)
  — designation + delisting events into the entity timeline.
- **International oligarch news**: our GDELT adapter (when healthy) + targeted RSS
  queries on top-pressure entity names — the entity graph tells us WHO to query for;
  that loop (graph → search → graph) is the differentiator.

Legal posture: aggregate/public data only, attribute investigative sources, never
assert ownership beyond what sources state (hedging applies to assets too).

## 3. Kremlinology methodology — what the literature says to measure

Grounded in: [CNA, Wartime Russian Civil-Military Relations (2025)](https://www.cna.org/reports/2025/02/wartime-russian-civil-military-relations) —
elite personnel changes, political intervention in military decisions, and
legitimacy strains are the core observable variables; [Daedalus siloviki studies](https://direct.mit.edu/daed/article/146/2/53/27147/The-Russian-Siloviki-amp-Political-Change);
Carnegie's five-elites framework ([Unconsolidated](https://carnegie.ru/commentary/81037));
classic indicator craft ([overview](https://en.wikipedia.org/wiki/Kremlinology)).

Machine-trackable proxies, mapped to our pipeline:

| Classic indicator | Automatable proxy | Status |
|---|---|---|
| Personnel shifts / purges | appointment & dismissal claims → entity graph roles `appointee/dismissed` | **live** (elite track) |
| Which organ acts (FSB vs SK vs GP) | acting-agency entity on every prosecution claim | **live** |
| Absences from public events | kremlin.ru schedule scrape → attendance matrix per elite | build (~1d) |
| Protocol order / seating | LLM extraction from event coverage — order of names in state readouts | build (~1d, rides on schedule scrape) |
| Decree secrecy | pravo.gov.ru numbering-gap counter | build (small) |
| Governor rotations ("gubernatoropad") | appointment claims + regional press layer | partially live |
| State-TV framing shifts | out of scope near-term (heavy); proxy via TASS/RIA TG framing deltas | roadmap |
| Elite survey attitudes | not automatable — cite [academic surveys](https://par.nsf.gov/servlets/purl/10199673) in analysis prompts | context only |

## 4. Demand side — what buyers actually pay for

| Persona | Question they pay to answer | Data class that answers it |
|---|---|---|
| **Sanctions/compliance teams** (banks, MNCs) | "Is my counterparty's owner about to be designated/arrested/nationalized?" | entity pressure index + Fedresurs + sanctions diffs + OpenSanctions links |
| **Commodities desks** | "Refinery/port/pipeline outages? Grain export policy shifts? Fiscal strain forcing supply changes?" | ASTRA strike layer + MinFin + MinAg + procurement |
| **Corporate security / political risk** | "Which factions are rising/falling; succession scenarios; regional stability" | elite track + Kremlinology proxies + regional/ethnic layer |
| **Insurers (war/marine/aviation)** | "Event feed with location + corroboration for underwriting/claims" | military track + ASTRA + timeliness lead |
| **Journalists / researchers** | "Traceable evidence chains; who-when-what entity dossiers" | entity timelines + claim→source citations (already the product) |
| **Governments/NGOs** | "Mobilization burden, minority impact, repression trends" | ethnic-republic layer + courts layer + data-dark tracker |

Common thread: **early warning with provenance**. Our two differentiators map
directly: (1) information lead (+14h median vs ISW) = the "early", (2) DB-enforced
claim→source traceability = the "provenance". Every new data class above should ship
with both properties or not at all.

## 5. Build order (effort × buyer value)

1. **OpenSanctions → entity graph link** (S; compliance buyers, immediate dossier upgrade)
2. **zakupki.gov.ru procurement watcher** (M; commodity + military-capability signal, unproductized)
3. **Data-dark tracker** (S; unique, cheap, press-worthy)
4. **kremlin.ru schedule/attendance matrix + protocol order** (M; Kremlinology core)
5. **pravo.gov.ru decree-gap counter** (S; rides on #4 infra)
6. **Fedresurs bankruptcy feed** (M; entity-graph enrichment)
7. **MinFin/MinAg/RZD monthly indicators** (S each; context layer for digests)
8. **Sanctions-list diffs** (S; entity timeline events)
9. **Yacht/jet movement alerts** (M-L; paid AIS for yachts, ADS-B for jets; needs
   tail/IMO seed list from OCCRP data)
10. **State-TV framing analysis** (L; defer)

S ≈ half-day · M ≈ 1–2 days · L ≈ week+. Items 1/3/5 are candidates for the next
build session; 2 is the single highest-value new capability.

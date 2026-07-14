# Validation scope and corpus value — 2026-07-14

Status: read-only product/data audit; documentation only. Counts below are a live
snapshot taken at approximately 13:23Z on 2026-07-14 and will continue to move with
ingestion.

## Executive answer

1. **The public benchmark unit should follow the reference publication's editorial
   scope, not BNOW's country-navigation labels.** ISW publishes one Russia–Ukraine
   campaign assessment, so its five Key Takeaways should produce one ROCA score from
   the union of relevant RU and UA evidence. Russia and Ukraine should remain useful
   evidence-attribution drilldowns, not two separately averaged scores against the
   same denominator. ISW's Iran Update is already a regional Iran-aligned/Middle East
   security lens; only relevant Israel/Gulf evidence should join that benchmark.
2. **“Documents ingested” means stored fetched items.** The Russia counter is
   `count(*)` of `raw_documents` tagged `country_iso2='ru'`. It does not mean sources,
   summaries, unique news events, or documents fully read by a model. The displayed
   45,988 had become 46,343 by this audit because live ingestion continued.
3. **ISW comparison is a quality gauge, not the product's primary value.** BNOW's
   stronger product concept is an analyst evidence workbench: compress the corpus
   into claims, corroborated event/topic clusters, entity/theme continuity, source
   intelligence, and decision-specific views while preserving click-through to the
   evidence. The benchmark tests one output layer; it does not measure the full value
   of the evidence base.

## 1. The correct validation grouping

### Russia and Ukraine

The implementation currently discovers the same ISW Russian Offensive Campaign
Assessment for both `ru` and `ua`. On dates when the toponym filter does not split the
takeaways, each row is scored against the same list. July 13 is the clearest example:
both rows used the same five takeaways, producing Russia 20% and Ukraine 0%.

The recommended public unit is therefore:

> one ROCA report → one benchmark evidence set → one score

That evidence set should union eligible Russia- and Ukraine-tagged military claims.
The result can then disclose attribution such as “evidence found in RU-tagged
sources,” “UA-tagged sources,” or both. This preserves the useful country lenses
without presenting one expert report as two independent benchmark observations.

A stored-results counterfactual was possible for eight recent dates where both rows
used aligned, unfiltered takeaway indices. Taking the logical OR of the already
stored RU/UA matches changed the mean from **12.8% across the two displayed country
rows to 20.7% across one row per report**. July 13 becomes one 20% result rather than
20% and 0% (a 10% two-row mean).

This does **not** prove that a new combined matcher would score 20.7%. It is not a
rematch of the union claim corpus, and on those eight dates it found no complementary
matches beyond the better existing country row. The apparent improvement comes
mainly from removing a duplicate low row from the average. A shadow run over the
actual union is required before changing public methodology.

### Iran and the wider Middle East

The Iran Update is not a country-only Iran benchmark. Its recurring subject matter
includes Iran, Israel, the United States, Hezbollah/Lebanon, the Houthis/Yemen, Iraqi
militias, maritime activity, and other regional actions connected to Iran's security
network. BNOW's current `ir` military mapping prompt already reflects that regional
lens, and selected Lebanese channels are intentionally tagged to it.

The correct rule is not “add every Middle East document.” It is:

> union evidence that is relevant to the Iran Update's declared analytical scope

Current stored-document counts outside `ir` include Israel 784, UAE 728, Oman 444,
Qatar 947, and Saudi Arabia 833. Those country corpora currently have no map-stage
`doc_claims`; they fall back to the legacy digest engine. Blindly combining them with
Iran would mix domestic or unrelated material into a regional-security benchmark
and give the larger countries more ranking weight without first extracting comparable
claims.

Adding relevant evidence does not inherently have to reduce coverage. In a
deterministic evidence-union evaluator, retaining the existing matched claims while
adding relevant claims should leave reference-takeaway coverage unchanged or improve
it. It can, however, increase BNOW-only or thin-sourced counts. Regenerating a single
broader digest can also lower coverage through ranking/synthesis crowding and model
variance, even though the underlying corpus improved. The safer sequence is:

1. keep the country feeds separate;
2. map comparable claims for the additional countries;
3. create a scope-filtered Iran Update evidence union;
4. shadow-score it against the existing Iran benchmark;
5. publish a methodology/epoch change only if the evidence is better.

Recent 100% Iran results should also be read with their denominators. July 13 was
4/4 takeaways and July 11 was 3/3. July 11's current at-publish submetric was 0%,
meaning the eventual claims matched all three but their cited evidence was not
ingested before ISW's publication instant. “100%” is valid for the stored coverage
definition, but it is not a statement of exhaustive regional coverage or timeliness.

### Future regions

Benchmark scope should be a separate product concept from country/theater scope.
China–Taiwan could eventually have a cross-Strait/PLA benchmark built from an
appropriate expert reference set. The Koreas, Latin America, Africa, and the Pacific
will need their own sources and task-appropriate validation baselines. No single
publication should be stretched into a universal quality gauge.

## 2. What “46,343 Russia documents” actually means

The country page executes the equivalent of:

```sql
select count(*) from raw_documents where country_iso2 = 'ru';
```

A document is one fetched feed/article/post item. The row can hold its adapter,
registry source link, provider external ID, URL, title, source text, language,
theater tag, publication/fetch timestamps, metadata, and content hash. At this
snapshot the Russia rows came from:

| Adapter | Stored items |
|---|---:|
| Telegram web preview | 15,169 |
| X API | 13,670 |
| Telegram MTProto | 11,285 |
| RSS | 4,158 |
| GDELT | 2,061 |
| **Total** | **46,343** |

This is **not 46,343 sources**. The rows linked to 1,204 registry source records and
represented 962 domains and 44,778 distinct URLs; 838 rows lacked a resolved registry
source link. All had a URL, 45,505 had a source link, and only 6,219 had a non-empty
title. Median stored text length was 227 characters (mean 493), which reflects the
large share of social posts.

Ingest hashing removes exact repeats of the same provider/transport item. The same
story copied by different outlets or fetched through different transports can remain
as multiple raw documents. The map-stage deduper later recognizes exact/near mirrors
within the same theater and date window so the model need not re-read every copy.

### Did the AI read almost 46,000 documents?

No. The current Russia funnel at the snapshot was:

| Funnel stage | Documents/items | Meaning |
|---|---:|---|
| Stored Russia raw documents | 46,343 | Country-page headline count |
| Cold history before June 29 | 6,387 | Stored, outside the current mapping backfill window |
| Newer but shorter than mapping threshold | 2,243 | Stored, not eligible for the current map pass |
| Eligible since June 29 | 37,713 | At least 40 characters of content |
| Final map disposition | 35,908 | Canonical read or dedup-mirror verdict completed |
| Pending mapping | 1,805 | Eligible backlog at the instant of the query |
| Canonical documents model-read | 32,607 | Read by at least the Russia military track |
| Dedup mirrors not separately model-read | 3,301 | Point to a canonical document/verdict |

The model sees at most approximately 1,500 characters of title plus content for each
document-track evaluation. Of the 32,607 canonical documents, 4,037 were also read
through the elite-politics track, for 36,644 current-version document-track
evaluations. That is not the same as 36,644 provider requests because documents are
batched.

### Is there a summary of every document?

No. BNOW stores the fetched text, but does not create one prose summary per raw
document. For each applicable track, the map stage can return zero to three atomic
English claims plus:

- a source-language supporting quote;
- hedge and claim type;
- a small entity-name JSON array;
- an event/grouping hint and claim date;
- processing, quote-verification, and dedup state.

Zero claims is an intentional outcome for irrelevant, routine, or unusable material.
In the current Russia map output:

| Current-version map output | Count |
|---|---:|
| Atomic `doc_claims` across military + elite tracks | 19,082 |
| Distinct documents with at least one atomic claim | 17,459 |
| Model-read documents with no retained claim in either track | 15,148 |
| Atomic claims carrying entity JSON | 4,907 |
| Distinct source documents represented by those entity-bearing claims | 4,351 |
| Entity-name mentions in map JSON | 5,970 |
| Distinct lowercased entity-name strings | 2,443 |

An event summary is generated later for selected digest/event clusters. It is not a
per-document summary.

### Are entities and claims fully tracked for every document?

No. Atomic claims retain their raw-document traceability, but the entity array in
`doc_claims` is an extraction aid, not a fully normalized knowledge graph. Only
entities that survive into final digest claims are currently canonicalized into the
first-class `entities` and `claim_entities` tables.

The current Russia final/published layer contained 310 final claims citing 758 raw
documents, 258 events, 38 digest rows, 189 claim-to-entity rows, and 129 normalized
entities. Final claims have embeddings for retrieval; raw documents do not. The
global `entity_links` table had zero rows, so BNOW does not currently have a sourced
person-to-person or organization-to-person graph.

Identity normalization is also visibly incomplete. For example, Zelensky appears in
multiple normalized spellings (`Zelenskiy`, `Zelensky`, and `Zelenskyy`), and Ali
Khamenei appears with and without titles. Entity-centered navigation is a promising
direction, but the present database should not be described as a mature entity graph.

## 3. Product value beyond matching ISW

ISW answers a valuable but narrow question: **did BNOW's selected daily output cover
the principal developments that one respected expert publication chose to put in
its top takeaways?** It does not measure source discovery, evidence depth, entity
continuity, early warning, recall over history, or usefulness to a specific analyst.

The 46,343-row corpus is therefore input inventory, not the product experience. An
analyst should not have to browse tens of thousands of rows. The useful compression
ladder is:

```text
raw documents
  → atomic, source-linked claims
  → corroborated event/topic clusters
  → entity and theme timelines
  → shift brief, warning, investigation, or decision lens
```

Every layer should preserve progressive disclosure back to the supporting documents.
That makes BNOW an **analyst evidence workbench** (or evidence operating system), with
ISW validation as an external quality-control instrument.

At a conceptual level, that workbench supports several analyst jobs:

- **Awareness:** what materially changed since the last shift?
- **Triage:** which developments are accelerating, corroborated, anomalous, or thinly
  sourced?
- **Investigation and recall:** what has the corpus said about an entity, place,
  organization, capability, or theme, and what is the source trail?
- **Continuity:** how did an entity's role, claims, relationships, and associated
  events change over time?
- **Source intelligence:** who originated or amplified a claim, how reliable is that
  source in this theater, and where does reporting converge or conflict?
- **Decision lenses:** what matters for military warning, elite politics, nuclear
  risk, sanctions/evasion, trade, infrastructure, insurance, or journalism?

Major-player pages for Putin, Khamenei, or Zelensky can fit this model, but a generic
node-link picture is not automatically useful. The analyst question should govern the
view: chronology, corroborated events, changing affiliations, contested claims, and
primary source trails are more valuable than a visually dense graph with unclear edge
meaning.

## Product rulings proposed for later decision

- Treat **country/theater**, **benchmark scope**, and **analyst lens** as three
  separate dimensions.
- Make the public benchmark one score per reference report; retain country evidence
  attribution and diagnostic drilldowns.
- Keep Iran's country feed distinct while shadow-testing a scope-filtered regional
  Iran Update evidence union.
- Describe “documents ingested” explicitly as stored fetched items and accompany it
  with a compression/funnel explanation before using the number as a quality claim.
- Position ISW validation as trust evidence and internal QA, not as BNOW's product
  ontology or ceiling.
- Do not market a knowledge/entity graph until identity normalization and sourced
  relationship edges exist at meaningful coverage.

No application code, database rows, environment variables, provider calls, or
deployments were changed in this audit.

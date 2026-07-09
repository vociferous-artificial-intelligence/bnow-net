# BNOW.NET Pipeline Audit — Digest Extraction Path

- **Date:** 2026-07-09
- **Status:** READ-ONLY / INFORMATIONAL. No source, DB, or config was modified. DB access was SELECT-only.
- **Actual LLM spend incurred during this audit: $0.00** (no LLM API was called; all token/cost figures are offline `js-tiktoken` `o200k_base` reconstructions or arithmetic).
- **Repo commit at audit time:** `32510eb`
- **Audience:** an external architect designing a map-reduce refactor of the digest pipeline (generalizing OPEN-TASKS #18 two-pass extraction and #28 K-run voting). This document is self-contained; the codebase is not required to read it.

**Reading conventions.** Every load-bearing number has a **self-contained** provenance path in *this* document: either a `file:line`, a runnable query in §13, or shown arithmetic. **One documented exception:** gpt-4o-mini's **16,384-token max-output ceiling** is an OpenAI *model-spec value / model knowledge*, not a repo/DB-derivable figure — it is correct for gpt-4o-mini but has no `file:line`/§13-query/arithmetic path here (grep confirms **no `max_tokens` is set in code**, so nothing in the repo emits it); it is flagged as such at each use (§3c note). Reconstructed output-token counts are **LOWER BOUNDS** and are marked wherever they appear. Estimates/reconstructions are labelled `[MODELLED]` / `[RECONSTRUCTED]`. Prices are **VERIFIED** (§7); no dollar figure requires an UNVERIFIED-PRICE label. `UNKNOWN` means not determinable from repo/DB — the follow-up location is given in §12. The corpus is a **live production feed**; counts drift **sub-0.2% within the ~20-minute audit window** (as-of `~2026-07-09 11:2x–11:4x UTC`), but the absolute drift is *not* single-digit over longer gaps — on re-measure `raw_documents` moved 46,345 → 46,404 (+59) and the 14-day ru/ua/ir totals moved by ~180 rows. Treat every count as an as-of-snapshot, not a fixed fact.

**Provenance of the `fNN` references.** Citations like `f03 §5` point to companion working-note files (`f01`–`f13`) produced during the audit; they are **not required** to read this document — every number they support is *also* reachable here via a `file:line`, a §13 query, or inline arithmetic. What each covers: **f01** pipeline flow; **f02** prompts + response schema (verbatim); **f03** the three representative days (tokens, funnels); **f04** schema/traceability/near-dupe; **f05** 14-day volumes + gather saturation; **f06** LLM call sites + spend-guard; **f07** models/tiers/rate-limits/pricing; **f08** cron inventory + call arithmetic; **f09** incremental-processing readiness; **f10** language handling; **f11** doc-arrival dynamics; **f12** ISW timing + ingest cadence; **f13** measured cost + redundancy factor.

---

## 1. Executive summary

**Terms.** *theater* = a `country_iso2` conflict feed (ru, ua, ir, …); *adapter* = an ingest connector / document source-type (`x_api, telegram_web, rss, gdelt, manual`); *digest-day* = one `(country, date)` corpus, extracted separately per track. All `MIX_CAP_FRACTION`-derived caps (240, 40) assume the shipped default 0.4 is live; the deployed Vercel value is UNKNOWN (§12 #5), and the "240 cap binds" thesis is conditional on it.

**Pipeline — five stages:**
- **(1) Ingest:** 10 cron jobs write `raw_documents` (46,345 rows; `count(*)`), one row per fetched doc, across 5 adapters (§8).
- **(2) Gather:** per `(country,date,track)` the digest cron pulls one UTC-day corpus (SQL `digest.ts:60-81`, `LIMIT 600`, per-adapter rank cap `ceil(600·0.4)=240` — see Terms) (§2 stage C).
- **(3) Reduce:** track-lexicon prefilter → minhash near-dupe collapse (0.7) → source-mix quota (`MAX_DOCS=100`, `ceil(100·0.4)=40` per-adapter/platform cap) (§2 stages D–F, §5c source shown).
- **(4) Extract:** **one `gpt-4o-mini` call** turns the batch into events→claims with cited `docIds`; truncation ladder `[docs.length,50,25]` (`digest.ts:130`), **no `max_tokens`** (§2 stage I, §3).
- **(5) Persist:** docId-validation gate + single-transaction write to `events/claims/claim_sources/claim_entities`, guarded by a deferred `claim_must_have_source` trigger (§2 stages J–L, §5a).
- **Three binding constraints** (conditional on shipped `MIX_CAP_FRACTION=0.4`, §12 #5): (a) the **240 per-adapter gather cap** — binds on **all 38** day×theater×adapter cells with >240 eligible docs (**38 of 38**; every such cell is necessarily clipped by the rank≤240 cap — the "39" is the coarser *day×theater* grain, §6a line 530, not this day×theater×adapter statement), not the 600 limit; (b) `MAX_DOCS=100` — the model sees ≤100 of up to 5,095 eligible docs (RU 07-08: 51× compression, §4a); (c) the **16,384-token model OUTPUT ceiling** [gpt-4o-mini model-spec value / model knowledge, **not** a repo/DB figure — flagged per the line-9 convention, §3c note] — the *only* thing that drives the truncation ladder (input is always <20% of TPM, §4b/§4d).
- **Per-day volumes:** ru+ua+ir 14-day corpus **42,944 raw** / **40,596 eligible** docs; peak day 2026-07-08 = **12,225 raw** / **11,491 eligible** across the three theaters (§6; *raw* = unfiltered `COALESCE(published_at,fetched_at)::date` count, *eligible* = after `length≥40`+non-stub). RU 07-08 funnel: 5,095 eligible → 600 gathered → 571 canonical → **100 analyzed** → 6 events / 8 claims / 10 cited docs (§4a).
- **Current per-day LLM cost:** **≈ $0.16/day** [central, compact-LB; range $0.14–$0.20] — ~88 digest calls/day (unmetered, MODELLED $/call) + 15 validate rounds/day ($0.002254 MEASURED). Monthly ≈ **$4.8** (range $4.2–$6.0). Only ~1–2% of true LLM spend is metered; ~98% is the **unmetered digest path** (records nothing to `provider_usage`; §7c).
- **Refactor headline:** each digest-day is re-extracted **8× (schedule-derived floor) → ~10.2× (modelled, +track overlap)** from scratch (§11); a per-doc map collapses this to once-ever, but the **reduce inherits cross-doc corroboration** — a real but *weak* signal, **not** the driver of `confirmed` or of confidence: only **33% of `confirmed` claims are multi-doc** (70/211; the other 141 cite a single doc and are markable by a per-doc map under HARD RULE 3), and confidence tracks **source reliability**, not corroboration (single-doc claims avg 0.596 vs multi-doc 0.602 — a 0.006 gap; §9b/§11).

---

## 2. Pipeline flow trace

Serial, single-request matrix. Entry → persist. Provenance: `src/app/api/cron/digest/route.ts`, `src/lib/analysis/{digest,tracks,minhash,source-mix,lang,provider,openai-provider}.ts` (f01).

| Stage | File:function | In → Out (counts) | Key params | Failure / retry |
|---|---|---|---|---|
| **A. Cron auth + matrix** | `route.ts:23-75` GET | HTTP → `{ok,results[]}` | `maxDuration=800`; `dates=[yesterday,today]` (UTC, `route.ts:31`); active countries `WHERE status='active'` filtered by `GROUPS[group]` (core=ru\|ua, gulf=rest); `tracks=[military,elite_politics,nuclear]`; loop `for date{for country{for track}}` **serial** | 401 if bad `CRON_SECRET`; per-digest errors caught into `results` (`route.ts:63-70`); `null` returns dropped silently. Timeout kills last-sorted theaters (B1). |
| **B. Track gate + country id** | `digest.ts:43-57` | `(iso2,date,track)` → `countryId` or `null` | gate `if(!trackCfg.countries.includes(iso2)) return null`; new `Pool` per call | unknown country throws; `pool.end()` in finally |
| **C. Gather SQL** | `digest.ts:60-81` | day corpus → `docRows` ≤**600** | `row_number() OVER (PARTITION BY adapter ORDER BY COALESCE(reliability,0.3) DESC, published_at DESC NULLS LAST)`; outer `WHERE adapter_rank ≤ ceil(600·`capFraction`)` = **240 assuming shipped `MIX_CAP_FRACTION=0.4`; deployed value UNKNOWN (§12 #5)** — `capFraction()` reads env `MIX_CAP_FRACTION` (`digest.ts:26-29`), `=1` disables the quota entirely; `length(content)≥40`; `content NOT LIKE '[STUB FIXTURE]%'`; window `COALESCE(published_at,fetched_at) ∈ [date, date+1d)` UTC; `LIMIT 600` | 0 rows → `console.warn` + `return null`. Whole UTC day re-gathered every run (B2). |
| **D. Track lexicon prefilter** | `digest.ts:89-96` | `docRows` → `trackRows` | `lexicon = lexiconByCountry?.[iso2] ?? trackCfg.lexicon`, tested on `(title+" "+content).slice(0,1500)`, `"i"`. **military `lexicon=null` ⇒ no-op** (`trackRows=docRows`), except `ir` military → IRAN_MILITARY_LEXICON | 0 rows → warn + `null` |
| **E. Near-dupe collapse** | `minhash.ts:64-89` (`findNearDuplicates`) | `trackRows` → `canonicalIdx` | minhash NUM_HASHES=64, BANDS=16 (4 rows/band), 3-word shingles, threshold **0.7** on `.slice(0,2000)`; first-seen (=highest-reliability) wins canonical; non-canonical **dropped from all later stages** | pure fn, deterministic |
| **F. Source-mix quota** | `source-mix.ts:26-60` (`selectSourceMix`) | canonical rows → `selectedRows` ≤**100** | `cap=max(1,ceil(100·capFraction))` = **40 assuming `MIX_CAP_FRACTION=0.4` (deployed UNKNOWN, §12 #5)** per adapter AND per platform (`platform ?? "unknown"`); overflow round-robin; **interleave-by-adapter** so any prefix keeps mix; `capFraction≥1` short-circuits to reliability order (source shown §5c) | — |
| **G. AnalysisInputDoc map** | `digest.ts:111-122` | `selectedRows` → `docs` | `lang: d.lang ?? detectLang(content)` (display only, **not** sent to model); `reliability`→Number or null | — |
| **H. Provider select** | `provider.ts:58-78` (`getProvider`) | → provider | prod (`OPENAI_API_KEY` set) ⇒ **OpenAiProvider** | dynamic import |
| **I. Analyze + truncation ladder** | `digest.ts:128-148`; `openai-provider.ts:93-158` | `docs` → `analysis.events`, `docsSent=batch` | ladder `for size of [docs.length,50,25]`, `batch=docs.slice(0,size)`; `model=gpt-4o-mini`, `temp=0.2`, `json_schema strict`, **no max_tokens** | `includes("truncated") && size>25` → warn + `continue`; else rethrow. 429 → sleep 65s + 1 retry (in provider). After ladder: `throw "analysis unavailable after retries"`. Degenerate for `docs.length≤25` / 26–49 (B5, O2). |
| **J. docId validation gate** | `digest.ts:150-162` | events → filtered events + `dropped` | `validIds=Set(docsSent.map(id))`; per claim `docIds=[...new Set].filter(validIds.has)`; drop claim if empty; drop event if 0 claims. `droppedClaims` **not persisted** | — |
| **K. Empty-extraction guard** | `digest.ts:170-185` | 0 events → keep prior? | if 0 events and prior digest has claims (SQL) → warn + `return null`. Else persist empty digest | guards the **2026-07-07 ua incident** — a regen that extracted 0 events would have *overwritten* a good prior UA digest with an empty one; this guard keeps the prior claims instead |
| **L. Single-tx persist** | `digest.ts:188-300` | events → DB | `BEGIN`; upsert `digests` `ON CONFLICT(country_id,digest_date,track)`; `DELETE claims`(cascades claim_sources/claim_entities); `DELETE` orphan events; insert events/claims/claim_sources (`ON CONFLICT DO NOTHING`)/entities; **confidence UPDATE = mean COALESCE(reliability,0.3) over claim_sources** (`digest.ts:277-286`); `renderMarkdown`; `COMMIT` | `ROLLBACK; throw` on error; deferred trigger `claim_must_have_source` aborts tx if any claim lacks a source |

**Batch-context assumptions** (each must move to the reduce under map-reduce): B1 serial matrix / timeout drops last theaters; B2 whole day re-gathered every 6 h; B3 interleave-by-adapter so 50/25 retries stay representative; B4 model may cite only ids in `docsSent`; B5 ladder assumes `docs.length>50`; B6 events keyed (country,date) not (digest,track); B7 confidence UPDATE scoped to `digest_id`.

**Reported observations (not fixed).** O1 — for ru/ua military the LLM providers apply **no relevance filter** (only the stub does), so the model sees the whole deduped day corpus. O2 — ladder degenerates: `docs.length` 26–49 re-sends an identical 50-rung (wasted call); `≤25` is never retried. O3 — near-dupe collapse discards corroboration breadth (non-canonical mirrors never reach `claim_sources`). O4 — minhash is star-shaped (compares to canonical only, first-candidate `break`), not union-find. O5 — `platform ?? "unknown"` lumps null-platform docs into one capped bucket. O6 — persisted `sourceMix.docsAnalyzed` uses `selectedRows.slice(0,docsSent.length)` (parallel reconstruction, currently equal to `docsSent`). O7 — events keyed (country,date) would race across tracks if the matrix were parallelized.

---

## 3. The extraction prompt (verbatim)

Production path is **`openai:gpt-4o-mini`** — the only provider that has ever generated a digest (`SELECT provider,count(*) FROM digests GROUP BY provider` → `openai:gpt-4o-mini | 89`, f02). AnthropicProvider (`max_tokens:4096`) and StubProvider exist but are dormant. `getProvider()` selects OpenAI whenever `OPENAI_API_KEY` is set (`provider.ts:58-78`). The message array is one `system` (resolved track prompt) + one `user` (theater header + doc lines), assembled at `openai-provider.ts:110-125`.

### 3a. System prompts — which (country, track) resolves to which

Rule: `TRACKS[track].systemPromptByCountry?.[iso2] ?? TRACKS[track].systemPrompt ?? SYSTEM` (`digest.ts:134` → `openai-provider.ts:114`). **4 distinct system prompts** are ever sent (f02 §c):

| (country, track) | resolved system prompt | tokens (o200k_base) |
|---|---|---|
| ru,ua,il,sa,ae,qa,om + military | `SYSTEM` (provider default) | **413** (f03 §3) |
| ir + military | IRAN_MILITARY_PROMPT | 551 (f10 §d) |
| ru,ir + elite_politics | ELITE_POLITICS_PROMPT | 562 |
| ir + nuclear | NUCLEAR_PROMPT | 522 |

All four end with the **shared `ENTITY_RULES` block** (`tracks.ts:46-50`, ≈200 tokens; verbatim as the tail of each prompt below). **All four are reproduced verbatim** — the default military `SYSTEM` first (used by the audit's three representative days), then the three track prompts, so an external reader can reconstruct the API call for every one of the 11 configured `(country,track)` pairs, not just the military track.

**DEFAULT military `SYSTEM`** — `openai-provider.ts:72-87`, `${ENTITY_RULES}` expanded inline:

```text
You are an OSINT analyst producing a daily conflict digest.
Input: numbered source documents (id, source, reliability 0-1, text; Russian/Ukrainian/English).
Output: significant events of the day with specific claims.

HARD RULES:
1. Every claim MUST cite docIds — only ids that appear in the input. Never invent ids.
2. A claim is ONE atomic assertion in English (translate as needed), <= 200 chars.
3. hedging: 'confirmed' only for visually/geolocation-corroborated facts;
   'claimed' for single-party assertions; 'unverified' for uncorroborated reports;
   'assessed' for analytic judgments (mark those claimType='assessment').
4. Prefer events corroborated by multiple independent sources; note single-source items as such.
5. Weigh source reliability: low-reliability sources need corroboration before their
   claims lead an event.
6. 5-12 events, most significant first. Do not editorialize beyond the evidence.

ENTITY RULES — entities must be specific, trackable real-world actors:
- ONLY named individuals (first + last name where known), specific agencies/courts ("Investigative Committee", "St. Petersburg City Court"), named companies, named organizations/parties/armed groups.
- NEVER: unnamed or counted people ("five individuals", "an ex-official", "a schoolboy"); collectives ("civilians", "officials", "protesters", "forces personnel"); bare geography as an actor ("Moscow", "Ukraine", "Isfahan"); weapons/equipment/objects ("Su-27", "oil tankers"); diseases/weather/abstractions.
- Use ONE canonical English transliteration without titles/honorifics: "Ali Khamenei" not "Ayatollah Seyyed Ali Khamenei"; "Volodymyr Zelenskyy" not "Zelenskiy".
- If the actor cannot be named specifically, attach no entity at all.
```

**`IRAN_MILITARY_PROMPT`** — `tracks.ts:100-124` (ir/military), `${ENTITY_RULES}` expanded inline:

```text
You are an OSINT analyst producing a daily IRAN-THEATER military/security digest.
Input: numbered source documents (id, source, reliability 0-1; English/Persian/Arabic).
Output: significant military-security developments as events with specific claims.

FOCUS (this theater is posture-and-proxy, not front lines):
- strikes and counterstrikes involving Iran, Israel, or the US (CENTCOM)
- IRGC / Artesh / Quds Force activity: deployments, exercises, commander statements, losses
- proxy and partner attacks: Hezbollah, Houthis (incl. Red Sea shipping), Iraqi militias, Palestinian Islamic Jihad
- maritime incidents: Strait of Hormuz, tanker seizures/harassment, naval movements
- air-defense activity, airspace closures, sabotage at military or nuclear facilities
- arms transfers and missile/drone program developments

HARD RULES:
1. Every claim MUST cite docIds from the input. Never invent ids.
2. One atomic assertion per claim, English (translate Persian/Arabic), <= 200 chars.
3. hedging: 'confirmed' for multi-party/visually corroborated; 'claimed' for single-party
   (state media claims stay 'claimed'); 'unverified' for uncorroborated; analytic
   judgments claimType='assessment', hedging='assessed'.
4. Weigh reliability: state-media (Press TV, IRNA) claims need corroboration before
   leading an event.
5. QUIET DAYS ARE NORMAL: if the day has no genuine military-security development,
   return fewer events (0-2) rather than inflating routine news into events.
6. 0-10 events, most significant first.

ENTITY RULES — entities must be specific, trackable real-world actors:
- ONLY named individuals (first + last name where known), specific agencies/courts ("Investigative Committee", "St. Petersburg City Court"), named companies, named organizations/parties/armed groups.
- NEVER: unnamed or counted people ("five individuals", "an ex-official", "a schoolboy"); collectives ("civilians", "officials", "protesters", "forces personnel"); bare geography as an actor ("Moscow", "Ukraine", "Isfahan"); weapons/equipment/objects ("Su-27", "oil tankers"); diseases/weather/abstractions.
- Use ONE canonical English transliteration without titles/honorifics: "Ali Khamenei" not "Ayatollah Seyyed Ali Khamenei"; "Volodymyr Zelenskyy" not "Zelenskiy".
- If the actor cannot be named specifically, attach no entity at all.
```

**`ELITE_POLITICS_PROMPT`** — `tracks.ts:52-70` (ru & ir / elite_politics), `${ENTITY_RULES}` expanded inline:

```text
You are an analyst tracking Russian ELITE POLITICS through open sources: criminal prosecutions, corruption cases, asset seizures/nationalizations, gang/organized-crime trials with political links, appointments, dismissals, and suspicious deaths of officials or businessmen.
Input: numbered source documents (id, source, reliability 0-1; Russian/Ukrainian/English).
Output: significant developments as events with specific claims.

ANALYTICAL FRAME — every event should answer where possible:
- WHO is targeted (person/company) and WHICH NETWORK/FACTION they belong to (patron, agency affiliation, region, industry).
- WHICH ORGAN is acting (FSB, Investigative Committee, Prosecutor General, MVD, courts) — the acting agency is itself a factional signal.
- WHAT the likely signal is (faction losing cover, asset redistribution, purge, intra-siloviki turf war). Mark such interpretations claimType='assessment', hedging='assessed'.

HARD RULES:
1. Every claim MUST cite docIds from the input. Never invent ids.
2. One atomic assertion per claim, English, <= 200 chars.
3. For each claim list involved entities: {name (canonical English), kind (person|agency|company|faction|org), role (defendant|prosecutor|target|beneficiary|appointee|dismissed|patron|other)}.
4. Facts get hedging claimed/confirmed/unverified per sourcing; factional interpretation is ALWAYS 'assessed'.
5. Ignore routine crime with no political/elite dimension.
6. event type: prosecution|asset_seizure|appointment|dismissal|elite_death|gang_case|other.
7. 4-10 events, most significant first.

ENTITY RULES — entities must be specific, trackable real-world actors:
- ONLY named individuals (first + last name where known), specific agencies/courts ("Investigative Committee", "St. Petersburg City Court"), named companies, named organizations/parties/armed groups.
- NEVER: unnamed or counted people ("five individuals", "an ex-official", "a schoolboy"); collectives ("civilians", "officials", "protesters", "forces personnel"); bare geography as an actor ("Moscow", "Ukraine", "Isfahan"); weapons/equipment/objects ("Su-27", "oil tankers"); diseases/weather/abstractions.
- Use ONE canonical English transliteration without titles/honorifics: "Ali Khamenei" not "Ayatollah Seyyed Ali Khamenei"; "Volodymyr Zelenskyy" not "Zelenskiy".
- If the actor cannot be named specifically, attach no entity at all.
```

**`NUCLEAR_PROMPT`** — `tracks.ts:140-160` (ir/nuclear), `${ENTITY_RULES}` expanded inline:

```text
You are a nonproliferation analyst tracking IRAN'S NUCLEAR PROGRAM through open sources.
Input: numbered source documents (id, source, reliability 0-1; English/Persian/Arabic).
Output: significant nuclear-related developments as events with specific claims.

FOCUS: enrichment level & stockpile changes, IAEA reporting/access/inspections, facility
activity (Natanz, Fordow, Isfahan, Arak, Bushehr), centrifuge installation/type, sabotage
or strikes on facilities, breakout-time implications, diplomatic status (JCPOA/talks),
weaponization indicators.

HARD RULES:
1. Every claim MUST cite docIds from the input. Never invent ids.
2. One atomic assertion per claim, English (translate Persian/Arabic), <= 200 chars.
3. Technical facts get hedging per sourcing (confirmed if IAEA/geolocated; claimed if
   single-party; unverified if uncorroborated). Analytic judgments (breakout estimates,
   intent) are claimType='assessment', hedging='assessed'.
4. For each claim list involved entities: {name, kind (person|agency|company|faction|org),
   role (target|operator|inspector|official|other)} — e.g. IAEA, AEOI, IRGC, facilities.
5. event type: enrichment|iaea|facility|sabotage|diplomacy|weaponization|other.
6. Do not sensationalize; distinguish reported from assessed. 4-10 events.

ENTITY RULES — entities must be specific, trackable real-world actors:
- ONLY named individuals (first + last name where known), specific agencies/courts ("Investigative Committee", "St. Petersburg City Court"), named companies, named organizations/parties/armed groups.
- NEVER: unnamed or counted people ("five individuals", "an ex-official", "a schoolboy"); collectives ("civilians", "officials", "protesters", "forces personnel"); bare geography as an actor ("Moscow", "Ukraine", "Isfahan"); weapons/equipment/objects ("Su-27", "oil tankers"); diseases/weather/abstractions.
- Use ONE canonical English transliteration without titles/honorifics: "Ali Khamenei" not "Ayatollah Seyyed Ali Khamenei"; "Volodymyr Zelenskyy" not "Zelenskiy".
- If the actor cannot be named specifically, attach no entity at all.
```

Note the tokenizer counts above (551 / 562 / 522) are `o200k_base` measures of each full prompt including the shared `ENTITY_RULES` tail; the three prompts differ from military `SYSTEM` only in the head, not the tail.

> **Latent schema/prompt mismatch** (f02 §e): the JSON-schema `type` enum is the **military vocabulary only** (`strike|advance|air_defense|political|economic|other`), but elite_politics and nuclear prompts ask for different `type` strings not in that enum. Under `strict:true` the model must still pick from the military enum. Also `entities` is `required[]` in the schema for **every** claim on **every** track, so military claims carry a (usually empty) `entities` array despite the military prompt never mentioning entities.

### 3b. User message + doc serialization (verbatim)

Template (`openai-provider.ts:117`): `` `Theater: ${iso2.toUpperCase()} · Date: ${date}\n\nDocuments:\n${docLines}` `` (`·` = U+00B7). Per-doc line (`openai-provider.ts:99-108`), `\n`-joined:

```js
const docLines = docs.map((d) =>
  `[${d.id}] (${d.sourceKey ?? "unknown"}, rel=${d.reliability?.toFixed(2) ?? "?"}) ${(
    (d.title ? d.title + ". " : "") + d.content
  ).replace(/\s+/g, " ").slice(0, 400)}`).join("\n");
```

Semantics: `[id]` = raw_documents.id (the id the model must cite); `sourceKey` = `sources.canonical_url` or literal `unknown`; `rel=NN` = reliability to 2 dp or literal `?`. **`.slice(0,400)` is applied to the collapsed body only, AFTER the `[id] (src, rel) ` prefix is stripped** — so the rendered line can exceed 400 chars; truncation counts **characters, not tokens**; **`lang` is not included in the prompt at all**. Real rendered example (raw_documents.id 497520, ru, novayagazeta.eu, reliability 0.4885→`0.49`; f02 §d): prefix = 37 chars, collapsed body 3188 chars → sliced to 400 (cuts mid-word), full line = 437 chars = **121 tokens** (o200k_base).

**Framing-header token count (isolated).** The header that precedes the doc lines — `` `Theater: RU · Date: 2026-07-08\n\nDocuments:\n` `` — is **17 tokens** (o200k_base, measured offline via `scratchpad/fram.mjs`; f06's earlier "~7 chat framing" was an under-count). This isolates the fixed framing term so a **single-doc input cost** is computable independently: `single-doc input = system(413 mil) + framing(17) + one doc-line`. For a mean RU doc-line (71.9 tok, §4b) that is **413 + 17 + 72 ≈ 502 tokens**; for the heaviest observed line (id 497520, 121 tok) it is **413 + 17 + 121 = 551 tokens**. (Used by the per-doc map arithmetic in §11.)

> **The exact 100-doc ru/2026-07-08 user message is NOT reproducible from this document alone** — and cannot be, because *which* 100 of the 571 canonical survivors are sent, and their interleave-by-adapter ordering, are computed by `selectSourceMix` (source shown §5c) over a DB query the reader does not hold. Only the deterministic **inputs** are enumerable here: (i) the 571 canonical raw_document ids in gather order (`COALESCE(reliability,0.3) DESC, published_at DESC NULLS LAST`; the gather SQL is in §13), (ii) each doc's `adapter`/`platform` (for the 40-cap) and `sourceKey`/`reliability`/`title`/`content` (for the line), and (iii) the caps (`MAX_DOCS=100`, per-adapter/platform `cap=40`). Given those three, running the verbatim `selectSourceMix` loop (§5c) + the doc-line serializer above reproduces the message byte-for-byte — which is exactly how §4's token counts were validated to reproduce the persisted `stats.docsAnalyzed.byAdapter` **exactly** (§4 intro). Absent the DB, one example line (id 497520) is the most any reader can render standalone.

### 3c. Response schema (verbatim) — `openai-provider.ts:15-70`

```js
const RESPONSE_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: { events: { type: "array", items: {
    type: "object", additionalProperties: false,
    properties: {
      title: { type: "string" },
      type: { type: "string", enum: ["strike","advance","air_defense","political","economic","other"] },
      summary: { type: "string" },
      claims: { type: "array", items: {
        type: "object", additionalProperties: false,
        properties: {
          text: { type: "string" },
          claimType: { type: "string", enum: ["factual","assessment"] },
          hedging: { type: "string", enum: ["confirmed","claimed","unverified","assessed","unknown"] },
          docIds: { type: "array", items: { type: "integer" } },
          entities: { type: "array", items: {
            type: "object", additionalProperties: false,
            properties: {
              name: { type: "string" },
              kind: { type: "string", enum: ["person","agency","company","faction","org"] },
              role: { type: "string" } },
            required: ["name","kind","role"] } },
        },
        required: ["text","claimType","hedging","docIds","entities"] } },
    },
    required: ["title","type","summary","claims"] } } },
  required: ["events"],
} as const;
```

API params (`openai-provider.ts:110-125`): `response_format:{type:"json_schema",json_schema:{name:"digest",schema:RESPONSE_SCHEMA,strict:true}}`, `temperature:0.2`, **no `max_tokens`/`max_completion_tokens`** (grep confirms absent), no `n`/`top_p`/`seed`/`stream`. Because no output cap is set, the model's own **16,384-token** gpt-4o-mini ceiling applies; `finish_reason==="length"` throws `"openai-provider: response truncated (finish_reason=length)"` (`:148-149`) — the string the ladder matches. **§3c note (16,384 provenance):** the *behavior* — truncation on `finish_reason==='length'` — is code-observed (`:148-149`); the *number* 16,384 is **not** in code (grep confirms no `max_tokens`/`max_completion_tokens` is set, so nothing in the repo emits or reads it) and is **not** the §7 web-cited figure (that source enumerates price + RPM 500 + TPM 200,000 only, with no max-output column). 16,384 is gpt-4o-mini's real max output tokens taken from the **OpenAI model spec (model knowledge)**, so per the line-9 convention it is flagged as a model-spec value rather than a `file:line`/§13-query/arithmetic-sourced number. It is factually correct for gpt-4o-mini; only its provenance class is being labeled. `TS/schema mismatch`: `ExtractedClaim.entities?` is optional in TS (`provider.ts:27`) but required in the schema; runtime tolerates absence via `c.entities ?? []`.

**Prompts and completions are NOT persisted anywhere** (f02 §h). `digests.structured` holds only `stats` (`SELECT DISTINCT jsonb_object_keys(structured) FROM digests` → `stats` only); the provider never reads `completion.usage` (grep: 0 hits in `openai-provider.ts`); no `provider_usage` row is written for the digest LLM call. **Consequence: all digest token/cost figures in this document are offline reconstructions, never read back from OpenAI.**

---

## 4. Measured numbers — three representative days

All three are **military** track (lexicon no-op, `trackRows===docRows`). Reconstruction fidelity is **proven**: the offline `selectSourceMix` reproduces the persisted `structured.stats.sourceMix.docsAnalyzed.byAdapter` **exactly** for all three days (f03 §0). Script `scratchpad/f03_recon.mjs`, tokenizer `js-tiktoken o200k_base`.

### 4a. Per-stage docs-in/docs-out funnel

**Persisted-stat → stage key** (`structured.stats`, written `digest.ts:193-204`): **`stats.docsRaw` = stage C output** (gathered ≤600, post-240-cap); **`stats.trackRows` = stage D output** (post track-lexicon prefilter; military = no-op so `trackRows = docsRaw`); **`stats.docsAnalyzed` = stage I batch actually sent** (post near-dupe + source-mix + truncation ladder). `stats.sourceMix.{docsRaw,trackRows,docsAnalyzed}` carry the per-adapter/per-platform breakdown of the same three grains. The near-dupe canonical count (stage E) is **not** persisted (§5b).

| Stage | HEAVY RU (ru/07-08, digest 289) | TYPICAL UA (ua/07-03, digest 31) | TRUNCATION UA (ua/07-02, digest 29) |
|---|---:|---:|---:|
| True unfiltered UTC-day corpus | 5,479 | 213 | 138 |
| After `length≥40` + non-stub (no cap) | 5,095 | 166 | 111 |
| Gather `docsRaw` (rank≤240, LIMIT 600) | **600** (SATURATED) | 166 | 111 |
| `trackRows` (military no-op) | 600 | 166 | 111 |
| Near-dupe canonical survivors (0.7) `[RECONSTRUCTED]` | 571 (29 collapsed, 4.8%) | 157 (9 collapsed) | 99 (12 collapsed) |
| Source-mix `docs` (≤100) | 100 | 100 | 99 |
| **Batch actually sent `docsAnalyzed`** | **100** | **100** | **25** (after 2 truncations) |
| Events persisted | 6 | 8 | 11 |
| Claims persisted | 8 | 8 | 11 |
| claim_sources rows | 10 | 9 | 14 |
| Distinct docs cited (% of sent) | 10 (10%) | 9 (9%) | 11 (44%) |
| claim_entities rows | 8 | 4 | 1 |
| Dropped claims (Stage J) | **UNKNOWN — not persisted** | UNKNOWN | UNKNOWN |

Persisted `stats` reproduce exactly on re-run today, including full `byAdapter` composition (f03 §2). RU is **saturated but stable**: 5,095 eligible is ~8.5× the 600 gather sample and **~51× what the model sees** (5,095/100). The near-dupe collapse (~5%) is **not** the dominant loss stage — the `MAX_DOCS=100` cap + source-mix quota discard ~94% of the discarded volume (471 of 500 dropped from the RU 571→100 step; f04 §c).

> **Correction to the task brief** (f03 §1C): the truncation exemplar's first ladder rung is `docs.length` **AFTER dedupe+source-mix = 99**, not 111 (=`docsRaw`). The ladder that fired was **[99→truncated, 50→truncated, 25→success]**.

### 4b. Token counts — INPUT (measured, o200k_base)

The `% of TPM` column is computed against the **published Tier-1 gpt-4o-mini TPM = 200,000** (§7b), *not* the in-code "60K TPM" belief, which matches no gpt-4o-mini tier and is debunked in §7b (the 60K was gpt-3.5-turbo's Tier-1 figure). A reader who reaches §4 first should ignore any "60K" framing.

| Day | docs sent | system tok | user tok | **total input** | mean/doc-line | max | vs 200K TPM |
|---|---:|---:|---:|---:|---:|---:|---:|
| RU 07-08 | 100 | 413 | 7,284 | **7,697** | 71.9 | 163 | 3.8% |
| UA 07-03 | 100 | 413 | 11,017 | **11,430** | 109.5 | 218 | 5.7% |
| UA 07-02 rung1 | 99 | 413 | 8,643 | **9,056** | — | — | 4.5% (truncated) |
| UA 07-02 rung2 | 50 | 413 | 5,691 | **6,104** | — | — | 3.1% (truncated) |
| UA 07-02 rung3 | 25 | 413 | 3,542 | **3,955** | 140.2 | 210 | 2.0% (success) |

Input is **never the binding constraint** — even the densest full batch is <6% of the real Tier-1 200K TPM (and <20% even of the debunked 60K figure; f03 §3). UA costs more input than heavier RU because uk/mixed text is denser (§9d; ru 0.289 tok/char vs uk 0.383).

> **Reconstruction variance to surface (not resolved):** three fragments independently reconstructed the RU 07-08 batch and got slightly different user-token totals — f03: 7,284 user / **7,697** total; f06: 7,219 user / ~7,650 total; f07: 7,392 user / 7,805 total. The spread (~±1.5%) reflects minor differences in whitespace/framing accounting across scripts; the audit uses **f03's 7,697** as canonical (its source-mix composition is proven exact). All three agree the system prompt = 413 and input ≪ any rate limit.

### 4c. Token counts — OUTPUT (RECONSTRUCTED LOWER BOUND)

Raw responses are not persisted; the lower bound re-serializes the *surviving* persisted events/claims/entities into `RESPONSE_SCHEMA` and tokenizes (f03 §5). **These are lower bounds** — the real response also held JSON whitespace the model emitted (pretty column is a closer proxy) and any claims later dropped by Stage J (gone from the DB).

| Day (digest) | events | claims | compact-JSON tok (LB) | pretty-JSON tok |
|---|---:|---:|---:|---:|
| RU 07-08 (289) | 6 | 8 | **734** | 1,119 |
| UA 07-03 (31) | 8 | 8 | **718** | 1,081 |
| UA 07-02 (29, rung3) | 11 | 11 | **1,007** | 1,448 |

(f06 independently reconstructed RU output at **676** compact — another lower-bound reconstruction; the audit uses f03's 734 as canonical. Both are floors.)

### 4d. The output ceiling is the binding constraint (truncation exemplar)

For UA 07-02 the retry ladder is driven **entirely by the 16,384-token OUTPUT ceiling** (a gpt-4o-mini model-spec value, not a code-set/DB figure — §3c note), never input TPM or the 128K context window (f03 §6). The blow-up is **non-linear**: 25 dense uk docs → ~1K output tokens, but 50 docs → ≥16,384 (>11× jump for 2× input). Because no `max_tokens` is set, the model runs to the full 16,384 default before truncating, is billed for it, and the response is **thrown away**. **Refactor consequence:** raising `MAX_DOCS` to exploit the large input TPM headroom (§10) would make truncation *more* frequent — output, not input, saturates.

### 4e. Wall-clock (from `digests.created_at` deltas, f03 §7)

The RU heavy digest (289) was written by the scheduled **core** cron at 2026-07-09 06:30 UTC. The whole 6-digest core run took **~64s** (06:30:29 → 06:31:33); per-digest deltas 6–18s; a RU military digest completes in **~15–30s**. The gulf run (16 digests) took ~138s (~8.6s each).

> **Contradicts AGENTS.md / AUDIT-2026-07-06.md** (§0 drift): those docs claim a RU military digest "takes ~3m40s under TPM throttle." No digest in the 2026-07-09 run took anywhere near that; no 65s 429-sleep fired. The 3m40s figure is stale — it required a 429→65s-sleep→retry that is **not** currently occurring.

---

## 5. Data model & traceability

Row counts (`scratchpad/counts.sql`, 2026-07-09; f04 §d):

| table | rows | table | rows | table | rows |
|---|--:|---|--:|---|--:|
| raw_documents | **46,345** | claim_sources | 837 | provider_usage | 9 |
| sources | 11,024 | entities | 447 | ask_usage | 4 |
| source_theater_stats | 10,583 | claim_entities | 296 | validation_runs | 46 |
| isw_reports | 2,641 | digests | 89 | countries | 11 |
| events | 566 | claims | 584 | provider_state | 1 |

**What each table is for** (one-line gloss): **raw_documents** = every fetched source doc (the ingest sink); **sources** = the source registry — one row per canonical URL/domain with a `reliability_score`; **source_theater_stats** = per-`(source, theater)` citation/reliability aggregates (recomputed by `registry-materialize.ts`); **isw_reports** = scraped **ISW** (*Institute for the Study of War*) daily assessments — ROCA (*Russian Offensive Campaign Assessment*, ru+ua) and Iran Update — used as the external ground-truth for validation (§10b); **events**/**claims** = the digest output (an event groups claims; a claim is one atomic cited assertion); **claim_sources** = the M:N claim↔raw_document traceability join; **claim_entities**/**entities** = extracted named actors (get-or-create by `(kind,name)`); **digests** = one row per `(country,date,track)` with the `structured.stats` blob + rendered markdown; **validation_runs** = one row per `(digest, isw_report)` scoring pass (coverage / unsupported-rate / timeliness); **provider_usage** = the spend ledger (per `(provider, day)`; the digest LLM path writes **nothing** here, §7c); **ask_usage** = per-question `/ask` spend log; **provider_state** = poll watermarks (only `x_api`'s `lastPollAt`); **countries** = the 11 theater configs (8 active).

### 5a. The claim → doc → source invariant, and how it is enforced

Storage chain: `claims.id ─(claim_sources.claim_id)→ claim_sources ─(raw_document_id)→ raw_documents.id ─(source_id, nullable)→ sources.id`. `claim_sources` is a pure M:N join (PK `(claim_id, raw_document_id)`, no surrogate). Measured fan-out: **837 links / 584 claims = 1.43 docs/claim** (f04 §b).

**Two independent enforcement gates:**
1. **App-layer (anti-hallucination), `digest.ts:150-162`:** `validIds = Set(docsSent.map(id))`; each claim's `docIds` is intersected with the actually-sent batch; claims citing only invented/out-of-batch ids are stripped and dropped (surfaced as `droppedClaims`, not persisted). A claim citing only hallucinated ids never reaches INSERT.
2. **DB-layer (deferred constraint trigger).** `claim_must_have_source AFTER INSERT ON claims DEFERRABLE INITIALLY DEFERRED` runs `enforce_claim_has_source()` at COMMIT (verbatim, `proc.json`):
```sql
CREATE OR REPLACE FUNCTION public.enforce_claim_has_source() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM claim_sources WHERE claim_id = NEW.id) THEN
    RAISE EXCEPTION 'claim % has no source documents (traceability invariant)', NEW.id;
  END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;
```
Any claim committed with zero `claim_sources` aborts the whole transaction → `ROLLBACK` (`digest.ts:295-297`) → **no partial digest ever persisted**. **Gap:** the trigger fires only `AFTER INSERT`; deleting a claim's last source or an UPDATE does not re-check (the app never does this — regen deletes whole claims via cascade). Live verification (`scratchpad/verify.sql`): **0 claims with no source; 0 dangling doc references**; invariant holds. Integration tests assert it (`hardening.itest.ts:33-47,49-72,116-140`, provider forced to stub).

**Reliability floor.** 1,112/46,345 raw_documents (2.40%) have NULL `source_id`; every consumer coalesces to **0.3** (gather order `digest.ts:67,78`; confidence `digest.ts:279`). Effective-NULL reliability (NULL source_id OR NULL score) = **3,239/46,345 (7.0%)** — reliability-indistinguishable at the 0.3 floor, so reliability ordering degrades to a `published_at DESC` tiebreak for that slice (f04 §b).

### 5b. Near-dupe handling (quantified)

Minhash (`minhash.ts`): 3-word shingles, 64 hashes, 16 bands × 4 rows, threshold **0.7** (`digest.ts:100`), first-seen (=highest-reliability, because input is reliability-ordered) wins canonical. **Non-canonical docs are simply not selected** — never sent to the LLM, never in `claim_sources`; **no merge, no seen-in record, and the collapse is not persisted** (recompute offline to know the count). Collapsed docs remain fully queryable in `raw_documents` (`processed` stays false). Offline recompute (`scratchpad/nd.mjs`, verbatim port):

| representative day | docs in | canonical | collapsed | groups |
|---|--:|--:|--:|--:|
| HEAVY RU 07-08 | 600 | 571 | 29 (4.8%) | 28 (27 pairs + 1 triple) |
| TYPICAL UA 07-03 | 166 | 157 | 9 (5.4%) | 9 pairs |

Near-dupe removal is ~5% of the day corpus — **not** the dominant document-loss stage (§4a).

### 5c. Table dumps — columns, indexes, one sample row each

`\d`-style dump per audited table: **columns** (from `information_schema.columns`), **indexes** (from `pg_indexes`; every PK also has an implicit `*_pkey` unique index, omitted unless notable), and **one real sample row** (long text truncated, marked). Provenance: `scratchpad/cols.json`, `idx.json`, `con.json`, `samp1.json`+`samp2b.json` (f04 §a). Enum columns show the pg enum (`udt_name`).

**raw_documents** (46,345) — `id int NN(seq) · adapter text NN · source_id int null · external_id text null · url text null · title text null · content text NN · content_hash text NN · lang text null · country_iso2 text null · published_at timestamptz null · fetched_at timestamptz NN now() · embedding vector(1536) null · processed bool NN false · meta jsonb NN '{}'`.
Indexes: `raw_documents_hash_idx` **UNIQUE(content_hash)**; `_adapter_idx(adapter)`; `_country_idx(country_iso2)`; `_published_idx(published_at)`; `_processed_idx(processed)`. **No index on `source_id`.** FK `source_id→sources(id)` ON DELETE no action (nullable). **Dead columns:** `embedding` NULL for all 46,345 rows; `processed=true` for 0 rows.
Sample: `{id:640388, adapter:"x_api", source_id:9062, external_id:"2075177033424941109", url:"https://x.com/BashaReport/status/2075177033424941109", title:null, content:"Kuwait's Ministry of Defense … intercepted three ballistic missiles, one cruise missile, and ten Iranian drones…"(len 614), content_hash:"3e7cdab7…", lang:"en", country_iso2:"ir", published_at:"2026-07-09T11:15:34Z", fetched_at:"2026-07-09T11:22:04.836Z", has_embedding:false, processed:false, meta:{}}`.

**sources** (11,024) — `id int NN(seq) · canonical_url text NN · domain text NN · platform platform-enum NN 'other' · name text null · country_id int null · citation_count int NN 0 · first_cited_report_date date null · last_cited_report_date date null · hedging_{confirmed,claimed,unverified,assessed,unknown} int NN 0 · reliability_score double null · decayed bool NN false · status source_status-enum NN 'active' · meta jsonb NN '{}' · created_at timestamptz NN now()`.
Indexes: `sources_canonical_url_idx` **UNIQUE(canonical_url)**; `_domain_idx(domain)`; `_platform_idx(platform)`. FK `country_id→countries(id)`. `reliability_score` NULL for **1,060/11,024** sources → 0.3 floor (§5a).
Sample: `{id:12, name:"facebook.com", domain:"facebook.com", platform:"other", country_id:null, canonical_url:"facebook.com", citation_count:26195, reliability_score:0.4975, hedging_claimed:10853, hedging_confirmed:2364, first_cited_report_date:"2022-02-28", last_cited_report_date:"2026-07-03", decayed:false, status:"active"}`.

**digests** (89) — `id int NN(seq) · country_id int NN · digest_date date NN · status digest_status-enum NN 'pending' · structured jsonb NN '{}' · rendered_md text null · provider text null · created_at timestamptz NN now() · track text NN 'military'`.
Indexes: `digests_country_date_track_idx` **UNIQUE(country_id, digest_date, track)** — the ON-CONFLICT target (`digest.ts:208`). FK `country_id→countries(id)`. `structured.stats = {docsAnalyzed, docsRaw, trackRows, sourceMix{docsRaw,trackRows,docsAnalyzed}}`; does **not** record the near-dupe map or collapsed count.
Sample (rendered_md omitted): `{id:431, track:"military", status:"generated", provider:"openai:gpt-4o-mini", country_id:6, digest_date:"2026-07-09", structured:{stats:{docsRaw:1,trackRows:1,docsAnalyzed:1,sourceMix:{docsRaw:{byAdapter:{rss:1},byPlatform:{other:1}},…}}}}`.

**claims** (584) — `id int NN(seq) · country_id int NN · digest_id int null · event_id int null · text text NN · claim_type text NN 'factual' · hedging hedging-enum NN 'unknown' · confidence double null · claim_date date null · created_at timestamptz NN now()`.
Indexes: `claims_country_date_idx(country_id, claim_date)`; `claims_digest_idx(digest_id)`. FKs `country_id→countries`, `digest_id→digests`, `event_id→events`; **CONSTRAINT TRIGGER `claim_must_have_source`** (deferred; §5a). `confidence` = mean COALESCE(source reliability,0.3), set post-insert (`digest.ts:277-286`).
Sample: `{id:3008, text:"The National Center for Environmental Compliance issued 557 violations worth over SR16 million for dust control breaches in Riyadh.", hedging:"claimed", event_id:2959, digest_id:431, claim_date:"2026-07-09", claim_type:"factual", confidence:0.5, country_id:6}`.

**events** (566) — `id int NN(seq) · country_id int NN · event_date date NN · type text NN 'other' · title text NN · summary text null · cluster_key text null · confidence double null · created_at timestamptz NN now()`. **Keyed (country_id, event_date) — no track column** (B6).
Indexes: `events_country_date_idx(country_id, event_date)`. FK `country_id→countries`. `cluster_key`/`confidence` NULL in practice (INSERT omits both, `digest.ts:227-231`).
Sample: `{id:2959, type:"economic", title:"Fines Issued for Dust Control Violations in Riyadh", summary:"The National Center for Environmental Compliance fined construction projects over SR16 million…", confidence:null, country_id:6, event_date:"2026-07-09", cluster_key:null}`.

**claim_sources** (837) — `claim_id int NN · raw_document_id int NN`. **No surrogate id.**
Indexes: PK `claim_sources_claim_id_raw_document_id_pk` **UNIQUE(claim_id, raw_document_id)**; `claim_sources_doc_idx(raw_document_id)`. FK `claim_id→claims(id)` **ON DELETE CASCADE**; FK `raw_document_id→raw_documents(id)` ON DELETE no action (not deferred).
Sample: `{claim_id:3008, raw_document_id:568500}`.

**claim_entities** (296) — `claim_id int NN · entity_id int NN · role text NN 'other'`.
Indexes: PK **UNIQUE(claim_id, entity_id)**; `claim_entities_entity_idx(entity_id)`. FK `claim_id→claims` **ON DELETE CASCADE**; FK `entity_id→entities` (no action).
Sample: `{role:"regulatory authority", claim_id:3008, entity_id:1573}`.

**entities** (447) — `id int NN(seq) · kind text NN 'person' · name text NN · aliases jsonb NN '[]' · meta jsonb NN '{}' · created_at timestamptz NN now()`.
Indexes: `entities_kind_name_idx` **UNIQUE(kind, name)** — the get-or-create key (`digest.ts:261-263`).
Sample: `{id:1573, kind:"agency", name:"National Center for Environmental Compliance", aliases:[], meta:{}}`.

**sources registry (11,024)** is dumped above; the two remaining registry/stat tables:

**source_theater_stats** (10,583) — `source_id int NN · theater text NN · citation_count int NN 0 · first_cited_report_date date null · last_cited_report_date date null · hedging_{confirmed,claimed,unverified,assessed,unknown} int NN 0 · reliability_score double null · decayed bool NN false`.
Indexes: PK `source_theater_stats_source_id_theater_pk` **UNIQUE(source_id, theater)**; `_theater_idx(theater)`. FK `source_id→sources(id)` **ON DELETE CASCADE**.
Sample: `{source_id:12, theater:"ru", citation_count:25454, reliability_score:0.4978, hedging_claimed:10616, hedging_confirmed:2354, first_cited_report_date:"2022-02-28", last_cited_report_date:"2026-07-03", decayed:false}` (per-theater slice of the cross-theater `sources.*` totals; recomputed by `scripts/registry-materialize.ts`).

**validation_runs** (46) — `id int NN(seq) · digest_id int NN · isw_report_id int NN · run_at timestamptz NN now() · coverage_pct double null · unsupported_claim_rate double null · timeliness_hours double null · divergences jsonb NN '[]' · details jsonb NN '{}'`.
Indexes: `validation_runs_digest_report_idx` **UNIQUE(digest_id, isw_report_id)**. FKs `digest_id→digests`, `isw_report_id→isw_reports`.
Sample (arrays truncated): `{id:281, digest_id:299, isw_report_id:2939, coverage_pct:33.3, unsupported_claim_rate:0.25, timeliness_hours:22, details:{matcher:"llm-majority", threshold:0.6, voteRounds:5, ourClaims:4, iswTakeaways:6, matchedPairs:2, theater:"ir", votes:[…6…]}, divergences:[{kind:"agreement", score:0.7, claimId:2938, iswIndex:0, claimText:"Iran threatened to close the Strait of Hormuz…"}, …7 more…]}`.

**provider_usage** (9) — `id int NN(seq) · provider text NN · day date NN · requests int NN 0 · units int NN 0 · est_usd double NN 0 · updated_at timestamptz NN now()`.
Indexes: `provider_usage_provider_day_idx` **UNIQUE(provider, day)**. No FKs. Upsert `ON CONFLICT (provider, day)` sums the counters. **Only providers present: `llm_match`, `opensanctions`, `x_api`** — no `openai`/digest row (§7c).
Sample: `{id:3092, day:"2026-07-09", provider:"opensanctions", requests:9, units:9, est_usd:0.99}`.

**ask_usage** (4) — `id int NN(seq) · user_email text NN · question text NN · provider text null · prompt_tokens int null · completion_tokens int null · cost_usd double NN 0 · created_at timestamptz NN now()`.
Indexes: `ask_usage_email_created_idx(user_email, created_at)`; `ask_usage_created_idx(created_at)`. No FKs.
Sample: `{id:4, user_email:"gregoryoconnor@gmail.com", question:"which russian officials were prosecuted recently?", provider:"openai:gpt-4o-mini", prompt_tokens:2171, completion_tokens:97, cost_usd:0.00038385}`.

**isw_reports** (2,641) — `id int NN(seq) · url text NN · report_date date NN · title text null · fetched_at timestamptz null · parse_status text NN 'pending' · endnote_count int NN 0 · citation_count int NN 0 · derived jsonb NN '{}' · theater text NN 'ru'`.
Indexes: `isw_reports_url_idx` **UNIQUE(url)**; `isw_reports_theater_date_idx` **UNIQUE(theater, report_date)**. No FKs. Real publish wall-clock lives only in `derived->>'publishedAt'` (§10b).
Sample: `{id:2833, url:"https://understandingwar.org/research/middle-east/iran-update-special-report-july-3-2026/", title:"Iran Update Special Report, July 3, 2026", theater:"ir", report_date:"2026-07-03", parse_status:"parsed", endnote_count:31, citation_count:47, derived:{publishedAt:"2026-07-03T21:29:49Z", takeaways:[{index:0,chars:376,actions:[],toponyms:[]},…]}}`.

**provider_state** (1) — `provider text PK · state jsonb NN '{}' · updated_at timestamptz NN now()`. Sample: `{provider:"x_api", state:{lastPollAt:1783596049}, updated_at:"2026-07-09T11:22:04Z"}` (only the x_api poll watermark exists).

**countries** (11) — `id int NN(seq) · iso2 text NN · name text NN · slug text NN · status country_status-enum NN 'scaffolded' · config jsonb NN '{}' · created_at timestamptz NN now()`. Indexes: `countries_iso2_unique` **UNIQUE(iso2)**; `countries_slug_unique` **UNIQUE(slug)**. Sample: `{id:1, iso2:"ru", name:"Russia", slug:"russia", status:"active", config:{}}` (8 active: ae,il,ir,om,qa,ru,sa,ua; bh,kw scaffolded; cn deferred).

**Triggers (whole schema):** exactly **one** — `CREATE CONSTRAINT TRIGGER claim_must_have_source AFTER INSERT ON public.claims DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_claim_has_source()` (`tgenabled='O'`). No `updated_at`/audit triggers; no CHECK constraints on any target table; domains enforced only by the pg enums (`country_status, platform, hedging, source_status, digest_status, plan_interval`).

#### Verbatim reduce cores (so stages E/F are reproducible)

The 571-canonical count and the specific 100 docs selected (§4a) depend on two functions asserted by `file:line` elsewhere; both are dependency-free and deterministic, reproduced here so the reader can rerun them offline (this is exactly what `scratchpad/nd.mjs` and `f03_recon.mjs` port).

**Near-dupe collapse — `minhash.ts` core** (`findNearDuplicates`, NUM_HASHES=64, BANDS=16×4-rows, FNV-1a-variant hash, first-seen-wins, star-shaped `break`):

```ts
function hash32(s, seed) { let h=(0x811c9dc5 ^ seed)>>>0;
  for (let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h,0x01000193)>>>0; } return h>>>0; }
export function findNearDuplicates(texts, threshold = 0.7) {
  const sigs = texts.map((t) => minhashSignature(t));           // per-slot min of hash32(shingle, i*0x9e3779b9)
  const canonicalOf = new Map(); const buckets = new Map();
  const rowsPerBand = NUM_HASHES / BANDS;                        // = 4
  for (let i = 0; i < sigs.length; i++) {
    const candidates = new Set();
    for (let b = 0; b < BANDS; b++) {
      const key = `${b}:` + sigs[i].slice(b*rowsPerBand,(b+1)*rowsPerBand).join(",");
      const bucket = buckets.get(key);
      if (bucket) for (const j of bucket) candidates.add(j);
      buckets.set(key, [...(bucket ?? []), i]);
    }
    for (const j of candidates) {
      const cj = canonicalOf.get(j) ?? j;
      if (canonicalOf.has(i)) break;                            // O4: first candidate wins, not union-find
      if (estimatedJaccard(sigs[i], sigs[cj]) >= threshold) canonicalOf.set(i, cj);
    }
    if (!canonicalOf.has(i)) canonicalOf.set(i, i);
  }
  /* groups built from canonicalOf */ return { groups, canonicalOf };
}
```
Called at `digest.ts:98-101` as `findNearDuplicates(trackRows.map(d => `${d.title??""} ${d.content}`.slice(0,2000)), 0.7)`; only `canonicalIdx = [...new Set(canonicalOf.values())]` survives. Shingles = 3-word, over `normalizeForShingles` (lowercase → strip `https?://\S+` → non-`\p{L}\p{N}`→space → collapse ws).

**Source-mix selection — `source-mix.ts` core** (`selectSourceMix`, `cap=max(1,ceil(maxDocs·capFraction))`, per-adapter & per-platform, overflow round-robin, interleave-by-adapter):

```ts
export function selectSourceMix(docs, maxDocs, capFraction = MIX_CAP_FRACTION /* =0.4 */) {
  if (capFraction >= 1) return docs.slice(0, maxDocs);          // quota disabled → pure reliability order
  const cap = Math.max(1, Math.ceil(maxDocs * capFraction));    // =40 at 0.4/100
  const adapterCount = new Map(), platformCount = new Map(), pickedIdx = [], deferredIdx = [];
  for (let i = 0; i < docs.length && pickedIdx.length < maxDocs; i++) {
    const adapter = docs[i].adapter, platform = docs[i].platform ?? "unknown";   // O5: null→one bucket
    const a = adapterCount.get(adapter) ?? 0, p = platformCount.get(platform) ?? 0;
    if (a < cap && p < cap) { adapterCount.set(adapter,a+1); platformCount.set(platform,p+1); pickedIdx.push(i); }
    else deferredIdx.push(i);
  }
  for (const i of interleaveByAdapter(deferredIdx, docs)) { if (pickedIdx.length >= maxDocs) break; pickedIdx.push(i); }
  return interleaveByAdapter(pickedIdx, docs).map((i) => docs[i]);   // each adapter's best first, then 2nd-best…
}
```
Input `docs` MUST already be reliability-ordered (it is — gather `ORDER BY`). `interleaveByAdapter` re-sorts to `(rank-within-adapter, reliability index)` so any prefix (the 50/25 retry rungs) keeps the mix (B3). This loop reproduces the persisted `sourceMix.docsAnalyzed.byAdapter` **exactly** for all three representative days (§4 intro).

### 5d. Documentation drift (schema.ts / docs vs live DB)

| # | Item | Claim | Reality |
|---|---|---|---|
| D1 | `claim_must_have_source` trigger + fn | Only hand-written raw SQL in `0000_*.sql:241-256`; `schema.ts:263-266` is a **comment**, no Drizzle object | Present + enabled. **`drizzle-kit generate` from schema.ts would NOT reproduce it** — a fresh gen bypassing the curated 0000 migration silently drops the core invariant. |
| D2 | `raw_documents.adapter` comment lists `x`/`acled`/`telegram_mtproto` | schema.ts:179 | Actual adapters: `x_api, telegram_web, rss, gdelt, manual`. `acled`/`telegram_mtproto` never used; adapter is `x_api` not `x`. |
| D3 | `embedding vector(1536)` | declared + `vector` ext installed | **0/46,345 populated** — entirely dead. |
| D4 | `processed boolean` + index | declared, indexed | **0/46,345 true** — dead; gather re-scans by date window. |
| D5 | `events.cluster_key`, `events.confidence` | declared | NULL in practice (INSERT omits both). |

---

## 6. Volumes (14-day, ru/ua/ir)

Per-day × theater × adapter, **eligible** (post `length≥40`+non-stub), `COALESCE(published_at,fetched_at)::date`, UTC (f05 §c). `·`=0. **Column legend:** `gd`=gdelt, `rss`=rss, `tg`=telegram_web, `x`=x_api. These are the *eligible* counts; the **raw unfiltered** counts the exec summary quotes (07-08 = 12,225; 14-day = 42,944) are the same day/window *before* the `length≥40`+non-stub filter — this table's post-filter figures (07-08 DAY TOT **11,491**; 14-day grand **40,596**) are the reconciled eligible totals.

| day | ru/gd | ru/rss | ru/tg | ru/x | ua/gd | ua/rss | ua/tg | ua/x | ir/gd | ir/rss | ir/tg | ir/x | DAY TOT |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| 06-26 | · | 7 | 201 | · | · | · | 15 | · | · | 20 | · | · | 243 |
| 06-27 | · | 1 | 181 | · | · | · | 53 | · | · | · | · | · | 235 |
| 06-28 | · | 14 | 206 | · | · | · | 73 | · | · | · | · | · | 293 |
| 06-29 | · | 24 | 275 | · | · | · | 116 | · | · | 22 | · | · | 437 |
| 06-30 | · | 19 | 337 | 12 | · | · | 78 | · | · | 19 | · | 37 | 502 |
| 07-01 | · | 20 | 341 | 180 | · | · | 98 | 12 | · | 17 | · | 221 | 889 |
| 07-02 | · | 58 | 393 | 199 | · | · | 99 | 12 | · | 16 | · | 257 | 1,034 |
| 07-03 | · | 108 | 477 | 240 | · | 18 | 131 | 17 | · | 18 | 9 | 333 | 1,351 |
| 07-04 | · | 49 | 2,364 | 312 | · | 56 | 134 | 21 | · | 6 | 4 | 299 | 3,245 |
| 07-05 | 489 | 208 | 844 | 371 | 659 | 112 | 266 | 32 | · | 12 | 13 | 367 | 3,373 |
| 07-06 | 125 | 482 | 1,578 | 549 | 499 | 196 | 353 | 78 | · | 222 | 36 | 716 | 4,834 |
| 07-07 | 391 | 555 | 2,358 | 1,147 | 174 | 218 | 333 | 138 | · | 198 | 32 | 2,644 | 8,188 |
| 07-08 | 192 | 490 | 2,576 | 1,837 | 51 | 208 | 354 | 231 | · | 264 | 29 | 5,259 | **11,491** |
| 07-09 | 125 | 179 | 1,111 | 529 | 448 | 59 | 150 | 72 | · | 63 | 12 | 1,733 | 4,481 |

14-day eligible totals: **ru 22,154 · ua 5,564 · ir 12,878 · grand 40,596.** Volume was cold before ~07-04 (telegram-only), then exploded once x_api (onboarded 07-07 19:35Z) + gdelt (from 07-05) came online.

**Adapter coverage is highly asymmetric** (f05 §a): gulf theaters (sa,qa,ae,il,om) are **RSS-only**; gdelt covers **only ru & ua** (0 for ir); ir is **x_api-dominated** (90%); ru is telegram-dominated (61%).

### 6a. Gather-limit saturation — the 240 per-adapter cap binds, not the 600 limit

> **This whole finding is conditional on the shipped default `MIX_CAP_FRACTION=0.4` being live in production** (§12 #5). The 240 = `ceil(600·0.4)` and 40 = `ceil(100·0.4)` both derive from `capFraction()` (`digest.ts:26-29`), which reads the `MIX_CAP_FRACTION` env var; the repo supports overriding it (`=1` disables the quota entirely, filling the batch by pure reliability), and recent commit `586f93c` ("quota A/B verdict") shows it being actively toggled on a Neon branch. Deployed env is UNKNOWN. **If deployed `MIX_CAP_FRACTION ≠ 0.4`, the "240 cap is the binding constraint" conclusion inverts** — at `=1` the 600 `LIMIT` binds instead and single-adapter theaters (ir/x_api) fill the batch. Everything below assumes 0.4.

Gathered = `min(600, Σ_adapter min(n_adapter, 240))` (at `MIX_CAP_FRACTION=0.4`), **validated against the real gather SQL** for 4 cells (f05 §d, wrapped-query method):

| cell | eligible | after 240-cap | GATHERED | clipped adapters (>240) |
|---|--:|--:|--:|---|
| ir / 07-08 | 5,552 | 509 | **509** | rss(264), x_api(5259→240) |
| ru / 07-05 | 1,912 | 928 | **600** | gdelt(489), tg(844), x(371) |
| ru / 07-08 | 5,095 | 912 | **600** | rss(490), tg(2576), x(1837) |
| ua / 07-03 | 166 | 166 | **166** | — |

Key findings (f05 §d): **18 of 39 populated day×theater cells have eligible >600**, but **only 9 actually gather a full 600** — the 240 per-adapter cap binds far more often. **ir can never fill 600** (2 usable adapters → ceiling ~470–509); on its heaviest day (5,552 eligible) it gathers 509 and discards ~91% before the LLM. **38 (day,theater,adapter) cells are clipped by the 240 cap** — worst: ir/x_api 07-08 5,259→240 (95% dropped at gather).

**Content length** (drives token cost, f05 §e): telegram median 236 (31.5% >400), x_api median 188 (15.9% >400), gdelt median 72 (**0% >400** — headline snippets), rss median 140. Content is hard-capped at **8000 chars per adapter** at ingest, verified for **three** adapters — `rss.ts:19`, `telegram-web.ts:28`, `x-api.ts:127` (each `.slice(0,8000)`); the `gdelt` and `manual` adapters were **not** verified to apply it (gdelt snippets are far shorter than 8000 anyway, so the cap is moot there). This is upstream of the digest's own 400-char per-doc-line slice (§3b), so it affects only the `content_hash` input and `/ask` retrieval, not the prompt token count.

**Data-quality flag:** `sa` (Saudi) is badly degraded — 477 fetched but only 61 eligible; **median content length 0** (title-only/empty RSS items); 87% removed by `length<40` (f05 §f). Gulf theaters never approach GATHER_LIMIT (peak single-day eligible: il=130).

---

## 7. Models, limits, spend

**Model = `gpt-4o-mini` everywhere** (`OPENAI_MODEL ?? "gpt-4o-mini"`; `OPENAI_MODEL` unset in `.env.local`). **Price VERIFIED** (`developers.openai.com/api/docs/models/gpt-4o-mini`, WebFetch 2026-07-09, corroborated by WebSearch): **input $0.15/1M, output $0.60/1M** — and the repo's hardcoded constants (`src/lib/ask/limits.ts:43`, `src/lib/validation/llm-match.ts:38-39`) match exactly, so **no dollar figure needs an UNVERIFIED label** (f07 §7, f13 §0).

### 7a. Call sites (4 OpenAI in code; f06)

| Site | File | model | temp | response_format | max_tokens | typical tok in → out | 429 handling | metered? |
|---|---|---|---|---|---|---|---|---|
| **A. Digest extract** (primary cost) | `src/lib/analysis/openai-provider.ts:110-125` | gpt-4o-mini | 0.2 | json_schema strict | **none** | **7.7K–11.4K in → 0.7K–1.0K out** (MEASURED offline, 3 rep days §4b/§4c; LB out) | 65s sleep + 1 retry (429 only) | **NO** |
| B. Validation matcher | `src/lib/validation/llm-match.ts:87-98` | gpt-4o-mini | 0 | json_schema strict | none | **in/out split not persisted → UNKNOWN**; ≈$0.0001503/round (2026-07-09) ⇒ ≈**700–900 prompt + ~100 completion** [RECONSTRUCTED from $/round + price] | none (round dropped) | **YES** (majority path only) |
| C. /ask | `src/lib/ask/answer.ts:65-72` | gpt-4o-mini | 0.1 | none (free text) | none | **2,138 in → 130 out** avg/question (MEASURED, `ask_usage`: 8,552/520 over 4 q) | none | via `ask_usage` |
| D. Entity-audit cron | `src/app/api/cron/entity-audit/route.ts:66-74` | gpt-4o-mini | 0 | json_object | none | **UNKNOWN** — sends the entire entity listing (447 rows now) in one prompt; no past run's usage is persisted (§12 #2) | none | NO (unscheduled) |
| E. Anthropic (dormant) | `src/lib/analysis/anthropic-provider.ts:77-97` | `claude-sonnet-5` (`ANTHROPIC_MODEL`) | 0.2 | — | **4096** | never invoked (no `ANTHROPIC_API_KEY`) | 65s+1 | never invoked |

Per-site token notes: **A** is the only site with offline-reconstructed in/out figures (§4b/§4c); a per-doc-line averages 71.9 tok RU / 109.5 tok UA. **B**'s runtime `usage` is computed (`llm-match.ts:99-101`) but only aggregate USD is stored, so the in/out split is not recoverable from the DB — the token estimate above is back-derived from the measured $/round at the verified $0.15/$0.60 price. **C** is the one site with real persisted token counts (`ask_usage.prompt_tokens`/`completion_tokens`). **D**'s prompt scales with live entity-graph size and is never persisted.

**Spend-guard is wired only into** `enrich/run.ts` (opensanctions), `x-api.ts` (x_api), `llm-match.ts` (llm_match) — **absent from the entire digest path**. Of the 4 OpenAI sites only Site B (matcher, majority branch) writes `provider_usage`. There is **no global OpenAI kill-switch**: `OPENAI_API_KEY` presence alone enables uncapped digest spend (f06 §4,§10).

### 7b. Rate limits — belief vs reality

The **only** rate-limit belief in code is `digest.ts:13-15`: *"Cyrillic tokenizes ~1 token/char in GPT models; 100 docs × 400 chars keeps a full-RU batch under the entry-tier 60K TPM limit."* **Both premises are wrong** (f07 §3, §10 drift): measured Cyrillic is **0.289–0.295 tok/char** (~3.4 chars/token) under o200k_base, not 1.0; a full RU batch is **~7.7–12K prompt tokens**, not 40K; and published **Tier-1 gpt-4o-mini TPM is 200,000**, not 60K (60K matches no gpt-4o-mini tier — it was gpt-3.5-turbo's). `MAX_DOCS=100` is safe but ~3–5× over-conservative on token grounds. **Actual account tier = UNKNOWN from repo** (bounded ≥ Tier 1: gpt-4o-mini not Free-usable, account topped up after `insufficient_quota`, all 89 prod digests OpenAI-authored) → §12.

**Published Tier-1 gpt-4o-mini limits, all three types** (web-sourced `developers.openai.com/api/docs/models/gpt-4o-mini`, WebFetch 2026-07-09): **RPM = 500**, **TPM = 200,000**, **TPD = UNKNOWN** — the model page exposes RPM/TPM per tier but **no distinct TPD column** for gpt-4o-mini (RPD shows "-" for Tier 2+), so any tokens-per-day cap must be confirmed from the dashboard (§12 #4). For scale: higher tiers run TPM 2M (T2) → 4M (T3) → 10M (T4) → 150M (T5); RPM 5,000 (T2/T3) → 10,000 (T4) → 30,000 (T5). These are OpenAI *defaults*; the account's real per-model RPM/TPM/TPD are **UNKNOWN pending the OpenAI limits dashboard** and OpenAI may set account overrides. At 88 digest calls/day the RPM (500/min) has vast headroom; the only limit the pipeline ever reacts to is a 429 TPM window (§7b above), and none fired in the 2026-07-09 runs (§4e).

### 7c. Measured cost per run & monthly spend (f13)

Per call: `cost = in·1.5e-7 + out·6e-7`.

| Day / run | calls | cost | note |
|---|--:|--:|---|
| HEAVY RU 07-08 (289) | 1 | **$0.001595** (compact LB) / $0.001826 (pretty) | in 7,697 + out 734 LB |
| TYPICAL UA 07-03 (31) | 1 | **$0.002145** (compact LB) | in 11,430 + out 718 LB |
| TRUNCATION UA 07-02 (29) | 3 | **$0.02313** | 2 truncated calls billed at 16,384 out each (16,384 = gpt-4o-mini model-spec max output, **not** code-set; §3c note) = **$0.0219 wasted (94.8%)**, ~19× a clean call |
| Validate run (k=5, 3 countries) | 15 | **$0.002254** MEASURED (`provider_usage` 2026-07-09) | the one metered LLM path |

**Per full day:** digest ~88 calls × ~$0.0018 blend ≈ **$0.158** [MODELLED $/call, MEASURED cadence] + validate $0.002254 MEASURED + /ask ~$0 → **≈ $0.16/day** (range $0.14–$0.20). **Per month ≈ $4.8** (range $4.2–$6.0; +10–20% for output-LB floor → ~$5–7). Truncation adds ~$0.022 per event, frequency currently ~0 (f13 §c).

**The metering gap, stated loudly** (f13 §e): `provider_usage` records **only** the matcher ($0.0497 all-time). The digest path — the primary cost driver — records **$0.00**. Recorded LLM spend captures roughly **~1–2% of true LLM spend; ~98% is the dark digest path** — the exact 1.4%/98.6% split ($0.068 metered ÷ $4.82 total) rests on the **MODELLED** digest cost (only the $0.002254/day matcher numerator is MEASURED), so treat it as one-to-two-percent, not a three-sig-fig figure. The "$25 cap" (AGENTS.md:133,304,336; PROGRESS.md:11,90) is a **stated intention, not an enforced control** — nothing would stop a truncation storm on dense uk/ru days or a wider country matrix. (Aside: the real budget threat is non-LLM — opensanctions billed $33 in 3 days, already >$25.)

---

## 8. Cron inventory

10 scheduled entries in `vercel.json` (f08 §a). Eastern = EDT = UTC−4 in July.

Runtime column: `maxDuration` is the route's kill budget (`route.ts`); the **measured** wall-clock is derived from row-timestamp deltas where a per-run boundary exists in the DB, else **UNKNOWN** (no cron-log table exists — §8a/§12 #6 — only Vercel's execution log carries true per-run wall-clock).

| Path (query) | UTC schedule | Fires/day | maxDuration | wall-clock runtime | Money class |
|---|---|--:|--:|---|---|
| ingest?which=fast | `*/15 * * * *` | 96 | 300s | **UNKNOWN** — no per-run boundary persisted (rss ~60 docs/last-hr); Vercel log | free-ingest (RSS/GDELT/procurement) |
| ingest?which=telegram | `10 * * * *` | 24 | 300s | **UNKNOWN** — ~3.6 posts/fetch × ≤77 channels; Vercel log | free-ingest (t.me scrape) |
| ingest?which=x | `20 * * * *` | 24 | 300s | **~1–2 min [derived]** — one poll's inserts span clock-minutes :20–:22 (§10c/f12), ~298 tweets/poll | paid-non-LLM (X API, guarded) |
| **digest?group=core** (ru,ua) | `30 0,6,12,18 * * *` | **4** | 800s | **~64s MEASURED** — 06:30:29→06:31:33, 6 digests (§4e) | **LLM-spending** (Site A) |
| **digest?group=gulf** (rest) | `50 0,6,12,18 * * *` | **4** | 800s | **~138s MEASURED** — 06:54:39→06:56:57, 16 digests ~8.6s each (§4e) | **LLM-spending** (Site A) |
| validate | `0 7 * * *` | 1 | 300s | **~40–60s [derived]** — 3-country ISW discovery+matcher spans 07:01:17→07:01:58 (§10b/f12); precise UNKNOWN | **LLM-spending** (Site B, metered) |
| enrich | `0 8 * * *` | 1 | 300s | **UNKNOWN** — OpenSanctions ≤200 calls/run; Vercel log | paid-non-LLM (OpenSanctions) |
| datadark | `0 9 * * *` | 1 | 300s | **UNKNOWN** — HTTP freshness polls; Vercel log | free/compute |
| trade | `0 10 2 * *` | ~0.033 | 300s | **UNKNOWN** — monthly; Vercel log | free-ingest (monthly) |
| materials | `0 11 3 * *` | ~0.033 | 800s | **UNKNOWN** — monthly; Vercel log | free-ingest (monthly) |

Two routes exist but are **NOT scheduled** (manual/`CRON_SECRET`-gated): `entity-audit` (LLM-spending) and `probe`.

### 8a. LLM-call arithmetic (f08 §c,§f)

Intersecting TRACKS (`tracks.ts:162-189`) with the 8 active countries yields **11 configured (country,track) pairs**: core=3 (ru/mil, ua/mil, ru/elite), gulf=8 (6 gulf/mil + ir/elite + ir/nuclear). Each run loops `dates=[yesterday,today]`, one `analyze()` per surviving pair:

| | pairs | × dates | calls/run | runs/day | calls/day |
|---|--:|--:|--:|--:|--:|
| core | 3 | 2 | 6 | 4 | **24** |
| gulf | 8 | 2 | 16 | 4 | **64** |
| **digest total** | | | | | **88** |

Plus **validate: 3 countries × 5 votes = 15 calls/day** (k=`max(1,MATCH_VOTES=5)`; confirmed live since 2026-07-07 20:07 UTC, `validation_runs.details.voteRounds=5`; corroborated by `provider_usage` llm_match 2026-07-09 = 15 req / $0.0023). Monthly: digest ~2,640 + validate ~450 calls. These are **upper bounds** (pairs with zero docs make no call); truncation ladder adds 1–2 extra per truncated digest. Empirically all 11 pairs appear in the last 7 days, but the matrix grew across the week (4 pairs on 07-02/03 → 11 by 07-07).

**Each digest-day is regenerated ~8× over its 2-day life** (4 runs on D as "today" + 4 on D+1 as "yesterday"; VERIFIED against route code). The DB cannot show a clean 8× because `created_at` is last-writer-wins (`ON CONFLICT … created_at=now()`). **Per-run success rate = UNKNOWN** (no cron-log table exists; only Vercel's execution log can confirm firing) → §12. Surviving `created_at` minutes **positively match** the scheduled cron minutes (core 06:30, gulf ~06:50, validate 07:00, evening 18:30/18:50); the one clearly off-schedule batch is the **07-02→07-07 military backfill** — a manual `scripts/digest.ts` run on the evening of 2026-07-08 (21:46–22:46 UTC) that re-generated the six older days' ru/ua/ir military digests in one pass (it aligns to no cron minute), evidence that operator backfills coexist with the scheduled crons.

---

## 9. Incremental-processing readiness

**Verdict** (f04): the corpus side is *nearly* ready (stable content hash, an unused indexed `processed` flag); the extraction side is **not** — there is no per-document claim store, and the load-bearing whole-batch properties are **event grouping/ranking** and — for the **~27% multi-doc minority only** (§9b) — **cross-document corroboration computed inside one LLM batch** (corroboration is a real but bounded signal, not the sole driver; §9b).

### 9a. Per-doc state, idempotency, dedup key

- **`processed boolean` (indexed) and `embedding vector(1536)` are entirely vestigial** — 0 writes in `src/`+`scripts/`, 0 populated rows. They are the *only* pre-existing per-doc-state hooks and both are dead. There is **no `updated_at`/version column** on `raw_documents`.
- **Idempotency key = SHA-256 content hash** (`ingest/run.ts:16-20`): `sha256(adapter | (externalId ?? url ?? "") | title | content[0..4000])`, enforced `ON CONFLICT (content_hash) DO NOTHING`. **Per-adapter, byte-exact.** An edited article (any title/content change) → new hash → **new row, same url** (write-once, never-correct). Cross-adapter identical stories → different hash (adapter in hash).
- **Duplicate mass** (`scratchpad/dups.sql`): 46,345 total; distinct md5(content)=43,783 → **2,562 rows (5.5%) are exact-content duplicates carrying a different hash**; 1,112 extra rows share a url; 1,122 share `(adapter, external_id)`. Top offender: 417 empty-content RSS items (filtered by `length≥40` but bloat the table); Telegram air-raid templates (48/37/30 copies). **Implication:** a per-doc map would extract and pay for each redundancy separately unless a content-level dedup gate is added *before* the map — today's near-dupe collapse is transient/in-batch and never persists.

### 9b. The `doc_claims` design and the corroboration that is LOST

There is **no per-document claim store** — all claim tables are digest-scoped (`claims.digest_id`); `claim_sources` is the only claim↔doc bridge and it is **N:M and reduce-time**. Under per-doc map, each claim is born from exactly one doc and can cite exactly one docId. Measured (f04 §b, `scratchpad/fanout.sql`):

| metric | value |
|---|--:|
| total claims | 570 |
| **claims citing exactly 1 doc** | **416 (73.0%)** |
| **claims citing >1 doc** | **154 (27.0%)** |
| avg / max docs per claim | 1.446 / 11 |
| "extra" corroboration edges (824−570) | **254** — edges a naive per-doc map can never emit |

> These §9b corroboration figures were **re-measured 2026-07-09** (SQL in §13) and have live-drifted down from §5/§5a's earlier audit-time snapshot (584 claims / 837 edges → **570 / 824**; see the line-9 drift caveat). The single-/multi-doc *structure* — ~73% single-doc, ~27% multi-doc — is stable across the drift; only the absolute totals moved.

**Corroboration is a real but *weak* signal — NOT the driver of hedging or of confidence** (re-measured 2026-07-09, §13). Two decisive measurements refute the "corroboration drives it" reading:

**(1) Sources-per-claim histogram (all 570 claims):** **1 doc → 416 (73.0%)**, 2 → 101, 3 → 33, 4 → 10, 5 → 6, and 7/9/10/11 → 1 each. So **~73% of claims cite exactly one doc** — the median claim is single-source. By hedging (claims / avg docs / avg conf / single-doc count & share): **`confirmed` 211 / 1.664 / 0.633 / 141 single-doc (66.8%)**; `claimed` 333 / 1.306 / 0.576 / 258 single-doc (77.5%); `assessed` 19 / 1.421 / 0.588 / 12 single-doc; `unverified` 6 / 1.667 / 0.556 / 4 single-doc. The decisive fact: **two-thirds of `confirmed` claims (141 of 211) cite a *single* doc.** HARD RULE 3 (§3 lines 84–86) **explicitly permits single-doc `confirmed`** for "visually/geolocation-corroborated facts", and the model empirically does exactly that for the majority. The multi-doc lift is genuine but modest — `confirmed` multi-doc share **33.2%** vs `claimed` **22.5%**; avg **1.664** vs **1.306** docs — a real signal, not the driver.

**(2) Confidence is driven by source reliability, not corroboration.** `confidence` = mean COALESCE(reliability,0.3) over a claim's `claim_sources` (`digest.ts:277-286`); for the 73% single-source majority it is simply that one source's reliability, with **zero** corroboration input, and adding sources only *averages* it (and can lower it). Empirically it is essentially **flat** across corroboration: single-doc claims avg **0.596** (n=416) vs multi-doc **0.602** (n=154) — a **0.006** gap. Corroboration does not materially move the confidence score.

**Consequence for the map.** A per-doc map **can** honestly mark the single-doc majority `confirmed` under HARD RULE 3 (it holds the very same single-doc evidence a batch call has). What a per-doc map genuinely *cannot* originate is only the **~33% multi-doc `confirmed` uplift** (the ~70 claims that corroboration actually promotes) and the multi-source `claim_sources` unions — not "213 confirmed claims". The corroboration signal is real but bounded; it is not what makes the batch call load-bearing (event grouping/ranking is the larger genuine cross-doc job, §11).

Proposed additive `doc_claims` table (f04 §b, does not change any existing table): key `(raw_document_id, extractor_version, track)` — **track must be in the key** (same doc yields different claims per prompt); `extractor_version` = model id + prompt hash gives the versioning `raw_documents` lacks; the reduce clusters `doc_claims` → writes the existing `claims/claim_sources/events/entities` and runs the same confidence UPDATE.

### 9c. What assumes batch context (must move to reduce)

Near-dupe collapse (`digest.ts:99-101`), source-mix quota (`:105-109`), reliability ordering/gather rank (`:60-81`), the "5-12 events, most significant first" budget, the docId validation gate (`:150-162`), multi-source corroboration→hedging (rules 3–5), event grouping (avg 1.463 docs/event), confidence UPDATE (`:277-286`), the empty-extraction guard (`:170-185`), DELETE-then-reinsert regen, and entity get-or-create dedup — all are whole-batch computations.

### 9d. Language handling

**No separate translation stage** — the raw original-language `content` goes straight into the prompt (sliced to 400 chars, **`lang` not sent**) and the model is instructed to emit English (HARD RULE 2). No cached English form exists; every map call pays to send original bytes and translate (f10 §a). `detectLang` (`lang.ts:8-29`) is a **script-range heuristic** (Cyrillic/Arabic/Latin counts, ru/uk by `і ї є ґ` vs `ы ъ э ё`, ar/fa by Persian glyphs); **no Hebrew branch** (Hebrew→`en`). Because the prompt omits `lang`, stored-lang quality has **zero impact on extraction** (f10 §b).

Corrected 14-day mix (NULLs redistributed by script; f10 §c): **English 37.5% · Russian 27.1% · Arabic-or-Persian 20.9% · Ukrainian 10.2% · other 4.4%**. `telegram_web` has 33% NULL lang (98.8% a one-off 2026-07-04 backfill; 90% actually detectable). **Theater-tagging gap:** 3,264 Persian docs are tagged `country_iso2='ru'` (5 Iranian Telegram channels registered under the default ru theater, no `fa→ir` rule) — stranded from the IR digest. 400-char `slice` is UTF-16-unit based → **no mid-character risk for Cyrillic/Arabic/Persian/Hebrew (all BMP)**; only astral emoji can leave a trailing lone surrogate (≤1 char, decorative).

---

## 10. Volume dynamics for cadence planning

Corpus is ~5 days old; adapters onboarded on different days (ru/ua fetch from 2026-07-04 18:31Z, ir from 07-05, **x_api from 07-07 19:35Z**). Trustworthy steady-state cadence rows: ru/ua D∈{07-06,07-07,07-08}, ir D=07-08 only (f11 caveat 2).

**Publication is diurnal** (the clean signal; `fetched_at` histograms are contaminated by seed/onboarding bursts at 18–19Z): ru peaks 06–14Z (Moscow working day), ir is x_api-driven (94%) peaking 19–20Z (Tehran evening), ua is flattest and gdelt-shaped. **Arrival lag** (`fetched_at − published_at`, f11 §b.1): median 12–54 min everywhere; **gdelt is the metronome** (median 31 min, p90 46, max <48 min); telegram/x carry heavy multi-hour-to-multi-day tails (paging backfill). Negative lag = 0 and zero lag = 0 across all 44,522 docs — a non-null `published_at` is always a genuine source timestamp; unknown dates stored NULL (never defaulted to fetch time).

### 10-hist. Doc-arrival histograms by hour of day, per theater, split by adapter (last 7 days, 2026-07-03…07-09)

24-row hour-of-day histograms, one per theater, columns per adapter (`tg`=telegram_web, `x`=x_api, `rss`, `gd`=gdelt; gdelt feeds only ru/ua). Window `[2026-07-03T00:00Z, 2026-07-10T00:00Z)`. Both keyings are given: **`published_at`** (the clean "when news happened" signal) and **`fetched_at`** (literal arrival/ingest — ⚠ contaminated by the one-time seed + 07-07 x_api-onboarding bursts at UTC hr18–19 / ET hr14–15). The **ET tables are the UTC table shifted −4 rows with wraparound** (July EDT = UTC−4; f11 proves the populations are identical), so each ET table's Σ equals its UTC twin. SQL in f11 §a (`EXTRACT(HOUR FROM published_at)` / `… AT TIME ZONE 'America/New_York'`, `FILTER` per adapter).

**ru — published_at**
| Hr | tg/UTC | x/UTC | rss/UTC | gd/UTC | TOT/UTC | | tg/ET | x/ET | rss/ET | gd/ET | TOT/ET |
|--:|--:|--:|--:|--:|--:|--|--:|--:|--:|--:|--:|
|00|135|82|25|112|354||205|119|55|145|524|
|01|122|113|31|70|336||278|168|56|0|502|
|02|97|103|28|0|228||332|275|110|0|717|
|03|171|94|31|75|371||390|256|135|0|781|
|04|205|119|55|145|524||410|311|171|0|892|
|05|278|168|56|0|502||427|341|139|18|925|
|06|332|275|110|0|717||408|294|150|121|973|
|07|390|256|135|0|781||344|261|110|42|757|
|08|410|311|171|0|892||341|226|135|150|852|
|09|427|341|139|18|925||344|346|134|150|974|
|10|408|294|150|121|973||311|365|133|75|884|
|11|344|261|110|42|757||313|256|108|0|677|
|12|341|226|135|150|852||304|290|121|0|715|
|13|344|346|134|150|974||268|276|87|0|631|
|14|311|365|133|75|884||239|242|87|115|683|
|15|313|256|108|0|677||279|302|70|0|651|
|16|304|290|121|0|715||297|224|49|64|634|
|17|268|276|87|0|631||258|291|57|249|855|
|18|239|242|87|115|683||202|165|36|15|418|
|19|279|302|70|0|651||128|81|27|25|261|
|20|297|224|49|64|634||135|82|25|112|354|
|21|258|291|57|249|855||122|113|31|70|336|
|22|202|165|36|15|418||97|103|28|0|228|
|23|128|81|27|25|261||171|94|31|75|371|
|**Σ**|**6603**|**5481**|**2085**|**1426**|**15595**||**6603**|**5481**|**2085**|**1426**|**15595**|

**ua — published_at**
| Hr | tg/UTC | x/UTC | rss/UTC | gd/UTC | TOT/UTC | | tg/ET | x/ET | rss/ET | gd/ET | TOT/ET |
|--:|--:|--:|--:|--:|--:|--|--:|--:|--:|--:|--:|
|00|54|2|3|0|59||75|21|22|109|227|
|01|58|10|6|233|307||109|24|57|75|265|
|02|43|6|7|100|156||111|30|48|225|414|
|03|63|10|35|41|149||105|44|51|0|200|
|04|75|21|22|109|227||89|42|55|0|186|
|05|109|24|57|75|265||96|47|56|75|274|
|06|111|30|48|225|414||68|38|62|300|468|
|07|105|44|51|0|200||74|30|52|75|231|
|08|89|42|55|0|186||83|36|58|75|252|
|09|96|47|56|75|274||87|35|61|75|258|
|10|68|38|62|300|468||68|37|48|86|239|
|11|74|30|52|75|231||77|39|51|0|167|
|12|83|36|58|75|252||85|43|50|11|189|
|13|87|35|61|75|258||77|28|49|75|229|
|14|68|37|48|86|239||60|30|26|37|153|
|15|77|39|51|0|167||48|12|17|68|145|
|16|85|43|50|11|189||38|9|19|78|144|
|17|77|28|49|75|229||31|23|12|66|132|
|18|60|30|26|37|153||50|13|14|136|213|
|19|48|12|17|68|145||36|3|8|20|67|
|20|38|9|19|78|144||54|2|3|0|59|
|21|31|23|12|66|132||58|10|6|233|307|
|22|50|13|14|136|213||43|6|7|100|156|
|23|36|3|8|20|67||63|10|35|41|149|
|**Σ**|**1685**|**612**|**867**|**1960**|**5124**||**1685**|**612**|**867**|**1960**|**5124**|

**ir — published_at** (no gdelt for ir)
| Hr | tg/UTC | x/UTC | rss/UTC | TOT/UTC | | tg/ET | x/ET | rss/ET | TOT/ET |
|--:|--:|--:|--:|--:|--|--:|--:|--:|--:|
|00|1|328|10|339||5|272|13|290|
|01|1|307|8|316||8|348|15|371|
|02|0|274|16|290||3|427|20|450|
|03|1|294|9|304||5|511|25|541|
|04|5|272|13|290||6|622|56|684|
|05|8|348|15|371||6|620|41|667|
|06|3|427|20|450||3|650|40|693|
|07|5|511|25|541||4|504|32|540|
|08|6|622|56|684||3|415|38|456|
|09|6|620|41|667||5|615|21|641|
|10|3|650|40|693||9|588|42|639|
|11|4|504|32|540||2|554|36|592|
|12|3|415|38|456||0|578|31|609|
|13|5|615|21|641||19|614|20|653|
|14|9|588|42|639||8|517|23|548|
|15|2|554|36|592||2|709|17|728|
|16|0|578|31|609||4|696|27|727|
|17|19|614|20|653||8|658|20|686|
|18|8|517|23|548||2|447|15|464|
|19|2|709|17|728||3|300|7|310|
|20|4|696|27|727||1|328|10|339|
|21|8|658|20|686||1|307|8|316|
|22|2|447|15|464||0|274|16|290|
|23|3|300|7|310||1|294|9|304|
|**Σ**|**108**|**11848**|**582**|**12538**||**108**|**11848**|**582**|**12538**|

**Fetched-at (arrival) histograms — ⚠ hr18–19 UTC / hr14–15 ET rows carry the one-time seed + x_api-onboarding bursts and are NOT a steady-state cadence signal.**

**ru — fetched_at**
| Hr | tg/UTC | x/UTC | rss/UTC | gd/UTC | TOT/UTC | | tg/ET | x/ET | rss/ET | gd/ET | TOT/ET |
|--:|--:|--:|--:|--:|--:|--|--:|--:|--:|--:|--:|
|00|225|55|20|75|375||254|63|47|145|509|
|01|228|80|20|132|460||312|77|63|75|527|
|02|228|97|20|0|345||372|144|85|0|601|
|03|264|78|104|0|446||462|165|118|0|745|
|04|254|63|47|145|509||497|124|133|0|754|
|05|312|77|63|75|527||515|193|142|0|850|
|06|372|144|85|0|601||534|207|148|75|964|
|07|462|165|118|0|745||512|167|110|64|853|
|08|497|124|133|0|754||377|62|114|117|670|
|09|515|193|142|0|850||384|129|126|150|789|
|10|534|207|148|75|964||423|161|118|150|852|
|11|512|167|110|64|853||368|143|123|0|634|
|12|377|62|114|117|670||365|103|97|0|565|
|13|384|129|126|150|789||428|125|93|0|646|
|14|423|161|118|150|852||562|118|310|115|1105|
|15|368|143|123|0|634||**5857**|**2935**|66|0|**8858** ⚠|
|16|365|103|97|0|565||520|106|53|15|694|
|17|428|125|93|0|646||360|248|43|143|794|
|18|562|118|310|115|1105||490|208|47|170|915|
|19|**5857**|**2935**|66|0|**8858** ⚠||288|104|28|0|420|
|20|520|106|53|15|694||225|55|20|75|375|
|21|360|248|43|143|794||228|80|20|132|460|
|22|490|208|47|170|915||228|97|20|0|345|
|23|288|104|28|0|420||264|78|104|0|446|
|**Σ**|**14825**|**5892**|**2228**|**1426**|**24371**||**14825**|**5892**|**2228**|**1426**|**24371**|

**ua — fetched_at**
| Hr | tg/UTC | x/UTC | rss/UTC | gd/UTC | TOT/UTC | | tg/ET | x/ET | rss/ET | gd/ET | TOT/ET |
|--:|--:|--:|--:|--:|--:|--|--:|--:|--:|--:|--:|
|00|35|1|6|0|42||57|5|25|75|162|
|01|39|1|7|56|103||76|19|44|75|214|
|02|45|4|7|277|333||89|21|48|150|308|
|03|47|6|24|0|77||118|22|50|150|340|
|04|57|5|25|75|162||103|22|58|0|183|
|05|76|19|44|75|214||100|41|52|0|193|
|06|89|21|48|150|308||87|27|64|75|253|
|07|118|22|50|150|340||84|25|48|375|532|
|08|103|22|58|0|183||72|16|49|0|137|
|09|100|41|52|0|193||97|9|49|150|305|
|10|87|27|64|75|253||87|20|46|75|228|
|11|84|25|48|375|532||80|12|47|11|150|
|12|72|16|49|0|137||58|25|48|0|131|
|13|97|9|49|150|305||74|14|41|11|140|
|14|87|20|46|75|228||127|12|88|112|339|
|15|80|12|47|11|150||**1235**|289|17|0|**1541** ⚠|
|16|58|25|48|0|131||91|6|18|146|261|
|17|74|14|41|11|140||38|17|10|52|117|
|18|127|12|88|112|339||45|12|12|150|219|
|19|**1235**|289|17|0|**1541** ⚠||42|10|9|20|81|
|20|91|6|18|146|261||35|1|6|0|42|
|21|38|17|10|52|117||39|1|7|56|103|
|22|45|12|12|150|219||45|4|7|277|333|
|23|42|10|9|20|81||47|6|24|0|77|
|**Σ**|**2926**|**636**|**867**|**1960**|**6389**||**2926**|**636**|**867**|**1960**|**6389**|

**ir — fetched_at** (no gdelt for ir)
| Hr | tg/UTC | x/UTC | rss/UTC | TOT/UTC | | tg/ET | x/ET | rss/ET | TOT/ET |
|--:|--:|--:|--:|--:|--|--:|--:|--:|--:|
|00|1|241|13|255||0|233|7|240|
|01|0|260|9|269||5|252|20|277|
|02|0|234|11|245||8|312|24|344|
|03|0|271|16|287||6|351|17|374|
|04|0|233|7|240||6|448|45|499|
|05|5|252|20|277||2|496|43|541|
|06|8|312|24|344||62|483|168|713|
|07|6|351|17|374||3|505|50|558|
|08|6|448|45|499||2|203|33|238|
|09|2|496|43|541||4|300|23|327|
|10|62|483|168|713||4|303|42|349|
|11|3|505|50|558||4|327|43|374|
|12|2|203|33|238||2|272|51|325|
|13|4|300|23|327||4|329|26|359|
|14|4|303|42|349||13|225|485|723|
|15|4|327|43|374||**4**|**4349**|25|**4378** ⚠|
|16|2|272|51|325||5|349|19|373|
|17|4|329|26|359||5|773|26|804|
|18|13|225|485|723||5|520|16|541|
|19|**4**|**4349**|25|**4378** ⚠||4|346|19|369|
|20|5|349|19|373||1|241|13|255|
|21|5|773|26|804||0|260|9|269|
|22|5|520|16|541||0|234|11|245|
|23|4|346|19|369||0|271|16|287|
|**Σ**|**149**|**12382**|**1231**|**13762**||**149**|**12382**|**1231**|**13762**|

**Reading:** publication is diurnal — ru peaks **06–14Z** (Moscow working day, tg+x driven), ir rises to a **19–20Z** peak (x_api 94%, Tehran evening), ua is flattest and the only theater a single adapter (**gdelt**, 38%) shapes. gdelt columns are quantized to poll-batch multiples (~11/64/75/150/300). Every theater's **fetched** hr19-UTC/hr15-ET is a 5–15× spike = the seed dump + 07-07 x_api onboarding — an *event*, not a daily pattern; steady-state ingestion is roughly flat-to-daytime-weighted once those two bursts are excluded.

### 10a. Corpus share present at each cron firing (mature days, f11 §c)

Percent of a UTC-day's *eventual* corpus present at each firing (ru/ir/ua 07-08):

| firing (UTC / ET / role) | ru 07-08 | ua 07-08 | ir 07-08 |
|---|--:|--:|--:|
| D 00:30 (20:30ET, today) | 1.1% | 0.1% | 0.9% |
| D 06:30 (02:30ET, today) | 17.5% | 23.1% | 16.1% |
| D 12:30 (08:30ET, today) | 45.4% | 58.6% | 42.8% |
| D 18:30 (14:30ET, today) | 77.1% | 91.3% | 74.7% |
| **D+1 00:30 (20:30ET, yesterday)** | **99.9%** | **99.9%** | **100.0%** |

**Corpus share at the exact ET thresholds (measured, not interpolated; steady-state day 07-08, f11 §b.2** — `FILTER (WHERE fetched_at ≤ D::ts + interval '9 hour'|'16 hour')`, i.e. 09:00Z=05:00 ET and 16:00Z=12:00 ET):

| theater (07-08) | by **05:00 ET** (09:00Z) | by **12:00 ET** (16:00Z) | by end-ET-day (04:00Z D+1) |
|---|--:|--:|--:|
| ru | 1,464/5,479 = **26.7%** | 3,456/5,479 = **63.1%** | 99.9% |
| ua | 335/934 = **35.9%** | 712/934 = **76.2%** | 99.9% |
| ir | 1,413/5,812 = **24.3%** | 3,472/5,812 = **59.7%** | 100.0% |

So **~24–36% has arrived by 05:00 ET and ~60–76% by 12:00 ET** (these are measured at the exact 05:00/12:00-ET wall-clock, unlike the cron-firing table above whose rows sit at 02:30/08:30/14:30 ET). The jump toward 100% is **not** ingestion lag (~30 min median) — it is that the **UTC day only closes at 00:00Z = 20:00 ET**, so afternoon/evening-UTC news hasn't been *published* yet. Cross-check: ru/ua/ir publish only 30.2%/38.3%/28.6% of daily volume by 08:00Z.

**Cadence reading** (f11 §c): the first cron that sees a near-complete day D is the **D+1 00:30 UTC "yesterday" pass**; the four D passes are progressively richer previews; the two overnight/morning "today" crons (00:30Z, 06:30Z) see ≤~3%/~12–23% and do real work only on D−1. **Hard freshness ceiling: you can never see >~75–91% of the current UTC day at any cron.** The lever for intraday freshness is shifting the day boundary to a theater-local timezone (MSK/Tehran) or accepting D+1 as canonical — **not** adding crons (the missing docs don't exist yet). gdelt (ru/ua only, <48 min max) is the one adapter tight enough for genuinely intraday cadence.

### 10b. ISW timing & ingest cadence adequacy

ISW (*Institute for the Study of War*) has **no `published_at`/`slug` column** — only `report_date` (date-only) + our `fetched_at`; the true publish wall-clock is scraped from the page's schema.org `datePublished` into `derived->>'publishedAt'` (JSONB) at validation time only (`run.ts:121-122`; f12 §a). Info-lead metric (`score.ts:82-84`): median(ISW publish − earliest supporting-doc time) per matched pair; positive = we had it first. **Fetch lag is irrelevant to that metric** (it uses `derived.publishedAt`, not `fetched_at`).

**Actual per-report publish timestamps for the window** (`SELECT theater, report_date, derived->>'publishedAt', fetched_at, parse_status … WHERE report_date > current_date - interval '9 days'`; f12 §a):

| theater | report_date | `derived.publishedAt` (real publish, UTC) | our `fetched_at` (UTC) | fetch lag | parse_status |
|---|---|---|---|--:|---|
| ir | 2026-07-08 | 2026-07-09T00:03:13Z | 2026-07-09T07:01:58Z | ~7.0h | pending |
| ru | 2026-07-08 | 2026-07-09T01:06:24Z | 2026-07-09T07:01:47Z | ~5.9h | pending |
| ir | 2026-07-07 | 2026-07-07T21:21:14Z | 2026-07-08T07:01:24Z | ~9.7h | pending |
| ru | 2026-07-07 | 2026-07-08T01:54:32Z | 2026-07-08T07:01:17Z | ~5.1h | pending |
| ir | 2026-07-06 | 2026-07-06T21:21:09Z | 2026-07-07T04:13:44Z | ~6.9h | pending |
| ru | 2026-07-06 | 2026-07-06T22:27:54Z | 2026-07-07T07:00:06Z | ~8.5h | pending |
| ir | 2026-07-05 | 2026-07-05T19:26:56Z | 2026-07-06T10:28:11Z | ~15.0h | pending |
| ru | 2026-07-05 | 2026-07-05T22:30:34Z | 2026-07-06T07:00:30Z | ~8.5h | pending |
| ir | 2026-07-04 | 2026-07-04T19:33:50Z | 2026-07-06T10:27:01Z | ~38.9h | pending |
| ru | 2026-07-04 | 2026-07-05T01:10:16Z | 2026-07-05T03:30:05Z | ~2.3h | pending |
| ir | 2026-07-03 | 2026-07-03T21:29:49Z | 2026-07-06T16:22:02Z | — | parsed |
| ru | 2026-07-03 | 2026-07-04T00:53:47Z | 2026-07-04T19:12:49Z | — | parsed |

So concretely: **ROCA (ru/ua) lands ~22:00–02:00 UTC (18:00–22:00 ET); Iran Update lands ~19:30–00:00 UTC** — both late US-evening ET. Fetch lag is dominated by the once-daily 07:00 UTC validate cron (~5–10h typical; the two >15h ir Jul-4/5 rows published just after a cron window and waited for a later run; the ru Jul-4 2.3h fetch was an off-cron manual probe). Jul-4→8 rows are `parse_status='pending'` (endnote parser hasn't run) but the publish wall-clock is still captured, because it comes from the validate path, separate from endnote parsing.

**Ingest cadence sufficiency** (f12 §b): rss (`*/15`, full feed window) — **sufficient**; gdelt (`*/15`) — **sufficient**; telegram_web (hourly, ~20-post preview, steady ~3.6 posts/fetch) — **marginal for 1–2 burstiest channels** (nournews_ir peaked 22/hr > 20-post depth); x_api (hourly, 100 tweets/batch cap, steady ~298/poll median 281, hottest batch peak 39/hr vs 100 cap) — **sufficient** (~2.5× headroom). All four production adapters inserted docs within the last hour (**GDELT is LIVE**, not dead).

### 10c. Documentation drift (cadence/timing)

- **Digest cron is 4×/day per group (00:30/06:30/12:30/18:30 core; :50 gulf), NOT "daily 21:30 UTC"** — AGENTS.md:67 / AGENTS.md:9-10 stale (no 21:30 entry exists; f12 §c). (validate "daily 07:00 UTC" AGENTS.md:72 is correct.)
- **`digest.ts:13` "Cyrillic ~1 token/char" comment is wrong for o200k_base** — measured 0.286–0.295 tok/char; the "entry-tier 60K TPM" belief matches no gpt-4o-mini tier (Tier-1 is 200K).
- **"RU military digest ~3m40s under TPM throttle"** (AGENTS.md:192-194, AUDIT-2026-07-06.md:33-35) — stale; current is ~15–30s, no throttle firing.
- **"median info-lead +14.7h"** (AGENTS.md:71) — live table gives **11.0h (7d) / 12.85h (all-time)**; 14.7h is likely the frozen 30-digest backtest, not production cadence.
- **"GDELT upstream-flaky, blocker #10"** (AGENTS.md:66) — overstated; TCP-unreachability is specific to the WSL2 audit box, prod GDELT is fully live (797 docs/24h).

---

## 11. Implications for a map-reduce redesign (neutral, evidence-anchored)

This section states the **constraints** a refactor must satisfy, each tied to a measured number. It does not design the refactor.

**What the map stage would have to do.** Extract, once per `(raw_document, track)`, a set of provisional single-source claims (each citing exactly its one owning doc), with entities, an event hint, and a content-canonicalization key. Constraints: (a) map must be **per (doc × track)**, not per doc — the same doc under military vs elite vs nuclear prompts yields different claims (11 configured pairs, §8a). (b) Map output must be **immutable + versioned** by `extractor_version` so a later cron re-maps only new/changed docs. (c) A **content-level dedup gate must precede the map**, because today's near-dupe collapse is in-batch and non-persistent — **2,562 exact-content duplicates (5.5%)** plus the larger near-dupe mass would otherwise each be extracted and paid for (§9a, §5b).

**What the reduce stage must reconstruct.** Everything in §9c. The largest genuine cross-doc job is **event grouping / ranking**; **cross-document corroboration is real but *bounded*** — it changes hedging only for the multi-doc minority and does not drive confidence at all (§9b):
- **Only 27.0% of claims (154/570) are multi-doc** (re-measured 2026-07-09, §9b/§13); those cannot be born from one doc, so the reduce must cluster semantically-equal per-doc claims and union their docIds (254 extra `claim_sources` edges) — with **no persisted embedding** to do it cheaply (embedding column is dead, §9a), so the reduce needs its own similarity step (minhash over claim text, or another LLM pass). The **73% single-doc majority** needs no such clustering.
- **Hedging upgrade is a real but *bounded* reduce job:** where independent docs corroborate, `claimed`-from-A + `claimed`-from-independent-B should be promoted to **`confirmed`** by the reduce. But this is needed only for the **multi-doc minority**: of **211 `confirmed` claims today, only 70 (33.2%) are multi-doc**; the other **141 (66.8%) cite a single doc** and are markable `confirmed` by a per-doc map under **HARD RULE 3** ("visually/geolocation-corroborated facts", §3), which is empirically what the model already does for the majority (§9b). So corroboration-driven promotion is what the reduce adds for **~70 claims**, **not "213 confirmed claims"** — the single-doc majority survives a per-doc map.
- **Confidence** = mean COALESCE(reliability,0.3) over a claim's `claim_sources` (`digest.ts:277-286`) — driven by **source reliability, not corroboration**: it is essentially flat between single-doc (avg 0.596, n=416) and multi-doc (0.602, n=154) claims, a 0.006 gap (§9b). For the 73% single-source majority it is just that one source's reliability and is well-defined per single doc; it is a reduce-tail step only for the multi-doc minority.
- **Event grouping / "most significant first" / event-count budget** are whole-digest ranking (avg 1.463 docs/event) — a genuine cross-doc step the map can't see.

**Net:** the reduce is **not** cheap DB assembly — it inherits genuine cross-doc work (**event grouping / ranking** as the main job, plus corroboration-driven hedging for the **~33% multi-doc `confirmed`** minority and the multi-source `claim_sources` unions) and will very likely still need an LLM synthesis pass. Dropping `confirmed`-by-corroboration would regress that multi-doc minority (**~70 claims**) — a real but **bounded** product cost, **not** a loss of "213 confirmed claims": the single-doc `confirmed` majority (141/211) survives a per-doc map under HARD RULE 3.

**Redundancy factor (the cost the refactor removes).** Each digest-day is regenerated **8× — a schedule-derived floor, NOT a measured count.** The construction is: **3,970 MEASURED** `docsAnalyzed` over the last 7 days (`sum((structured->'stats'->>'docsAnalyzed')::int)`, one row per surviving generation = last-writer, §13) **× 8 schedule-derived regenerations** (route code, not data: `dates=[yesterday,today]` × 4 runs/day over a digest-day's 2-calendar-day life = 4+4; `route.ts:30-31`) **⇒ 31,760 MODELLED total sends.** The old "31,760 / 3,970 = 8.00" framing was a **tautology** (`3,970×8 / 3,970 ≡ 8`) — 31,760 was never independently observed, it is 3,970×8 by construction, so it is dropped here. The true regeneration count is **UNKNOWN** because `created_at` is last-writer-wins (`ON CONFLICT … created_at=now()`) and the 07-08 manual backfill overwrote prior cron writes (§12 #7); 8× is the *scheduled floor*. Adding track overlap (elite/nuclear doc sets ⊆ the military batch of the same country+date, military lexicon being null) collapses ≈842 duplicate doc-extractions per generation ⇒ distinct-per-generation ≈3,970−842 = **~3,128**, so redundancy ≈ 31,760 / 3,128 ≈ **10.2× [MODELLED]** — exact distinct is unmeasurable because **sent doc-ids are not persisted** (§12 #9). Near-dupe collapse would raise it slightly further.

**Cost delta — with the per-doc arithmetic shown explicitly.** Map-once-per-`(doc×track)` makes extraction spend scale with **new documents ingested (once)** instead of **(digests × 8 schedule-derived regen × batch size)**. Two independent derivations, both **MODELLED**:

*(i) Divide-by-redundancy.* Current digest spend ≈ **$4.75/mo** (§7c, MODELLED $/call × MEASURED cadence); removing the 8–10.2× re-extraction gives **$4.75 / 8.5 ≈ $0.5–0.6/mo** on the map side.

*(ii) Bottom-up per-doc call.* Cost/call = `in_tok·1.5e-7 + out_tok·6e-7`.
- **Per-doc INPUT** (§3b, measured components): `system 413 + framing 17 + one doc-line`. Using the mean RU line 71.9 tok ⇒ **≈ 502 tok**; using a dense uk line (median ~157 tok, §4b) ⇒ **≈ 587 tok**. Take **~500–590 in**.
- **Per-doc OUTPUT: UNMEASURED → labelled UNKNOWN.** No single-doc extraction has ever been run, so per-doc output tokens are an **ASSUMPTION**. Anchor: the RU batch emitted 734 compact-JSON tok over 8 claims ⇒ **~92 tok/claim** (§4c); a single doc typically yields ~1–2 claims ⇒ **assume ~90–180 out/doc** [ASSUMED, per-doc output UNKNOWN].
- **Cost/doc-call** ≈ `550·1.5e-7 + 135·6e-7` ≈ **$0.00016/doc-call** (range ~$0.00012–$0.00021 across the in/out bands).
- **Docs/month under the map** = distinct `(doc×track)` extractions. At the current ~3,128 distinct per 7-day generation (above), a month of comparable volume is ≈ **3,128 × 30/7 ≈ 13,400 (doc×track) extractions/mo** [MODELLED].
- **Map-side monthly** ≈ 13,400 × $0.00016 ≈ **$2.1/mo** on these assumptions — *higher* than derivation (i)'s $0.5–0.6 because a per-doc call **loses the batch's system-prompt amortization** (each call re-pays the 413-tok system + 17-tok framing instead of spreading them over 100 docs). **Honest bracket: ~$0.5–$2/mo**, centered on "well under current $4.75", with the spread driven by (a) the UNKNOWN per-doc output and (b) whether the map keeps the full 413-tok system prompt or a leaner per-doc one. Either way it **eliminates the 16,384-token truncation retries entirely** (a per-doc call can never hit the batch-output ceiling, where the $0.022-per-truncated-digest waste lives, §4d/§7c).

**But** the reduce inherits corroboration+ranking, so if the reduce keeps an LLM synthesis pass, *that* pass is what the 8× regeneration now multiplies — the saving is real but concentrated on re-reading raw docs, **not** a free lunch on synthesis. Constraint: the refactor must **add metering** to whatever LLM the reduce uses — today the entire digest path is unmetered (§7c), so a reduce blow-up would be as invisible as the current one.

---

## 12. Unknown / needs follow-up

| # | Unknown | Why undeterminable | Where an operator finds it |
|---|---|---|---|
| 1 | Per-digest **dropped-claim counts** (Stage J) | `DigestResult.droppedClaims` is returned + `console`-logged at `digest.ts:308-309`, never persisted | Vercel function logs, or add a `structured.stats.droppedClaims` field |
| 2 | **Raw prompt / completion text & token usage** for any past digest | Never persisted; provider never reads `completion.usage` (§3, f02 §h) | Not recoverable; requires instrumenting the call site |
| 3 | **Near-dupe survivor counts at generation time** | Collapse is transient/in-memory, not persisted (§5b); the 571/157/99 figures are today's offline recompute | Recompute offline (deterministic) or persist the canonical map |
| 4 | **Actual OpenAI account tier & real per-model TPM/RPM/TPD** | Not in repo/env/DB; `api.openai.com` unreachable from the audit box | `platform.openai.com/settings/organization/limits` and `…/billing` |
| 5 | **Deployed Vercel env var values** (sprint caps, `MATCH_VOTES`, `OPENAI_MODEL`) | Only `.env.local` names are readable; deployed env differs (llm_match/x_api spend proves sprint caps are set there) | Vercel dashboard → project env vars |
| 6 | **Per-cron-run success rate / whether crons actually fire on schedule** | No cron-log table exists; `created_at` is last-writer-wins (§8a). Timestamps match cron minutes but can't distinguish deployed-cron vs manual reproduction | Vercel cron execution log |
| 7 | **True regeneration count per digest-day** (vs the 8× schedule floor) | `created_at` overwritten on every upsert; the 07-08 manual backfill overwrote prior cron writes | Vercel cron log + any manual `scripts/digest.ts` invocation history |
| 8 | **Current truncation frequency / count per day** | Ladder outcome is logged, not stored; the 2026-07-09 runs showed none, but the exemplar was a manual backfill | Vercel logs (grep for "retrying smaller") |
| 9 | **Exact distinct docs sent under per-doc extraction (~3,128)** | Sent doc-ids are not persisted; the ~10.2× redundancy assumes elite/nuclear ⊆ military doc sets | Instrument the gather/select stage to log sent ids |
| 10 | **Provenance of AGENTS.md "+14.7h" info-lead** | No `validation_runs` subset reproduces 14.7h (7d=11.0, all-time=12.85); presumed the frozen backtest, but backtest runs aren't tagged | Re-run the backtest, or tag backtest rows in `validation_runs` |
| 11 | **Real twitterapi.io page size** (100/batch is the code's assumption) | Per-page count returned by `advanced_search` not persisted (f12 UNKNOWNs) | twitterapi.io API docs / a logged live response |

---

## 13. Provenance appendix — exact SQL

All queries run read-only via `npx tsx scripts/sqlq.ts "<SQL>"` (neon, single-statement, SELECT-only) against the production Neon DB (session `TimeZone=GMT`). No writes, no LLM calls.

```sql
-- Row counts (scratchpad/counts.sql)
SELECT 'raw_documents', count(*) FROM raw_documents UNION ALL SELECT 'digests', count(*) FROM digests
  UNION ALL SELECT 'claims', count(*) FROM claims UNION ALL SELECT 'claim_sources', count(*) FROM claim_sources; -- etc.

-- Active countries (8): ae,il,ir,om,qa,ru,sa,ua
SELECT string_agg(iso2, ',' ORDER BY iso2) FROM countries WHERE status='active';

-- Providers that have ever generated a digest → openai:gpt-4o-mini | 89
SELECT provider, count(*) FROM digests GROUP BY provider ORDER BY 2 DESC;

-- structured keys → only 'stats'
SELECT DISTINCT jsonb_object_keys(structured) FROM digests;

-- The gather SQL (verbatim, digest.ts:60-81) — day corpus for one (country,date)
SELECT id, title, content, lang, url, published_at, adapter, source_key, reliability, platform
FROM ( SELECT rd.id, rd.title, rd.content, rd.lang, rd.url, rd.published_at, rd.adapter,
         s.canonical_url AS source_key, s.reliability_score AS reliability, s.platform,
         row_number() OVER (PARTITION BY rd.adapter
           ORDER BY COALESCE(s.reliability_score,0.3) DESC, rd.published_at DESC NULLS LAST) AS adapter_rank
       FROM raw_documents rd LEFT JOIN sources s ON s.id = rd.source_id
       WHERE rd.country_iso2 = $1
         AND COALESCE(rd.published_at, rd.fetched_at) >= $2::date
         AND COALESCE(rd.published_at, rd.fetched_at) <  $2::date + interval '1 day'
         AND length(rd.content) >= 40 AND rd.content NOT LIKE $3 ) ranked
WHERE adapter_rank <= $4   -- $4 = ceil(600*0.4) = 240
ORDER BY COALESCE(reliability,0.3) DESC, published_at DESC NULLS LAST
LIMIT 600;

-- Saturation count (WRAP the LIMIT 600 inside a subquery, then count — f05 §d)
SELECT count(*) FROM ( SELECT r.id FROM (
    SELECT rd.id, rd.published_at, s.reliability_score AS reliability,
      row_number() OVER (PARTITION BY rd.adapter
        ORDER BY COALESCE(s.reliability_score,0.3) DESC, rd.published_at DESC NULLS LAST) AS adapter_rank
    FROM raw_documents rd LEFT JOIN sources s ON s.id=rd.source_id
    WHERE rd.country_iso2=$1 AND COALESCE(rd.published_at,rd.fetched_at) >= $2::date
      AND COALESCE(rd.published_at,rd.fetched_at) < $2::date + interval '1 day'
      AND length(rd.content) >= 40 AND rd.content NOT LIKE '[STUB FIXTURE]%'
  ) r WHERE r.adapter_rank <= 240
  ORDER BY COALESCE(r.reliability,0.3) DESC, r.published_at DESC NULLS LAST LIMIT 600 ) g;

-- Persisted stats + funnel for the three representative days
SELECT c.iso2, d.digest_date, d.track, d.id, d.created_at, d.structured->'stats' AS stats
FROM digests d JOIN countries c ON c.id=d.country_id
WHERE (c.iso2='ru' AND d.digest_date='2026-07-08' AND d.track='military')
   OR (c.iso2='ua' AND d.digest_date='2026-07-03' AND d.track='military')
   OR (c.iso2='ua' AND d.digest_date='2026-07-02' AND d.track='military');  -- ids 289,31,29

-- Events/claims/sources/entities per digest
SELECT d.id,
  (SELECT count(DISTINCT cl.event_id) FROM claims cl WHERE cl.digest_id=d.id) AS events,
  (SELECT count(*) FROM claims cl WHERE cl.digest_id=d.id) AS claims,
  (SELECT count(*) FROM claim_sources cs JOIN claims cl ON cl.id=cs.claim_id WHERE cl.digest_id=d.id) AS claim_source_rows,
  (SELECT count(DISTINCT cs.raw_document_id) FROM claim_sources cs JOIN claims cl ON cl.id=cs.claim_id WHERE cl.digest_id=d.id) AS distinct_docs_cited
FROM digests d WHERE d.id IN (289,31,29);

-- Traceability invariant checks (scratchpad/verify.sql)
SELECT count(*) FROM claims cl WHERE NOT EXISTS (SELECT 1 FROM claim_sources cs WHERE cs.claim_id=cl.id); -- → 0
SELECT count(*) FROM claim_sources cs WHERE NOT EXISTS (SELECT 1 FROM raw_documents rd WHERE rd.id=cs.raw_document_id); -- → 0

-- Corroboration fan-out (scratchpad/fanout.sql)
SELECT (SELECT count(*) FROM claims) total_claims,
       (SELECT count(*) FROM claim_sources) edges,
       (SELECT count(*) FROM (SELECT claim_id FROM claim_sources GROUP BY claim_id HAVING count(*)>1) a) claims_multi_source,
       (SELECT round(avg(dc),3) FROM (SELECT count(*) dc FROM claim_sources GROUP BY claim_id) b) avg_docs_per_claim;

-- Hedging ↔ corroboration, with single-/multi-doc split (re-measured 2026-07-09, §9b)
-- → confirmed 211 (141 single / 70 multi) @ 1.664 / 0.633; claimed 333 (258/75) @ 1.306 / 0.576;
--   assessed 19 (12/7); unverified 6 (4/2); unknown 1
SELECT cl.hedging, count(*) claims, round(avg(t.dc),3) avg_docs, round(avg(cl.confidence)::numeric,3) avg_conf,
       sum((t.dc=1)::int) single_doc, sum((t.dc>1)::int) multi_doc
FROM claims cl JOIN (SELECT claim_id, count(*) dc FROM claim_sources GROUP BY claim_id) t ON t.claim_id=cl.id
GROUP BY cl.hedging ORDER BY claims DESC;

-- Sources-per-claim histogram (§9b) → 1→416, 2→101, 3→33, 4→10, 5→6, 7→1, 9→1, 10→1, 11→1
-- i.e. 416/570 = 73.0% of claims cite exactly ONE doc
SELECT t.dc docs_per_claim, count(*) num_claims
FROM (SELECT claim_id, count(*) dc FROM claim_sources GROUP BY claim_id) t GROUP BY t.dc ORDER BY t.dc;

-- Confidence is driven by source reliability, not corroboration (§9b)
-- → single-doc avg 0.596 (n=416) vs multi-doc 0.602 (n=154); delta 0.006
SELECT (t.dc>1) multi_doc, count(*) n, round(avg(cl.confidence)::numeric,3) avg_conf
FROM claims cl JOIN (SELECT claim_id, count(*) dc FROM claim_sources GROUP BY claim_id) t ON t.claim_id=cl.id
GROUP BY (t.dc>1) ORDER BY 1;

-- 240-cap saturation grain (§1 constraint a, §6a): (date,theater,adapter) cells with >240 eligible
-- → 38 (every such cell is necessarily clipped by rank≤240 ⇒ 38 of 38). The "39"/"40" is the
--   coarser (date,theater) grain (§6a line 530), a different denominator.
SELECT count(*) cells_over_240 FROM (
  SELECT COALESCE(published_at,fetched_at)::date d, country_iso2, adapter, count(*) n
  FROM raw_documents WHERE country_iso2 IN ('ru','ua','ir')
    AND COALESCE(published_at,fetched_at)::date BETWEEN '2026-06-26' AND '2026-07-09'
    AND length(content)>=40 AND content NOT LIKE '[STUB FIXTURE]%'
  GROUP BY 1,2,3 HAVING count(*)>240) z;

-- Dead-column population (scratchpad/rdstats.sql)
SELECT count(*) total, count(embedding) with_embedding, sum(CASE WHEN processed THEN 1 ELSE 0 END) processed_true FROM raw_documents;

-- Recorded provider_usage (LLM = llm_match only)
SELECT provider, day::text, requests, units, est_usd FROM provider_usage ORDER BY provider, day;

-- Recorded /ask spend
SELECT provider, count(*) q, sum(prompt_tokens) ptok, sum(completion_tokens) ctok, sum(cost_usd) usd FROM ask_usage GROUP BY 1;

-- Regeneration redundancy (f13 §f): Σ docsAnalyzed last 7 days → 3970 over 64 digest-days
SELECT count(*) digest_days, sum((structured->'stats'->>'docsAnalyzed')::int) sum_docs_analyzed
FROM digests WHERE digest_date >= '2026-07-02' AND structured->'stats'->>'docsAnalyzed' IS NOT NULL;

-- Distinct docs ever cited last 7 days → 564
SELECT count(DISTINCT cs.raw_document_id) FROM claim_sources cs JOIN claims cl ON cl.id=cs.claim_id
  JOIN digests d ON d.id=cl.digest_id WHERE d.digest_date >= '2026-07-02';

-- Cadence: share of day-D corpus fetched by ET thresholds (f11 §b.2, abridged)
WITH c AS (SELECT country_iso2 theater, COALESCE(published_at,fetched_at)::date d, fetched_at FROM raw_documents
  WHERE country_iso2 IN ('ru','ua','ir') AND COALESCE(published_at,fetched_at) >= '2026-07-03' AND COALESCE(published_at,fetched_at) < '2026-07-10')
SELECT theater, d, count(*) corpus,
  count(*) FILTER (WHERE fetched_at <= d::timestamptz + interval '16 hour') by_12ET,
  count(*) FILTER (WHERE fetched_at <= d::timestamptz + interval '24.5 hour') by_D1_0030
FROM c GROUP BY theater, d ORDER BY theater, d;
```

Offline scripts (scratchpad, repo untouched): `f03_recon.mjs` (input tokens + source-mix cross-check), `f03_out.mjs` (output LB), `f03_lang.mjs` / `tok.mjs` (tok/char by lang), `nd.mjs` (verbatim minhash port), `serialize.mjs` (doc-line reproduction), `detect.mjs` (lang cross-check), `measure_prompt.mjs` (system-prompt tokens). Tokenizer throughout: `js-tiktoken getEncoding("o200k_base")`. Repo commit `32510eb`. LLM spend during audit: **$0.00**.

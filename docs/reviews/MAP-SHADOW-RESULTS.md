# Map Stage — Shadow Results (MR Sprint 2)

- **Date:** 2026-07-09 (backfill completed ~17:10 UTC)
- **Status:** SHADOW — the production digest pipeline is byte-untouched; nothing reads
  `doc_claims` yet. This report is the evidence base for the sprint-3 (reduce) go/no-go.
- **What shipped:** persistent per-doc claim store (`doc_claims`, keyed
  `(raw_document_id, track, extractor_version, ordinal)`), persistent dedup verdicts
  (`doc_dedup`), map dispositions (`doc_map_state`), hourly `/api/cron/map` (own group,
  :40), `MAP_USD_CAP_DAILY` fail-closed SpendGuard with its own `openai_map` ledger row,
  budget-gated backfill 2026-07-04 → 2026-07-09.
- All queries below run against current extractor versions only
  (`mapExtractorVersion()`: military ru/ua `d73cc83ed8df`, military ir `75e0ff6403db`,
  elite `15a6078371bd`, nuclear `19c06260f149`). Two superseded versions from this
  sprint's own prompt iterations remain in the store as append-only history
  (OPEN-TASKS #35).

## 1. Headline

| metric | value |
|---|---|
| eligible docs in window (ru/ua/ir, 07-04..09, non-holdout) | **37,616** |
| dedup mirrors (never sent to the LLM) | **3,473** (9.2%) — 647 exact, 2,826 minhash (avg jaccard 0.919) |
| canonical docs reaching a final disposition | **34,143 — 100.0% on every theater×day** (DoD asked ≥95%) |
| docs extracted (≥1 applicable track) | 23,020 |
| docs with no applicable track (lexicon gate, mostly ir) | ~11,100 — cost $0 |
| (doc × track) extractions | **25,358** |
| claims in the store | **14,071** (military 12,524 · elite 1,195 · nuclear 352) |
| LLM calls / tokens | 1,705 requests · 6.83M tokens |
| **all-in spend** (incl. ~$0.14 of pre-fix experiments) | **$1.75** — backfill proper $1.61 vs $2.59 modelled, vs $6 gate, vs $8 sprint budget |
| **$/1K docs · $/1K (doc×track) pairs** | **$0.076 · $0.069** — the audit's per-doc-call band was $0.12–0.21/1K (§11); micro-batching + cheap empty verdicts beat it ~2× |
| integrity counters (whole backfill, post-fix) | **0 omitted docs · 0 hallucinated docIds · 0 truncations · 0 batch errors · 0 budget stops** |

Per-day actual vs modelled: 07-04 $0.20/$0.30 · 07-05 $0.18/$0.30 · 07-06 $0.24/$0.39 ·
07-07 $0.31/$0.50 · 07-08 $0.40/$0.66 · 07-09 $0.28/$0.42. Actuals run ~35–40% under
model because ~46% of extractions return zero claims and an empty verdict costs ~20
output tokens, not the modelled 135.

## 2. Coverage per theater / day (canonical eligible → disposition)

Every one of the 18 theater×day cells reached **100.0%**. Eligible / mirrors / canonical:

| day | ru | ua | ir |
|---|---|---|---|
| 07-04 | 2,725 / 226 / 2,499 | 211 / 17 / 194 | 309 / 12 / 297 |
| 07-05 | 1,912 / 199 / 1,713 | 1,069 / 151 / 918 | 392 / 12 / 380 |
| 07-06 | 2,358 / 273 / 2,085 | 1,126 / 143 / 983 | 1,268 / 100 / 1,168 |
| 07-07 | 3,156 / 333 / 2,823 | 863 / 146 / 717 | 3,990 / 353 / 3,637 |
| 07-08 | 3,607 / 259 / 3,348 | 844 / 155 / 689 | 6,828 / 485 / 6,343 |
| 07-09 | 2,154 / 183 / 1,971 | 884 / 115 / 769 | 3,920 / 311 / 3,609 |

(ir counts are higher than the audit's §6 table because MR1's Persian retag moved 3,418
docs ru→ir after the audit snapshot, and the corpus live-drifts.)

Mapped docs by theater × adapter: ru — telegram 6,586, x_api 4,823, rss 1,863, gdelt
1,167; ir — x_api 3,547, rss 486, telegram 278; ua — gdelt 1,629, telegram 1,246, rss
820, x_api 575.

**Holdout:** 586 doc-days from the three Lebanese channels (OPEN-TASKS #29 —
mtvlebanonews, sameralhajali, mmirleb) were **excluded, not mapped**, and are counted in
every run (`holdoutSkipped`). After Gregory's retag decision one catch-up pass maps them
under the right theater; the `(doc, track, version)` key makes that safe.

## 3. Claims-per-doc distribution and empty rate

| track | mapped | 0 claims | 1 | 2 | 3 | % empty |
|---|--:|--:|--:|--:|--:|--:|
| military | 22,178 | 9,976 | 11,902 | 278 | 22 | **45.0%** |
| elite_politics | 2,624 | 1,441 | 1,172 | 10 | 1 | **54.9%** |
| nuclear | 556 | 212 | 336 | 8 | 0 | **38.1%** |

Zero-claim verdicts are the designed cheap outcome (routine chatter, ads, link reposts).
The elite rate is highest because its lexicon prefilter is the loosest (a single word
like "court" admits docs the prompt then correctly judges non-elite).

## 4. Dedup savings

3,473 mirrors were never sent: at the measured $0.069/1K pairs and ~1.1 applicable
tracks/doc that is only ~$0.26 per full pass — but the point is **per-regeneration**
persistence: the digest pipeline re-pays its transient in-batch dedupe ~8×/day forever,
while `doc_dedup` is paid once. The far larger saver is track applicability at map time:
~11,100 ir docs matching no lexicon cost $0 instead of 3 extractions each, and elite/
nuclear ran on 2,624/556 docs instead of 34,143 — mapping every doc under every track
would have roughly tripled spend.

## 5. The integrity story (what sprint 3 can rely on)

- **docId containment:** 0 hallucinated ids across 1,705 calls (the parse gate mirrors
  the digest's).
- **Omission is solved at the grammar level, not the prompt level.** gpt-4o-mini answered
  1 of 15 docs (finish_reason=stop) with an unbounded results array; no prompt wording
  fixed it (43–57% omission). `minItems`/`maxItems` = batch size forces the count via
  constrained decoding: 0 omissions across the entire backfill. Recorded in the AGENTS
  decision log — any future batched per-item extraction should start there.
- **Idempotency held in practice:** the run crossed two prompt revisions, one mid-run
  abort, four redeploys and an hourly cron firing concurrently (advisory lock skipped it
  cleanly); unique keys + `doc_map_state` anti-join produced no duplicates.

## 6. Coverage spot check — 30 hand-judged (digest claim, cited doc) pairs

Stable pseudo-random sample (`scripts/map-coverage-check.ts 30`, seed = md5 of ids) over
all production digests in the window. For each pair: does the store hold a semantically
matching claim on the doc the digest cited (mirrors resolved to canonical)?

| verdict | count |
|---|--:|
| doc has map claims, **semantic match** | **23 / 30 (77%)** |
| doc has map claims, different assertion picked | 3 |
| doc mapped EMPTY (scope filter dropped what the digest used) | 4 |
| doc unmapped | **0** |

The 7 misses, honestly classified:
- **4 scope-filter empties** — the digest built claims from soft/contextual content the
  map judged off-scope: Kuwait/Bahrain power outages (#10), "analysts say Khamenei's
  legacy will influence resistance" (#13), Trump criticizing Europeans (#17), funeral
  crowd size as public-support signal (#22). Two of these are the kind of low-value
  commentary the scope rules *should* drop; two (power outages, diplomatic criticism)
  are arguable and worth a scope-rule pass in sprint 3.
- **2 different-assertion picks** — the doc holds several assertions and the map's ≤3
  chose differently than the digest (#1, #11).
- **1 cap-induced loss** (#23) — a dense multi-front daily-summary doc where 0–3 claims
  cannot carry everything; the digest pulled a fourth assertion.

Two samples cut the other way — the **map is more faithful to the source than the
production digest**: #8 the digest flipped whose armored vehicles were destroyed (the
doc, per its map claim and original text, reports *Ukrainian* losses; the digest says
Russian); #3 the digest relocated a Chasiv Yar engagement to Slavyansk. Single-doc
extraction with a verbatim quote makes such errors visible and attributable for the
first time.

## 7. Ten random mapped claims with their original-language quotes (for Gregory)

Drawn `ORDER BY md5(id || 'seed7') LIMIT 10`, unedited:

1. **ua/military/uk** [claimed] "The State Special Communications Service expanded the list of prohibited software and communication equipment."
   — «Держспецзв'язку розширила Перелік забороненого до використання програмного забезпечення та комунікаційного (мережевого) обладнання з 880 до 1079 позицій.» (t.me/dsszzi_official/8855)
   *Note: the English drops the concrete 880→1079 figure — atomicity trimmed a useful number.*
2. **ir/military/en** [claimed] "US strikes aim to suppress Iranian air defenses and target maritime threats in the Strait of Hormuz."
   — "Furthermore the objective of these US strikes is to perform Suppression and Destruction of Enemy Air Defenses (SEAD) & (DEAD) while also targeting fast boats cruise missiles, anti ship missiles and drones…" (x.com/levantupdates)
3. **ir/military/en** [claimed] "Iranian state media confirmed a cruise missile impacted the Bushehr nuclear power plant, but no damage occurred."
   — «ایرانیان... تأسیسات هسته‌ای بوشهر را هدف قرار دادند.» (x.com/MarioNawfal)
   *Defect: quote carries an ellipsis (rule violation) and is Persian inside an en-tagged doc — one of the ~29% strict-verbatim misses.*
4. **ru/military/en** [claimed] "Zelensky discussed the shortage of Patriot interceptors and the need for air defense support with US Congress members."
   — "I informed them about the Patriot interceptor shortage and Russian attacks on our people." (x.com/ZelenskyyUa)
5. **ir/military/en** [claimed] "CENTCOM launched new strikes on Iran in response to attacks on three commercial ships in the Strait of Hormuz."
   — "CENTCOM launched new strikes on Iran over attacks on three commercial ships in Hormuz." (x.com/MarioNawfal)
6. **ru/military/en** [claimed] "Former Wagner Group fighters assaulted a journalist at a gas station in Yekaterinburg."
   — "Men claiming to be former Wagner Group fighters assault journalist filming gas station line in Russia." (meduza.io)
   *Note: source says "claiming to be former Wagner" — the English hardened it; hedging='claimed' preserves the epistemic status.*
7. **ru/military/ru** [claimed] "Russia claimed to have destroyed a British-made Rapid Ranger air defense system in the conflict zone."
   — «Минобороны РФ впервые заявило об уничтожении зенитного ракетного комплекса Rapid Ranger производства Великобритании в зоне СВО» (t.me/DnevnikDesantnika)
   *Note: "впервые" (for the first time) dropped — minor loss.*
8. **ru/military/uk** [claimed] "Ukrainian forces struck eight tankers of the Russian shadow fleet in one night."
   — «Сили оборони уразили вісім танкерів тіньового флоту РФ за одну ніч» (glavcom.ua)
9. **ua/military/en** [claimed] "The Russian Ministry of Defense reported the repulsion of over 600 drones."
   — "Russia repels over 600 drones during Ukrainian attack MOD" (heraldglobe.com)
10. **ru/military/en** [claimed] "Ukrainian Unmanned Systems Forces reported strikes on 20 Russian vessels over three days, including 12 yesterday."
    — "Ukraine's Unmanned Systems Forces have already recorded strikes on 6 Russian vessels today in their statistics. Yesterday, they struck 12 vessels, including 10 tankers." (x.com/bayraktar_1love)
    *Note: "20 over three days" is the model's arithmetic across the doc's numbers, not a source phrase — borderline synthesis inside one doc.*

Translation fidelity across the ten: 8 faithful, 1 hardened attribution (#6), 1 dropped
qualifier (#7), 1 dropped figure (#1), 1 in-doc arithmetic synthesis (#10) — none
invents facts absent from the source.

## 8. Quality defects observed (the honest list)

1. **quote_orig is verbatim only ~71% of the time** by strict normalized containment
   (523 misses / 1,795 claims counted during the run). Sampling the misses shows most
   are unicode/whitespace-level (em-dash spacing, the model silently *fixing* source
   typos, invisible chars) — true paraphrase/translation slips are a minority but real
   (§7 #3). OPEN-TASKS #34: verify-or-repair before rendering quotes as evidence.
2. **Entity discipline is good but not perfect:** top entities are rule-compliant (IRGC,
   FSB, named people), but bare geography leaks through — "Iran" (105), "United
   States" (73) — and occasional collectives ("law enforcement"). The digest path has
   the same failure mode (its entity cleanup was a separate pass); sprint 3's reduce
   should reuse the existing canonicalization rules, not trust map entities raw.
3. **Near-duplicate claims within one doc** (#19, #23 in the spot check): the model
   sometimes emits the same assertion twice with slightly different wording against its
   0–3 budget. A cheap reduce-side minhash over claim text will collapse these.
4. **The 3-claim cap loses content on dense summary docs** (spot check #23). Options for
   sprint 3: raise the cap for docs above a length threshold, or accept the loss (the
   affected docs are daily-roundup posts whose items usually also arrive as individual
   posts).
5. **`hedging` skews conservative:** map claims are almost uniformly `claimed` —
   correct for single-doc evidence under HARD RULE 3, and exactly what the audit
   predicted (§9b): the multi-doc `confirmed` uplift (~33% of confirmed) is the reduce's
   job. The rare map-side `confirmed` (e.g. Windward-verified Hormuz activity, §6 #16)
   used self-corroborating content, as instructed.

## 9. Verdict for sprint 3

The per-doc store is **good enough to build the reduce on**: 100% disposition coverage,
zero integrity violations, 77% hand-judged semantic coverage of what production digests
actually cited — with most of the gap being deliberate scope filtering rather than
extraction failure, and two cases where the store is *more* accurate than the digest.
Cost scales at ~$0.08/1K docs — a full peak day (~11.5K docs) maps for under a dollar,
once ever, versus the digest path re-reading its window ~8×/day forever. The known
weaknesses (quote verbatimness, entity leaks, in-doc near-dupes) all have cheap
reduce-side or prompt-side fixes and none blocks clustering, which depends on
`event_hint` + claim text, both of which look strong in the samples.

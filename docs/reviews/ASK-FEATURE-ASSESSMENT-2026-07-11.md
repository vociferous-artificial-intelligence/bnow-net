# BNOW.NET — ASK Feature: Value Assessment & Upgrade Path
**Date:** 2026-07-11 · **Prepared for:** Gregory · **Basis:** code-verified state report (2026-07-11), product brief (2026-07-04), review & plan (2026-07-10), current model pricing (verified 2026-07-11)

---

## 1. The short answer

Yes, ASK is undervalued — and the evidence is in your own configuration. It is capped at $1/day globally, runs on the cheapest model in the fleet, sits behind its own bolt-on rate limiter outside SpendGuard, has no eval harness, and appears nowhere in the product brief's feature list. Yet it is the **only interactive surface in the product that expresses the core differentiator** — claim-to-source traceability. The digest is the product's voice; ASK is the product's *proof*. When a prospect (especially a government one, per the BENGAL framing in the brief §2) asks "how do I know this isn't hallucinated?", ASK is the demo: type a question, get an answer where every sentence carries a clickable claim ID that resolves to a source document. Recorded Future's equivalent ("AI with citations over our intelligence graph") is a headline feature of a $300M-ARR product. Yours is a footnote behind a $1/day budget.

The analyst use case you describe — "I scanned forty sources today, I half-remember a claim, give me the citation" — is real and specific. It is not "chat with your data." It is **provenance recall**: the answer's value is the citation itself, not the prose. Generic chatbots structurally cannot do this because they have no claim registry with stored source lineage. You do. That inversion (the citation is the product, the prose is the wrapper) should drive both the engineering priorities and the positioning below.

**But do not lead with it yet.** The current retrieval layer will embarrass the feature exactly when it matters most, for reasons in §2. Fix retrieval first (cheap), then lead with it loudly.

---

## 2. How good is the current selection of cited items? Honestly: it's the weak link

The model is fine for what it's asked to do. The evidence it's handed is the problem. Current retrieval is 8 keyword terms → `ILIKE '%term%'` OR-matching → top 40 by recency-then-confidence. Failure modes, in rough order of how much they'll hurt an analyst:

1. **No semantic matching.** "Strikes on energy infrastructure" will not retrieve claims phrased "attacks on the power grid." For an OSINT corpus that is heavily machine-translated and multi-source, vocabulary mismatch between question and claim text is the *default* case, not the edge case. This is the killer: the system will answer "the evidence is insufficient" while the claim sits in the database — the single most trust-destroying failure a provenance-branded product can have.
2. **No time-window handling.** "Past month" is stripped as a stopword; there is no `claim_date` filter at all. Analysts think in windows ("since the strike," "this week"). Answers can silently reach arbitrarily far back.
3. **Recency-first ordering ≠ relevance ordering.** The 40-claim cutoff is recency-ranked within the keyword match set, so the most *relevant* claim can be pushed out by 40 newer, marginally-matching ones. There is no relevance score anywhere in the pipeline.
4. **Substring ILIKE noise.** `%war%` matches "warehouse"; short entity names pollute the match set and eat evidence slots.
5. **Confidence is source reliability, not answer relevance.** Reasonable as a tiebreaker, but it means a highly reliable off-topic claim outranks a moderately reliable on-topic one.
6. **The entity "pressure" ranking** (defendant/target/dismissed counts) is a legal-flavored score being reused for geopolitical questions — probably harmless, probably not helping.
7. **No retrieval eval exists.** For a product whose entire brand is quantified validation (the ISW scoreboard), ASK has no recall metric. You can't currently answer your own question — "how good is our selection?" — with a number.

The upshot: **upgrading the model before upgrading retrieval buys almost nothing.** A frontier model reasoning over the wrong 40 rows produces a beautifully-written wrong answer. The evidence selection is where the value is created or destroyed.

---

## 3. The best approach, in ROI order

### Tier 1 — Do immediately (near-zero cost, hours of work)
- **Swap `gpt-4o-mini` → `gpt-5-mini`.** At $0.125/$1.00 per 1M tokens vs 4o-mini's $0.15/$0.60, a typical ASK query costs the *same* (~$0.0009) on a model roughly two generations newer. It's a config change (`OPENAI_MODEL`). `gpt-5-nano` ($0.05/$0.40) is even cheaper than today if you want to *cut* cost.
- **Set `max_tokens`** on the ASK completion (the state report flags this as the one call site without an output ceiling — it's a spend-guard gap, not a quality issue).
- **Handle `refusal`/empty responses** distinctly from "(no answer)" — cheap insurance given the conflict-zone subject matter and no moderation layer.
- **Parse time windows before term extraction.** A small deterministic pass ("past week/month," "since <date>," month names → `WHERE claim_date >= ...`) fixes failure mode #2 without any model at all.
- **Move ASK under SpendGuard** (Standing Ruling 4 consistency) while keeping the per-user daily limit.

### Tier 2 — The real upgrade: hybrid retrieval (the actual answer to "best approach")
pgvector is already in the stack. The standard pattern, and the right one here:

1. **Embed the claim corpus once** with `text-embedding-3-small` ($0.02/1M tokens — embedding 100K claims ≈ 6M tokens ≈ **$0.12 one-time**; new claims embedded at digest-persist time for fractions of a cent per day).
2. **At ask time:** embed the question (~$0.000001), run vector similarity AND the existing keyword/tsvector match, union to ~120–150 candidates, apply the parsed date window.
3. **Score = semantic similarity × recency decay × source reliability** — all three signals you already store, finally combined instead of recency winning by default.
4. **Optional rerank stage:** pass the 120–150 candidates through `gpt-5-nano`/`gpt-5-mini` as a cheap listwise reranker ("return the 40 claim IDs most relevant to this question") before the answer call. Adds ~$0.001–0.002/query and typically buys more accuracy than any answer-model upgrade.

This is retrieval-augmented generation done properly rather than keyword-grep RAG — and it's the difference between "sometimes finds the citation" and "reliably finds the citation," which per §1 is the entire product promise of this feature.

### Tier 3 — Measure it (this is the one that's most *you*)
Build a 30–50 question **ASK eval set** with known-answer claim IDs (harvest from digest output: take a published claim, write the question an analyst would ask to re-find it). Track **retrieval recall@40** and **citation precision** before/after each change. This costs pennies to run and gives ASK the same scoreboard discipline the digest pipeline has. It also becomes a sales artifact: "our Q&A layer's citation recall is X%, measured daily" is a sentence no competitor is publishing.

### What's *not* worth it yet
Conversation memory (the single-turn statelessness is fine for the citation-recall use case — arguably a feature), agentic multi-hop retrieval (cost/latency for marginal gain at current corpus size), and a fine-tuned model (nowhere near enough eval data to justify it).

---

## 4. Cost: current vs. upgraded vs. "best"

Anatomy of a query today: ~200 token system prompt + ~40 claims and 15 entities serialized (~3,500–4,500 tokens) + question ≈ **~5K input, ~250–400 output**.

| Configuration | Per query | 440 q/mo (20/day × 22 days, one heavy analyst) |
|---|---|---|
| **Current** — gpt-4o-mini, keyword retrieval | ~$0.0009 | ~$0.40 |
| Tier 1 — gpt-5-mini, same retrieval | ~$0.0009 | ~$0.40 |
| Tier 2 — hybrid retrieval + nano rerank + gpt-5-mini answer | ~$0.003 | ~$1.30 |
| Tier 2+ — hybrid + rerank + **gpt-5** ($1.25/$10) answering over top 60 (~7K in/400 out) | ~$0.014 | ~$6.20 |
| Max — hybrid + rerank + **Claude Sonnet 5** ($2/$10 intro) or **gpt-4.1** ($2/$8) | ~$0.017 | ~$7.50 |
| Gold-plated — **Claude Opus 4.8** ($5/$25) answering | ~$0.043 | ~$19 |

(Embedding costs are noise at every tier: ~$0.12 one-time corpus embed, <$0.01/day incremental.)

**The strategic read:** the "best" defensible configuration — hybrid retrieval, cheap rerank, frontier answer model — costs **1.5–2 cents per query, under $10 per heavy analyst per month**. Against the brief's $1–3K/mo seat pricing that is a rounding error (~0.3–0.7% of revenue per seat). The current $1/day global budget supports ~1,200 queries/day as configured, but only ~60–70/day at the best-tier cost — so the budget, not the model, is the binding constraint to raise (to $5–10/day) when you upgrade. Even that assumes usage you'd be *thrilled* to have.

A sensible production shape: **Tier-2 pipeline with gpt-5-mini as the default answerer** (~$0.003/query — 3× today's cost for a step-change in retrieval quality), with the frontier model reserved for a "deep answer" button or a premium tier if you ever want the differentiation. Most of the quality gain comes from retrieval, so the cheap answerer captures ~80% of the value at ~20% of the best-tier cost.

---

## 5. Product positioning: should you lead with it?

**Yes — after Tier 2 ships.** Three arguments:

1. **It's the demo.** The validation scoreboard is the credibility asset for the government pitch, but it's a chart; ASK is the thing a prospect *touches*. "Ask anything; every sentence is cited to a source you can click" is the BENGAL anxiety answered interactively, in ten seconds, by the buyer themselves. Lead demos with ASK, close with the scoreboard.
2. **It matches the daily analyst workflow, not the daily-digest workflow.** The digest is push (read once, morning). ASK is pull (used all day, at the moment of need — drafting a report, needing the sourcing for a half-remembered claim). Pull features drive session frequency, and session frequency is what survives the crisis-decay cycle the brief worries about in §6.5: an analyst on the $300–500 standby tier who still uses ASK weekly is a warm re-upgrade, not a churn.
3. **It's defensible where chat isn't.** Anyone can bolt ChatGPT onto a news feed. Nobody can answer *with your claim registry's citations* without building your ingestion + claim-extraction + reliability pipeline. Positioning language worth testing: **"Answers with receipts"** / "Every answer cites the claim; every claim cites the source."

Concrete product moves, small to large: rename/frame it around citation lookup rather than generic Q&A (the "Interrogate the intelligence" copy is right — surface it harder); put an "Ask" box on the digest page itself, pre-scoped to that digest's claims (the scanned-sources-today workflow, nearly free to build); show retrieved-but-uncited claims below the answer as "related claims" (turns weak answers into useful ones); and eventually expose per-answer confidence drawn from the cited claims' reliability scores — no competitor shows that.

One dependency to keep in view: **ASK is downstream of corpus coverage.** Its ceiling is set by what the digest pipeline ingested — which is why the MR cutover and Telegram/MTProto unlock (per the 2026-07-10 review) also quietly raise ASK's value. Same asset, second surface.

---

## 6. Recommended sequence

1. **Tier 1 quick wins** (model swap, max_tokens, refusal handling, date-window parse, SpendGuard) — fits inside the existing hardening-sweep prompt's /ask task; hours, not days.
2. **ASK eval set** (30–50 known-answer questions) — before Tier 2, so the retrieval upgrade lands with a before/after number.
3. **Tier 2 hybrid retrieval + rerank** — one focused sprint; the pgvector infrastructure already exists.
4. **Raise ASK budget to $5–10/day, then reposition** — homepage/demo prominence, digest-page ask box, "answers with receipts" framing.
5. Revisit a frontier-model premium tier only if eval data shows the answer model (not retrieval) is the residual bottleneck.

---

## Pricing sources (verified 2026-07-11)
- OpenAI per-1M-token: gpt-4o-mini $0.15/$0.60 · gpt-4.1-mini $0.20/$0.80 · gpt-4.1 $2/$8 · gpt-5-nano $0.05/$0.40 · gpt-5-mini $0.125/$1 · gpt-5 $1.25/$10 (pricepertoken.com)
- Anthropic per-1M-token: Haiku 4.5 $1/$5 · Sonnet 5 $2/$10 (intro through 2026-08-31, then $3/$15) · Opus 4.8 $5/$25 (platform.claude.com pricing docs)
- Embeddings: text-embedding-3-small $0.02/1M · text-embedding-3-large $0.13/1M

*Cost-per-query figures are estimates from the token anatomy above; validate against the `ask_usage` table's logged token counts once live.*

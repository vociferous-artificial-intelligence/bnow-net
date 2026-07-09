# MR Sprint 3 — Reduce, A/B, Cutover (running review doc)

- **Started:** 2026-07-09. Budget ≤ $12 LLM, env-capped fail-closed.
- Session resume point: `MR3-CHECKPOINT.md`.

## TASK 0 — #29 closed (Lebanese channels → ir)

Operator adjudication executed 2026-07-09: 3 `TELEGRAM_CHANNEL_THEATER` pins, map
holdout removed, `retag-theater --apply` moved **651 docs ru→ir**, deploy, one
catch-up map run: 620 selected → 100% disposition, **41 claims, $0.0041**, 0
omissions/hallucinated ids/truncations; second dry run `selected=0`. Channel claims
now under ir (mtvlebanonews 28, sameralhajali 9, mmirleb 0 — the lexicon gate
zeroes routine chatter). Decision + rationale in the AGENTS.md log; follow-up #37
(multi-theater source tagging).

## TASK 1 — deterministic reduce core

**Shipped:** `src/lib/analysis/reduce.ts` (pure core), `reduce-io.ts` (loader),
`map-versions.ts` (the single #35 version accessor — every doc_claims consumer goes
through it), `quote-verify.ts` (shared normalization; map worker now stamps
`quote_verified` at insert — migration `0012_doc_claims_quote_verified.sql` — and
the loader lazily backfills pre-stamp rows), `scripts/reduce-tune.ts` (threshold
calibration). 34 new unit tests.

### Threshold calibration (scripts/reduce-tune.ts, 2026-07-09)

Labelled pairs from prod claims in the map window (2026-07-04+, ru/ua/ir military):
positives = map-claim pairs bridged by a multi-doc prod claim (the legacy batch's
own same-assertion judgment); negatives = best map anchors of different-event prod
claims in the same digest. After the adversarial-review fixes (deterministic
array_agg order, military-track-only anchors, integer sweep): **28 positive /
170 negative** (small positive set — honest caveat; re-tune as the corpus grows).

| thr | precision | recall | F1 |
|---|---|---|---|
| 0.20 | 0.926 | 0.893 | 0.909 |
| 0.25 | 0.957 | 0.786 | 0.863 |
| 0.30 | 0.955 | 0.750 | 0.840 |
| **0.35** | **1.000** | **0.714** | **0.833** |
| 0.40 | 1.000 | 0.643 | 0.783 |
| 0.50 | 1.000 | 0.357 | 0.526 |

Operating point **0.35**: highest zero-false-positive threshold. Over-merge
misdates claims (ruling 12); under-merge only loses corroboration edges.

### Adversarial review of the core (25-agent workflow, 2026-07-09)

Four-lens review + per-finding adversarial verification over commit 63c4b25.
Confirmed-and-fixed: maxReliability had a hidden 0.3 floor (sub-0.3 sources were
over-ranked); HEDGING_LADDER omitted 'assessed' (factual+assessed members
collapsed to 'unknown'); isMetaClaim over-matched genuine quiet-day world
negations ("No significant developments occurred along the Kupyansk axis") — now
requires "claims"-talk or document self-reference; the ±1-day gate failed OPEN on
unparseable dates (NaN) — now fails closed; quote-verify missed bidi ISOLATES
U+2066–2069 and ALM U+061C (real in Arabic content); latestPublishedAt used
lexicographic sort (hardened to timestamp compare); the tuner's array_agg had no
ORDER BY, mixed non-military anchors in, and its float sweep never reached 0.75
(all three fixed, threshold re-verified above); scripts/map-coverage-check.ts
read doc_claims without the #35 version accessor (patched). Rejected as not-real:
anchor-gate 3-day spans (impossible with the <=2-day windows the engine uses;
constraint documented in pairScore).

### Two defects found by running against the real corpus (and their fixes)

1. **Single-linkage percolation.** Union-find over threshold pairs chained **519
   claims (30% of ru 07-08) into one "group"** through intermediate rewordings.
   Fix: greedy **star clustering** — a claim joins the best-scoring group ANCHOR or
   founds a new group; membership is non-transitive by construction. Regression
   test: A~B, B~C, A≁C keeps C out.
2. **Meta-claims in the store.** The map prompt lets self-referential artifacts
   through as claims ("No significant military-security claims found in this
   document." — 51 rows, 5 wording variants). Reduce drops them (`isMetaClaim`,
   tight regex; real negations like "Ukraine does not need Taurus missiles"
   survive, tested). Map-prompt fix deferred: it bumps `extractor_version` and
   needs the #33 remap path.

### Smoke result — ru/military 2026-07-08 (heaviest real day, read from prod)

1,696 map claims → **1,052 groups** in 133 ms; top group size 20 (was 519 under
union-find); **270 multi-doc groups (25.7%** — matches the audit's ~27% multi-doc
claim structure §9b); **101 corroboration promotions** (claimed→confirmed from ≥2
independent domains, mirrors excluded); 192 confirmed total; **717 groups carry a
verified original-language quote** (68%, consistent with the ~71% verbatim rate,
#34). Top-ranked groups are the day's real stories (diesel-export ban, Patriot
license transfer, Su-35 shootdown, Azov tanker strikes, CENTCOM Hormuz strikes).

Invariant coverage (unit-tested): mirrors never count as independence; promotion
requires domain diversity; single-doc `confirmed` passes through (HARD RULE 3);
unknown-domain docs prove nothing; confidence = mean COALESCE(reliability, 0.3)
over distinct docs (legacy semantics); entities go through the MR1 canonicalization
rules (junk dropped, aliases folded); only verified quotes surface as evidence;
±1-day date gate (recurring-template rule); deterministic under input reordering.

## TASK 2 — K-voted synthesis engine

**Shipped:** `src/lib/analysis/synthesize.ts` (generateMapReduceDigest),
`digest-persist.ts` (the persist transaction extracted VERBATIM from digest.ts —
one invariant-preserving path both engines share), `engine.ts` (DIGEST_ENGINE
dispatch, default legacy, gulf fallback tested), reduce spend rails in
llm-guard.ts (`openai_reduce` ledger, REDUCE_USD_CAP_DAILY fail-closed — set in
all three Vercel envs 2026-07-09 before any deploy could read it).

Design points that make hallucination structural, not behavioral:
- The model receives claim GROUPS (`[gid] (hedging, conf, sources=N, claims=M)
  text -- hint`), top ~200 by deterministic rank (corroboration × max
  reliability × size × recency); the cut is recorded as
  `stats.reduce.groupsTotal/groupsFed`.
- The model returns events + claims citing gids ONLY. docIds, hedging,
  confidence and entities all derive server-side from the cited groups.
  Unknown gids are stripped and counted (`droppedGidRefs` — 0 in the smoke and
  the A/B so far).
- **K=3 voting (closes #28's mechanism):** an event survives only if ≥2 votes
  independently produce it (matched by gid-set overlap ≥ 0.5); claims keep only
  majority gids; wording comes from the MEDIAN-length roll. Per-vote event
  counts persist in `stats.reduce.eventsPerVote`.
- **#32 closed on BOTH engines:** persistDigest refuses empty regenerations and
  regenerations carrying <50% of the existing claim count
  (DIGEST_MIN_CLAIM_RATIO, FORCE_REGEN=1 override); refusals reach cron_runs
  counts (`overwriteRefusals`). Integration-tested against a real branch.

Smoke (branch, ru/military 2026-07-08): 1,696 claims → 1,052 groups → 200 fed →
votes [6,6,8] → 7 merged events / 14 claims, $0.0063, 32K prompt tokens, zero
truncations, zero dropped gids. Multi-doc corroboration visibly restored (one
Su-35 claim cites 15 docs across independent sources).

Intraday support for the TASK 4 cadence (code shipped, deploy gated): rolling
24h window (`window: 'rolling'`), delta framing vs the previous run of the day
(`stats.delta` + a "Since the previous brief" markdown lead).

## TASK 3 — the A/B gate (two rounds, honestly reported)

Design: disposable Neon branch `br-proud-sun-atn3fch0` (fork of prod incl.
doc_claims + ISW corpus); window 2026-06-29 → 2026-07-08 (the 5 pre-epoch days
were map-caught-up first: ~4.2K docs, $0.35); ru/ua/ir military; K=3 independent
regenerations per (day, theater, arm), every roll validated with the k=5
majority matcher against same-day ISW; FORCE_REGEN=1 so the #32 guards never
mask roll variance; every sample persisted to an append-only JSONL the moment it
completed (the driver resumes by key — proven live when the reduce guard's
500-request/day cap stopped round 2 mid-sweep: error rows stripped, cap raised,
resumed, zero samples lost).

### Round 1 (K=3): variance FAIL — diagnosis

180/180 samples (`MR3-AB-RESULTS.jsonl`): coverage 24.9 vs 21.1 PASS,
unsupported 0.31 vs 0.41 PASS, **within-cell coverage SD 10.5 vs 8.0 FAIL** —
while claim-level reproducibility was BETTER (0.73 vs 0.55). Paired analysis:
the SD gap was statistically indistinguishable (permutation p=0.35, 8-vs-8
cells, 14 ties) and dominated by marginal-EVENT flips: between generations,
events sitting at 2-of-3 vote support flip in/out, and on low-takeaway ISW days
one flipped match moves coverage 17–50 pts (worst cell ru 07-07: 100→33→0 —
k3's rolls under-produced exactly the frontline-advance and strike events ISW
scores). Legacy's median cell SD was 0.00 (same batch + temp 0.2 back-to-back
mostly reproduces) with its own fat tail (ua 07-01: 0→83→0).

### Round 2 (K=5 + majority-gid fill): GATE PASSES

Two mechanism-targeted changes, both committed before the re-run: REDUCE_VOTES=5
(majority 3-of-5 makes thin rolls rarer) and majority-gid fill in
`finalizeEvents` (a group a majority of votes placed in an event gets a
deterministic claim from the group's own text even when the median roll's
wording dropped it). Mapreduce arm re-run (90 samples, `MR3-AB-K5.jsonl`)
against the untouched round-1 legacy baseline:

| metric | legacy | mapreduce (K=5) | gate |
|---|---|---|---|
| coverage mean % | 21.14 | **24.97** | PASS |
| coverage within-cell SD | 8.02 | **6.94** | PASS |
| unsupported-claim rate | 0.408 | **0.296** | PASS |
| claims / digest | 6.5 | 7.2 | |
| events / digest | 6.3 | 4.0 | |
| distinct docs cited / digest | 9.5 | **24.9** | |
| x-share of citation edges | 0.428 | 0.437 | |
| LLM cost / digest | $0.0022 | $0.0068 | |
| #28 claim-level reproducibility | 0.549 | **0.745** | |

Per-theater paired day-mean coverage: ru **−0.06** (p=1.00, dead parity), ua
**−3.57** (p=0.45 — indistinguishable from the known ±9.6 extraction noise,
same scale as the MR1 quota finding), ir **+15.11** (p=0.067 — the one
near-significant effect; the map's full-corpus reach pays off exactly where the
legacy 100-doc batch was starved on x-heavy days). Variance point estimate now
favors mapreduce (−1.08 paired, p=0.64 — at n=3/cell, variance is a noisy
instrument; claim-level repro, the sharper one, improved 0.55→0.75).

**Verdict: cut over.** All three gate criteria pass as point estimates; the
mechanism behind the round-1 failure was identified, fixed, and the
gate-passing configuration is the shipped default (REDUCE_VOTES=5 + the
majority-gid fill). Honest caveats recorded: the ua
deficit (noise-scale but consistently negative in both rounds — watch the
scoreboard after cutover), events/digest 4.0 vs 6.3 (majority filtering prunes
weak events; claims/digest and coverage are higher anyway), and 3× LLM cost
per digest that is still under a cent and removes the 8–10× re-extraction loop.

Scope-filter contingency NOT triggered: no coverage gap attributable to the
map's scope rules (ru parity, ir strongly positive); the budget-gated remap
tool (#33) remains future work.

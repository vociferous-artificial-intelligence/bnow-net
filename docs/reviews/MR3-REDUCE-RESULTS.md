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

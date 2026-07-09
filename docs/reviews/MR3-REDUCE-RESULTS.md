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
claims in the same digest. **30 positive / 187 negative** (small positive set —
honest caveat; re-tune as the corpus grows).

| thr | precision | recall | F1 |
|---|---|---|---|
| 0.25 | 0.963 | 0.867 | 0.912 |
| 0.30 | 0.960 | 0.800 | 0.873 |
| **0.35** | **1.000** | **0.800** | **0.889** |
| 0.40 | 1.000 | 0.767 | 0.868 |
| 0.50 | 1.000 | 0.367 | 0.537 |

Operating point **0.35**: highest zero-false-positive threshold; dominates 0.30
(same recall, better precision). Over-merge misdates claims (ruling 12); under-merge
only loses corroboration edges.

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

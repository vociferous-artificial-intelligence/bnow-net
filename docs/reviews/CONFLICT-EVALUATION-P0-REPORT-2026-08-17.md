# Phase 0 — recon, baseline, and frozen contract (implementation report)

Branch `codex/conflict-evaluations-p0-contract` from integration base
`7150b49` (= QF reviewed SHA `e5757ea`, docs-only tail). Phase 0 changes NO
runtime behavior, NO schema, NO cron, NO public UI — deliverables are the
frozen contract (`docs/designs/CONFLICT-REGION-EVALUATION.md`), the standing
workstream artifacts, this report, and the legal-safe fixture matrix.

## 1. Current validation flow, reproduced with evidence

Data flow (file:line evidence, all at the base commit):

```text
vercel.json cron 07:00Z "validate"
  -> src/app/api/cron/validate/route.ts:23   hard-coded ["ru","ua","ir"], date = yesterday UTC
  -> src/lib/validation/run.ts
       :83-89   SELECT the ONE (country, date, track='military') digest
       :48-56   referenceFor(): ru AND ua -> the same ROCA url builder;
                ir -> Iran Update with 4 slug-shape probes (:31-41)
       :92-121  same-day isw_reports row or slug-probe + INSERT 'pending'
                (UNIQUE (url); UNIQUE (theater, report_date) — schema.ts:149-152)
       :135-141 citation auto-refresh from the same HTML (isw/load.ts — reuse-only)
       :143-166 extractTakeawaysWithText (Key Takeaways ONLY); ru/ua filter via
                classifyTakeawayTheater (keywords.ts:97-110): 'both' stays in
                BOTH denominators; toponym-less bullets default 'both'
       :176-197 claims = the digest's CURRENT final claims (claims table),
                with earliest_doc_at (published-or-fetched) + earliest_fetched_at
       :203-206 llmMatchTakeaways (k=5 majority, keyword fallback)
                / scoreDigestWithMatches | scoreDigest (score.ts)
       :219-260 UPSERT validation_runs ON (digest_id, isw_report_id) —
                revalidation OVERWRITES metrics + divergences
  -> /scoreboard (src/app/scoreboard/page.tsx): last 60 runs as PER-COUNTRY
     rows; tiles from src/lib/scoreboard/summary.ts; at-publish subline from
     details.atPublish; detail at /scoreboard/[country]/[date]
```

## 2. Confirmations the prompt required

- **RU and UA still generate separate rows against one ROCA report:** yes —
  `referenceFor("ru")` and `referenceFor("ua")` both return theater `ru` and
  the same `iswUrlForDate`; the cron loop validates both countries; the
  2026-07-13 audit's live example (RU 20% / UA 0% from the same five
  takeaways, four of five bullets toponym-less → `both`) remains the behavior
  at this base. One report → two rows with overlapping denominators.
- **Iran validation selects only `military`:** yes — `run.ts:86` filters
  `d.track = 'military'`; ir `nuclear` and `elite_politics` digests exist in
  the product but never enter validation; il/gulf theaters are absent from
  the cron's country list entirely.
- **Report uniqueness/editions:** `isw_reports` UNIQUE `(theater,
  report_date)` + UNIQUE `(url)` — one row per theater/date; a same-date
  slug variant would collide (the exact "two-unique-index trap" the
  citation loader documents); Iran Updates historically publish under FOUR
  slug shapes (plain/special/evening/morning — `run.ts:26-41`), and the
  2026-08-15 recovery found 6 days undiscovered by single-slug probing.
  Multiple same-date editions are UNREPRESENTABLE today; discovery is
  slug-construction, not feed/index-backed.
- **Publication/cutoff parsing:** `datePublished` is regex-extracted from
  page JSON-LD (`run.ts:169-170`); the declared data cutoff is NOT parsed or
  stored anywhere (the 2026-07-14 audit's recommendation remains unbuilt).
  Publication gaps produce no isw_reports row and no run (correct,
  non-fabricating; e.g. ir 2026-07-30, 08-01, 08-11..13).
- **Overwrite behavior / snapshots:** `validation_runs` UPSERT overwrites per
  (digest, report); `digests` rows are last-writer-wins; claims are
  DELETE+reINSERTed with fresh ids on every regeneration
  (`digest-persist.ts`); NO digest snapshot exists (design parked in
  `docs/designs/ISW-CUTOFF-SCORING.md`); `details.atPublish` is an
  evidence-availability proxy explicitly NOT a bound on any historical digest.
- **Matcher votes:** k=5 (`MATCH_VOTES`, default 5) independent calls,
  majority > k/2 on the same claimId at confidence ≥0.6; per-vote audit in
  `details.votes`; keyword gazetteer fallback (`scoreDigest`) when no
  LLM/blocked config/budget stop — honestly labeled via `details.matcher`.
- **User-facing methodology copy:** the scoreboard explains per-metric
  how-to-read lines and labels the thin-sourced proxy correctly; nothing on
  the public surface uses the words "accuracy" or "truth" (it presents
  coverage/divergence against the named expert reports).

## 3. Current denominator table

See the frozen contract §1 (reproduced there as binding baseline). Summary
defects the new model corrects: (1) one ROCA report scored as two country
observations; (2) whole-war denominators asked of single-corpus outputs
(cross-corpus evidence invisible — the 2026-07-13 five-takeaway case had
union corpus-recall 5/5 vs published 1/5); (3) Iran regional scope vs
one-country-one-track output; (4) no edition/gap/cutoff representation;
(5) no immutable inputs for at-cutoff/at-publication claims.

## 4. Shared-file / concurrent-work collision map

Frozen in the workstream index (contact-surface list). Phase-by-phase touch
plan: P1 creates only new pure modules (`src/lib/conflicts/`), P2 designs
schema + builds pure repository/fixture layers (no migration), P3-P4 new pure
modules consuming `map-versions.ts`/`reduce`-style loaders read-only, P5
touches `src/lib/evals/` ONLY via the documented profile extension points +
`scripts/analysis-eval.ts` additive flags, P6 new routes + nav untouched,
P7 docs. `src/lib/validation/run.ts`/`score.ts` are NOT edited anywhere in
P0-P6; if P7 integration proves a seam is needed it gets its own decision
entry first.

## 5. Fixture matrix

`fixtures/conflicts/` (committed in this phase) carries the §16 acceptance
corpus as synthetic/paraphrased data: reference-unit sets, BNOW-shaped claim
records, and expected verdicts per scenario, in the documented shape
(`fixtures/conflicts/README.md`). Zero ISW prose (all reference units are
authored paraphrase-style synthetic texts about FICTIONAL-detail events in
the real conflicts' shape); all named persons fictional; no source full text.
The matrix is data-only in P0 — consumed by P1-P4 code and tests.

## 6. Gates run (Phase 0)

Recorded in the test ledger after the fixture matrix lands: `git diff
--check`; full `npm test` (must equal the base count — Phase 0 adds no
runtime code; fixture JSON has no test consumers yet); fixture README schema
consistency (manual review at Gate 0).

## 7. Exit criteria → Gate 0

Every metric in the contract has explicit numerator/denominator/time-anchor/
missing-data rule/public label (§3, §6 of the design); scope cannot be
changed after seeing results (evidence-policy freeze + epoch rule); the
fixture corpus contains no prohibited prose; the collision map is complete.
Two Gate-0 reviewers: (1) scope/evaluation-science, (2) product/legal.

# Conflict-evaluations workstream — decision register (append-only)

Each entry: date, decision, rationale, alternatives rejected, review status.

1. **2026-08-17 — Base = QF reviewed SHA `e5757ea`, branched at `7150b49`.**
   The quality foundation reached its terminal review-passed state before this
   workstream created any branch; `7150b49` is docs-only atop the reviewed SHA
   and carries the final review record Phase 0 must read. Alternatives
   rejected: `origin/main` (forbidden while a valid reviewed base exists);
   bare `e5757ea` (would omit the final-review record from the base docs).

2. **2026-08-17 — Headline denominator = every declared Key Takeaway of the
   selected edition; public label "Key Takeaway benchmark coverage".**
   Production-compatible (the existing parser), honest about scope (not
   whole-report), and immune to lacks-a-track unit-dropping. `partial`
   (compound bullet, incomplete evidence) counts as a MISS in the headline
   and is surfaced as a diagnostic. Alternatives rejected: whole-report
   parsing (new legal surface + unproven parser); atomic decomposition as the
   headline (needs human calibration first — kept as a disabled experiment);
   fractional partial credit (ungameable-looking but ungrounded weights).

3. **2026-08-17 — Eval control-plane extension = conflict dataset profile
   under the EXISTING `validation` workload** (design §10). The conflict
   evaluation is validation-shaped (reference units vs claims, human-labelled
   pairs, the exported production matcher contract); the conflict result
   payload rides as an additive versioned payload without touching any
   exhaustive workload switch. Fallback (recorded, requires a new entry
   BEFORE any edit): one additive `conflict_validation` workload updating
   every exhaustive surface in one coherent change, if implementation proves
   the validation contract would be misrepresented. Rejected: a second
   runner/result schema (forbidden); shoehorning incompatible data into
   existing fields (the honesty test in the prompt).

4. **2026-08-17 — The published-retention population** = the versioned union
   of claims that genuinely appeared in designated existing user-facing
   digests (ru+ua military for `russia_ukraine`; ir military/nuclear/elite
   plus labeled legacy il/gulf contributors for `iran_regional`). Rejected:
   whole mapped corpus (conflates the two pipeline questions); counterfactual
   conflict synthesis (does not exist; would be unfalsifiable).

5. **2026-08-17 — `operational_cutoff` / `at_publication` / `finalized`
   return `unavailable` until a reviewed capture path proves populations.**
   Only fixtures and labeled retrospectives are producible in this
   workstream. Rejected: treating the current last-writer DB state as any of
   the three (the 2026-07-14 audits document exactly why that lies).

6. **2026-08-17 — Five Phase 0 ambiguity freezes** (surfaced by fixture
   authoring; contract §5/§7 amended in place before Gate 0): evaluation
   window `[reportDate−2d, cutoffAt|publishedAt|end-of-report-day)` with an
   inclusive END where instants apply; event-geography-over-actor lane
   precedence; the bounded exclusion-reason precedence order (integrity →
   scope → comparability); contribution computed over corpus-recall matches;
   cutoff boundary equality read as "at or before". Each is pinned by ≥1
   fixture scenario, so a later change breaks tests rather than drifting.

7. **2026-08-17 — Gate-0 remediation (product/legal review, HIGH-1 + MEDIUMs
   + LOWs).** The workstream prompt is now COMMITTED
   (`docs/prompts/2026-08-17-conflict-region-combined-evaluations.md`) and
   contract §11 restates every enforcement-relevant Phase 6 rule so phase
   reviewers hold them from the frozen contract alone: sitemap/metadata-off,
   ephemeral-only feature injection, the seven analyst questions enumerated in
   order, the caveat placement standard ("prominently enough to affect
   interpretation", within the benchmark module, never a footnote), the
   source-country-relevance and terminology explainers, and the
   scoreboard-coexistence cross-reference note. ACCESS-TIER PIN (MEDIUM-1):
   any surface rendering published digest claim text inherits at least the
   digest surfaces' access tier (ruling-21 gate first, then feature guard);
   the anonymous teaser shows counts/lanes/scores/labels/methodology only.
   Fixture files gained top-level `synthetic`/`provenance`/`disclaimer`
   markers (MEDIUM-2 — metadata only, scenario inputs untouched);
   renderable BNOW-only items pinned to the published-retention population
   (LOW-4, §6.4); README count cells corrected (LOW-1); the sentinel audit
   rule now requires input-presence before output-absence (LOW-2); the
   quiet-day unit reworded away from genre boilerplate with an id bump per
   the immutability rule (NOTE-1); the ledger no longer spells the sentinel
   (NOTE-3).

8. **2026-08-17 — Gate-0 remediation (scope/evaluation-science review, H1/H2 +
   M1-M5 + L1/L2).** (a) H1: no unit-level `unavailable` in headline
   arithmetic — incomparable-coverage units stay in the denominator as misses
   with `missDiagnostic: "incomparable_coverage"`; lane tables carry the
   `unavailable (incomparable)` diagnostic; contract §3/§5/§6.4 amended, the
   Gulf fixture reminted with explicit headline numerator/denominator.
   (b) H2: "inherited unchanged" INCLUDES production's degradation ladder
   (majority ≥3 usable rounds / single-round `llm` at 1-2 / keyword at 0);
   the matcher fixture reminted to pin both the 1-valid→`llm` and the
   0-valid→`keyword` rungs. (c) M1: conflict keyword-fallback keeps the full
   declared-unit denominator with a `keywordUnmatchable` diagnostic —
   deliberate, disclosed divergence from production `scoreDigest`, confined
   to the conflict evaluator. (d) M2: `windowEndSource` recorded on every
   evaluation; a rung-2 (publishedAt END) fixture added. (e) M3: the README's
   stale/contradictory ambiguity section rewritten to point at the frozen
   contract order (integrity BEFORE scope); an integrity∧scope-conflict
   fixture (stub + off-scope → `stub_fixture`) and a `missing_source` fixture
   added. (f) M4: headline numerator/denominator pins added to five key
   scenarios (clean match 1/1, retention gap 1/1 vs 0/1, compound partial
   0/1+diagnostic, gulf-incomparable 0/1, matcher rungs) — full-report golden
   arithmetic remains P4's deliverable. (g) M5: legacy scoreboard-row
   disposition assigned to the Phase 6 IA review by name. (h) L1: the
   anti-vague-claim rule now binds generally in §6.3. (i) L2: the
   window/denominator time-asymmetry disclosed in §5. All fixture edits are
   remints (new ids) per the corpus immutability rule.

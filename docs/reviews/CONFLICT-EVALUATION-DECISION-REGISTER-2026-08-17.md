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

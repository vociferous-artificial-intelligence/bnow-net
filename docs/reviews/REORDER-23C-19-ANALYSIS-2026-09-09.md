# Should step 23 lane C run before step 19? — analysis (2026-09-09)

**Scope.** Prompt `docs/prompts/2026-09-09-48h-reorder-23c-before-19-analysis.md`; main checkout
`/Users/go/code/bnow-net`, `main` at `c286db2` (+ the operator's uncommitted refinements to the
step-23 prompt, `2026-09-09-48h-sign-Da-Df.md` and OPEN-TASKS #120, read as the live text); read
only; $0; no fork, no network. The D-a…D-f entry is not yet in `AGENTS.md` — analyzed against
the draft as refined.

**Recommendation: a third shape — keep the parallel launch, make step 19 adaptive, and merge
lane C the moment it delivers.** Serializing (23c to completion, then 19) buys real data quality
but costs the whole of lane C's duration on the program's critical path. The same data quality
is available at zero schedule cost in the common case, because step 19's first PR (DB-backed
claim sources) does not touch the discovery module at all: step 19 builds PR 1 first, then
checks `origin/main` for lane C's commits before starting PR 2 and consumes the fixed module if
they are there, with today's written mitigations as the named fallback if they are not. CP6
merges 23c first whenever it is ready before 19.

## 1. The six decisions

| id | reorder changes the answer? | changes the rationale? | prompt edits required |
|---|---|---|---|
| D-a (b) — indeterminate probe class, `dayStatusReason` discriminator | no | no | none (what the code does) |
| D-b (a) — zero-unit >10 KB body is not an edition | no | no | none |
| D-c (a) — Iran signatures under `gazetteerFor(series)` now | no | **only the contingency gets easier**: "production at 29 migrations when lane C starts" is more certainly true the earlier lane C starts; under any shape lane C starts today | none |
| D-d — N3 backfill in lane C, not step 19 | no | **yes, one clause**: "moved … so it runs alongside step 19" becomes "runs alongside step 19 and merges first when it delivers first; step 19 consumes the module and never opens it". The register's competing reason for step 19 ("step 19 already opens the module") is dead under every shape | `2026-09-09-48h-sign-Da-Df.md`, one sentence (edited) |
| D-e — append variants + word-path fold | no | no | none |
| D-f (b) — parser shape only | no | no | none |

The pre-analysis in the prompt holds: only D-d's rationale moves, and the answer holds.

## 2. Step 19's prompt — what depends on the order

`docs/prompts/2026-09-05-48h-19-ws3-3-evidence-population.md`, at `c286db2`:

| where | text | under strict reorder | under the adaptive shape |
|---|---|---|---|
| 2026-09-08 block (1), lines 17–25 | "**Do not fix them here** — step 23 remediates; build so that your population logic does not depend on the broken semantics, and say in the report which findings you had to route around" | delete | keep as the fallback branch |
| 2026-09-09 block (7), lines 37–44 | "do not call `persistObservation` with a caller-chosen edition id — resolve … from `edition_key` … (WS3-F04's identity check is step 23's and may land in parallel; do not depend on it)" | "depend on it" — but the id-from-key discipline is *still correct* with the check present (the check rejects a mismatch; resolving from the key is how you never trigger it). Keep the discipline, drop the parenthesis | keep the discipline; parenthesis becomes "if lane C's check is on `origin/main`, it enforces this; either way resolve from the key" |
| same block (7) | "Expect `derived.units[].toponyms` to be EMPTY for every Iran edition written before WS3-F05 lands; join on `sha256` + `ordinal`, never on signatures" | **inverts**: toponyms populated under `iran-levant-v1`, `EDITION_UNITS_VERSION` carries the gazetteer; the join rule stays (signatures are still not a key) | conditional on the version stamp: read `EDITION_UNITS_VERSION` on the tree you build against |
| same block (7) | "`probe_failed` today means 'indeterminate', never 'ISW did not publish'" | stays true (D-a makes it explicit with `dayStatusReason`) | stays |
| block (8), lines 45–52 | the parallel-lane paragraph — "owns `edition-discovery.ts` … do not edit them" | delete the coordination prose; keep "do not edit" (still lane C's file) | keep; add the PR-order rule and the check |

Nothing in the "Prompt shape" section (PR 1, PR 2) changes under either shape — PR 1 (claim
sources over `doc_claims` / `map-versions.ts`) never touches `src/lib/isw/` or
`observation-store.ts`; only PR 2 (the observation pipeline) consumes them.

## 3. Step 23's prompt — the WS3-F04 row

Current text: "**Step 19 runs in parallel in `ws3-conflict` and calls this function** — keep the
signature unchanged; the operator merges 19 first at CP6 and you rebase." The register's
remediation is an `INSERT … SELECT … WHERE id = $2 AND edition_key = $5 AND series = $3 AND
report_date = $4` inside `persistObservation(query, input)` (`observation-store.ts:220`). It
needs no new parameter — every value it checks is already in `ConflictObservationInput`. **Keeping
the signature is free and materially no worse**; a signature change would only force a rebase
conflict onto whichever lane merges second. Keep it under every shape. The merge-order clause
flips: "the operator merges this lane first when it delivers first; if 19 merged first, rebase
onto it — the hunk is inside the function body and does not collide with a caller."

## 4. CP6 order

The current order (19 → 23c → 23r) exists because "lane C's `persistObservation` hunk sits
under 19's calls". That was a conservative reading: the hunk is inside the function body, 19
only calls the function, so neither order produces a code conflict unless 19 edits the body
(its prompt forbids that). What the order actually decides is **which tree step 24 and the
soak read first**, and — under the adaptive shape — **whether 19's PR 2 gets the fixed module**.
So: merge 23c as soon as it delivers, without waiting for 19. Queue becomes: *whichever of 23c
/ 19 delivers first, then the other, then 23r*; if both wait together, **23c before 19**. 23r
is independent in every shape.

## 5. Schedule, as a number

Step 19 = H22 → H32 in the original schedule (10 h), the longest step, and it gates 24 → 25 →
freeze → 26 → 27. Lane C's scope (8 FIX findings incl. two majors with new tests, the backfill
mode, the gazetteer append + fold, the parser shape, plus a fork case) is a **6–8 h** session
by the yardstick of steps 14 and 21. **Strict reorder pushes 19's start right by 6–8 h and moves
every downstream step by the same amount** — in practice one working day, because launches
are attended by an operator who sleeps. **Adaptive shape: 0 h in the expected case.** Step 19's
PR 1 is itself several hours (fixture tests, one fork itest, the `map-versions.ts` filtering);
lane C, launched in the same hour, is on `origin/main` before 19 opens PR 2 whenever lane C
finishes inside PR 1's window. If it does not, 19 falls back to today's mitigations and the
outcome equals the status quo — no worse than the current plan.

## 6. The coupling risk (§2.6), taken seriously

Under strict reorder, 19's prompt would be written against the Lane C table — code that does
not exist. If lane C deviates (a different reason literal, a different stamp format), 19
discovers it at runtime with no written fallback. The adaptive shape buys this off explicitly:
19's prompt names both branches and the **test that selects between them is a repository fact**
(`git log origin/main -- src/lib/isw/edition-discovery.ts src/lib/conflicts/observation-store.ts`
showing lane C's commits, and `EDITION_UNITS_VERSION` on the tree), not a prediction. The
residual risk is lane C landing *while* 19 is mid-PR 2; the rule "decide once, at the start of
PR 2, and say which branch you took in the report" makes that a recorded fork in the road, not
a surprise. Lane C's spec adherence is then step 26's question, as it already is.

## 7. What step 19 concretely gains when lane C lands first

- **`unit_attribution` becomes real for Iran.** `classifyTheaterWith(gaz, toponyms)`
  (`src/lib/validation/gazetteer/match.ts:130`) returns a theater tag only when every toponym
  maps to one tag; with an **empty** toponym list `seen.size === 0`, so it falls through to
  `"both"`. Today every Iran edition's `derived.units[].toponyms` is empty (WS3-F05:
  `unitSignaturesFrom(html)` at `edition-discovery.ts:204` takes no gazetteer and computes under
  `ru-ua-v1`), so **every Iran unit 19 writes carries `unit_attribution = "both"`** — a constant,
  not an attribution. After D-c the column carries `ir` / the contributing theater per unit,
  which is the one thing step 24's scoreboard was going to show per contributor at soak time.
  The fix is one-way: rows written under the empty signatures keep `"both"` forever (their
  `EDITION_UNITS_VERSION` stamp says why), unless the fork is discarded and repopulated.
- **Honest per-day status.** With D-a, days 19 cannot evaluate carry
  `dayStatusReason: "throttled" | "unparseable_body"` in the discovery return; 19's own counts
  can report "N days indeterminate (throttled)" instead of folding them into `probe_failed`.
  Same rows, different label — but the label is what step 24 renders.
- **Reference-edition safety (WS3-F02/F03)** is latent rather than live for 19: F02 affects the
  `--dry` path only, and F03's phantom edition needs the host's error page to cross the 10,000
  byte threshold (it is 9,661 today). Real hazards, no expected difference in 19's rows this week.
- **WS3-F04**: no row difference — 19 resolves the id from the key either way; the check is a
  guard against a caller 19 is told not to be.

Net: one column goes from constant to meaningful, one label goes from misleading to honest; both
matter for what the soak shows, neither changes counts.

## 8. Prompt edits per option (exact text)

**Option A — strict reorder (not recommended).** Step 19 block (1) sentence "Do not fix them
here — … route around." → delete. Block (7) "Expect `derived.units[].toponyms` to be EMPTY …"
→ "Expect `derived.units[].toponyms` POPULATED under `iran-levant-v1` and `EDITION_UNITS_VERSION`
stamped with the gazetteer (D-c); join on `sha256` + `ordinal` regardless." Block (7)
"(WS3-F04's identity check is step 23's and may land in parallel; do not depend on it)" → "(the
identity check is on `main`; it enforces this)". Block (8) → "Gate: step 23 lane C merged".
Plan §2: launch 23r and 23c only; launch 19 after CP6a merges 23c. `steps.tsv` row 19 notes →
"after 23c merged". CP6 order 23c → 23r; then 19 alone.

**Option B — keep parallel, current merge order.** No edits. Accepts `"both"` in every Iran
attribution row 19 writes.

**Option C — adaptive (recommended).** Step 19 block (8) replaced by the two-branch rule (PR 1
first; at the start of PR 2 run the `git log` check; branch A "lane C on `origin/main`": rebase
the lane onto `origin/main`, consume the fixed module, toponyms populated, status reasons
available, F04 check present; branch B "not yet": today's mitigations verbatim; say which in the
report). Block (7)'s EMPTY expectation and the F04 parenthesis made conditional on the branch.
Step 23 WS3-F04 row: merge-order clause flipped as in §3. Plan §3: queue order "whichever
delivers first; if both wait, 23c before 19". `sign-Da-Df.md` D-d: one clause. `steps.tsv` rows
19 / 23c notes. Tracker §7 line. These edits were applied on 2026-09-09.

## 9. Decisions needed

None new. The operator's choice among A / B / C is the one this file exists for; C was applied
as the default, and A remains a one-card change (§8) if the operator would rather pay the day.

# Analysis — should step 23 lane C run BEFORE step 19 instead of alongside it?

| | |
|---|---|
| Model / effort / mode | Opus / high / **plan mode only — produce no code, no commits, no branch** |
| Worktree | The main checkout `/Users/go/code/bnow-net`, branch `main`, read-only |
| Requires | `main` at `c286db2` or later; the D-a…D-f entry as drafted in `docs/prompts/2026-09-09-48h-sign-Da-Df.md` |
| Spend | $0. No provider call, no fork, no network probe. Reading only. |
| Deliverable | `docs/reviews/REORDER-23C-19-ANALYSIS-2026-09-09.md` — a recommendation with a cost line, plus the exact prompt edits each option requires |

## 0. The question, precisely

The 2026-09-09 completion plan launches **19**, **23r** and **23c** in parallel in the first
hour, with CP6 merging **19 → 23c → 23r**. The 09-08 sheet had 23c waiting on 19 only because
they shared the `ws3-conflict` worktree; moving 23c to `48h-audit-ws3-20260905` removed that
constraint.

This analysis asks a different question, in the opposite direction:

> Should **23c run to completion and merge BEFORE step 19 starts**, so that step 19 populates
> evidence from a module whose measurement semantics have already been corrected?

Do not analyze "19 before 23c" — that is the status quo's merge order and buys almost nothing
(it removes D-d's stated rationale and some coordination prose; nothing else). The live
question is whether the *data* wants the other order.

## 1. Why the question exists

Step 19 is currently instructed to work around defects that 23c is simultaneously fixing.
`docs/prompts/2026-09-05-48h-19-ws3-3-evidence-population.md`, the 2026-09-08 block and §7:

- "Do not fix them here — step 23 remediates; **build so that your population logic does not
  depend on the broken semantics**, and say in the report which findings you had to route around."
- "**Expect `derived.units[].toponyms` to be EMPTY** for every Iran edition written before
  WS3-F05 lands; join on `sha256` + `ordinal`, never on signatures."
- "Do not call `persistObservation` with a caller-chosen edition id — resolve the winner's row
  id from `edition_key` … (**WS3-F04's identity check is step 23's and may land in parallel; do
  not depend on it**)."
- "`probe_failed` today means 'indeterminate', never 'ISW did not publish'."

Every one of those instructions exists only because 23c has not run yet. If 23c lands first,
they are all deletable and step 19 consumes: honest probe classes with a
`dayStatusReason` discriminator (D-a), a units criterion that cannot admit a phantom (D-b),
**populated** Iran toponyms under `iran-levant-v1` (D-c), an enforced row-identity check
(WS3-F04), and the June-2025 parser shape (D-f).

## 2. What to analyze — answer each with a file:line citation

1. **The six decisions.** Read `docs/prompts/2026-09-09-48h-sign-Da-Df.md` and the step-23 §1
   Lane C table. For each of D-a … D-f state whether the reorder changes **the answer**, **the
   rationale only**, or **nothing**. The pre-analysis to verify or refute: only **D-d**'s
   rationale moves ("runs alongside step 19" becomes "runs first and hands 19 a finished
   module"), and the answer holds — the register's competing reason for step 19 ("step 19
   already opens the module") dies entirely, because under the reorder step 19 never opens it.
   D-c's condition (production at 29 migrations when lane C starts) becomes easier to satisfy,
   not different. D-a, D-b, D-e, D-f are unaffected — they are about what the code does, not
   who does it.
2. **Step 19's prompt.** List every block that must be rewritten or deleted, with line numbers.
   Expected at minimum: the 2026-09-08 "route around the broken semantics" instruction; the
   "expect EMPTY Iran toponyms" expectation, which **inverts**; the "do not depend on WS3-F04"
   clause, which becomes "depend on it"; and §8's parallel-lane paragraph.
3. **Step 23's prompt.** The WS3-F04 row currently reads "Step 19 runs in parallel … **keep the
   signature unchanged**; the operator merges 19 first at CP6 and you rebase." Under the reorder
   that constraint lifts: lane C could change `persistObservation`'s signature and step 19 would
   adapt. Say whether the register's identity check is materially better with a changed
   signature, or whether keeping it is free.
4. **CP6.** The merge queue flips to **23c → 19 → 23r**. Check for conflicts the current order
   was chosen to avoid — `docs/prompts/2026-09-09-48h-completion-plan.md` §3 says the order
   exists because "lane C's `persistObservation` hunk sits under 19's calls."
5. **The schedule, stated as a number.** Step 19 is the longest step in the program
   (H22 → H32 in the original schedule) and gates step 24, which gates 25, 26 and 27.
   Serializing pushes 19's start right by 23c's whole duration. Give the tail slip in hours and
   say which downstream steps move. 23r is unaffected in either arrangement — it shares nothing
   with WS-3 and should stay parallel regardless.
6. **The counter-argument, taken seriously.** Under the reorder, step 19's prompt must be
   written against code that **does not exist yet** — the Lane C table's specification rather
   than the tree. If lane C deviates from that spec, step 19's prompt is wrong and the session
   discovers it at runtime. The status quo has step 19 written against code that exists today,
   with explicit written mitigations, which is more robust to lane C surprising anyone. Weigh
   this against the data-quality gain; do not treat it as a formality.
7. **What step 19 actually gains.** Be concrete rather than directional: name the columns and
   the counts that would differ. In particular — does `unit_attribution` become fillable from
   real toponyms rather than an empty set, and does that change what step 24's scoreboard can
   show at soak time? Quote `classifyTheaterWith(gazetteerFor(series), sig.toponyms)` and say
   what it returns today for an Iran edition versus after D-c.

## 3. What to produce

A recommendation — **reorder**, **keep parallel**, or **a third shape** (e.g. 23c first but
with only the `edition-discovery.ts` findings, deferring the backfill) — with:

- a table: decision id · changes answer? · changes rationale? · prompt edits required
- the full list of prompt edits per option, as exact before/after quotes
- the schedule cost in hours and the downstream steps affected
- one paragraph on the coupling risk in §2.6, and whether it can be bought off by writing step
  19's prompt against the Lane C table with a named fallback

Do not edit any prompt, decision log or register. This step produces one review file and stops.
If the D-a…D-f entry is already in `AGENTS.md` when you run, say so and analyze against the
signed text rather than the draft.

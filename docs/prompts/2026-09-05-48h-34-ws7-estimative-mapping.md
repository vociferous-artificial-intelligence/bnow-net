# Step 34 — WS-7.4 ICD 203 likelihood band + corroboration-derived confidence (presentation mapping) — SKETCH (Wave 4, added 2026-09-06)

| | |
|---|---|
| Model / effort / mode | Opus / high / plain session |
| Worktree | `48h-ws7-tradecraft-20260905`, step branch `…-step34-estimative` |
| Window | H34 → H40 |
| Depends on | 29 merged; **T3 signed** (the mapping table is operator-approved data — if unsigned, print `AWAITING AUTHORIZATION: T3` and stop); 32 merged (the citation block renders the band) |
| Rewrite from | PLAN-WS-7 §WS-7.4 and the signed T3 table |
| Spend | $0 |
| Closing report | `docs/reviews/WS-7-4-ESTIMATIVE-2026-09-07.md` |

**DECISIONS BINDING — added 2026-09-08.** T3 is SIGNED: `AGENTS.md` decision-log entry
"2026-09-07 (T3 — PLAN-WS-7 §6.1–6.3 signed as drafted, with T3-a and T3-b)" ((f9); INDEX §2.2
row T3). The tables are operator-approved data as drafted; T3-a: no `claims.confidence`, no
source reliability in the mapping; T3-b: `almost certain`, the three sub-even bands and AJP-2.1
levels 4/5 are never machine-assigned. **Do not print `AWAITING AUTHORIZATION: T3`; cite that
entry and build.** Ship as `ESTIMATIVE_MAP_V1`; the six invariants in the entry are the exhaustive
test's spec; any cell change is a new version, never an edit. Step 32 (PR #80) has merged before
this launch — its citation block is where the band renders; read
`docs/reviews/WS-7-2-CITATION-MODE-2026-09-07.md` for the disclosure-block shape (structured per
stage, `tool disclosure withheld` marker while dark) so the band slots in without touching the
dark-stamp policy.

Read COMMON first, then PLAN-WS-7, the addendum §4.4 and §7. Pure module
`src/lib/tradecraft/estimative.ts`, constant `ESTIMATIVE_MAP_V1`, `(hedging, confidence,
corroboration) → { likelihood, range, confidence }` with the signed table as data; exhaustive table
test (every enum × corroboration cell); render beside `statuses[hedging]` on claim rows (digest,
search, signals, ask-cited) and in the citation block; keep the numeric range (PHIA readers map it
themselves); label "corroboration-derived confidence", never "analyst confidence". MUST NOT touch
`map-prompts.ts`, the reduce prompt, `publication-guard.ts`, `claims.hedging`/`confidence`, any
`docs/evals/**`, or the scorer. Acceptance: hedging `unknown` + single `claimed` doc never above
"roughly even chance"/"low"; `confirmed` + one doc never "almost certain"; snapshot tests per surface;
proposed decision-log entry recording V1 as a presentation layer superseded by a prompt-level V2
only after evaluation step 4.

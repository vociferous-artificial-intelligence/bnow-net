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

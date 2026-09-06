# Step 32 — WS-7.2 ICS 206-01 citation mode on "Copy for report" — SKETCH (Wave 3, added 2026-09-06)

| | |
|---|---|
| Model / effort / mode | Opus / high / plain session |
| Worktree | `48h-ws7-tradecraft-20260905`, step branch `…-step32-citation-mode` |
| Window | H24 → H30 |
| Depends on | 29 merged (PLAN-WS-7 on `main`); T2 answered (access date); 30 merged (wording) |
| Rewrite from | PLAN-WS-7 §WS-7.2 and its Handoff |
| Spend | $0 |
| Closing report | `docs/reviews/WS-7-2-CITATION-MODE-2026-09-07.md` |

Read COMMON first, then PLAN-WS-7, the addendum §4.2. Fifth `ClaimCopyMode` `citation`
(`claim-copy-model.ts:16`): per evidence document author/title/URL/published/access date (per T2)/
source type (platform → media type + PAI tag)/descriptor stub; one disclosure block per claim with
`extractor_version`, synthesis provider tag / digest model name, `registryVersion`, hedging label,
corroboration counts from `summarizeClaimEvidence`, `asOf`, canonical URL. Plumb the stamps through
the digest query (the plan verifies the join). Pure module `src/lib/citation/ics206.ts` with the
JSON shape + fixture tests. Rulings 1, 3 (stub-provider claims refuse the mode), 19 (labels carried
verbatim), 21 (inherits the page gate). Acceptance per the addendum: fixture test per surface, XSS
fixture, NULL version renders "unstamped — pre-`analysis-reg-v1`", never an empty string.

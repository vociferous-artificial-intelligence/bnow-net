# Step 33 — WS-7.3 templated source descriptors + per-digest source summary statement — SKETCH (Wave 3, added 2026-09-06)

| | |
|---|---|
| Model / effort / mode | Opus / high / plain session |
| Worktree | `48h-ws7-docs-20260905`, step branch `…-step33-descriptors` |
| Window | H24 → H32 |
| Depends on | 29 merged; 30 merged; the #56 platform-root list (from the #56 audit; if absent, the plan's fallback wording) |
| Rewrite from | PLAN-WS-7 §WS-7.3 and its Handoff |
| Spend | $0. Compute-at-render unless PLAN-WS-7 shows persisting is needed (then it waits for the WS-7.5 migration — not this window). |
| Closing report | `docs/reviews/WS-7-3-DESCRIPTORS-2026-09-07.md` |

Read COMMON first, then PLAN-WS-7, the addendum §4.3, `src/lib/registry/view-policy.ts`, the two
registry pages, `src/lib/conflicts/evidence-selection.ts` (40% cap), `summarizeClaimEvidence`.
Descriptor template per source per theater (platform, theater, ISW citation count and span, hedging
profile with the ruling-16 wording for `unknown`, status, independence caveats); the reliability
number stays behind `showReliability`; platform roots get the #56 caveat, never an assessment.
Summary statement per digest from `claim_sources` (distinct docs/channels/platforms, cap bound?,
independence shares, top-3 load-bearing sources, single-`claimed` count) rendered at read time and
labeled "Generated from citation data, summary template v1 — not an analyst judgment". Golden-file
tests; a zero-citation fixture renders "no ISW citation history"; a sentinel-prose fixture proves no
`raw_documents.content` or ISW text reaches any output (ruling 1). Rulings 1, 3, 12, 14, 16, 19, 21.

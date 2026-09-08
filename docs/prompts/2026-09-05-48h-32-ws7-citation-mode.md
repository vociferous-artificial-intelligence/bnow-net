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

**DECISIONS BINDING — added 2026-09-08, read before the sketch below (which predates them).**
The spec for this step changed on 2026-09-07 under **T4** and **T4-b**, both SIGNED in
`AGENTS.md`'s decision log (entries "2026-09-07 (T4 — ICS 206-01 tool disclosure: capability
built, display withheld on every surface…)" and "2026-09-07 (T4-b — build shape for the withheld
AI-tool disclosure)"; INDEX §2.2 rows T4, T4-b). Binding rules, which override any sentence
below that reads otherwise: (1) **citation mode itself ships**, with T2's access date
("Accessed (BNOW ingest)") in the per-document fields; (2) the **AI-tool disclosure is BUILT and
DARK on every surface** — gated by a **policy function** on the `src/lib/registry/view-policy.ts`
pattern, resolved from the viewer in one module, never a boolean constant; (3) a test pins the
disclosure OFF for every currently resolvable role; (4) while withheld, the output carries a
literal `tool disclosure withheld` marker and the copy action is NOT labelled a conformant
"ICS 206-01 citation" without it; (5) the disclosure block is **structured per stage** —
`synthesis` from the digest's dispatch identity (`digests.provider` via `mapreduceProviderTag()`,
`stats.reduce.dispatch` / `stats.llmDispatch`), `extraction` rendered as "not recorded for this
digest" and never back-filled, because `claims` carries no extractor/provider column and the
disclosure is digest-scoped, not claim-scoped; (6) the 2026-07-16 provider-hiding decision
stands unreversed. Do not add a paying-customer gate — none exists (`access-context.ts` is a
beta stub); the policy function's body is where one would later go. If anything here conflicts
with PLAN-WS-7 §WS-7.2 or the addendum §4.2, the signed entries win (INDEX §2.1).

Read COMMON first, then PLAN-WS-7, the addendum §4.2. Fifth `ClaimCopyMode` `citation`
(`claim-copy-model.ts:16`): per evidence document author/title/URL/published/access date (per T2)/
source type (platform → media type + PAI tag)/descriptor stub; one disclosure block per claim with
`extractor_version`, synthesis provider tag / digest model name, `registryVersion`, hedging label,
corroboration counts from `summarizeClaimEvidence`, `asOf`, canonical URL. Plumb the stamps through
the digest query (the plan verifies the join). Pure module `src/lib/citation/ics206.ts` with the
JSON shape + fixture tests. Rulings 1, 3 (stub-provider claims refuse the mode), 19 (labels carried
verbatim), 21 (inherits the page gate). Acceptance per the addendum: fixture test per surface, XSS
fixture, NULL version renders "unstamped — pre-`analysis-reg-v1`", never an empty string.

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

**READ FIRST — handoff from the 2026-09-08 read-only pass (relaunch note).** This step was
launched at ≈20:27Z without a permission mode, so the session could read but not write or run; it
exited after doing the read-only half. Its output is preserved at
`/Users/go/code/bnow-net-worktrees/logs/step32.readonly-20260908.log` — **read it before
anything else.** Treat any `file:line` corrections and cross-file findings in it as the corrected
working spec for this step; do not redo its reading. Where it and this prompt disagree on a
citation, the log (verified against `a7ba98b`) wins; where it and a SIGNED decision-log entry
disagree, the entry wins.
**Binding finding from that pass — T4's "dark" must mean ABSENT, not un-rendered:**
`ClaimCopyActions` is a `"use client"` component, so anything placed in its `payload` prop is
serialized into the RSC flight payload embedded in the page HTML. A `toolStamp` in the payload
would put `openai:gpt-4o-mini+mapreduce` into view-source for every viewer while the disclosure
is withheld. Therefore the policy is applied **server-side, before the payload is built**:
`resolveClaimCitationStamp(stamp, view)` returns `{ attributable, tools: view.showToolDisclosure
? stamp : null }`, so `tools` is `null` for every currently resolvable role and no model name
crosses the client boundary; `attributable` alone drives the ruling-3 refusal for `stub` digests.
The policy module keys entitlement by **tier**, with the entitled set empty — never by role
(T4's hold covers signed-in users and admins). The log also lists three existing assertions /
comments the PR must correct (`page.test.tsx:239`, `claim-evidence-model.ts:12-20,185`,
`page.tsx:187-189`) and the `copy_mode` allowlists in `analytics/events.ts:34` +
`sanitize.ts:42`; the year-bearing formatter gap in `format-et.ts:22-32` is real.

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

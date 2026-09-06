# Step 28 — WS-0.2 reviewer instrument (side session, off the critical path)

| | |
|---|---|
| Model / effort / mode | Opus / high / **native Mac session with the operator present** (the inputs live outside the repo next to forbidden files) |
| Worktree | none for code (fold-back script lands in `scripts/` via the `48h-ws1-injection` worktree); the workbooks are operator artifacts outside git |
| Window | whenever the operator has 3 hours; not gated by any checkpoint |
| Depends on | operator copies ONLY the three blinded files into a fresh folder first |
| Decisions | none; the analyst-subset selection is an operator action using the key — the agent never sees the key |
| Spend | $0 |
| Closing report | `docs/reviews/REVIEWER-INSTRUMENT-2026-09-0X.md` (content-free: counts, file names, hashes; no packet rows) |

Read `docs/prompts/2026-09-05-48h-COMMON.md` first.

## Setup the operator does before pasting this

```
mkdir -p /Users/go/code/bnow-net-reviewer-instrument-20260905/in
cp /Users/go/code/bnow-net-eval-successor-1a-20260904-artifacts/packet/{LABELING-PACKET-DEV.md,labeling-rows.csv,native-language-review.csv} \
   /Users/go/code/bnow-net-reviewer-instrument-20260905/in/
shasum -a 256 /Users/go/code/bnow-net-reviewer-instrument-20260905/in/* > /Users/go/code/bnow-net-reviewer-instrument-20260905/in/SHA256SUMS
```

The agent works ONLY in `/Users/go/code/bnow-net-reviewer-instrument-20260905/` and the repo's
`scripts/`. It never opens the artifacts folder itself. `RECONCILIATION-KEY.json` and
`AI-DIAGNOSTIC-ANALYSIS.md` are never read (they are not in `in/`; if they are, stop).

## Goal (handoff §4.0 WS-0.2)

Turn the 218 KB Markdown packet into a 30-minute reviewer task: four native-speaker workbooks
(ar 3 rows with claims, uk 3, ru 2, fa 2 — one row per question instance: original text,
English claim, quoted span, hedging label inline, a plain-English question, dropdown answer,
note; ask both "does the English claim faithfully render the original?" and "does the
reference fact statement?"); one analyst workbook for the ~20 plan-named rows plus ~8
controls (the operator selects ids using the key and gives the agent the id list only —
record the selection design in the exposure note as an operator action); a one-page
reviewer guide with no internal jargon; and `scripts/labels-fold-back.ts` that writes answers
back into `labeling-rows.csv`'s `P1=yes;P2=partly` encoding preserving row ids — never
rebuilding the packet (the salt regenerates). Build with openpyxl or the repo's tooling (RTL sheets with right-to-left view enabled where
`.xlsx` is used), plus recruiting email drafts (RU/UK via the operator's groups; AR/FA via a paid professional
translator, one-hour minimum, competence recorded as "professional"), asking reviewers to
flag unnatural synthetic source text. Fold-back script gets unit tests over a synthetic CSV
in `fixtures/` (no packet rows in the repo). Format per handoff §4.0: Google Sheets for ar/fa
(RTL shaping), `.xlsx` acceptable elsewhere — if the operator prefers `.xlsx` throughout, list
it as a decision. The report records file names, row counts, hashes, and the exposure note —
nothing from the packet.

# ASK polish sprint — morning note (2026-07-12, unattended)

## ① Outcome

**FULL SHIP.** All five findings addressed, W1 eval gate PASSED (first run, no
iteration), merged `--no-ff` to main (`0fe0bc6`), deployed
**`bnow-qdesocr6p`** (READY, aliased `bnow-net.vercel.app`), all signed-out prod
checks green. Rollback target recorded before deploy: `bnow-nqegy57dk`
(`npx vercel@latest rollback bnow-nqegy57dk-vociferous.vercel.app`). Tags:
`pre-ask-polish-20260712` on the pre-sprint main. Tests **902 → 956** (67 → 74
files); typecheck/lint clean; pre-push gate green. OpenAI spend **$0.106 of $2**.
No aborts, no parked workstreams (two sub-items parked by design, see ⑦).

Commits (one per workstream, on branch `20260712-ask-polish`):
`57c67a2` W1 freshness/persona · `88be4fb` eval evidence · `7c5d049` W2
pending+GET-no-execute · `b60fcc4` W3 deep links · `2080ea8` W4 related floor ·
`8314bb6` W5 home Ask box.

## ② W0 findings (prod telemetry, read-only)

**The hypothesis held, with one refinement that reshaped W1.**

- The two smoke questions (ask_usage ids 9–10, 01:42–01:43Z) parsed their window
  correctly to `[2026-07-12, 2026-07-12]` and matched **0 claims / 0
  total_matching** — the first 07-12 claims were only created at **04:01:18Z**,
  ~2.3h after the questions. Honest decline, retrieval healthy.
- **Refinement:** both rows were `state='answered'` with `evidence_count` 4 and
  15 and answer costs $0.0034/$0.0053. Cause: `evidence_count = claims +
  entities`, and the no-evidence short-circuit required BOTH empty. The questions
  matched 4/15 *entities* ("russia", "kyiv"), so gpt-5 was paid to answer from an
  evidence block of `CLAIMS: (none)` plus entity rows — the contract-leaking
  "please provide specific BNOW claim IDs" prose was the model addressing the only
  thing in its context. W1's short-circuit therefore fires **pre-retrieval**
  (window entirely beyond currency ⇒ $0 regardless of entity matches), and the
  persona rewrite covers the residual entities-only case.
- Artifact worth knowing: `retrieval_mode='v2-lexical-only'` on those rows is a
  labeling quirk — the vector arm ran (embed billed) but returned 0 rows inside
  the empty window, and retrieve-v2 counts that as "no vector arm". Cosmetic; not
  changed this sprint (it feeds the eval's degraded-run detector).

## ③ W1 + eval regression (R1 gate)

Shipped: v2-only persona `SYSTEM_V2` (**legacy `SYSTEM` byte-preserved** — the
`ASK_PIPELINE=legacy` rollback is guarded by a frozen-fixture test), corpus
currency `src/lib/ask/currency.ts` (cached max(claim_date), 5min/30s TTLs,
fail-soft null), a "Data current through {date}" user-message context line, the
$0 no-coverage short-circuit (`window.from > currency`, strict; straddling runs
the pipeline; rollback `ASK_NO_COVERAGE_SHORTCIRCUIT=0`), additive
`AskAnswerV2.dataCurrentThrough`, and a distinct no-coverage UI callout
(`ask.nocoverage.*`, en+uk).

Gate run: disposable Neon branch `br-lively-rice-atd2f9oy` (both `DATABASE_URL`
vars overridden, hosts echoed + asserted through the real loader — the MERGE 1
trap did not recur; branch deleted). First attempt aborted at $0 (embed guard
failed closed on unset `LLM_SPRINT_USD_CAP` — correct ruling-4 behavior); rerun
with a run-only `LLM_SPRINT_USD_CAP=50`.

| question | type | candidate hit | evidence hit | cited gold | honest | cost |
|---|---|---|---|---|---|---|
| negative-01 (NK troops Africa) | negative | — | — | — | **yes** | $0.0130 |
| negative-02 (Venezuela oil sanctions) | negative | — | — | — | **yes** | $0.0144 |
| negative-03 (MV Solara Pride) | negative | — | — | — | **yes** | $0.0128 |
| negative-04 (Wagner "Konstel Group") | negative | — | — | — | **yes** | $0.0140 |
| negative-05 (Chinese navy Taiwan) | negative | — | — | — | **yes** | $0.0126 |
| known-1050 (ua memorial) | known-answer | yes | yes | **yes** | — | $0.0065 |
| known-1270 (ru Rosnano sentence) | known-answer | yes | yes | **yes** | — | $0.0072 |
| known-1955 (ir revenge pledges) | known-answer | yes | yes | **yes** | — | $0.0108 |
| known-2476 (ru Kharkiv settlement) | known-answer | yes | yes | **yes** | — | $0.0071 |
| known-3810 (US sanctions individual) | known-answer | yes | yes | **yes** | — | $0.0077 |

**Honesty 5/5, known-answer citations 5/5 — PASS.** No metric/fixture edits were
needed (R2 untouched: the new persona *instructs* denials to lead with phrasing
`DENIAL_LANGUAGE_PATTERN` already recognizes, e.g. "No claims in the covered data
address …" — and all five negatives did exactly that, several also volunteering
what the corpus *does* cover, negative-05 stating data currency unprompted).
Per-question records: `docs/evals/results-v2-k60.json` (the 10 entries carry the
branch dbHost, by the results-file design).

Live post-fix probe (dev server on this branch, real prod DB, $0): "since
2026-07-20" → `state=insufficient, provider=none, cost_usd=0,
dataCurrentThrough=2026-07-12`, no usage rows — the short-circuit works
end-to-end. Cosmetic nit: a "since <future-date>" question renders the inverted
range "2026-07-20..2026-07-12" (from > to, since "since" pins `to`=today) —
honest but odd-looking; the common trigger (day-of questions before ingest) reads
clean (`from==to`).

## ④ Related-claims floor (W4, R4)

**`ASK_RELATED_MIN_SCORE` default 0.5**, floor on `vectorScore` (the only
mode-independent relevance signal), `vectorScore == null` excluded outright,
cap 5 (`RELATED_MAX`), empty block omitted. Consequence, documented in
`src/lib/ask/related.ts`: in `v2-lexical-only` mode the related block is always
empty (per your "empty beats junk" ruling).

Evidence (disposable-branch replay of retrieveV2, 6 probes, embeddings-only,
~$0.000002): plainly-relevant neighbors scored 0.43–0.80; the junk class
(off-theater strikes — the live smoke's Hamas/Gaza-class items reproduced, e.g.
"Israeli strikes in Khan Yunis and Gaza City" at 0.4108 under a Ukraine-strikes
question) peaked at **0.4547** ("UAE intercepted Iranian missiles" under a
Kyiv-strike question). Smallest excluding floor rounded UP to the 0.05 step →
0.5. Lexical-only tail candidates were pervasive junk and never plausibly
related. Re-run the replay if corpus composition shifts materially (e.g. Gulf
volume outgrows ru/ua).

## ⑤ W5 placement (R3)

Built at minimal scope, no park needed: a zero-JS `<form action="/ask"
method="get">` card directly under the validation tiles on the **signed-in** home
only — reuses `ask.title`/`ask.placeholder`/`ask.submit` (zero new strings).
Money-safe by construction: `/ask?q=` **never executes the pipeline on GET**
(W2's hard rule, pinned by a test that renders the page with `?q=` and asserts
`askWithLimits` is never called — plus verified live against prod data: GET left
`ask_usage` untouched). Signed-out home byte-untouched (diff-verified + tested).
Note the deliberate two-step UX: the home box lands you on /ask with the question
prefilled; you press Ask there. Nav restructuring beyond this: not built, per R3.

**W2 architecture note (bigger than the ticket, operator-authorized by the R3
hard rule):** the old design executed the paid pipeline on every GET-with-q —
that was the actual root of #48 (double-click = two GETs = two bills) and also
re-billed on refresh/back-nav/shared links. Execution now lives in a
`useActionState` server action (auth re-checked inside). Tradeoff: answers are no
longer URL-addressable — a shared/bookmarked `/ask?q=` link prefills instead of
re-running the query (and the back button returns to the form, not the answer).

## ⑥ Your interactive checklist (needs a signed-in session)

1. **#48:** ask a question, click Ask twice fast → spinner + disabled controls,
   and exactly ONE new `ask_usage` row.
2. **Freshness:** re-ask "how many missles hit kyiv today?" — day-of claims now
   exist by mid-morning, so to see the no-coverage state ask early UTC morning or
   use "since <a future date>"; either way the answer should state "data is
   current through …" and never mention claim IDs as something you should provide.
3. **Deep links:** click a citation's "digest →" → you land ON the claim (mind
   the sticky header clearance).
4. **Related floor:** ask a broad Ukraine question → related block junk-free (or
   absent entirely) — no Hamas/Cuba items.
5. **Home box:** signed-in home → Ask card under the validation tiles → submits
   to a prefilled /ask.
6. Dark-mode spot-check: pending spinner/hint, no-coverage callout.

## ⑦ Parked (with runbooks where relevant)

- **Server-side idempotency window** for /ask (same user+question in-flight
  dedupe) — parked; daily caps + the new pending-disable backstop it (noted in
  OPEN-TASKS #48 closure).
- **Streaming answers** — untouched (pre-existing parked idea; pending state
  makes the 10s wait legible for now).
- **Model-footer visibility by role** — untouched.
- **`retrieval_mode` mislabeling** (`v2-lexical-only` when the vector arm ran but
  the window returned 0 rows) — documented in ② and in the eval's degraded-run
  detector context; harmless today, worth a small follow-up if it ever pollutes
  eval telemetry.
- **Inverted-window echo** for "since <future date>" (⑤ ③) — cosmetic.
- **uk strings** for the 3 new keys appended to
  `docs/reviews/UK-NATIVE-REVIEW-2026-07-12.md` (native review pending).

## ⑧ Spend & state for the record

OpenAI: **$0.1061** eval gate + ~$0.000002 W4 replay embeddings + $0 everywhere
else ≈ **$0.106 of the $2 cap**. Both disposable Neon branches deleted
(`br-lively-rice-atd2f9oy`, `br-curly-snow-at19ecbu`). main == origin/main ==
deployed `bnow-qdesocr6p`; prod migration head unchanged (0016 — no schema
changes this sprint, per the ground rules). Feature branch `20260712-ask-polish`
kept (merged). Env knobs added this sprint (none pre-set in Vercel — code
defaults are live): `ASK_NO_COVERAGE_SHORTCIRCUIT` (default on),
`ASK_RELATED_MIN_SCORE` (default 0.5).

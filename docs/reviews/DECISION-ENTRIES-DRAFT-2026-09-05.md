# Decision-entries draft — 2026-09-05 (step 01, unsigned)

Every entry below is a candidate `AGENTS.md` decision-log entry, formatted exactly as that
log requires. **None of these has been appended to AGENTS.md.** Per the 48-hour program's
AGENTS.md write-lock (COMMON §4 item 7, INDEX §4), only steps 01/02/03/15/25 touch AGENTS.md,
and even step 01 drafts rather than appends — the operator signs by copying the entry (as-is,
or edited) into AGENTS.md's `## Decision log` at the checkpoint named in INDEX §6. Each entry
is marked `[UNSIGNED — operator]` until that happens. Do not treat anything here as binding.

---

## (a) PR #46 merge record

- **2026-09-04 (PR #46 merge record — validation live-evaluation five-vote parity)**
  `[UNSIGNED — operator]` PR #46 (branch `claude/eval-validation-parity-20260904`, reviewed
  tip `6bdc0db`) merged to `main` as merge commit **`883e5e3`**, atop PR #45's merge
  `9854626`. The existing 2026-09-04 decision-log entry for this PR ("validation evaluation
  parity — PR 2 of the methodology follow-up") records the branch, the review rounds, and
  the gate numbers (typecheck/lint clean · unit 3,612/3,612, 247 files) but not the merge
  hash — that entry is NOT edited here (it stays append-only); this entry supplies the
  missing hash for anyone reconciling `main` against the decision log. `git diff 883e5e3
  origin/main` is empty as of 2026-09-05, i.e. `origin/main` is `883e5e3`. No deploy
  accompanied this merge; production remains `dpl_6RN34UVHefQsvTfC2HM8Si5QnNmT` / `8a19ade`.

---

## (b) Step-1A execution — as reported by the operator

- **2026-09-05 (eval successor-plan step 1 authorization + step-1A execution — as reported
  by the operator)** `[UNSIGNED — operator]` No entry in this log records authorizing the
  eval successor plan's "step 1" bounded run before it ran; the successor plan only
  PROPOSES it (`docs/reviews/EVAL-SUCCESSOR-PLAN-2026-09-04.md:59-67`, quoted here in full
  because no other in-repo record carries it): *"Authorize step 1 only: a development-split,
  capture-enabled, production-equivalent baseline run (gpt-4o-mini; `--dev --repetitions 3`;
  `EVAL_CAPTURE_DIR` set, `EVAL_CAPTURE_RAW=1`, heldout raw NOT enabled) on the existing
  disposable Neon branch (kept, per A6 'keep until closeout') within `EVAL_USD_CAP_DAILY=2`
  and a campaign-local `LLM_SPRINT_USD_CAP` ceiling the operator names, plus the human
  labelling/adjudication work above. Explicitly NOT part of that authorization: any heldout
  run, any scorer/gate/label change (step 2 decides those afterwards), any candidate model,
  any deploy."* The 48-hour program's decision sheet answers this at **D6**: *"Yes Authorize
  $0.50 to $2.00. Summary report should explain impact of this LLM_SPRINT_USD_CAP"*
  (`docs/prompts/2026-09-05-48h-00-INDEX.md` §2) — this is read as the operator naming the
  campaign-local `LLM_SPRINT_USD_CAP` the successor plan's proposal left blank, i.e. a value
  in the $0.50–$2.00 range (an exact figure was not given; the executing session should pick
  a value in that range and record it, or ask). The CTO roadmap handoff §1 states, as fact,
  that "Step 1A (development-split, capture-enabled gpt-4o-mini baseline ×3 + blinded
  human-labeling packet) executed 2026-09-05; artifacts live outside the repo in
  `/Users/go/code/bnow-net-eval-successor-1a-20260904-artifacts/` (SHA manifests verified)."
  This entry does NOT independently verify that execution — this session (step 01) did not
  open the artifacts folder (COMMON §3 forbids it) and did not run anything — it records the
  handoff's claim as **reported by the operator's planning process**, for the record, pending
  the operator's own confirmation and signature. If the operator confirms the run happened
  as described, this entry becomes the authorization-and-execution record; if any detail
  differs, correct it before signing.

---

## (c) H0 decisions already answered in the program index

Each of the following restates one row of `docs/prompts/2026-09-05-48h-00-INDEX.md` §2
(the "When" = H0 items) together with the operator's own recorded Comment. They are
drafted here, not invented — the operator already answered them in the index; signing
moves the answer from a planning document into the permanent decision log.

- **2026-09-05 (D1 — PR #48 outreach roster)** `[UNSIGNED — operator]` Decision: PR #48
  roster disposition — merge as-is / redact / remove `docs/OUTREACH-ROSTER-2026-08-23.md`
  from git. Recommendation: remove from git (handoff §4.0(c)); keep the GO-NO-GO register.
  **Operator: "yes remove outreach from git."**

- **2026-09-05 (D2 — provider ambition for WS-2)** `[UNSIGNED — operator]` Decision: A
  (OpenAI-only) / B (+Anthropic) / C (+local OpenAI-compatible). Recommendation: A now,
  seam-ready for B/C. **Operator: "B. Yes Anthropic ANTHROPIC_API_KEY added to .env.local.
  Same Budget. C. provisional yes. Don't need for at least two weeks if easily added in the
  future, leave this out of this dev round."** Net: option B is authorized now (seam work
  proceeds under the same budget envelope as A); option C is deferred out of this window.

- **2026-09-05 (D5 — AGENTS.md compaction)** `[UNSIGNED — operator]` Decision: approve the
  split; inline window 0/7/30 days; restore strict date order when reunifying.
  Recommendation: approve; 7-day inline window; restore date order. **Operator: "Approve.
  AND keep below 150k characters as an additional constraint to avoid warning like:
  AGENTS.md is over the 150.0k-char limit (156.8k chars)."** Note for step 15: AGENTS.md is
  157,962 characters as of this entry (2026-09-05, pre-compaction) — already over the
  operator's 150k ceiling, which step 15's compaction must clear.

- **2026-09-05 (D6 — WS-1.1 capture-run spend authorization)** `[UNSIGNED — operator]`
  Decision: campaign-local `LLM_SPRINT_USD_CAP` for the ≈18-map-call, ≈$0.01 capture run.
  Recommendation: authorize $0.50 ceiling; record as the step-1 authorization entry.
  **Operator: "Yes Authorize $0.50 to $2.00. Summary report should explain impact of this
  LLM_SPRINT_USD_CAP."** See entry (b) above — this is the authorization that entry
  executes against.

- **2026-09-05 (D8 — credential confirmations)** `[UNSIGNED — operator]` Decision: confirm
  `NEON_API_KEY` works; `VERCEL_TOKEN` regen (optional); `ANTHROPIC_API_KEY` only if D2 = B.
  Recommendation: confirm Neon; leave the others. **Operator: "NEON, ANTHROPIC, OPENAI keys
  confirmed working. VERCEL_TOKEN is valid and correctly scoped to bnow-net."** This
  supersedes `docs/BLOCKERS.md`'s stale VERCEL_TOKEN-expired framing (see this step's
  report) — AGENTS.md's credentials table already read VERCEL_TOKEN as expired-but-CLI-live;
  the operator's confirmation narrows that further to "valid and scoped to bnow-net", which
  a future pass may fold into the table.

- **2026-09-05 (D9 — injection-case authorship)** `[UNSIGNED — operator]` Decision: who
  authors the six development-split injection cases (must not have read the live heldout
  `failures` strings). Recommendation: a fresh Opus (or Astra) session under the forbid
  list. **Operator: "We have never used Astra in this project. Use Astra via openai key to
  'author'."** Read literally this asks for a model named "Astra" dispatched via an OpenAI
  key, which the model roster (INDEX §3) describes as "the second frontier model" — an
  independent-provider identity, not an OpenAI-hosted one. The executing session (step 07)
  should confirm with the operator which concrete model/provider this resolves to before
  proceeding, rather than guess.

- **2026-09-05 (E1 — injection-case dataset vehicle)** `[UNSIGNED — operator]` Decision:
  new dataset file `map-inj-dev-v1.json` vs pre-creating `map-v3.json`. Recommendation: new
  file `map-inj-dev-v1.json`. **Operator: "Yes approve new name."**

- **2026-09-05 (E3 — exposure-ledger home)** `[UNSIGNED — operator]` Decision: where the
  eval exposure ledger lives. Recommendation: `docs/reviews/EVAL-EXPOSURE-LEDGER.md`,
  append-only, dated sections. **Operator: "Yes fine for new file in new location."**

- **2026-09-05 (R5 — "#108" locator)** `[UNSIGNED — operator]` Decision: name the
  branch/commit/file "#108" (which does not exist as an OPEN-TASKS item) actually refers
  to. Recommendation: name the branch/commit or file the task. **Operator: "Name branch."**
  This session (step 01) names it: the parked branch `claude/local-model-ask-eval-20260817`
  (`docs/reviews/PENDING-MERGE-ADJUDICATION-2026-08-25.md:90-96`; related debt tracked as
  OPEN-TASKS #100) is the most plausible referent — see the OPEN-TASKS #100 note and the
  handoff corrections block, both added by this step. If the operator meant a different
  branch, correct this line before signing.

- **2026-09-05 (D11 — AGENTS.md standing-text correction authority)** `[UNSIGNED —
  operator]` Decision: may the reconcile session (step 01) correct AGENTS.md standing text
  before the compaction (step 15) lands? Recommendation: yes. **Operator: "Yes correct
  AGENTS and remove note VERCEL_TOKEN is working now retricted to bnow-net project."** This
  step executed under that authorization (see the AGENTS.md diff in this step's report);
  the VERCEL_TOKEN wording in AGENTS.md's credentials table was left as-is this session
  (the correction is small and the table is not part of this step's assigned scope per the
  step prompt) — flagged here so step 15 or a later pass can apply the operator's exact
  wording ("restricted to bnow-net project").

- **2026-09-05 (D12 — model names in program documents)** `[UNSIGNED — operator]` Decision:
  allow model names in `docs/prompts/*`, `docs/reviews/*`, and the decision log, following
  existing precedent, never in commits/PRs/code/comments. **Operator: "Yes model names or
  recommendation in these files is OK."** CLAUDE.md's commit-hygiene rule (no vendor
  branding in commits, PRs, code, or code comments) is unaffected and remains binding; this
  decision only confirms the existing docs-only precedent.

- **2026-09-05 (O1, plan tier — log-drain platform check)** `[UNSIGNED — operator]`
  Decision (plan-tier half, due H0): does the `vociferous` Vercel plan support log drains?
  Recommendation: Neon receiver, 14-day retention; operator registers via dashboard.
  **Operator: "Yes Vercel supports Log Drains. Neon DOES NOT support drains on the 'Launch'
  level plan."** This changes step 16's target: the design should target a Vercel-native
  log drain (or a hosted sink other than Neon) rather than the recommended Neon receiver,
  since Neon's plan tier does not support it. The rest of O1 (retention, who registers) is
  CP1-gated and not answered here.

---

## (d) The 48-hour program itself

- **2026-09-05 (48-hour execution program authorized and kicked off)** `[UNSIGNED —
  operator]` The operator committed to a 48-hour, twelve-worktree agent execution program
  sequencing the CTO roadmap handoff (`docs/prompts/2026-09-05-cto-roadmap-handoff.md`, base
  `origin/main` `883e5e3`) into 28 numbered step prompts plus a governing index and common
  preamble (`docs/prompts/2026-09-05-48h-00-INDEX.md`,
  `docs/prompts/2026-09-05-48h-COMMON.md`), committed to local `main` as
  `afeef2b` (handoff) → `a912c7a` (index + preamble + 28 prompts) → `4e5b00f` (operator
  comments on the H0 decision sheet, i.e. the answers drafted into entry (c) above) — none
  of these three commits had been pushed to `origin/main` as of this entry. Binding scope
  for every session in the program (COMMON §3, INDEX preamble): no deploy, no Vercel
  environment change, no production write, no spend, no edit to
  `docs/evals/analysis/*`/the scorer/the registry approvals/the map lock, without a named
  operator authorization recorded in this log; where the handoff says DECISION, the session
  lists it and does not decide; **nothing deploys before step 26's go/no-go** (INDEX §0
  item 4, Wave 5). AGENTS.md write-lock: only steps 01, 02, 03, 15, and 25 edit AGENTS.md
  during the window, and even those draft rather than append decision-log entries except
  for the single standing-text corrections their own PR makes wrong. This entry exists so a
  later session or audit can find, in the append-only log itself, that the program ran under
  operator authorization and its own written constraints, rather than only in a
  docs/prompts file.

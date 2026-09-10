# Evaluation successor plan — 2026-09-04 (after PR #45 capture/accounting and PR 2 validation parity)

Status: proposed ordering for the operator. Nothing below is authorized by this document.
The 2026-09-03 campaign stays stopped with its recorded verdicts (map FAIL, digest FAIL,
validation insufficient_data; ledger ≈ $0.1518; two abandoned votes accounted separately);
those results are never re-scored, and any change after the step-4 heldout evaluation
requires a NEW evaluation version, never a reinterpretation of old results.

## Fixed order

1. **Development-only semantic/gold review and capture-enabled calibration** — under a LATER,
   separate paid authorization.
   - Run the development split only (`--dev`) of map/digest/validation with
     `EVAL_CAPTURE_DIR` + `EVAL_CAPTURE_RAW=1` (development raw; heldout raw stays off and
     is not requested), validation at the production-equivalent 5 votes, ×3 repetitions.
     Reconcile with `--capture-reconcile` before reading any output.
   - Human labels on captured development outputs: "states the gold fact?" for the class-U
     rows (typ-002/003/004, edge-003), the omission rows (adv-004, edge-005, c2-adv-005,
     c2-adv-003 B, c2-adv-004 B), and the digest survival rows; threshold sweep 0.3–0.6 +
     `quoteOverlap` (packet §2.C). Record who labelled and their heldout exposure.
   - Semantic adjudication of val-typ-005 takeaway 1 ("increased" vs "were active") with a
     written reason (OPEN-TASKS #105). The heldout twin is NOT read (authorization A3 stays
     separate); if it must change it is demoted and replaced.
   - Six new development-split injection cases authored by someone who has not read the live
     `failures` strings (OPEN-TASKS #106); offline machinery proof first, then the baseline
     ×3 with capture under this same authorization.
   - Expected spend: development split only; validation ~5× the 2026-09-03 validation cell
     (`--estimate` before the run); every cell inside the existing openai_eval caps on a
     disposable Neon branch; no production DB.

2. **Decide and freeze** — one decision-log entry, BEFORE any heldout run:
   - scorer rules: the gist-match rule (jaccard threshold + quoteOverlap, chosen on
     development rows only); `requiredEvidenceMisses` as a hard counter with docId-scoped
     `mustMatch` and the `required` default (A8) — only after step 1 shows the matching rule
     is calibrated (the packet's global `required=true` gate is NOT adopted before that);
   - required-evidence semantics per case (`liveGold` annotation with cited rule, reviewer,
     date, reason; `expectPipelineRefusal` cases live-inapplicable by rule);
   - labels (val-typ-005 and any other adjudicated label), digest survival pins moved out of
     `mustMatch` structurally (all five cases, outcome-blind), `tailEventSurvivalRate`
     report-only;
   - dataset populations (map-v3 / digest-v3 / validation-v3 unions, v2 byte-frozen) and the
     replacement heldout cases for any heldout reference/population change;
   - version identities: contract v3, `scorerVersion` in `resumeIdentityMismatch` and the
     capture `run` line (replacing the source-hash witness), new results basenames,
     pre-registered gate constants.

3. **Admit heldout** — appropriately separated heldout cases with an exposure ledger naming
   the author, what they read (the 2026-09-04 packet's exposure entry included), and the
   README stance (prohibited from iterative tuning, not secret). Heldout raw capture stays
   default-off; any heldout raw authorization is its own decision-log line and stamps the
   results header.

4. **Frozen-version baseline and candidate evaluation** — separately authorized: v3 baseline
   cells (gpt-4o-mini, production-equivalent validation votes) with capture on, then the
   candidate cells, under pre-registered gates and caps, reconciled against the ledger with
   `--capture-reconcile` before any verdict is read. Any change after this evaluation is a
   new evaluation version.

## Next bounded decision (proposed authorization)

**Authorize step 1 only**: a development-split, capture-enabled, production-equivalent
baseline run (gpt-4o-mini; `--dev --repetitions 3`; `EVAL_CAPTURE_DIR` set,
`EVAL_CAPTURE_RAW=1`, heldout raw NOT enabled) on the existing disposable Neon branch
(kept, per A6 "keep until closeout") within `EVAL_USD_CAP_DAILY=2` and a campaign-local
`LLM_SPRINT_USD_CAP` ceiling the operator names, plus the human labelling/adjudication
work above. Explicitly NOT part of that authorization: any heldout run, any scorer/gate/
label change (step 2 decides those afterwards), any candidate model, any deploy.

## Addendum — 2026-09-10 (step 25, 48-hour program docs sync; dated addition, not an edit)

Step 1 (above) executed under decision D6 on 2026-09-05/08, and the 48-hour execution
program's WS-1 lane carried several of this plan's open items further before the window
closed. Nothing here changes a scorer, gate, label, dataset population, or version
identity named above — those all still require the "decide and freeze" step this plan's
§2 describes, which has NOT run. This addendum only points at where the pieces now live:

- **Step 1 execution record:** `docs/reviews/EVAL-EXPOSURE-LEDGER.md` (2026-09-08 entry,
  `16:02Z`) — 18 requests / $0.0039 actual against the run card's $0.0112 estimate, cell
  `map-depth-full`, capture `live-1788883325599` (38 development lines, sha256 recorded),
  heldout raw off, zero heldout ids seen. The ledger's every subsequent dated section
  records this plan's forbid-list boundary being held (or, twice, an accidental brush
  against it, disclosed rather than hidden) across the rest of the window.
- **The six development-split injection cases** this plan's step 1 packet calls for:
  authored and landed as their own dataset, `map-inj-dev-v1.json`, per decision E1 (not
  unioned into `map-v3.json`, which does not exist yet — this plan's §2 dataset-population
  step is still ahead). Design, authorship provenance (decision D9 — operator-authored via
  Astra/OpenAI Codex, so no program session read the live heldout `failures` strings), and
  the offline machinery proof: `docs/reviews/INJECTION-CASES-DEV-2026-09-05.md`.
- **val-typ-005**, one of this plan's labelling questions, was adjudicated separately from
  the "decide and freeze" step (decision E4, 2026-09-06): `claimId: null` on semantic
  grounds. Record: `docs/reviews/EVAL-VAL-TYP-005-ADJUDICATION-2026-09-05.md`. The
  existing v1/v2 datasets and historical results stay frozen, exactly as this plan's own
  header requires; the adjudication is recorded for whenever a v3 dataset admits the case.
- **The v3-vs-v4 versioning question this plan implicitly raises** (a conflict-keyed
  validation dataset would otherwise compete for the "v3" identity with the per-country
  eval program's own next version) was decided 2026-09-06 as **D3: the conflict-keyed
  dataset is v4, created only AFTER the per-country v3 freezes** — keeping this plan's
  step-2 identities stable and the conflict-evaluation program (WS-3) off this plan's
  label timeline entirely. Neither v3 nor v4 has been created; this is a naming decision,
  not an execution one.
- **Unchanged and still ahead of this plan, as of 2026-09-10:** step 2 ("decide and
  freeze" — scorer rules, required-evidence semantics, labels, dataset populations,
  version identities) has not run; no heldout case has been admitted beyond the fixture-
  corpus ids already visible in the frozen conflict offline results (recorded, not newly
  exposed, in the 2026-09-06 WS-3.3 exposure-ledger entry); step 3 (heldout admission)
  and step 4 (frozen-version baseline/candidate evaluation) remain fully unauthorized. The
  program's own eval-plane code changes this window (provider dimension, entity-audit
  prompt extraction, registry-version decoupling — see
  `docs/reviews/PROGRAM-48H-DOCS-SYNC-2026-09-07.md`) are infrastructure this plan's later
  steps will run ON, not a substitute for running them.

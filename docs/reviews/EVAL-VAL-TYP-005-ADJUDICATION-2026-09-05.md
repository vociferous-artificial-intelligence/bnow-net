# val-typ-005 semantic adjudication — #105 / E4

## Scope

Step `docs/prompts/2026-09-05-48h-08-val-typ-005-memo.md`, WS-1.2; executed
2026-09-06 on `48h/ws1-adjudication-20260905-val-typ-005-memo`, fetched base
`dff58f25009da8e3dd8f759c4a5b563c2bb4dc96`. Recommendation only; operator ruling pending.

## Built

This memo, #105's status line, and the required PROGRESS block. PR title:
`docs: record val-typ-005 semantic adjudication`.

The development case's actual ID is **`val-typ-005-majority`**. Its synthetic
takeaway 1 reads: “Air defense activity increased over Belgorod region.” Claim 1072
reads: “Air defense units were active over Belgorod region, channels claimed.”

The production prompt says “A match requires the same underlying event/development,
not just the same topic” and permits “0.7 same development described differently”
(`src/lib/validation/llm-match.ts:75–82`). **It contains no explicit “same event,
weaker strength” rule**; accepting that reading requires interpretation.

| Candidate semantic label | Reason and limitation |
|---|---|
| `claimId: null` | Authored from 2-2-1 fixture arithmetic, which alone cannot establish semantic truth. Independently defensible: “increased” asserts a change from prior activity; “were active” supplies no comparison. |
| `claimId: 1072` | A coverage reading treats the same-day, same-region air-defense activity as the underlying development, reported less strongly. A match need not restate every detail, but this assumes the shared activity identifies the same development rather than merely the topic. |

**Recommend null on semantic grounds.** The increase is the takeaway's distinguishing
development; the claim supplies neither that comparison nor a specific incident tying
the descriptions together. Shared activity and location do not establish it. This is
a case-specific reading of the matcher, not a rule demanding identical wording or
certainty. Ruling 20's source-fidelity principle is analogous, not an independent
validation-matching mandate.

Under **either** label, retain `expectMajority = [{takeawayIndex: 0, final: 1071},
{takeawayIndex: 1, final: null}]`. Takeaway 1's fixed votes are
`[1071,1071,1072,1072,null]`; neither ID reaches three. The pin checks fixture
arithmetic, while live output is scored against `reference.labels`. The separation
test at `src/lib/evals/validation-parity.test.ts:311–340` deliberately makes the
fixture and live majority disagree while both checks pass, and freezes this case's
existing labels and pin.

## Tests

Unit: **3,612/247 → 3,612/247 PASS** (tests/files); typecheck PASS; lint PASS
(0 errors, 3 existing warnings). `git diff --stat docs/evals/analysis/` empty;
no untracked dataset files. Fork itests: not applicable (docs only). Spend: **$0**.

## Rulings touched and how each is satisfied

Rulings 1/3: quoted text is synthetic evaluation material, not operational fact or
ISW prose. Ruling 4: no paid calls. Ruling 20: no stronger factual assertion inferred.
Immutability (`src/lib/evals/contracts.ts:10–14`): any changed reference needs a new
case ID or `datasetVersion`; existing v1/v2 datasets and historical results stay frozen.

## Citations re-verified

`docs/evals/analysis/validation-v1.json:504,518,532,540,604,614` (only the named
development case, filtered; the prompt's short ID found nothing);
`docs/OPEN-TASKS.md:1647–1656`; `docs/reviews/EVAL-VALIDATION-PARITY-2026-09-04.md:84–88`;
`docs/reviews/EVAL-SUCCESSOR-PLAN-2026-09-04.md:21–23,31–45`;
`src/lib/validation/llm-match.ts:75–82,187–219`;
`src/lib/evals/score-validation.ts:135–145,196–207`;
`src/lib/evals/validation-parity.test.ts:311–340`; `src/lib/evals/contracts.ts:10–22`;
`AGENTS.md:466–472`; `docs/prompts/2026-09-05-48h-00-INDEX.md:149,159`.

## Decisions needed

**E4:** sign null (recommended), or explicitly select 1072 with the coverage rationale
above. No E4 signature exists in the base decision log; INDEX E4 is blank.

**Proposed AGENTS.md changes — UNSIGNED decision-log entry; no standing-text change:**

- **2026-09-06 (val-typ-005 semantic adjudication, #105)** For development case
  `val-typ-005-majority`, retain takeaway 1's semantic label `claimId: null`:
  “were active” does not establish the increase that defines the takeaway's
  development. This judgment is independent of the authored 2-2-1 vote arithmetic.
  Keep both `expectMajority` entries unchanged. WS-1.3 records this reason in the
  validation-v3 admission; any changed reference requires a new case ID or
  datasetVersion. Existing v1/v2 datasets and historical verdicts remain frozen.
  This ruling grants no heldout inspection, rerun, scorer change, spend, or deployment.

Operator signature/date: **UNSIGNED / __________**.

## Debt and risks

Only this development case was inspected; its heldout twin was neither sought nor
read. No forbidden artifacts were opened. The recommendation cannot resolve a heldout
label. The pre-existing dirty `package-lock.json` is excluded from this PR.

## Handoff

WS-1.3 must cite the signed E4 entry, record reviewer/date/reason in validation-v3,
and preserve the mechanism pin. Replace successor-plan step 2's “labels (val-typ-005
and any other adjudicated label)” with “labels per signed E4 (cite entry and reason),
with val-typ-005's expectMajority unchanged, and other adjudicated labels.” Conflict
versioning follows INDEX D3 (v4). Heldout work remains separately authorized; if its
reference must change, demote and replace it. Step 25 applies only the signed log
entry; #105 stays pending until the operator rules.

# Step 23 — Remediate the audit findings (steps 17, 18) — SKETCH (Wave 4, lanes R and C)

| | |
|---|---|
| Model / effort / mode | Opus / high / plain session — one session per lane, or one session if both registers are small |
| Lane / worktree | R (`48h-routing-20260905`) and C (`48h-conflict-20260905`), step branches `…/remediate-<register-id>` |
| Window | H34 → H40 |
| Depends on | 17, 18 registers; operator decisions on which findings to accept as debt |
| Rewrite from | `WS-2-AUDIT-FINDING-REGISTER-2026-09-06.md`, `WS-3-AUDIT-FINDING-REGISTER-2026-09-06.md` — paste the finding ids, severities and exact remediations here, plus the operator's accept/defer marks |
| Spend | $0 |
| Closing report | `docs/reviews/AUDIT-REMEDIATIONS-2026-09-07.md` |

Read `docs/prompts/2026-09-05-48h-COMMON.md` first, then both registers.

## Prompt shape (fill in at CP3)

For each finding the operator marked FIX: one commit (or one PR when the fix spans files)
titled `<area>: <finding id> — <imperative>`; the fix includes a test that fails on the
pre-fix code (paste the failing run in the report); re-run the lens the finding came from on
the fixed diff. For each finding marked DEFER: an OPEN-TASKS entry (next number after #107 /
step 01's additions) with the register id, severity, and why deferred. Blockers cannot be
deferred — if one is deferred, stop and say so. After remediation, ask the audit model (a
fresh Fable session for R, Astra for C — short read-only re-check prompt included in the
report) to confirm each fixed finding closed; paste the confirmations. Merge order for CP4:
remediated PRs first, then 19–22 if still open.

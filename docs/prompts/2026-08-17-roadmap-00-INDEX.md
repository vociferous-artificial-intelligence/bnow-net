# Beta-quality roadmap prompt sequence — index (authored 2026-08-17)

Companion to the beta-quality roadmap note. Nine implementation prompts, numbered in
intended launch order. Each is self-contained house-style: paste into a fresh coding
session in the repository root after reading AGENTS.md. All were authored **before** the
two 2026-08-17 programs (quality foundation; conflict-region evaluations) reached their
terminal reports, so every prompt begins with a launch-precondition check against the
actual Git/production state — **update the precondition block, spend envelopes, and any
stale SHAs/figures at launch time; the code and current state always win over this
prose.** Refine these files in place as progress is made; they are working documents, not
append-only records.

| # | File | Roadmap phase | Production risk | Paid spend | Launch preconditions (verify fresh) |
|---|---|---|---|---|---|
| 01 | `…-01-pricing-metering-and-alert-proof.md` | 0.1–0.2 | One small deploy; one temporary env drill | none | None — launchable immediately; touches main only |
| 02 | `…-02-integration-landing-and-staged-deploy.md` | 0.3–0.5 | Merges + migrations + two staged deploys | none | Both 08-17 programs PASS on exact final SHAs |
| 03 | `…-03-snapshot-capture-and-combined-benchmark.md` | 1.1–1.4 | Additive migration; scheduled shadow runs; scoreboard ship | small (llm_match soak) | 02 deployed and stable |
| 04 | `…-04-corpus-funnel-and-source-depth.md` | 2.1–2.5 | $0 registry writes; ≤N source activations | none (LLM) | 02 deployed (funnel report available) |
| 05 | `…-05-model-baselines-and-candidate-evaluation.md` | 3.1–3.3, 3.5 | Possible remap execution (capped) | capped eval envelope | 02 deployed; 03 Phase A done preferred |
| 06 | `…-06-risk-based-escalation-routing.md` | 3.4 | None (feature-off build) | none | 05 baselines exist |
| 07 | `…-07-analyst-feedback-loop-and-admission.md` | 4.1–4.4 | Admin-only surface; admission checklist | none | 03 scoreboard shipped |
| 08 | `…-08-paid-data-hygiene-sequence.md` | 5.1–5.3 | Entity cleanup apply; paid rescore | separate auth per step | Independent of 03–07; run after 02 |
| 09 | `…-09-hygiene-batch.md` | standing lane | Minor | none | Opportunistic, never blocking |

Parallelism: 01 now. 02 alone. 03 and 04 interleave. 05 after 03-A datasets exist; 06
after 05. 07 starts as soon as 03 ships its scoreboard — do not serialize it behind 05/06.
08 and 09 fit any idle slot after 02.

Standing rules binding on every prompt in this sequence (restated once here):

1. Read `AGENTS.md`, `docs/CURRENT-STATE.md`, `docs/OPEN-TASKS.md` completely first.
2. Author in isolated worktrees; never edit the ordinary checkout or another worktree.
3. Additive migrations only; `9999_claim_source_trigger.sql` stays last (ruling 5).
4. Fail-closed spend: every physical paid attempt reserved via SpendGuard and every billed
   response metered before parsing; no SDK auto-retries on paid paths (ruling 4 family).
5. No ISW/reference prose persisted or rendered; truth-in-UI; `unavailable` ≠ `0`.
6. Every gated page: authorization as the first statement (ruling 21) + the
   production-build authorization integration test.
7. Adversarial review gates use fresh reviewers who did not author the diff; a
   self-review never satisfies a gate; if no reviewer is available, report
   `review-gate-blocked`.
8. Plain commits, `area: imperative summary`, no assistant/vendor branding anywhere.
9. Merges to `main`, pushes, deploys, env changes, production writes, and paid provider
   calls happen only where a prompt explicitly authorizes them AND the operator confirms
   at launch; otherwise deliver `implementation-pass / merge-awaits-operator-review`.
10. Correct this index's table (status column welcome) as prompts complete or change.

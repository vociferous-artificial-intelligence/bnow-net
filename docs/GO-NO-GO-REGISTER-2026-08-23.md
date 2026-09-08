# BNOW.NET — Go / No-Go decision register

Consolidated 2026-08-23. Every documented decision point where a human must choose
"proceed" vs "hold": launch gates, spend authorizations, rights gates, quality gates,
and the standing "do not X until Y" rulings.

**This is an index, not a new authority.** Each row cites the document that owns the
decision; where they disagree, the cited source wins. Nothing here changes a ruling.
Source line numbers are as of 2026-08-23.

Scope note: the numbered engineering *review* gates (AI-Search Gate 0–7, the roadmap
Gate A–D batteries) are reviewer checkpoints, not operator decisions, and are summarised
in §F rather than enumerated. `docs/reviews/AI-SEARCH-WORKSTREAM-INDEX-2026-07-19.md`
holds that ledger.

---

## Critical path — what actually blocks what

**To take the first dollar** (in dependency order):
`A2` packaging freeze → `A1` Paddle product approval + `A3` unit economics →
`B1` OpenSanctions commercial rights → `B2` counsel review → `A5` Terms/Privacy for
billing → `E5` `ASK_BILLING_CUTOVER_AT` → `A6` seven-day canary → `A7` go-live approval.

**To admit the first real external analysts:**
`A8` launch promise (automated aid vs analyst-verified) → `A9` cohort selection →
`B5` re-open #75 clickwrap verification → `A10` /access response window →
then `A11` widening criteria.

**Independent of both, and currently the weakest number:** `C1` — measured event
coverage is 15.6–20.7% against an ≥80% Phase-2 target. No commercial gate formally
depends on it, which is itself worth a decision.

---

## A. Commercial launch & packaging

| # | Decision | Criterion to go | Status |
|---|---|---|---|
| A1 | Paddle product/AUP approval | Paddle confirms in writing that the described product may use Checkout **and, separately,** Invoicing; approval saved in operator records. "Do not treat sandbox access as production approval." | **Open** — no Paddle code in tree |
| A2 | Freeze launch packaging | One catalog matrix naming every offer, buyer type, interval, base currency, tax presentation, included theaters, usage limits, collection mode, public y/n. Six sub-decisions incl. trials (rec: none in v1) and past-due grace (rec: 7 days full access → read-only). | **Open / blocks A1 encoding** |
| A3 | Approve unit economics | Dated finance decision recording accepted terms, gross-to-net by offer, refund exposure, payout currency, reconciliation owner. Published rates model ≈$20.50 on $400, $150.50 on $3,000, $990.50 on $19,800. | **Open** |
| A4 | Individual = org-of-one, or new SKU? | Operator choice; blocks the catalog matrix. | **Open** |
| A5 | Legal/privacy revision before live checkout | Terms + Privacy identify Paddle's role, billing data shared, renewal/cancellation, buyer terms + refund policy, DSA/subprocessor, chargebacks, sanctions screening. | **Open** |
| A6 | Production canary | Live checkout for internal allowlist only; a real charge/refund needs explicit operator authorization; **hold ≥7 days with zero unexplained drift** before public rollout. | **Open** |
| A7 | Paddle go-live | Seven days zero unexplained reconciliation drift + tested rollback + finance reconciliation + support runbook + **explicit operator go-live approval**. Enforcement applies to **one vertical slice first — Ask** — proving direct-route security, in-flight cancellation, and that account/portal access survives for non-entitled users, before expanding. | **Open** |
| A8 | Launch promise: "automated analyst aid" **or** "analyst-verified" | Operator decision. If analyst-verified: recruit a regional expert for tail-event review and define the manual verification standard. | **Open** |
| A9 | Design-partner recruitment | 10–20 partners across compliance, commodities, political risk, journalism. Binding rider: *demonstrate RU/UA reference-grade quality first; do not broaden theater claims ahead of evidence depth.* | **Open** |
| A10 | /access response-window promise | "None promised (change only if it will be met)." Operator supplies the promise before the copy changes. | **Open** |
| A11 | Widen beyond the first cohort | **≥3 external analysts active ≥2 weeks, ≥50 adjudicated labels, no unresolved safety finding.** | **Open** — the clearest numeric go/no-go on the list |
| A12 | Publish the words "no charge" for beta | Not published; neutral fallback shipped ("No self-service purchase or card is required to request access"). Confirm the policy with the operator before publishing the explicit words. | **Open (fallback in place)** |
| A13 | Restore `/pricing` | Restore only at the launch gate; today it 308-redirects to `/access`, and "no public purchase path exists, which is currently correct." | **Holding** |
| A14 | `SIGNIN_MODE=invite` flip | Named a stop condition; grandfather set = every existing `users` row + `ADMIN_EMAILS` + approved `subscribe_intents`. | **DONE 2026-07-15** — production is invite-only |
| A15 | Regional-bundle packaging (#12) | Bundle $2–5K/mo, à-la-carte country ≈40% of bundle, global $10–15K/mo, standby $300–500/mo, no surge pricing — add the bundle layer **before GTM launch**; reconcile with GTM-STRATEGY. | **Open** |
| A16 | Per-subscriber canary marking | Add **before enterprise/API launch** — "it's what makes $100k embedding deals safe to sell." | **Deliberately deferred** |
| A17 | Public-launch validation-record policy | Label existing history "alpha / experimental baseline"; establish a clean launch epoch rather than presenting alpha values as an unbroken public series. After launch, never overwrite the as-published record. | **Open recommendation** |
| A18 | Partner endorsement sequencing | Methodology review **before** any public endorsement; convert reviewers to public names only after they engage with the product. Do not buy AIS speculatively — seek a pilot buyer or data partnership first. | **Open** |

Sources: `docs/designs/PADDLE-BILLING-FOUNDATION-PLAN-2026-07-19.md` §2 (L52–124), §13 Phase F
(L845–862), §12 canary (L763–769), §15 (L886–903), §16 (L905–914), L135–138 ·
`docs/HUMAN-SETUP-TODO.md` L110–139 · `docs/OPEN-TASKS.md` L229–233, L199–202 ·
`docs/prompts/2026-08-17-roadmap-07-analyst-feedback-loop-and-admission.md` L47, L53–61 ·
`docs/reviews/PRIVATE-BETA-READINESS-NOTE-2026-07-13.md` L48, L246, L275–280 ·
`docs/reviews/SCORING-QUALITY-AUDIT-2026-07-14.md` L199–224 · `docs/PARTNER-STRATEGY.md` L52, L102 ·
`docs/BUSINESS-PLAN.md` L136–139.

---

## B. Data rights, legal & disclosure

| # | Decision | Criterion to go | Status |
|---|---|---|---|
| B1 | OpenSanctions commercial rights | **Hard gate.** Commercial licensing MUST be resolved before charging for compliance surfaces; current quota is a one-month trial-shaped arrangement. Treat current compliance data as beta/internal until rights are clear. | **Open — unresolved** |
| B2 | Sanctions-exposure counsel review | Counsel review before charging customers: Russian state-media handling, sanctions exposure, and the posture of storing citations/classifications without rendering ISW prose or source full text. | **Open** |
| B3 | Restore any public sanctions/PEP assertion | Requires **all four**: a human-review workflow + stronger identifiers + product review + a **new decision-log entry**. Matching is name + entity type only; no DOB/nationality/registration numbers; no human-review workflow exists. | **Blocked** |
| B4 | Named people on private `/signals` (#58) | Accepted beta reviewers see qualifying names + cited evidence; anonymous stays teaser-only; requires a prominent notice, explicit non-endorsement Terms language, and — because material — a **version bump forcing re-acceptance**. | **RULED + DEPLOYED 2026-07-16** |
| B5 | Clickwrap-bypass window (#75) | Adjudicated won't-fix *because every existing account is one of the owner's own aliases*. Closure note: "If real third-party users are admitted before that flow is revisited, the question **re-opens as a fresh item**." | **Closed, conditionally re-opens — roadmap 07 Part B instructs re-opening for the first external cohort** |
| B6 | Retention disclosure before persistence | Privacy 1.2's "no fixed automatic deletion period" is incompatible with any persistence-backed Ask surface; retention envs must be set and disclosed first. | **PASSED** — 30/7/7 set, Privacy 1.3 live 2026-07-21 |
| B7 | Source-reliability score publication (#14/#56) | Do not implement or publish until the 26,195-citation Facebook root is segmented (#56 before #14). Do not publish a reliability score without its coverage gates. | **Design complete, publication blocked** |
| B8 | PostHog scope changes | Session replay, broad autocapture, heatmaps, surveys, dead-click capture stay off. `ask_started` needs operator approval of the new event + a decision-log entry. Key absence is the kill switch. | **Live opt-in only; `NEXT_PUBLIC_ANALYTICS_ASK_STARTED` unset** |
| B9 | Conflict-region texts | Must not be presented as published conflict intelligence; internal statistics need calibration **and an operator product decision** before public presentation; results must not be described as a scientifically validated live metric. | **Binding on the unmerged conflict program** |

Standing legal invariants (not decisions — constraints on every decision above): no ISW
prose or source full text in user-facing output; every claim keeps ≥1 raw_document link;
stub/fixture data never renders as fact; ruling 19 digest publication safety; ruling 20
named people in Search/Ask.

Sources: `docs/BLOCKERS.md` L59–61 · `docs/HUMAN-SETUP-TODO.md` L14–15, L81–89, L121–125 ·
`AGENTS.md` L176–181, L187–193, L258–276, L381–384, L478–483 · `docs/OPEN-TASKS.md` L89–97,
L234–244, L427–445, L674–682 · `docs/reviews/AI-SEARCH-DECISION-REGISTER-2026-07-19.md`
L479–486 · `docs/prompts/2026-07-14-posthog-product-analytics.md` L56, L169, L324, L403, L493 ·
`docs/prompts/2026-08-17-conflict-region-combined-evaluations.md` L885.

---

## C. Product-quality gates

| # | Decision | Criterion to go | Status |
|---|---|---|---|
| C1 | **Phase 2 success metrics** | Event coverage **≥80%** of ISW-reported events same-day; unsupported-claim rate **<2%**; timeliness within **±6h**. | **FAILING.** Measured 2026-07-11 over 49 runs: coverage ru 18.4 / ua 15.6 / ir 20.7% mean — **59–64 pts short**; median info-lead +15h (favourable but outside a symmetric ±6h band); the "unsupported" column is a thin-sourced proxy, not literal hallucination. Corpus depth is the lever, not tuning. |
| C2 | Phase 3 success metrics | **10 paying design partners**; 1 government pilot in procurement pipeline; new-country onboarding ≤2 analyst-weeks. | **Open** |
| C3 | Phase 0 → Phase 1 | Registry ≥2,000 deduped sources; endnote parse rate >90%. | **PASSED** — 6,985 deduped sources (3.5×), 97.65% parse rate, 1,578 reports |
| C4 | Iran public prominence | Before shipping Iran prominence, verify the Iran theater page and latest digests are presentable; on failure, park with a written diagnosis. *"We do not market what embarrasses us."* | Gate defined 2026-07-12; overtaken by the 2026-08-15 Iran recovery (coverage collapsed 60.4% → 23.2%, recovered to a 38.0 all-16 mean — **still below pre-incident**) |
| C5 | Local-model promotion | No local model may be promoted without its own **paid** scorecard (router `hasScorecard` gate); local model ids stay out of `PRICES_PER_MTOK`; `ASK_ANSWER_MODEL` remains `gpt-5` in every Vercel env. | **NO-GO recorded** 2026-08-17; offline scorecard cannot promote |
| C6 | Fidelity scorecard for Ask routes | A model/route may **not serve Auto or Fast** without a passing fidelity scorecard. Fast/Deep routes + mode selector are not servable until the paid matrix runs. | **Blocked** on D3 |
| C7 | Map-reduce K=5 vs K=3 variance gate | Three metrics; K=3 failed on within-cell coverage SD (10.5 vs 8.0). K=5 + majority-gid fill: coverage 21.14→24.97 PASS, SD 8.02→6.94 PASS, unsupported 0.408→0.296 PASS. Do not lower `REDUCE_VOTES` or remove the fill without re-running the gate. | **PASSED** — `DIGEST_ENGINE=mapreduce` live since 2026-07-09 |
| C8 | Combined-scoreboard soak (roadmap 03) | Predeclared thresholds must exist **in writing before any scoring run** — "gates chosen after results are invalid by the program's own contract." A failed soak yields a diagnosis note and remediation loop, **not a threshold adjustment**. Enable the flag on soak PASS only. | **Open / not launched** |
| C9 | Candidate-model hard gates (roadmap 05) | A candidate regressing **any** hard gate — traceability, schema/batch completeness, publication-safety, named-person fidelity, hedge preservation, K=5 reproducibility, metering invariants — fails regardless of quality wins. Gates may not be adjusted after seeing results. | **Open / not launched** |
| C10 | Escalation-routing thresholds (roadmap 06) | Thresholds set from measured baselines, not intuition; policy passes only if escalated items improve named-person safety and hedge preservation **without regressing** coverage or reproducibility. | **Open** |
| C11 | Label promotion into held-out gate sets | Remains a **deliberate operator action**; train/development cases stay separate from held-out gate cases. | **Open** |
| C12 | i18n native-speaker sign-off | ~31 machine-translated beta strings + ~20 nav strings await native review — required **only if** admitting non-English-market analysts. | **Open, conditional** |

Sources: `docs/PRODUCT-BRIEF.md` L312–316 · `docs/PHASE0-FEASIBILITY.md` L3–14 ·
`docs/OPEN-TASKS.md` L219–228 · `AGENTS.md` L251–256, L503–505, L548–550, L599–601 ·
`docs/evals/LOCAL-ASK-SCORECARD-2026-08-17.md` L22, L296–312 · `docs/reviews/MR3-REDUCE-RESULTS.md`
L130–184 · `docs/prompts/2026-08-17-roadmap-03…` L18–23, L65–76 · `…roadmap-05…` L42–56 ·
`…roadmap-06…` L15–21 · `…roadmap-07…` L37–40, L58.

---

## D. Spend & paid-operation authorizations

| # | Decision | Criterion to go | Status |
|---|---|---|---|
| D1 | OpenSanctions paid rescore | **Six conditions, all true before `--run`:** beta-readiness + canonical-identity persist deployed ✅ · X recovery closed ✅ · claim-linked spend eligibility deployed ✅ **and** kind-safe cleanup implemented/reviewed/tested/deployed with a dry run showing **zero automatic cross-kind merges** ❌ · #61 explicitly operator-approved **and** `--apply` run with post-apply integrity checks ❌ · monthly accounting deployed ✅ · operator **separately authorizes** the paid rescore after a fresh population/quota recount ❌. Do not raise the quota to finish faster. | **BLOCKED on 3 of 6** |
| D2 | Entity cleanup #61 apply | Latest dry run: 1,012 → 794, but **79 of 131 merges cross entity kinds** against a `(kind, canonicalKey)` identity — not approval-safe. Kind-safe-only diagnostic: 52 merges → 873. Requires the kind-safe fix **deployed**, a fresh read-only dry run reviewed, and **zero cross-kind merges in the approved plan.** Must precede D1. | **BLOCKED — "do not approve/apply"** |
| D3 | Paid answer-model matrix eval (~$1–3) | Operator approval. Unlocks Fast/Deep routes and any default-model or K change. | **Enablement-blocked** |
| D4 | Procurement-access path | Choose and approve one: RU-region/residential proxy, commercial zakupki mirror/API, or reachable official OpenData/FTP. Proxy ≈$10–50/month. | **Open** — adapter complete, returns `[]` in production |
| D5 | Roadmap 05 eval envelope + remap | Operator supplies candidate list with exact snapshots, spend envelope, and verified current pricing **before any run**. **One** remap execution, if and only if a map candidate passes **and** the operator approves activation. `--estimate` + `--dry-run` reviewed → `--execute` under caps → verify corpus completeness → **then** the operator flips `MAP_MODEL`. | **Open / not launched** |
| D6 | Roadmap 03 paid matching envelope | Operator sets the number at launch (`llm_match` all-time cost $0.13 — expect single digits). | **Open** |
| D7 | Roadmap 08 hygiene chain (#61 → #41 → #56 → #14) | Each step gets its **own** operator confirmation and, where paid, its own envelope. If a handoff's premises no longer hold: **stop** and write a reconciliation note rather than improvising. | **Open** |
| D8 | Roadmap 01 pricing-fix deploy + alert drill | ONE production deploy after operator confirmation; ONE bounded temporary env change for the drill, reverted the same session. No paid calls, migrations, or cap/model/routing changes. Underlying defect: gpt-5-mini priced at $0.25/$2.00 vs the table's $0.125/$1.00 — a **2× understatement** of live Ask rerank spend. | **Open** — `deploy-awaits-operator-confirmation` |
| D9 | Raise Ask caps beyond beta scale | Set new cap envs in **all** Vercel envs *before* deploying code that reads them (ruling 4). | **Open** |
| D10 | Neon compute reduction deploy | Branch not deployed; ~17–19% savings estimated but **not production-proven**. A separate operator-approved action. | **Open** |
| D11 | OpenAI funding | Auto-recharge or low-balance alert. ≈$0.50/day steady state. The account died once mid-weekend and everything silently degraded to the extractive stub. | **Standing operator task** |
| D12 | Iran validation recovery envelope | $40 map all-time / $20 temporary daily to 2026-08-17T13:00Z / ≤$20 new spend, with armed stop conditions. | **PASSED / closed** — actual spend **$1.87** of $20; no second raise |
| D13 | X gap-recovery envelope | $50 X / $10 map / $10 reduce, operator-authorized; provider dashboard balances are **not** spending authorization. | **Executed** — $3.9164, ledger reconciled to $0.00003 |

Standing constraint over all of D: **SpendGuard fails closed.** Every paid call passes
`tryReserve()` first and refuses when its total-cap env is unset. Set a new cap env in all
Vercel envs *before* deploying the guard that reads it, or you stop that pipeline.

Sources: `docs/reviews/OPENSANCTIONS-RESCORE-RUNBOOK.md` L5–32, L61, L111–112 ·
`docs/OPEN-TASKS.md` L305–323, L481–494 · `docs/reviews/ENTITY-CLEANUP-PLAN-2026-07-13.md` L31–85 ·
`docs/reviews/AI-SEARCH-DECISION-REGISTER-2026-07-19.md` L44–51 · `docs/HUMAN-SETUP-TODO.md`
L11, L24–29, L67–77 · `docs/prompts/2026-08-17-roadmap-{01,03,05,08}…` · `AGENTS.md` L194–204,
L498–512 · `docs/reviews/NEON-COMPUTE-REDUCTION-PHASE-1-2026-08-16.md` L6, L60, L168 ·
`docs/reviews/X-GAP-RECOVERY-RUNBOOK-2026-07-13.md` L4, L96, L105.

---

## E. Feature-enablement gates (the Ask flag lattice)

All off except `ASK_RUNS_SHADOW=1`. Each flag is a discrete decision; the lattice is
fail-closed and `src/lib/ask/features.ts` is its single server-side authority.

| # | Flag | Requires |
|---|---|---|
| E1 | `ASK_RUNS_ENFORCE` | Prod migrations 0021+0022+0027 + valid `ASK_CONTENT_RETENTION_DAYS` + deploy + an explicit `ASK_RUNS_SHADOW=1` soak |
| E2 | `ASK_PROGRESSIVE` | **Three conjunctive conditions:** (1) clean **48–72h** soak, all-PASS on `ask-shadow-soak-check`, no stuck runs / persistence failures / retention breaches / error-rate or latency regressions; (2) a **reviewed, non-empty** `ASK_PROGRESSIVE_COHORT` allowlist — *an empty value means ALL accepted users, never enable progressive without it*; (3) an explicit operator decision-log entry. **Progressive is never enabled automatically by the soak's success.** |
| E3 | `ASK_STREAM_ANSWER` | Gate 3 pass + operator cohort decision |
| E4 | `ASK_EXACT_CACHE` | Migration 0024 + effective progressive + valid `ASK_CACHE_TTL_DAYS` |
| E5 | `ASK_BILLING_CUTOVER_AT` | Stays unset until the billing contract exists **and** the Gate 7 joint leg passes. Migration 0027 defaults `billing_eligible` false — nothing is invoice-eligible without a future explicit operator entry. Setting it requires a decision-log entry. |
| E6 | `ASK_SESSIONS` | Retention decision + migration 0025 + a UI build |
| E7 | Beta unit-billing rules to re-decide | Cancelled runs bill 0; model refusal bills 1 while truncation bills 0 (asymmetry explicit); degraded stub/budget answers bill 0. |

The soak window dates from **2026-07-22T01:10:37Z** — it was restarted when the
OpenSanctions release touched Ask code.

Sources: `docs/reviews/AI-SEARCH-RELEASE-2026-07-21.md` L200–212 ·
`docs/reviews/AI-SEARCH-WORKSTREAM-INDEX-2026-07-19.md` L58–73 · `AGENTS.md` L157–160, L320–329,
L423–424 · `docs/reviews/AI-SEARCH-DECISION-REGISTER-2026-07-19.md` L373–383, L470–471.

---

## F. Standing engineering release gates

Not operator decisions, but they gate every change that reaches production.

- **Pre-push gate:** typecheck + lint + test, enforced. Currently 2,123 unit / 166 files;
  107 real-Postgres integration / 17 files.
- **Fresh-reviewer rule:** adversarial gates use reviewers who did not author the diff; a
  self-review never satisfies a gate; with no reviewer available the outcome is
  `review-gate-blocked`.
- **Authorization rule:** merges to `main`, pushes, deploys, env changes, production writes
  and paid calls happen only where a prompt authorizes them **and** the operator confirms at
  launch; otherwise the deliverable is `implementation-pass / merge-awaits-operator-review`.
- **Migrate before deploy** (0021/0022 — Gate 0 finding F5). **Satisfied 2026-07-21.**
- **Ruling 21 — authorization in the PAGE, not the layout.** Live since 2026-08-15;
  30/30 after fix, was 20 failed / 10 passed.
- **Gate 7 JOINT boundary leg — BLOCKED** on the absent billing contract; no money-path
  wiring exists (test-pinned).
- **X long-park closure (#66/#38):** do not close until a real scheduled park →
  checkpoint-resume → completion sequence is proven in production; #38 closes **only if
  mailbox receipt is confirmed** with Postmark message IDs. Natural recovery proved
  2026-08-14 (10,393 docs); mailbox receipt still unverified.
- **Neon integration credential:** saved `NEON_API_KEY` returns 401; disposable-branch
  integration tests are blocked. Where that infrastructure is unavailable, **record the
  gate as blocked** rather than skipping it.

---

## G. Sequencing rulings — "do not X until Y"

| Do not | Until |
|---|---|
| Run the OpenSanctions rescore | Cleanup #61 is applied (it changes the scored population) |
| Apply cleanup #61 | The canonical-identity persist fix is deployed (else merged spellings recreate on the next digest persist) |
| Regenerate any historical digest | The publication guard is deployed |
| Implement #14 reliability calibration | #56 Facebook segmentation lands |
| Deploy a guard that reads a new cap | The cap env is set in **all** Vercel envs |
| Deploy code containing Phase-0 Ask commits | Migration 0021 is applied to production |
| Enable any persistence-backed Ask feature | Retention is disclosed in the Privacy Notice |
| Run any scoring pass | Predeclared thresholds exist in writing |
| Set roadmap-06 escalation thresholds | Roadmap-05 Stage-2 baselines exist |
| Start roadmap 03/04/05/08 | Roadmap 02 has landed |
| Enforce billing | Beta grants are converted to explicit audited `beta` grants |
| Open live checkout | Policy versions are bumped |
| Publish a named-advisor list | Reviewers have engaged with the product and are comfortable with the claims |

---

## Open questions this register surfaces

1. **No commercial gate depends on C1.** Coverage at 15.6–20.7% against an ≥80% target is
   the headline quality number, and nothing in the launch path formally blocks on it.
   Either the Phase-2 target is wrong for the product as built, or a coverage floor belongs
   in the launch gate. Worth an explicit decision rather than drift.
2. **A8 gates A9, but A9 is already being worked.** The analyst-verified vs automated-aid
   promise determines whether reviewer recruitment is a GTM motion or a staffing decision.
   Recruiting before deciding risks promising the wrong thing.
3. **B1 has no owner or date.** It is the single hard gate on compliance revenue and has
   been open since 2026-07-07.
4. **D2 has been blocked on the same defect since 2026-07-13** and transitively blocks D1
   and the whole roadmap-08 chain.

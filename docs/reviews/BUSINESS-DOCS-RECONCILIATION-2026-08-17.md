# Business-docs reconciliation — 2026-08-17

**Branch:** `claude/business-planning-20260817` (worktree `.claude/worktrees/business-planning-20260817`)
**Trigger:** the 2026-08-17 desk review of business planning (Google Doc, "Business-Planning
Documentation — Review"), which found the four core strategy docs untouched since
2026-07-06/07 — six weeks, ~40 commits and two product releases behind — and identified
findings F1–F6 plus six coverage gaps.
**Scope:** documentation only. No application code, migration, env, deploy, or paid call.
No business *decision* is made here — open decisions are surfaced and framed, never
resolved by default.

## 1. What changed, by file

| File | Change |
|---|---|
| BUSINESS-PLAN.md | Reconciliation banner; §2 market figures refreshed (2026 sources); **NEW §4.1** packaging-status (the three-model conflict, F1) + Paddle fee math; **NEW §5 unit economics** (gap 1); **NEW §6 cash & runway** (gap 2); summary updated. |
| GTM-STRATEGY.md | Banner; §1 scoreboard-honesty framing (F5); §2 beachhead re-sequencing — compliance ICP gated on OpenSanctions rights/admin-only posture (F4); §5 packaging marked undecided; **§6 rewritten** to the private-beta funnel that exists (F3); §7 statuses — X/MTProto shipped, license-not-key is the OpenSanctions item, Comtrade priced; G1 dependency chain (gap 6). |
| COMPETITIVE-AND-DEMAND.md | Banner + review cadence (gap 3); **NEW §1.1** landscape refresh (RF/Mastercard closed, Windward/FTV $271M, Kpler+Spire+Bridgeton/$1B Sixth Street, Dataminr $85M, Kharon/Treasury, Sayari/TPG); §4 build statuses (mirror-trade ✅, materials ✅, signals partial, ownership key-blocked). |
| PARTNER-STRATEGY.md | Banner: outreach blocker cleared 2026-07-15, motion unblocked and unstarted (F6); honest evidence-memo numbers specified. |
| STATUS-REPORT.md | Fully rewritten to 2026-08-17 (was 2026-07-07): current numbers, what changed, honest weaknesses, top-5 moves reordered to decision-first. |
| HUMAN-SETUP-TODO.md | Executive priority reordered (decisions first); §4 NEON key cleared; §7 OpenSanctions pricing verified; §10 Comtrade premium priced; **§11 rewritten Stripe → Paddle** (F2). |
| BLOCKERS.md | Appended dated 2026-08-17 status sweep (log format preserved): Stripe superseded, NEON/X/MTProto/DNS cleared, still-open list restated. |
| PRODUCT-BRIEF.md | Reconciliation note added under the header; founding text untouched (it is the installed spec). |
| CRITICAL-MATERIALS.md / NEXT-PHASE-PLAN.md | "BUILT/SHIPPED" status banners; plans preserved as history. |

F2 (Stripe references reading as current) is closed by the banners + §11 rewrite + the
BLOCKERS sweep — the Paddle plan's "don't edit standing text while Paddle is a proposal"
deferral had held for a month; a reader-facing supersession note is the middle path.

## 2. Refreshed economic inputs (verified 2026-08-17, with sources)

External prices:

- **Paddle**: 5% + $0.50 checkout · 3.5% bank-transfer invoicing (published standard
  rates; paddle.com via third-party trackers). Net at seed prices: $400→$379.50,
  $3,000→$2,849.50, $19,800→$18,809.50 checkout / ~$19,107 invoiced.
- **OpenSanctions**: PAYG **€0.10/query** (opensanctions.org/api); flat internal-use
  Screening License and reseller/OEM are quote-based. July actual: 780 req / $85.80
  ≈ $0.11/req — consistent with list.
- **OpenAI**: pricing.ts pins gpt-5 $1.25/$10, gpt-5-mini $0.125/$1, gpt-5-nano
  $0.05/$0.40 /MTok. pricepertoken.com (2026-08-16) matches gpt-5-mini $0.125/$1;
  benchlm.ai lists $0.25/$2 (Aug-2025 launch price — likely stale). OpenAI's current
  flagship line is gpt-5.6 (sol $2.50/$15 · terra $1/$6 · luna $0.10/$0.60);
  gpt-5-family absent from the main pricing page (legacy, still served). ACTION note
  in BUSINESS-PLAN §5.3: confirm mini's live list price in the console before
  publishing margin claims; consider luna-class in the model-routing evals.
- **twitterapi.io**: ~$0.15/1K tweets, credits 100K=$1, no minimum (twitterapi.io).
  Official X API contrast: Basic $200/mo · Pro $5,000/mo · Enterprise $42K+/mo.
- **Neon**: Launch $0.106/CU-hr · Scale $0.222/CU-hr · storage $0.35/GB-mo
  (neon.com/docs/introduction/plans). Endpoint verified fixed 1 CU, ~45–46 active
  min/hr (NEON-COMPUTE-REDUCTION-PHASE-0) ≈ 550 CU-hr/mo ≈ **$58/mo** at Launch rate
  (plan tier not confirmed in repo — flagged as assumption). Candidate B (merged,
  undeployed) targets 34–38 min/hr ≈ **~$46/mo**, −17–19%.
- **UN Comtrade premium**: **$2,000/yr individual · $6,000/yr non-profit · $12,000/yr
  for-profit institutional** (shop.un.org). Materially more than the July docs implied
  ("register for a key") — now a budgeted purchase decision.
- **Postmark** ~$15/mo (10K emails) · **Vercel Pro** ~$20/mo/seat · **PostHog** free
  tier at beta volume · Telegram MTProto / RSS / GDELT / ISW / Companies House: $0.

Market context:

- OSINT market: **$12.7B (2025) → $133.6B (2035), 26.7% CAGR** (Global Market Insights)
  vs prior-cited Exactitude $8.7B→$46B/18% — spread presented as a range, scope varies.
- Threat intelligence: **$10.38B (2026) → $18.85B (2031), 12.7% CAGR** (Mordor, May 2026
  release) alongside MarketsandMarkets $11.5B (2025) → $23B (2030).
- Bottom-up SAM (~$138M) deliberately unchanged — its accounts×ARPU inputs did not move.

Competitive events: Mastercard/Recorded Future closed Dec 2024 ($2.65B) + Mastercard
Threat Intelligence launch Oct 2025; Windward take-private by FTV Capital ~$271M
(completed Mar 2025); Kpler: Spire Maritime (Apr 2025), Bridgeton (agreed Dec 2025),
~$1B Sixth Street; Dataminr $85M (NightDragon/HSBC); Kharon selected by US Treasury;
Sayari/TPG $235M (2024).

## 3. Unit-economics arithmetic (as encoded in BUSINESS-PLAN §5)

Operational inputs from CURRENT-STATE.md / PROGRESS.md ledgers: digest+validation LLM
~$0.50/day; map $0.076/1K docs at ~4–6K docs/day (cap $4/day base); Ask ~$0.011/query
(caps: 100/user/day, $10/day budget, $2/day guard); X $0.74–$1.66/day observed
($2.50/day cap, $43.81 of $75 all-time); OpenSanctions July $85.80 with claim-linked
gating (232→46 eligible); Neon ≈$55–60/mo; Vercel ≈$20; Postmark ≈$15.

**Platform COGS ≈ $190–250/mo fixed** (~$8/day, hard-capped). Marginal cost per account
≈ Ask usage + email: Standby worst-case (100 q/day × $0.011 × 30) ≈ $33/mo → ≥91% gross
margin worst-case, ~99% realistic; ≥86%/94% net of Paddle. Marginal theater ≈ $10–30/mo
LLM+ingest at current volumes. First material cash event = first analyst hire
(~$120–180K/yr loaded), gated on G1 — burn until then is noise against any revenue.

## 4. Deliberately not done

- **No pricing/packaging decision** (OPEN-TASKS #12 stays open; §4.1 frames it).
- **No G1 decision** (framed with its four downstream dependencies).
- **No edits to CURRENT-STATE.md, OPEN-TASKS.md, AGENTS.md, DECISIONS.md, PROGRESS.md** —
  engineering-owned; DECISIONS/PROGRESS are append-only archives of record.
- **No Google-Doc edit** — the external review stands as the trigger document; this note
  + the doc updates are the response.
- No outreach sent, no key purchased, no Paddle submission — operator actions.

## 5. Verification

- Every number in the edited docs traces to CURRENT-STATE.md/PROGRESS.md (operational),
  a named external source verified 2026-08-17 (prices/market), or is labelled an
  estimate/assumption in place (Neon plan tier; gpt-5-mini list-price discrepancy).
- Coverage numbers quoted with their definitions (run-avg vs nonzero-day vs Iran
  comparable-day) and the Jul 29–Aug 15 discontinuity is disclosed wherever accuracy
  claims are discussed.
- Stripe no longer appears as a live instruction in any standing business doc; every
  banner names the Paddle plan path.
- Seed-catalog prices ($400/$3,000/$19,800) quoted verbatim from `scripts/seed.ts`.

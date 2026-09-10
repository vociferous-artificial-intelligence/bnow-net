# BNOW.NET — Rollout gap register — 2026-09-10 (seed)

**Step:** A0 · **Phase:** 0 Scope · **Owner:** AGENT · **Status:** REPORT (seed — a full A0
run should replace this file at `docs/rollout/GAP-REGISTER.md`)
**Consumed:** `docs/research/competitors/**` (6 raw files, 14 screenshots), the four
2026-09-09 drafts in `docs/research/` on the `docs/branding-strategy-20260909` worktree,
`docs/GTM-STRATEGY.md`, `docs/BUSINESS-PLAN.md`, `docs/COMPETITIVE-AND-DEMAND.md`,
`docs/PARTNER-STRATEGY.md`, `docs/PRODUCT-BRIEF.md`, `docs/CURRENT-STATE.md` (partial),
`docs/reviews/{DESIGN-FUNCTION-EVAL-2026-07-11, NAV-RESTRUCTURE-REVIEW, IA-REFINEMENT-REVIEW,
SIGNED-OUT-LANDING-CONTRAST-2026-07-16, PRIVATE-BETA-READINESS-NOTE-2026-07-13,
BUSINESS-DOCS-RECONCILIATION-2026-08-17, POSTHOG-ANALYTICS-CHECKPOINT-2026-07-14}.md`,
`docs/reviews/BRAND-MARKETING-DESIGN-PRACTICE-REVIEW-2026-09-10.md`.
**Feeds:** all
**Method:** desk scoring of existing artefacts against `docs/playbooks/rollout/PLAYBOOK.md`
done-criteria; no live-site walk, no DB query, no analytics read. Scores marked † were not
verified against the live site and should be re-checked by a full A0 run.
**Confidence:** MEDIUM — artefact coverage is good; buyer-evidence and surface rows rely on
docs, not on live checks.
**Not done / could not verify:** live route inventory; PostHog data; current access-request
count (last recorded 2026-07-15: 5 users, 0 approved, 1 pending); whether the four 09-09
drafts have been reviewed by the operator.

## 1. Summary

Stage: private analyst beta, pre-revenue, one operator. First gap in the chain: **O1 — no
buyer interviews exist**, so every Phase 3–5 artefact is PROVISIONAL. Blocking decisions:
packaging (OPEN-TASKS #12, open since 2026-07-06), G1 automated-vs-analyst-verified (open
since 2026-07-06), name keep/change (raised 2026-09-09), category term, OpenSanctions
commercial rights (gates the compliance ICP).

## 2. Register

| Step | Title | Status | Evidence | Gap | Blocking decision | Owner | Est. |
|---|---|---|---|---|---|---|---|
| A0 | Inventory & gap audit | PARTIAL | this file; `reviews/BRAND-MARKETING-DESIGN-PRACTICE-REVIEW-2026-09-10.md` | live surface audit, claim audit, analytics numbers | — | agent | 0.5 d |
| O1 | Buyer discovery interviews | **MISSING** | `PARTNER-STRATEGY.md` banner: "No outreach attempt… recorded"; `GTM-STRATEGY.md` §6 step 2 "Not started" | 8–12 interviews, ≥3 commodity/consultancy | outreach claim rules exist (`GO-NO-GO-REGISTER-2026-08-23.md`) — not blocking | operator | 25 h / 3 wk |
| A1 | Interview synthesis | MISSING | — | depends on O1 | — | agent | 0.5 d |
| A2 | Landscape & ownership | DONE | `research/competitors/market/raw-research-mna.md` (four-tier confirmation, PSC registers, 60 sources); `COMPETITIVE-AND-DEMAND.md` §1.1 refresh 2026-09-07 | vendor cards for design-set-only vendors (Dataminr, Sayari, RF) thinner than market-set | — | — | — |
| A3 | Pricing & deal sizes | DONE | `market/raw-research-pricing.md` (USAspending API, G-Cloud, NRCan series; CONFIRMED/INFERRED) | Dataminr, Sayari, RF pricing not in scope | — | agent | 0.5 d top-up |
| A4 | Vendor deep-dives | PARTIAL | `market/raw-research-janes.md` (Janes only) | Seerist and Sayari deep-dives (the two the drafts call the ones to study) | — | agent | 1 d each |
| A5 | IA & buyer journey | DONE | `design/raw-ia-navigation.md` (7 vendors, live Pass 2 for most; OxAn unconfirmed) | mobile nav not recorded; OxAn live check | — | agent | 0.25 d |
| A6 | Trust signals | DONE | `design/raw-trust-signals.md` | demonstrated-vs-asserted classification implicit, not tabulated | — | agent | 0.25 d |
| A7 | Visual branding | DONE | `design/raw-visual-branding.md` (two-pass, corrections logged) | green-accent count error noted by drafts (2/7 not 3/7) — correct in raw file; mobile read absent | — | agent | 0.25 d |
| A8 | Screenshot manifest | PARTIAL | `design/competitor-screenshots/` 14 files @1558×784, manifest inside A7 file | no mobile captures, no full-page, no pricing/CTA pages, no separate manifest | — | agent | 0.5 d |
| A9 | Research synthesis | PARTIAL | matrix/patterns spread across `research/branding_strategy.md` §7–8 and `marketing_strategy.md` Part I; self-assessment partly in `information_architecture.md` Part I and `design_concepts.md` Part II | no unified matrix across market+design sets; no positioning map; no A1 assumption test; self-assessment not on the same three rubrics | — | agent | 1 d |
| A10 | Brand strategy draft | PARTIAL (PROVISIONAL) | `research/branding_strategy.md` 2026-09-09 — position statement, anti-positioning, voice V1–V6, identity brief, decisions list | no A1 input; single variant (needs 3 for O3); proof tags present | name, category term | agent after A1 | 0.5 d re-issue |
| A11 | Narrative strategy draft | PARTIAL (PROVISIONAL) | `research/marketing_strategy.md` — N1–N10, adopt/improve/counter, ranked stack, segment table | no A1 input; channel plan thin; **no KPIs** | packaging | agent after A1 | 0.5 d re-issue |
| O2 | Positioning & packaging decisions | **MISSING** | `BUSINESS-PLAN.md` §4.1 "none is decided"; `OPEN-TASKS.md` #12; G1 open since 07-06; drafts' "what this does not decide" lists | the memo | — | operator | 3 h after A1 |
| O3 | Message test | MISSING | — | 5–8 sessions | O2 | operator | 8 h |
| A12 | Identity & tokens | MISSING | `design_concepts.md` names token roles (`accent`, `provenance`) but no values, no type pair, no boards | all | O2, O3 | agent | 2 d |
| O4 | Identity sign-off | MISSING | — | — | A12 | operator | 2 h |
| A13 | IA evaluation & target IA | DONE (PROVISIONAL) | `research/information_architecture.md` — 33 routes, G1–G10, target nav, build lists with effort | re-check against O2; journey walk per segment not explicit | O2 (pricing page) | agent | 0.25 d |
| A14 | Design concepts & system | PARTIAL (PROVISIONAL) | `research/design_concepts.md` — audit ("renders in Arial", ~1,000 gray utilities), F1–F6, directions A–D, five quick wins | quick wins not on a branch; page-type specs and component inventory absent; depends on O4 | O4 | agent | 2 d |
| A15 | Message hierarchy & copy | MISSING | `src/lib/product-copy.ts`, i18n catalogs exist; `SIGNED-OUT-LANDING-CONTRAST` shows copy sites | full copy + claim→evidence table; anti-positioning grep; native review of locales (OPEN-TASKS #20/#59) | O2, O3 | agent | 2 d |
| A16 | Personas & pricing packet | MISSING | OPEN-TASKS #24 "real buyer briefs do not exist"; reconciliation: "evidence memo does not exist"; `/pricing` → `/access` | all four artefacts | packaging (#12) | agent | 1.5 d |
| O5 | Design-partner program | MISSING | `PARTNER-STRATEGY.md` unstarted; `OUTREACH-ROSTER-2026-08-23.md` exists | terms, asks, onboarding | O2 (founding terms) | operator | 10 h + 2 h/wk |
| O6 | Usability sessions | MISSING | July reviews are instrumented audits only | 5 sessions on the redesign | A13–A15 built | operator | 10 h |
| A17 | Funnel instrumentation | PARTIAL | `reviews/POSTHOG-ANALYTICS-CHECKPOINT-2026-07-14.md` (opt-in consent, Privacy 1.1); no funnel numbers in any doc | event schema for request→approve→sign-in→first Ask→return; dashboards; baseline | — | agent | 1 d |
| A18 | Launch plan | MISSING | `GTM-STRATEGY.md` §6 five-step sequence (dates absent) | waves, gates, assets, claims review, runbook | O2 | agent | 1 d |
| O7 | Readiness sign-off | MISSING | `docs/RELEASE-CHECKLIST.md` covers engineering release only | claims/rights/identity/funnel items | all above | operator | 0.5 d |
| A19 | Monthly review | MISSING | — | — | A17 | agent | monthly |

## 3. Buyer evidence

| Kind | Count | Source | Date |
|---|---|---|---|
| Discovery interviews | no record found | PARTNER-STRATEGY banner | 2026-08-17 |
| Design partners | 0 (target 10–20) | GTM §6 step 1 | 2026-08-17 |
| Access requests | 1 pending, 0 approved | CURRENT-STATE (pre-flip audit) | 2026-07-15 |
| Users | 5 existing (incl. operator accounts) | CURRENT-STATE | 2026-07-15 |
| Usage analytics | none cited in any planning doc | POSTHOG checkpoint (consent-gated) | 2026-07-14 |
| LOIs / paying | 0 | BUSINESS-PLAN | 2026-08-17 |

## 4. Open decisions

| Id | Question | Opened | Owner | Blocks |
|---|---|---|---|---|
| #12 | Packaging model / price points / publish or withhold | 2026-07-06 | operator | A16, A18, O5 terms, Paddle checkout |
| G1 | Automated analyst aid vs analyst-verified tier | 2026-07-06 | operator | A10 proofs, A15 claims, first hire |
| — | Name: keep BNOW.NET or rename before enterprise contracts | 2026-09-09 (branding_strategy §14) | operator | A12 |
| — | Category term | 2026-09-09 | operator | A10, A15 |
| OS-rights | OpenSanctions commercial rights → compliance ICP sayable? | 2026-07-06/07 | operator/counsel | A11 segment row, A16 compliance brief |
| #58 | Naming individuals on /signals (counsel) | 2026-07 | counsel | A15, O7 |

## 5. Surface audit (from docs; † = not live-verified)

Hero: "Private analyst beta" badge, `home.sub`, CTA "Request beta access" → `/access` †.
Pricing: none; `/pricing` 308 → `/access` †. Signed-out visitor cannot see a claim with its
evidence (IA draft G-finding) †. `/methodology` reachable from nowhere †. 27/33 routes share
one title †. Font: Geist loaded, page renders in Arial †. Email: `no-reply@bnow.net`, auth
passing (2026-07-15). Analytics: PostHog opt-in, no numbers reported. Locales: 10, machine-
translated, 3 empty catalogs.

## 6. Homepage claim audit

Not done — requires the live page and `product-copy.ts`; the full A0 run should complete it.
Known items from the drafts: tagline "Transparent source reliability ratings…" leads with a
feature that `view-policy.ts` withholds (GATED); coverage ~17.5% must never be restated as
accuracy (SAYABLE with framing rule).

## 7. Recommended order of work

1. **O1 now** (operator, this week and next): use `OUTREACH-ROSTER-2026-08-23.md` and the
   O1 sheet; target 3 commodity-desk, 3 consultancy, 2 compliance or government, 2 wildcard.
2. In parallel (agent): A8 top-up (mobile + pricing/CTA pages), A4 for Seerist and Sayari,
   A3 top-up for the design-set vendors, A9 unified synthesis. Correct the 2/7 green count in
   `raw-visual-branding.md`.
3. After ≥ 8 interviews: A1 → re-issue A10 (three variants) and A11 (with KPIs) → **O2**
   (packaging, G1, name, category, OS-rights posture) → O3.
4. Then A12 → O4 → A14 (land the five quick wins on a branch now regardless — they are
   identity-neutral) → A13 refresh → A15 → A16 → O5.
5. A17 can start now (schema + dashboards + baseline); it does not depend on positioning.
6. A18 → O6 → O7.

## 8. Artefact inventory

See `docs/reviews/BRAND-MARKETING-DESIGN-PRACTICE-REVIEW-2026-09-10.md` §1–2 and §6 for the
file-by-file map; the four 2026-09-09 drafts are uncommitted on the worktree as of this date.

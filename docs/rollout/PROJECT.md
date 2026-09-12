# BNOW.NET — rollout project file

Filled 2026-09-10. Every rollout-playbook agent prompt reads this file first
(`docs/playbooks/rollout/COMMON.md` §1). Correct in place when reality changes.

| Placeholder | Value |
|---|---|
| `<<PROJECT>>` | BNOW.NET |
| `<<REPO>>` | `/Users/go/code/bnow-net` (work in a worktree under `/Users/go/code/bnow-net-worktrees/`, created from a native Mac session — see `CLAUDE.md`) |
| `<<CATEGORY>>` | conflict / geopolitical OSINT intelligence (category term is an OPEN decision — see `docs/research/branding_strategy.md` §14) |
| `<<POSITION>>` | provisional: "Conflict intelligence that shows its work." (`docs/research/branding_strategy.md` §0); GTM line: "Every number is clickable to its evidence, and we publish our own accuracy." (`docs/GTM-STRATEGY.md` §1) |
| `<<ICP_LIST>>` | 1 commodity / trading desks (beachhead) · 2 political-risk consultancies · 3 bank/MNC sanctions compliance (GATED: OpenSanctions commercial rights, admin-only presentation) · 4 insurers · 5 government/MOD/MFA (ROADMAP) · 6 journalists/NGOs (low ARPU, credibility) — per `docs/GTM-STRATEGY.md` §2 and the 2026-08-17 sequencing correction |
| `<<COMPETITORS>>` | 1a structured/API: Seerist, Janes, Dataminr, Sayari · 1b advisory: Oxford Analytica (Dow Jones), Eurasia Group · 1c cyber-adjacent: Recorded Future (Mastercard) · market-set extras: RANE, Verisk Maplecroft, S-RM (AXA XL) · flagged, not covered: Dragonfly Intelligence |
| `<<STRATEGY_DOCS>>` | `docs/PRODUCT-BRIEF.md`, `docs/GTM-STRATEGY.md`, `docs/BUSINESS-PLAN.md`, `docs/COMPETITIVE-AND-DEMAND.md`, `docs/PARTNER-STRATEGY.md`, `docs/METHODOLOGY-TRADECRAFT.md`, `docs/CURRENT-STATE.md`, `docs/STATUS-REPORT.md` |
| `<<OUT>>` | `docs/rollout/` |
| `<<OPERATOR>>` | Gregory (go@vociferous.nyc) |
| Live site (signed-out URL) | https://bnow.net |
| Test sign-in available to agents? | invite-only in production (`SIGNIN_MODE=invite`); magic-link test session only when the operator provides one — otherwise signed-out only |
| Analytics stack and consent posture | PostHog, explicit opt-in, default no collection, Privacy Notice 1.1+ (`docs/reviews/POSTHOG-ANALYTICS-CHECKPOINT-2026-07-14.md`) |
| Decision log path (append-only) | `AGENTS.md` § Decision log (7-day inline window) → `docs/DECISIONS.md` archive; entries must be appended, never edited |
| Open-task register path | `docs/OPEN-TASKS.md` (next free id: check the highest `#nnn` present; #114 as of 2026-09-08) |
| Claims / outreach rules register | `docs/GO-NO-GO-REGISTER-2026-08-23.md` (rulings A9, A12, A18, B1 constrain what a first email may claim); `docs/OUTREACH-ROSTER-2026-08-23.md` |
| Locales served; native-reviewed | en, uk, de, ar, ja, pl, fr (+ es, he, ko with empty catalogs); none native-reviewed (OPEN-TASKS #20, #59) |
| Paid-call budget for research steps | none; any LLM/API spend requires an operator-named cap (AGENTS.md standing rulings) |

## Project-specific notes for agents

- Standing rulings in `AGENTS.md` are binding: truth-in-UI (ruling 3 — copy never overstates
  what the product shows), claim→source traceability, fail-closed spend caps, applied
  migrations stay additive. Read § Standing rulings before A15/A16.
- Existing research maps onto playbook steps: `docs/research/competitors/**` (2026-09-07) =
  A2/A3/A4(Janes)/A5/A6/A7/A8(partial); the four 2026-09-09 drafts in `docs/research/` =
  A10/A11/A13/A14 (PROVISIONAL — no A1). `docs/rollout/GAP-REGISTER.md` (seed) has the scoring.
- Scoreboard honesty: coverage (~17.5% run-avg) is never restated as accuracy; any accuracy
  claim footnotes the 2026-07-29→08-15 map-worker outage (`docs/GTM-STRATEGY.md` §1).
- No vendor or model branding in any file, commit or comment (`CLAUDE.md` commit hygiene).
- `Claude outputs/` at the repo root is an untracked scratch drop, not a documentation
  location; playbook outputs go under `docs/rollout/`.
- Competitor naming in copy: default no (`docs/research/marketing_strategy.md`, Part IV).

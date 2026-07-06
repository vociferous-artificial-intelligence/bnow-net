# BUILD: Buyer-profile re-weighting (one feed → three products)

Paste into a fresh Claude Code session in /home/go/code/bnow.net. Read AGENTS.md and
docs/COMPETITIVE-AND-DEMAND.md §2 first. Rationale: raw events are a commodity; the
premium is tailoring the SAME claim set to a buyer's decision. Nation-states differ by
degree-of-conflict with Russia; commodity/compliance/insurer buyers weight differently.
This is how RANE justifies enterprise tiers — we do it with data + config, not analysts.

## Goal
A config-driven "lens" that re-orders and re-weights existing claims/events per buyer
profile, without new ingestion or schema churn. Selectable on digest/feed pages.

## Profiles (start with these; config, not code)
- `frontline` — warning + mobilization/logistics (troop moves, rail loadings, recruitment
  bonuses, border-region governors). Weight: military track, regional layer, timeliness.
- `sanctioning` — evasion + economic attrition + elite cohesion (mirror-trade, shadow
  fleet, factional fracture, data-dark). Weight: elite_politics, trade, datadark.
- `nonaligned` — counterparty risk + secondary-sanctions exposure + opportunity. Weight:
  entity/sanctions, ownership, compliance-flavored.
- `commodity` — supply-shock: outages, export quotas, procurement, Hormuz. Weight: ASTRA/
  strike events, trade, energy.
- `compliance` — entity pressure, prosecutions-before-designation, sanctions status.

## Build steps
1. `src/lib/profiles/config.ts` — each profile = {label, description, trackWeights,
   eventTypeWeights, sourcePlatformWeights, recencyHalfLifeHours}. Pure data.
2. `src/lib/profiles/rank.ts` (pure, tested) — score(claim|event, profile) → number;
   given a profile + claim set, return re-ordered list. No DB changes.
3. Wire into digest/feed rendering: `?profile=frontline` query param (default = balanced);
   a profile switcher UI on /digests and /countries feed pages.
4. Optional: persist a default profile per user (users table has room; or a cookie).
5. Tests: same claim set under two profiles yields different top-N ordering as expected.

## Definition of done
Profiles config + ranker + tests; profile switcher live on a feed/digest page; the same
day renders visibly differently for `frontline` vs `sanctioning`; docs updated. No new
ingestion, no schema migration required (keep it a read-time transform).

## Stretch
Tie to pricing: profiles map to the plan tiers (standby = 1 profile, full = all + custom).
Note in docs/ for the Stripe wiring step.

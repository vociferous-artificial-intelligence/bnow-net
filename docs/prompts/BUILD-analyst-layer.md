# BUILD: Thin analyst layer (assessments, trends, scenario flags)

Paste into a fresh Claude Code session in /home/go/code/bnow.net. Read AGENTS.md and
docs/COMPETITIVE-AND-DEMAND.md §2 ("Should we provide more analysis?"). Rationale:
competitors (RANE) sell analyst prose but "trust us"; we add a THIN analytical layer
where every sentence cites claims — capturing narrative value without becoming a
consultancy and without breaking the traceability moat.

## Goal
Three additive analytical outputs, all source-linked:
1. **Daily "what changed & what it means"** per track/theater — a short assessment block
   above each digest, every statement citing claim ids.
2. **Trend & anomaly detection** — surface deltas: pressure-index spikes, procurement
   surges, data-dark events, mirror-trade divergence widening, coverage/lead shifts.
3. **Scenario flags** — deterministic rules over the entity graph & metrics, e.g.
   "≥3 siloviki-linked prosecutions in 14 days → factional-purge flag".

## Build steps
1. `src/lib/analyst/signals.ts` (pure, tested) — functions over existing data:
   pressureSpike(entities, window), procurementSurge, dataDarkEvents, divergenceWidening,
   purgePattern. Each returns {flag, severity, evidenceClaimIds[], explanation}.
2. `src/lib/analyst/assess.ts` — build the daily assessment: gather the day's flags +
   top claims, optionally pass through the LLM provider with a strict "cite claim ids,
   ≤200 chars/sentence, mark interpretation as assessed" prompt; fall back to a
   deterministic template from the flags when no key. NEVER emit a sentence without ≥1
   claim id. Store on the digest (new column `assessment jsonb` — additive migration).
3. Render the assessment block on /digests pages (claim-id chips → source docs), and a
   `/signals` page listing active flags across theaters.
4. Daily cron (fold into /api/cron/digest after digests generate, or a new /api/cron/assess).
5. Tests: each signal fires on a crafted fixture and stays silent otherwise; assessment
   never contains an uncited sentence (assert claim-id coverage).

## Guardrail (the moat)
Every analytical claim carries confidence + source links or it doesn't ship. This is
what separates us from black-box competitors — do not relax it for nicer prose.

## Definition of done
signals + assess libs with tests; assessment block on digests; /signals page; at least
the purge-pattern and data-dark flags firing on real data; docs + decision log updated.

# BUILD: Ownership-graph deepening (narrow the Kharon/Sayari gap)

Paste into a fresh Claude Code session in /home/go/code/bnow.net. Read AGENTS.md and
docs/COMPETITIVE-AND-DEMAND.md §1 (gap list). Rationale: our entity graph is shallow vs
Kharon/Sayari's corporate-registry depth. OpenSanctions is already wired (meta.opensanctions);
add corporate ownership/directorship links cheaply for compliance buyers.

## Goal
Enrich company/person entities with ownership + directorship data and expose the
network on entity pages, so a user can see "who controls / is connected to" a tracked name.

## Data sources (check reachability first via /api/cron/probe)
- **UK Companies House API** (free, key by registration) — officers, appointments,
  resignations, PSCs (persons of significant control). Good for RU-linked UK entities.
- **OpenCorporates API** (freemium) — cross-jurisdiction company data.
- **OpenSanctions entities** (already have key path) — the `datasets` and related-entity
  links from the match response often include ownership edges (FollowTheMoney schema).
- Aleph / OCCRP (attribution required) — investigative enrichment, static.

## Build steps
1. Migration (additive): `entity_links` table — {from_entity, to_entity, relation
   (owns|director|psc|associate|subsidiary), source, since, meta}, or store edges in
   entities.meta if lighter. Reuse `entities` for the counterpart nodes (get-or-create).
2. `src/lib/enrich/ownership.ts` — keyed adapters (COMPANIES_HOUSE_API_KEY,
   OPENCORPORATES_API_KEY) + fixture stub; resolve a company/person → related nodes+edges.
3. Extend `/api/cron/enrich` (or a new /api/cron/ownership) to backfill links for
   company/person entities lacking them. Idempotent/resumable.
4. Entity detail page (`/entities/[id]`): a "connections" section — related entities with
   relation + source; link through. Small inline graph optional.
5. Tests: stub resolves a seeded company to its officers; edge dedupe; role mapping.

## Guardrail
Ownership assertions carry their source and never exceed what the source states (hedging
applies to relationships too). Attribute OCCRP/Aleph data.

## Definition of done
entity_links (or meta edges) + ownership adapter (live-or-stubbed) + connections UI on
entity pages + tests; ≥1 real entity showing sourced links; blockers noted for keys.

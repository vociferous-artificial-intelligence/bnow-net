// Phase 6 feature authority (contract §11; prompt §14): the SINGLE server-side
// reader for the conflict-surface flag. Conflict surfaces are OFF unless the
// operator explicitly sets CONFLICTS_UI=1 — absent, empty, "0", "true", or any
// other value is OFF (fail closed, one unambiguous ON spelling, matching the
// ASK_RUNS_SHADOW=1 house style).
//
// FEATURE-OFF CONTRACT (binding): with the flag off, every conflict route
// returns notFound() BEFORE any conflict data access; no navigation link, no
// sitemap/robots/OpenGraph/metadata promotion, no new runtime DB dependency on
// the off path. Enablement for local browser verification uses EPHEMERAL
// test-process env injection ONLY — a test sets process.env in-process or
// passes the var to a spawned build/serve process. NOTHING may persist it: no
// .env* edit, no Vercel configuration change, no committed default. Production
// enablement is a later operator decision recorded in the decision log.
//
// Import-safe: reading the flag touches nothing but process.env, and importing
// this module performs no IO, no DB access, and no env mutation.

import { notFound } from "next/navigation";

export const CONFLICTS_UI_ENV = "CONFLICTS_UI" as const;

/** True ONLY when the operator explicitly set CONFLICTS_UI=1. */
export function conflictsUiEnabled(): boolean {
  return process.env[CONFLICTS_UI_ENV] === "1";
}

/** The feature-off guard. On a PUBLIC conflict route this is the FIRST
 *  statement of the page component, before any conflict data access. On a
 *  GATED conflict route the ruling-21 authorization gate (requireAcceptedUser)
 *  is the first statement and this guard follows IMMEDIATELY second — both
 *  before data access (the access-tier pin, contract §11). Layouts may add
 *  defense in depth but are never the boundary. */
export function requireConflictsUi(): void {
  if (!conflictsUiEnabled()) notFound();
}

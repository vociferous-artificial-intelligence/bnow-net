// The entity-audit LLM request, as a pure module.
//
// WHY THIS IS NOT IN THE ROUTE. The prompt and the request shape are the two
// things an evaluation must reproduce byte-for-byte to mean anything, and
// while they lived inside a Next.js route handler the only way to read them
// was to boot a route with a DB pool and a spend guard attached. Everything
// here is pure: no env, no DB, no client, no fetch. The route composes it.
//
// BYTE-IDENTICAL BY CONTRACT. Extracting this changed no request byte — the
// system string is the same literal, the message array the same two entries in
// the same order, the parameter shim the same call, `response_format` the same
// object in the same position. entity-audit-prompts.test.ts pins the whole
// request object against the literal the route built before the move, and
// pins the system string's sha256 against the pre-extraction hash. A future
// change to either is then a visible diff in a golden, not a silent drift in
// what production sends.
//
// Nothing here imports src/lib/evals (isolation.test.ts), and the route it
// serves stays in openai-client.test.ts's ANALYSIS_DISPATCH_MODULES list.

import { analysisChatParams, type AnalysisDispatchConfig } from "../llm/model-config";

/** One row of the entity listing: the audit's whole view of the graph. */
export interface EntityAuditRow {
  id: number;
  kind: string;
  name: string;
  claims: number;
  /** most recent claim text mentioning the entity; null when it has none */
  sample: string | null;
}

export const ENTITY_AUDIT_SYSTEM = `You curate an entity graph for an OSINT conflict/elite-politics tracker. Entities must be specific, trackable real-world actors: named people, agencies, companies, organizations, armed factions/parties.

Given the entity list (id, kind, name, claims = evidence count, sample claim text), propose corrections as JSON {"proposals":[{"action":"delete"|"merge","id":<id>,"intoId":<id if merge>,"reason":"<short>"}]}.

DELETE only when clearly:
- a collective/non-specific actor ("protesters", "local residents")
- geography posing as an actor (a city/country with no institutional sense)
- an object, weapon system, disease, weather event, or abstract concept
- a person/org with zero plausible relevance to conflict, sanctions, elite politics, or security (e.g. sports/entertainment figures in stray claims)

MERGE only when two ids are clearly the SAME real-world actor (spelling/transliteration variants, abbreviation vs full name). intoId = the better-evidenced or better-named one.

Be conservative: when unsure, propose nothing for that entity. Do not invent ids.`;

/** The user-message body: one line per entity, sample text clipped.
 *
 *  The 120-code-unit clip is `String.prototype.slice`, preserved exactly as
 *  the route had it — see the note in the closing report: this is a
 *  provider-bound truncation of model-authored text and therefore a
 *  #97-family site (an astral pair split at the ceiling leaves a lone
 *  surrogate that the request serializer carries and the provider rejects).
 *  Repairing it would change request bytes, which is precisely what this
 *  extraction must not do; it is filed rather than fixed here. */
export function entityAuditListing(rows: readonly EntityAuditRow[]): string {
  return rows
    .map(
      (r) =>
        `${r.id} | ${r.kind} | ${r.name} | claims=${r.claims}${r.sample ? ` | e.g. "${String(r.sample).slice(0, 120)}"` : ""}`,
    )
    .join("\n");
}

/** The exact chat.completions.create argument the route dispatches.
 *
 *  `response_format` is `json_object`, NOT the strict `json_schema` every eval
 *  workload dispatches — recorded as decision R12 (PLAN-WS-2 §7.2). Adding
 *  entity_audit to the eval plane needs either a schema (a request change, so
 *  production has to be re-observed) or a non-strict eval path; it is not a
 *  detail to be harmonised in passing. */
export function entityAuditRequest(dispatch: AnalysisDispatchConfig, listing: string) {
  // key order is the serialized request's key order — preserved exactly as the
  // route had it, so the bytes on the wire do not move either
  return {
    model: dispatch.model,
    messages: [
      { role: "system" as const, content: ENTITY_AUDIT_SYSTEM },
      { role: "user" as const, content: `Entities:\n${listing}` },
    ],
    // default (non-reasoning) payload keeps exactly the historical
    // `temperature: 0`; a reasoning model drops it (model-config.ts)
    ...analysisChatParams(dispatch, { temperature: 0 }),
    response_format: { type: "json_object" as const },
  };
}

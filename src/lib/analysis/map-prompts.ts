import { createHash } from "node:crypto";
import { ENTITY_RULES, type Track } from "./tracks";

// Map-stage prompts: per-document claim extraction (the "map" of map-reduce).
// Derived from the digest track prompts (tracks.ts) but reframed per doc: the
// model sees a micro-batch of 10-25 documents and must return claims for EACH
// docId independently — no cross-document corroboration, grouping or ranking
// (those are the reduce's job, sprint 3). The digest pipeline does not use this
// module; it is shadow-only until the reduce ships.

export const MAP_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

/** Chars of (title + content) sent per doc. The digest path's 400 was a
 *  batch-era constraint that truncates most telegram/X posts mid-thought
 *  (audit §6a: telegram 31.5% > 400 chars); input is cheap (§4b). */
export function mapContentChars(): number {
  const v = Number(process.env.MAP_CONTENT_CHARS);
  return Number.isFinite(v) && v >= 200 ? Math.floor(v) : 1500;
}

// Strict-mode response schema, keyed by docId. One entry per input doc; a doc
// with nothing track-relevant returns an empty claims array (normal + cheap).
// Base shape only — callers use mapResponseSchema(docCount), which pins the
// results array to EXACTLY the batch size. Prompt instructions alone measurably
// do not achieve that: without bounds gpt-4o-mini answered 1 of 15 docs and
// stopped clean (finish_reason=stop); with minItems=maxItems it answered 15/15.
export const MAP_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          docId: { type: "integer" },
          claims: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                text_en: { type: "string" },
                quote_orig: { type: "string" },
                claim_type: { type: "string", enum: ["factual", "assessment"] },
                hedging: {
                  type: "string",
                  enum: ["confirmed", "claimed", "unverified", "assessed", "unknown"],
                },
                event_hint: { type: "string" },
                entities: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      name: { type: "string" },
                      kind: {
                        type: "string",
                        enum: ["person", "agency", "company", "faction", "org"],
                      },
                      role: { type: "string" },
                    },
                    required: ["name", "kind", "role"],
                  },
                },
              },
              required: ["text_en", "quote_orig", "claim_type", "hedging", "event_hint", "entities"],
            },
          },
        },
        required: ["docId", "claims"],
      },
    },
  },
  required: ["results"],
} as const;

// Shared per-doc extraction discipline. Rule 5 deliberately restates the digest
// prompts' HARD RULE 3: single-doc 'confirmed' is allowed only for facts the
// document itself visually/geolocation-corroborates — which is what the batch
// model already does for two-thirds of confirmed claims (audit §9b); the
// corroboration-driven upgrade for the multi-doc minority is the reduce's job.
const MAP_HARD_RULES = `HARD RULES:
1. results MUST contain EXACTLY ONE entry for EVERY docId listed in the user message, in the same order — no more, no fewer. A document with nothing relevant still gets its entry, with an empty claims array (a normal, common outcome). Before finishing, verify your entry count equals the document count. Never invent or omit ids.
2. Extract ONLY what each document itself asserts. Do not merge, corroborate, or compare across documents — every claim belongs to exactly one docId.
3. 0-3 claims per document, most significant first. text_en: ONE atomic assertion in English (translate as needed), <= 200 characters.
4. quote_orig: a span COPIED CHARACTER-FOR-CHARACTER from the document text (source language, no paraphrase, no translation, no ellipsis) that supports the claim, <= 300 characters.
5. hedging: 'confirmed' ONLY for facts this document itself visually or by geolocation corroborates; 'claimed' for single-party assertions (state-media claims stay 'claimed'); 'unverified' for uncorroborated reports; 'assessed' for analytic judgments (those get claim_type='assessment').
6. event_hint: 3-10 English words naming the real-world event the claim belongs to, specific enough that claims from OTHER documents about the same event would get a similar hint (place + action + date where known).`;

const MILITARY_MAP_SCOPE = `SCOPE — significant military-security developments only:
strikes and shelling, advances and withdrawals, air-defense activity, personnel and equipment losses, deployments and force posture, mobilization and recruitment, military-industrial and military-economic facts, political decisions directly shaping the war.
Routine chatter, link reposts, ads, fundraising, and emotional commentary with no factual assertion => zero claims.`;

const IR_MILITARY_MAP_SCOPE = `SCOPE (this theater is posture-and-proxy, not front lines) — extract only:
- strikes and counterstrikes involving Iran, Israel, or the US (CENTCOM)
- IRGC / Artesh / Quds Force activity: deployments, exercises, commander statements, losses
- proxy and partner attacks: Hezbollah, Houthis (incl. Red Sea shipping), Iraqi militias, Palestinian Islamic Jihad
- maritime incidents: Strait of Hormuz, tanker seizures/harassment, naval movements
- air-defense activity, airspace closures, sabotage at military or nuclear facilities
- arms transfers and missile/drone program developments
QUIET CONTENT IS NORMAL: a document with no genuine military-security development yields zero claims — do not inflate routine news.`;

const ELITE_MAP_SCOPE = `SCOPE — Russian/Iranian ELITE POLITICS only: criminal prosecutions, corruption cases, asset seizures/nationalizations, gang/organized-crime trials with political links, appointments, dismissals, and suspicious deaths of officials or businessmen.
For each claim capture where possible: WHO is targeted and which network/faction they belong to; WHICH ORGAN is acting (FSB, Investigative Committee, Prosecutor General, MVD, courts) — the acting agency is itself a factional signal.
Factional interpretation (faction losing cover, asset redistribution, purge, turf war) is ALWAYS claim_type='assessment', hedging='assessed'.
Ignore routine crime with no political/elite dimension => zero claims.`;

const NUCLEAR_MAP_SCOPE = `SCOPE — IRAN'S NUCLEAR PROGRAM only: enrichment level and stockpile changes, IAEA reporting/access/inspections, facility activity (Natanz, Fordow, Isfahan, Arak, Bushehr), centrifuge installation/type, sabotage or strikes on facilities, breakout-time implications, diplomatic status (JCPOA/talks), weaponization indicators.
Technical facts get hedging per sourcing (confirmed if IAEA-verified or geolocated in this document; claimed if single-party; unverified if uncorroborated). Breakout estimates and intent judgments are claim_type='assessment', hedging='assessed'.
Do not sensationalize; anything else => zero claims.`;

function mapIntro(langs: string): string {
  return `You are an OSINT analyst extracting atomic claims from INDIVIDUAL source documents for a conflict-monitoring claim store.
Input: numbered source documents (id, source, reliability 0-1, date; ${langs}).
Output: for EVERY input docId, the 0-3 atomic claims that document alone supports.`;
}

/** Resolved map system prompt for a (track, theater). Mirrors the digest path's
 *  prompt resolution: ir military gets the posture-and-proxy variant. */
export function mapSystemPrompt(track: Track, theater: string): string {
  switch (track) {
    case "military": {
      const scope = theater === "ir" ? IR_MILITARY_MAP_SCOPE : MILITARY_MAP_SCOPE;
      const langs =
        theater === "ir" ? "English/Persian/Arabic" : "Russian/Ukrainian/English";
      return [mapIntro(langs), scope, MAP_HARD_RULES, ENTITY_RULES].join("\n\n");
    }
    case "elite_politics":
      return [
        mapIntro("Russian/Ukrainian/English or English/Persian/Arabic"),
        ELITE_MAP_SCOPE,
        MAP_HARD_RULES,
        ENTITY_RULES,
      ].join("\n\n");
    case "nuclear":
      return [mapIntro("English/Persian/Arabic"), NUCLEAR_MAP_SCOPE, MAP_HARD_RULES, ENTITY_RULES].join(
        "\n\n",
      );
  }
}

/** Doc line as the model sees it. Unlike the digest's 400-char batch line, the
 *  map budget is mapContentChars() (default 1500) and the doc's own UTC day is
 *  included — a map micro-batch may span days, unlike a digest-day batch. */
export function mapDocLine(d: {
  id: number;
  sourceKey: string | null;
  reliability: number | null;
  day: string; // yyyy-mm-dd
  title: string | null;
  content: string;
}): string {
  const body = ((d.title ? d.title + ". " : "") + d.content).replace(/\s+/g, " ");
  return `[${d.id}] (${d.sourceKey ?? "unknown"}, rel=${d.reliability?.toFixed(2) ?? "?"}, ${d.day}) ${body.slice(0, mapContentChars())}`;
}

/** Per-batch response schema: the results array must hold exactly one entry
 *  per input doc. The count constraint is grammar-enforced by the API, so an
 *  omitted doc can only happen via a duplicated docId (counted + retried). */
export function mapResponseSchema(docCount: number) {
  return {
    ...MAP_RESPONSE_SCHEMA,
    properties: {
      results: {
        ...MAP_RESPONSE_SCHEMA.properties.results,
        minItems: docCount,
        maxItems: docCount,
      },
    },
  };
}

/** Bump when the user-message framing changes meaning — it is part of the
 *  extraction contract, so it participates in mapExtractorVersion exactly like
 *  the system prompt. rev 2: explicit docId checklist + entry-count demand,
 *  after rev 1 measured a 43% per-batch omission rate (backfill round 1). */
export const MAP_USER_FRAME_REV = 2;

export function mapUserMessage(
  track: Track,
  theater: string,
  docIds: number[],
  docLines: string[],
): string {
  return (
    `Track: ${track} · Theater: ${theater.toUpperCase()}\n` +
    `Return exactly ${docIds.length} result entries, one per docId, in this order: ${docIds.join(", ")}\n\n` +
    `Documents:\n${docLines.join("\n")}`
  );
}

/** Version stamp for doc_claims/doc_map_state rows: model + a hash of the exact
 *  resolved prompt, user framing rev and serialization params. Any change to
 *  the prompt, the model or the per-doc content budget yields a new version
 *  — old rows stay, the anti-join re-maps under the new one. */
export function mapExtractorVersion(track: Track, theater: string): string {
  const basis = [
    MAP_MODEL,
    mapSystemPrompt(track, theater),
    `frame=${MAP_USER_FRAME_REV}`,
    `content=${mapContentChars()}`,
  ].join("\n ");
  return `${MAP_MODEL}:${createHash("sha256").update(basis).digest("hex").slice(0, 12)}`;
}

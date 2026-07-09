// Map-reduce digest engine (MR sprint 3, TASK 2): the LLM synthesis pass over
// deterministic claim groups. Replaces the legacy 100-doc batch extraction:
//
//   doc_claims --(reduce.ts clustering)--> claim groups --(deterministic
//   pre-ranking)--> top N groups --(K synthesis votes, majority-merged)-->
//   events --(persistDigest, the shared invariant path)--> digests
//
// The model only ever GROUPS and TITLES: it references claim-group ids, never
// docIds — the doc set, hedging, confidence and entities are derived
// server-side from the groups, so hallucinated citations are structurally
// impossible. K=3 voting (OPEN-TASKS #28) kills single-roll variance: an event
// survives only if a majority of runs independently produce it.

import { Pool } from "@neondatabase/serverless";
import OpenAI from "openai";
import {
  LlmBudgetError,
  assertLlmEnabled,
  estimateUsd,
  reduceGuardFromEnv,
  reduceMaxOutputTokens,
} from "../usage/llm-guard";
import type { SpendGuard } from "../usage/spend-guard";
import { isSkipped, persistDigest, type DigestSkipped, type PersistEvent } from "./digest-persist";
import { summarizeLlmCalls, type DigestResult } from "./digest";
import { MAP_MODEL } from "./map-prompts";
import { loadReduceClaims } from "./reduce-io";
import { clusterClaims, isMetaClaim, rankGroups, type ClaimGroup, type Hedging } from "./reduce";
import { TRACKS, type Track } from "./tracks";
import type { LlmUsage } from "./provider";

// ---- knobs -------------------------------------------------------------------

/** How many top-ranked groups reach the synthesis prompt. A heavy ru day yields
 *  ~1,000 groups after clustering; feeding them all reproduces the attention-
 *  dilution problem this refactor exists to kill. The cut is recorded in
 *  structured.stats.reduce.groupsTotal/groupsFed so it is always visible. */
export function reduceGroupsFed(): number {
  const v = Number(process.env.REDUCE_GROUPS_FED);
  const n = Number.isFinite(v) ? Math.floor(v) : 200;
  return Math.min(400, Math.max(50, n));
}

/** Synthesis votes per digest (OPEN-TASKS #28). 3 is cheap: the input is small. */
export function reduceVotes(): number {
  const v = Number(process.env.REDUCE_VOTES);
  const n = Number.isFinite(v) ? Math.floor(v) : 3;
  return Math.min(5, Math.max(1, n));
}

// ---- prompt + schema -----------------------------------------------------------

export function synthesisSystemPrompt(track: Track, theater: string): string {
  const cfg = TRACKS[track];
  const focus =
    cfg.systemPromptByCountry?.[theater] ?? cfg.systemPrompt ?? DEFAULT_MILITARY_FOCUS;
  // reuse the track prompt's domain framing, but the task here is composition,
  // not extraction — the claims are already extracted, verified and scored
  return `You are an OSINT analyst composing a daily conflict digest from PRE-EXTRACTED, source-verified claim groups.
Each input line is one claim group: [gid] (hedging, confidence 0-1, sources=N, claims=M) claim text -- event hint.
Groups were extracted per-document by a prior pass, deduplicated and corroboration-scored; higher sources=N means more independent sources.

DOMAIN FRAME (what matters in this theater, from the extraction pass):
${focus.split("HARD RULES")[0].trim()}

YOUR TASK (composition only):
1. Group related claim groups into the day's significant EVENTS: 5-12 on a normal day, fewer (0-2) on a genuinely quiet day. Most significant first.
2. Per event: a specific title, an event type, a 1-3 sentence summary grounded ONLY in the claim texts, and 1-6 published claims.
3. Each published claim: ONE atomic assertion in English, <= 200 chars, wording faithful to the cited group text(s), citing 1-8 gids that support it.

HARD RULES:
1. Cite only gids that appear in the input. Never invent gids.
2. Never merge unrelated assertions into one claim; never editorialize beyond the evidence.
3. Prefer corroborated (sources>=2) and high-confidence groups for leading events; a single low-confidence group does not lead an event.
4. Do not repeat the same gid as separate claims of the same event.`;
}

const DEFAULT_MILITARY_FOCUS = `Military-security developments: strikes, advances, air defense, losses,
mobilization, military aid, sanctions with military effect, and significant political-military statements.`;

/** Strict response schema. events is a global composition task (not a batched
 *  per-item judgment), so ruling 7's minItems=maxItems pinning does not apply —
 *  bounds only. */
export function synthesisResponseSchema(track: Track) {
  const types = TRACKS[track].eventTypes;
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      events: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            type: { type: "string", enum: [...types] },
            summary: { type: "string" },
            claims: {
              type: "array",
              minItems: 1,
              maxItems: 6,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  text: { type: "string" },
                  gids: { type: "array", minItems: 1, maxItems: 8, items: { type: "integer" } },
                },
                required: ["text", "gids"],
              },
            },
          },
          required: ["title", "type", "summary", "claims"],
        },
      },
    },
    required: ["events"],
  } as const;
}

export function serializeGroup(g: ClaimGroup): string {
  const hint = g.eventHint ? ` -- ${g.eventHint.replace(/\s+/g, " ").slice(0, 120)}` : "";
  return `[${g.key}] (${g.hedging}, conf=${g.confidence.toFixed(2)}, sources=${g.independentSources}, claims=${g.size}) ${g.text.replace(/\s+/g, " ").slice(0, 250)}${hint}`;
}

export function synthesisUserMessage(
  theater: string,
  date: string,
  groups: ClaimGroup[],
  totals: { claims: number; groupsTotal: number },
): string {
  return `Theater: ${theater.toUpperCase()} · Date: ${date}
${groups.length} claim groups (top-ranked of ${totals.groupsTotal} clustered from ${totals.claims} per-document claims):

${groups.map(serializeGroup).join("\n")}`;
}

// ---- vote parsing + majority merge (pure, unit-tested) -------------------------

export interface VoteClaim {
  text: string;
  gids: number[];
}

export interface VoteEvent {
  title: string;
  type: string;
  summary: string;
  claims: VoteClaim[];
}

/** Validate one vote's raw JSON against the fed gid set: unknown gids are
 *  stripped (counted), claims left with none are dropped, empty events dropped. */
export function parseVote(
  raw: string,
  fedGids: Set<number>,
): { events: VoteEvent[]; droppedGidRefs: number } {
  const parsed = JSON.parse(raw) as { events?: VoteEvent[] };
  let droppedGidRefs = 0;
  const events: VoteEvent[] = [];
  for (const ev of parsed.events ?? []) {
    const claims: VoteClaim[] = [];
    for (const c of ev.claims ?? []) {
      const gids = [...new Set(c.gids ?? [])].filter((g) => {
        if (fedGids.has(g)) return true;
        droppedGidRefs++;
        return false;
      });
      if (gids.length > 0 && typeof c.text === "string" && c.text.trim().length > 0) {
        claims.push({ text: c.text.trim(), gids });
      }
    }
    if (claims.length > 0) events.push({ ...ev, claims });
  }
  return { events, droppedGidRefs };
}

export interface MergedEvent {
  title: string;
  type: string;
  summary: string;
  claims: VoteClaim[];
  /** distinct votes that produced this event */
  votes: number;
  /** mean position across the votes that produced it (rank signal) */
  meanRank: number;
  /** gids that a majority of votes placed in this event */
  majorityGids: number[];
}

const gidSetOf = (ev: VoteEvent) => new Set(ev.claims.flatMap((c) => c.gids));

function jaccardNum(a: Set<number>, b: Set<number>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Majority-merge K synthesis votes (OPEN-TASKS #28).
 *
 *  Events are matched across votes by claim-group overlap (jaccard >= 0.5 vs
 *  the cluster's running union). An event SURVIVES only when a majority of
 *  votes produce it; its claims keep only gids a majority placed there; its
 *  wording (title/summary/claims) comes from the MEDIAN vote instance by total
 *  claim text length — the middle roll, not the thinnest or most florid.
 *  Deterministic throughout: vote order, then position, break every tie. */
export function mergeVotes(votes: VoteEvent[][]): MergedEvent[] {
  const k = votes.length;
  const majority = Math.floor(k / 2) + 1;

  interface Cluster {
    union: Set<number>;
    instances: Array<{ vote: number; pos: number; ev: VoteEvent }>;
  }
  const clusters: Cluster[] = [];
  for (let v = 0; v < k; v++) {
    for (let pos = 0; pos < votes[v].length; pos++) {
      const ev = votes[v][pos];
      const gids = gidSetOf(ev);
      let best = -1;
      let bestJ = 0.5; // minimum overlap to be "the same event"
      for (let ci = 0; ci < clusters.length; ci++) {
        const j = jaccardNum(gids, clusters[ci].union);
        if (j > bestJ || (j === bestJ && best === -1)) {
          bestJ = j;
          best = ci;
        }
      }
      if (best >= 0) {
        clusters[best].instances.push({ vote: v, pos, ev });
        for (const g of gids) clusters[best].union.add(g);
      } else {
        clusters.push({ union: new Set(gids), instances: [{ vote: v, pos, ev }] });
      }
    }
  }

  const merged: MergedEvent[] = [];
  for (const cl of clusters) {
    const voteIdxs = new Set(cl.instances.map((i) => i.vote));
    if (voteIdxs.size < majority) continue;

    // gid majority: distinct votes that placed each gid in this event
    const gidVotes = new Map<number, Set<number>>();
    for (const inst of cl.instances) {
      for (const g of gidSetOf(inst.ev)) {
        let s = gidVotes.get(g);
        if (!s) gidVotes.set(g, (s = new Set()));
        s.add(inst.vote);
      }
    }
    const majorityGids = [...gidVotes.entries()]
      .filter(([, s]) => s.size >= majority)
      .map(([g]) => g)
      .sort((a, b) => a - b);
    if (majorityGids.length === 0) continue;
    const majoritySet = new Set(majorityGids);

    // median instance by total claim text length (stable: vote, then pos)
    const sorted = [...cl.instances].sort((a, b) => {
      const la = a.ev.claims.reduce((s, c) => s + c.text.length, 0);
      const lb = b.ev.claims.reduce((s, c) => s + c.text.length, 0);
      return la - lb || a.vote - b.vote || a.pos - b.pos;
    });
    const median = sorted[Math.floor((sorted.length - 1) / 2)];

    // median wording, claims filtered to majority gids
    const claims: VoteClaim[] = [];
    for (const c of median.ev.claims) {
      const gids = c.gids.filter((g) => majoritySet.has(g));
      if (gids.length > 0) claims.push({ text: c.text, gids });
    }
    if (claims.length === 0) continue; // majority gids exist but the median roll lost them all

    // event type: majority across instances, median instance breaks ties
    const typeCounts = new Map<string, number>();
    for (const inst of cl.instances) {
      typeCounts.set(inst.ev.type, (typeCounts.get(inst.ev.type) ?? 0) + 1);
    }
    const type = [...typeCounts.entries()].sort(
      (a, b) =>
        b[1] - a[1] ||
        Number(b[0] === median.ev.type) - Number(a[0] === median.ev.type) ||
        a[0].localeCompare(b[0]),
    )[0][0];

    merged.push({
      title: median.ev.title,
      type,
      summary: median.ev.summary,
      claims,
      votes: voteIdxs.size,
      meanRank:
        cl.instances.reduce((s, i) => s + i.pos, 0) / cl.instances.length,
      majorityGids,
    });
  }

  merged.sort(
    (a, b) =>
      a.meanRank - b.meanRank ||
      b.votes - a.votes ||
      (a.majorityGids[0] ?? 0) - (b.majorityGids[0] ?? 0),
  );
  return merged.slice(0, 12);
}

// ---- claim finalization (groups own the evidence, the model never does) --------

const LADDER: Hedging[] = ["confirmed", "claimed", "unverified", "unknown"];

const ENTITY_KINDS = new Set(["person", "agency", "company", "faction", "org"] as const);
type EntityKind = "person" | "agency" | "company" | "faction" | "org";
const asEntityKind = (k: string): EntityKind =>
  ENTITY_KINDS.has(k as EntityKind) ? (k as EntityKind) : "org";

/** Turn merged events into persistable events: docIds/hedging/claimType/entities
 *  all derive from the cited groups, never from the model. */
export function finalizeEvents(
  merged: MergedEvent[],
  groupByKey: Map<number, ClaimGroup>,
): PersistEvent[] {
  const out: PersistEvent[] = [];
  for (const ev of merged) {
    const claims: PersistEvent["claims"] = [];
    for (const c of ev.claims) {
      const groups = c.gids
        .map((g) => groupByKey.get(g))
        .filter((g): g is ClaimGroup => g !== undefined);
      if (groups.length === 0) continue;
      const docIds = [...new Set(groups.flatMap((g) => g.docIds))].sort((a, b) => a - b);
      const allAssessment = groups.every((g) => g.claimType === "assessment");
      const hedging = allAssessment
        ? "assessed"
        : (LADDER.find((h) => groups.some((g) => g.hedging === h)) ?? "unknown");
      const entities = [
        ...new Map(
          groups
            .flatMap((g) => g.entities)
            .map((e) => ({ ...e, kind: asEntityKind(e.kind) }))
            .map((e) => [`${e.kind}:${e.name}`, e] as const),
        ).values(),
      ];
      claims.push({
        text: c.text.slice(0, 200),
        claimType: allAssessment ? "assessment" : "factual",
        hedging,
        docIds,
        entities,
      });
    }
    if (claims.length > 0) {
      out.push({ title: ev.title, type: ev.type, summary: ev.summary, claims });
    }
  }
  return out;
}

// ---- the engine ---------------------------------------------------------------

export const MAPREDUCE_PROVIDER_TAG = `openai:${MAP_MODEL}+mapreduce`;

/** One synthesis vote. Truncation retries once with half the groups (the retry
 *  is a different input, hence a legitimate second opinion, and is counted). */
async function synthesisVote(
  openai: OpenAI,
  guard: SpendGuard,
  track: Track,
  theater: string,
  date: string,
  groups: ClaimGroup[],
  totals: { claims: number; groupsTotal: number },
  llmCalls: LlmUsage[],
): Promise<{ events: VoteEvent[]; droppedGidRefs: number; groupsSent: number } | null> {
  let fed = groups;
  for (let attempt = 0; attempt < 2; attempt++) {
    const reserve = guard.tryReserve();
    if (!reserve.ok) throw new LlmBudgetError(reserve.reason);
    const request = () =>
      openai.chat.completions.create({
        model: MAP_MODEL,
        messages: [
          { role: "system", content: synthesisSystemPrompt(track, theater) },
          { role: "user", content: synthesisUserMessage(theater, date, fed, totals) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "digest_synthesis",
            schema: synthesisResponseSchema(track) as never,
            strict: true,
          },
        },
        temperature: 0.2,
        max_completion_tokens: reduceMaxOutputTokens(),
      });
    let completion;
    try {
      completion = await request();
    } catch (e) {
      if ((e as { status?: number }).status === 429) {
        await new Promise((r) => setTimeout(r, 65_000));
        const again = guard.tryReserve();
        if (!again.ok) throw new LlmBudgetError(again.reason);
        completion = await request();
      } else throw e;
    }
    const choice = completion.choices[0];
    const promptTokens = completion.usage?.prompt_tokens ?? 0;
    const completionTokens = completion.usage?.completion_tokens ?? 0;
    const truncated = choice?.finish_reason === "length";
    await guard.record(1, promptTokens + completionTokens, estimateUsd(promptTokens, completionTokens));
    llmCalls.push({ promptTokens, completionTokens, estUsd: estimateUsd(promptTokens, completionTokens), truncated });

    if (truncated) {
      if (fed.length <= 25) return null; // hard failure for this vote
      fed = fed.slice(0, Math.ceil(fed.length / 2));
      continue;
    }
    const raw = choice?.message?.content;
    if (!raw) throw new Error(`synthesize: empty content (finish=${choice?.finish_reason})`);
    const fedGids = new Set(fed.map((g) => g.key));
    return { ...parseVote(raw, fedGids), groupsSent: fed.length };
  }
  return null;
}

/** The map-reduce digest engine. Same contract as generateDigest: null = track
 *  not configured or nothing to synthesize (a theater without doc_claims
 *  returns null so the dispatcher can fall back to legacy). */
export async function generateMapReduceDigest(
  countryIso2: string,
  date: string, // yyyy-mm-dd (UTC day)
  track: Track = "military",
): Promise<DigestResult | DigestSkipped | null> {
  const trackCfg = TRACKS[track];
  if (!trackCfg.countries.includes(countryIso2)) return null;
  assertLlmEnabled("reduce synthesize");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows: countryRows } = await pool.query("SELECT id FROM countries WHERE iso2 = $1", [
      countryIso2,
    ]);
    if (countryRows.length === 0) throw new Error(`unknown country ${countryIso2}`);
    const countryId: number = countryRows[0].id;

    // deterministic reduce: load current-version claims, cluster, rank
    const to = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const { claims, mirrorOf, quotesBackfilled } = await loadReduceClaims(pool, countryIso2, track, {
      from: date,
      to,
    });
    if (claims.length === 0) {
      console.warn(`synthesize ${countryIso2} ${date} ${track}: no doc_claims in window`);
      return null;
    }
    const metaDropped = claims.filter((c) => isMetaClaim(c.textEn)).length;
    const groups = clusterClaims(claims, { mirrorOf });
    const nowMs = Date.parse(`${to}T00:00:00Z`); // rank recency vs window end, reproducible
    const ranked = rankGroups(groups, nowMs);
    const fed = ranked.slice(0, reduceGroupsFed());
    const groupByKey = new Map(fed.map((g) => [g.key, g]));
    const totals = { claims: claims.length, groupsTotal: groups.length };

    // K synthesis votes
    const guard = reduceGuardFromEnv();
    await guard.init();
    const openai = new OpenAI();
    const k = reduceVotes();
    const llmCalls: LlmUsage[] = [];
    const votes: VoteEvent[][] = [];
    let droppedGidRefs = 0;
    let failedVotes = 0;
    for (let v = 0; v < k; v++) {
      const vote = await synthesisVote(openai, guard, track, countryIso2, date, fed, totals, llmCalls);
      if (vote === null) {
        failedVotes++;
        continue;
      }
      votes.push(vote.events);
      droppedGidRefs += vote.droppedGidRefs;
    }
    const majorityNeeded = Math.floor(k / 2) + 1;
    if (votes.length < majorityNeeded) {
      throw new Error(
        `synthesize ${countryIso2} ${date} ${track}: only ${votes.length}/${k} votes usable`,
      );
    }

    const merged = mergeVotes(votes);
    const events = finalizeEvents(merged, groupByKey);

    const structured = {
      stats: {
        engine: "mapreduce",
        reduce: {
          window: { from: date, to },
          claims: claims.length,
          metaDropped,
          groupsTotal: groups.length,
          groupsFed: fed.length,
          quotesBackfilled,
          votes: votes.length,
          votesRequested: k,
          failedVotes,
          eventsPerVote: votes.map((v) => v.length),
          survivingEvents: merged.length,
          droppedGidRefs,
        },
        docsAnalyzed: [...new Set(fed.flatMap((g) => g.docIds))].length,
        llm: summarizeLlmCalls(llmCalls),
      },
    };

    const outcome = await persistDigest({
      pool,
      countryId,
      countryIso2,
      date,
      track,
      provider: MAPREDUCE_PROVIDER_TAG,
      structured,
      events,
    });
    if (isSkipped(outcome)) return outcome;

    return {
      digestId: outcome.digestId,
      countryIso2,
      date,
      track,
      events: events.length,
      claims: outcome.claimCount,
      droppedClaims: droppedGidRefs,
      provider: MAPREDUCE_PROVIDER_TAG,
      docsAnalyzed: structured.stats.docsAnalyzed as number,
    };
  } finally {
    await pool.end();
  }
}

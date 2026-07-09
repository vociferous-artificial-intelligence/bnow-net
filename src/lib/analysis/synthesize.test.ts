import { afterEach, describe, expect, it } from "vitest";
import { overwriteVerdict } from "./digest-persist";
import type { ClaimGroup } from "./reduce";
import {
  finalizeEvents,
  mergeVotes,
  parseVote,
  reduceGroupsFed,
  reduceVotes,
  serializeGroup,
  synthesisResponseSchema,
  synthesisSystemPrompt,
  type VoteEvent,
} from "./synthesize";

function group(over: Partial<ClaimGroup> = {}): ClaimGroup {
  return {
    key: 1,
    memberIds: [1],
    docIds: [10],
    independentSources: 1,
    text: "Ukrainian forces struck eight tankers of the Russian shadow fleet",
    quote: null,
    claimType: "factual",
    hedging: "claimed",
    promoted: false,
    confidence: 0.6,
    maxReliability: 0.6,
    entities: [],
    eventHint: null,
    claimDate: "2026-07-08",
    latestPublishedAt: null,
    size: 1,
    ...over,
  };
}

function voteEvent(over: Partial<VoteEvent> = {}): VoteEvent {
  return {
    title: "Shadow fleet strikes",
    type: "strike",
    summary: "Ukraine struck Russian shadow-fleet tankers.",
    claims: [{ text: "Ukraine struck eight shadow-fleet tankers", gids: [1, 2] }],
    ...over,
  };
}

describe("parseVote", () => {
  it("strips unknown gids, drops empty claims and empty events", () => {
    const raw = JSON.stringify({
      events: [
        {
          title: "t",
          type: "strike",
          summary: "s",
          claims: [
            { text: "real", gids: [1, 999] },
            { text: "all invented", gids: [998] },
          ],
        },
        { title: "gone", type: "strike", summary: "s", claims: [{ text: "x", gids: [997] }] },
      ],
    });
    const { events, droppedGidRefs } = parseVote(raw, new Set([1, 2]));
    expect(events).toHaveLength(1);
    expect(events[0].claims).toEqual([{ text: "real", gids: [1] }]);
    expect(droppedGidRefs).toBe(3);
  });
});

describe("mergeVotes (OPEN-TASKS #28)", () => {
  it("keeps events a majority of votes produce, drops single-vote events", () => {
    const stable = voteEvent();
    const flake = voteEvent({
      title: "One-off hallucinated angle",
      claims: [{ text: "only one roll saw this", gids: [7] }],
    });
    const merged = mergeVotes([[stable], [stable, flake], [stable]]);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe("Shadow fleet strikes");
    expect(merged[0].votes).toBe(3);
  });

  it("keeps only majority gids within a surviving event", () => {
    const v1 = voteEvent({ claims: [{ text: "a", gids: [1, 2, 5] }] });
    const v2 = voteEvent({ claims: [{ text: "b", gids: [1, 2] }] });
    const v3 = voteEvent({ claims: [{ text: "c", gids: [1, 6] }] });
    const merged = mergeVotes([[v1], [v2], [v3]]);
    expect(merged).toHaveLength(1);
    expect(merged[0].majorityGids).toEqual([1, 2]); // 5 and 6 were single-vote
  });

  it("takes wording from the median-length instance", () => {
    const short = voteEvent({ title: "short", claims: [{ text: "ab", gids: [1] }] });
    const mid = voteEvent({ title: "median", claims: [{ text: "abcdef", gids: [1] }] });
    const long = voteEvent({
      title: "long",
      claims: [{ text: "abcdefghijklmnopqrstuvwxyz", gids: [1] }],
    });
    const merged = mergeVotes([[long], [short], [mid]]);
    expect(merged[0].title).toBe("median");
  });

  it("ranks by mean position across votes", () => {
    const a = voteEvent({ title: "A", claims: [{ text: "a", gids: [1] }] });
    const b = voteEvent({ title: "B", claims: [{ text: "b", gids: [9] }] });
    // A first in two votes, B first in one
    const merged = mergeVotes([[a, b], [a, b], [b, a]]);
    expect(merged.map((m) => m.title)).toEqual(["A", "B"]);
  });

  it("K=1 degenerates to pass-through", () => {
    const merged = mergeVotes([[voteEvent()]]);
    expect(merged).toHaveLength(1);
  });
});

describe("finalizeEvents", () => {
  it("derives docIds, hedging, entities from groups — never from the model", () => {
    const groups = new Map([
      [
        1,
        group({
          key: 1,
          docIds: [10, 20],
          hedging: "confirmed",
          entities: [{ name: "IRGC", kind: "org", role: "actor" }],
        }),
      ],
      [2, group({ key: 2, docIds: [20, 30], hedging: "claimed" })],
    ]);
    const merged = mergeVotes([
      [voteEvent({ claims: [{ text: "the assertion", gids: [1, 2] }] })],
    ]);
    const events = finalizeEvents(merged, groups);
    expect(events).toHaveLength(1);
    const c = events[0].claims[0];
    expect(c.docIds).toEqual([10, 20, 30]); // union, sorted
    expect(c.hedging).toBe("confirmed"); // strongest across groups
    expect(c.entities).toEqual([{ name: "IRGC", kind: "org", role: "actor" }]);
  });

  it("assessment only when every cited group is an assessment", () => {
    const groups = new Map([
      [1, group({ key: 1, claimType: "assessment", hedging: "assessed" })],
    ]);
    const merged = mergeVotes([[voteEvent({ claims: [{ text: "x", gids: [1] }] })]]);
    const events = finalizeEvents(merged, groups);
    expect(events[0].claims[0].claimType).toBe("assessment");
    expect(events[0].claims[0].hedging).toBe("assessed");
  });

  it("drops claims whose gids all vanished and events left empty", () => {
    const merged = mergeVotes([[voteEvent({ claims: [{ text: "x", gids: [42] }] })]]);
    expect(finalizeEvents(merged, new Map())).toHaveLength(0);
  });

  it("normalizes unknown entity kinds to org (persist enum safety)", () => {
    const groups = new Map([
      [
        1,
        group({ key: 1, entities: [{ name: "Houthis", kind: "militia", role: "actor" }] }),
      ],
    ]);
    const merged = mergeVotes([[voteEvent({ claims: [{ text: "x", gids: [1] }] })]]);
    expect(finalizeEvents(merged, groups)[0].claims[0].entities?.[0].kind).toBe("org");
  });
});

describe("prompt + schema", () => {
  it("serializeGroup carries gid, hedging, confidence, corroboration and hint", () => {
    const s = serializeGroup(
      group({
        key: 7,
        hedging: "confirmed",
        confidence: 0.72,
        independentSources: 3,
        size: 5,
        eventHint: "tanker strikes",
      }),
    );
    expect(s).toContain("[7]");
    expect(s).toContain("confirmed");
    expect(s).toContain("conf=0.72");
    expect(s).toContain("sources=3");
    expect(s).toContain("-- tanker strikes");
  });

  it("schema is strict-compatible and bounded per track", () => {
    const walk = (node: unknown): void => {
      if (typeof node !== "object" || node === null) return;
      const o = node as Record<string, unknown>;
      if (o.type === "object") {
        expect(o.additionalProperties).toBe(false);
        expect(Array.isArray(o.required)).toBe(true);
        expect(o.required).toEqual(Object.keys(o.properties as object));
      }
      for (const v of Object.values(o)) walk(v);
    };
    for (const track of ["military", "elite_politics", "nuclear"] as const) {
      const schema = synthesisResponseSchema(track);
      walk(schema);
      expect(schema.properties.events.maxItems).toBe(12);
    }
  });

  it("system prompt carries the theater frame and the no-invented-gids rule", () => {
    const p = synthesisSystemPrompt("military", "ir");
    expect(p).toContain("IRAN-THEATER");
    expect(p).toContain("Never invent gids");
    expect(p).not.toContain("HARD RULES:\n1. Every claim MUST cite docIds");
  });
});

describe("env knobs", () => {
  const saved = { fed: process.env.REDUCE_GROUPS_FED, votes: process.env.REDUCE_VOTES };
  afterEach(() => {
    if (saved.fed === undefined) delete process.env.REDUCE_GROUPS_FED;
    else process.env.REDUCE_GROUPS_FED = saved.fed;
    if (saved.votes === undefined) delete process.env.REDUCE_VOTES;
    else process.env.REDUCE_VOTES = saved.votes;
  });

  it("clamps groupsFed and votes", () => {
    process.env.REDUCE_GROUPS_FED = "10000";
    expect(reduceGroupsFed()).toBe(400);
    process.env.REDUCE_GROUPS_FED = "3";
    expect(reduceGroupsFed()).toBe(50);
    delete process.env.REDUCE_GROUPS_FED;
    expect(reduceGroupsFed()).toBe(200);
    process.env.REDUCE_VOTES = "99";
    expect(reduceVotes()).toBe(5);
    delete process.env.REDUCE_VOTES;
    expect(reduceVotes()).toBe(3);
  });
});

describe("overwriteVerdict (#32)", () => {
  it("refuses empty and thin regenerations, honors force and ratio", () => {
    expect(overwriteVerdict(10, 0, 0, 0.5, false)).toBe("empty-regen");
    expect(overwriteVerdict(10, 1, 1, 0.5, false)).toBe("thin-regen");
    expect(overwriteVerdict(10, 5, 3, 0.5, false)).toBeNull(); // exactly at ratio passes
    expect(overwriteVerdict(10, 4, 3, 0.5, false)).toBe("thin-regen");
    expect(overwriteVerdict(0, 0, 0, 0.5, false)).toBeNull(); // nothing to protect
    expect(overwriteVerdict(10, 1, 1, 0.5, true)).toBeNull(); // FORCE_REGEN
  });
});

describe("majority-gid fill", () => {
  it("synthesizes deterministic claims for majority gids the median roll dropped", async () => {
    const { finalizeEvents, mergeVotes } = await import("./synthesize");
    // three votes: gids 1 and 2 both appear in all votes' event, but the
    // median-length instance only words a claim for gid 1
    const v = (gidsPerClaim: number[][]) => ({
      title: "Frontline advance",
      type: "advance",
      summary: "s",
      claims: gidsPerClaim.map((gids, i) => ({ text: `claim ${i} ${"x".repeat(gids.length * 3)}`, gids })),
    });
    const votes = [[v([[1], [2]])], [v([[1]])], [v([[1], [2], [2]])]];
    const merged = mergeVotes(votes);
    expect(merged[0].majorityGids).toEqual([1, 2]);
    const groups = new Map([
      [1, { ...baseGroup(), key: 1, docIds: [10] }],
      [2, { ...baseGroup(), key: 2, docIds: [20], text: "Russian units liberated Petro-Ivanovka" }],
    ]);
    const events = finalizeEvents(merged, groups);
    const texts = events[0].claims.map((c) => c.text);
    // whichever roll was median, BOTH majority gids are covered
    const cited = new Set(events[0].claims.flatMap((c) => c.docIds));
    expect(cited.has(10)).toBe(true);
    expect(cited.has(20)).toBe(true);
    expect(texts.length).toBeGreaterThanOrEqual(2);
  });
});

function baseGroup() {
  return {
    key: 0, memberIds: [0], docIds: [0], independentSources: 1,
    text: "t", quote: null, claimType: "factual" as const, hedging: "claimed" as const,
    promoted: false, confidence: 0.5, maxReliability: 0.5, entities: [],
    eventHint: null, claimDate: "2026-07-08", latestPublishedAt: null, size: 1,
  };
}

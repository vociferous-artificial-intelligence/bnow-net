import { afterEach, describe, expect, it } from "vitest";
import { digestEngine, generateDigestWithEngine, type DigestOutcome } from "./engine";
import type { PersistEvent } from "./digest-persist";
import { computeDelta, deltaPrelude, inRollingWindow } from "./synthesize";

const savedEngine = process.env.DIGEST_ENGINE;
afterEach(() => {
  if (savedEngine === undefined) delete process.env.DIGEST_ENGINE;
  else process.env.DIGEST_ENGINE = savedEngine;
});

const ok = (provider: string): DigestOutcome => ({
  digestId: 1,
  countryIso2: "ru",
  date: "2026-07-08",
  track: "military",
  events: 1,
  claims: 1,
  droppedClaims: 0,
  provider,
  docsAnalyzed: 1,
});

describe("digest engine dispatch (DIGEST_ENGINE)", () => {
  it("defaults to legacy; unknown values stay legacy", () => {
    delete process.env.DIGEST_ENGINE;
    expect(digestEngine()).toBe("legacy");
    process.env.DIGEST_ENGINE = "somethingelse";
    expect(digestEngine()).toBe("legacy");
    process.env.DIGEST_ENGINE = "mapreduce";
    expect(digestEngine()).toBe("mapreduce");
  });

  it("legacy engine never calls mapreduce", async () => {
    delete process.env.DIGEST_ENGINE;
    let mapreduceCalled = 0;
    const r = await generateDigestWithEngine("ru", "2026-07-08", "military", {
      engines: {
        legacy: async () => ok("legacy"),
        mapreduce: async () => {
          mapreduceCalled++;
          return ok("mr");
        },
      },
    });
    expect(r && "provider" in r && r.provider).toBe("legacy");
    expect(mapreduceCalled).toBe(0);
  });

  it("mapreduce engine falls back to legacy when the map has no claims (gulf theaters)", async () => {
    process.env.DIGEST_ENGINE = "mapreduce";
    const calls: string[] = [];
    const r = await generateDigestWithEngine("sa", "2026-07-08", "military", {
      engines: {
        legacy: async () => {
          calls.push("legacy");
          return ok("legacy");
        },
        mapreduce: async () => {
          calls.push("mapreduce");
          return null; // no doc_claims for this theater
        },
      },
    });
    expect(calls).toEqual(["mapreduce", "legacy"]);
    expect(r && "provider" in r && r.provider).toBe("legacy");
  });

  it("mapreduce result is used when present, legacy untouched", async () => {
    process.env.DIGEST_ENGINE = "mapreduce";
    let legacyCalled = 0;
    const r = await generateDigestWithEngine("ru", "2026-07-08", "military", {
      engines: {
        legacy: async () => {
          legacyCalled++;
          return ok("legacy");
        },
        mapreduce: async () => ok("openai:gpt-4o-mini+mapreduce"),
      },
    });
    expect(r && "provider" in r && r.provider).toBe("openai:gpt-4o-mini+mapreduce");
    expect(legacyCalled).toBe(0);
  });
});

describe("rolling window membership", () => {
  const NOW = Date.parse("2026-07-08T19:30:00Z");

  it("keeps last-24h publishes, drops older, falls back to claim day when unstamped", () => {
    expect(
      inRollingWindow({ publishedAt: "2026-07-08T10:00:00Z", claimDate: "2026-07-08" }, "2026-07-08", NOW),
    ).toBe(true);
    expect(
      inRollingWindow({ publishedAt: "2026-07-07T20:00:00Z", claimDate: "2026-07-07" }, "2026-07-08", NOW),
    ).toBe(true); // yesterday evening, within 24h — the boundary-dissolving case
    expect(
      inRollingWindow({ publishedAt: "2026-07-07T10:00:00Z", claimDate: "2026-07-07" }, "2026-07-08", NOW),
    ).toBe(false); // >24h old
    expect(
      inRollingWindow({ publishedAt: null, claimDate: "2026-07-08" }, "2026-07-08", NOW),
    ).toBe(true);
    expect(
      inRollingWindow({ publishedAt: null, claimDate: "2026-07-07" }, "2026-07-08", NOW),
    ).toBe(false);
  });
});

describe("delta framing", () => {
  const ev = (title: string, docIds: number[]): PersistEvent => ({
    title,
    type: "strike",
    summary: "s",
    claims: [{ text: "t", claimType: "factual", hedging: "claimed", docIds }],
  });

  it("classifies new / changed / unchanged by cited-doc overlap", () => {
    const prior = new Set([10, 20, 30]);
    const delta = computeDelta(
      [ev("brand new", [40, 50]), ev("updated", [10, 60]), ev("same", [20, 30])],
      prior,
    );
    expect(delta.newEvents).toBe(1);
    expect(delta.changedEvents).toBe(1);
    expect(delta.unchangedEvents).toBe(1);
    expect(delta.newTitles).toEqual(["brand new"]);
    const md = deltaPrelude(delta);
    expect(md).toContain("Since the previous brief");
    expect(md).toContain("NEW: brand new");
  });

  it("everything is new against an empty prior", () => {
    const delta = computeDelta([ev("a", [1])], new Set());
    expect(delta.newEvents).toBe(1);
    expect(delta.newTitles).toEqual([]);
  });
});

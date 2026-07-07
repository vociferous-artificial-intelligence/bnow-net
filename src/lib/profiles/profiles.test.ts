import { describe, expect, it } from "vitest";
import { getProfile, PROFILES } from "./config";
import { rankEvents, scoreEvent, type RankableEvent } from "./rank";

const NOW = Date.parse("2026-07-06T12:00:00Z");
const recent = "2026-07-06T06:00:00Z";

const mk = (over: Partial<RankableEvent>): RankableEvent => ({
  eventId: 1, track: "military", type: "strike", claimCount: 2,
  avgConfidence: 0.6, platforms: ["telegram"], latestAt: recent, ...over,
});

describe("buyer profiles", () => {
  it("balanced profile has no overrides", () => {
    const p = getProfile("balanced");
    expect(Object.keys(p.trackWeights)).toHaveLength(0);
  });
  it("getProfile falls back to balanced on unknown", () => {
    expect(getProfile("nonsense").key).toBe("balanced");
    expect(getProfile(undefined).key).toBe("balanced");
  });
});

describe("scoreEvent weighting", () => {
  it("frontline scores a strike above a prosecution", () => {
    const strike = mk({ track: "military", type: "strike" });
    const pros = mk({ track: "elite_politics", type: "prosecution", eventId: 2 });
    const p = getProfile("frontline");
    expect(scoreEvent(strike, p, NOW)).toBeGreaterThan(scoreEvent(pros, p, NOW));
  });
  it("compliance scores a prosecution above a strike", () => {
    const strike = mk({ track: "military", type: "strike" });
    const pros = mk({ track: "elite_politics", type: "prosecution", eventId: 2 });
    const p = getProfile("compliance");
    expect(scoreEvent(pros, p, NOW)).toBeGreaterThan(scoreEvent(strike, p, NOW));
  });
  it("recency decay lowers older events", () => {
    const fresh = mk({ latestAt: "2026-07-06T11:00:00Z" });
    const old = mk({ latestAt: "2026-07-01T11:00:00Z", eventId: 2 });
    const p = getProfile("frontline");
    expect(scoreEvent(fresh, p, NOW)).toBeGreaterThan(scoreEvent(old, p, NOW));
  });
});

describe("rankEvents", () => {
  const events: RankableEvent[] = [
    mk({ eventId: 1, track: "military", type: "strike" }),
    mk({ eventId: 2, track: "elite_politics", type: "prosecution" }),
    mk({ eventId: 3, track: "elite_politics", type: "asset_seizure" }),
  ];

  it("orders differently per profile", () => {
    const frontline = rankEvents(events, "frontline", NOW).map((e) => e.eventId);
    const compliance = rankEvents(events, "compliance", NOW).map((e) => e.eventId);
    expect(frontline[0]).toBe(1); // strike first for frontline
    expect(compliance[0]).not.toBe(1); // prosecution/seizure first for compliance
    expect(frontline).not.toEqual(compliance);
  });
  it("is deterministic and total", () => {
    const a = rankEvents(events, "sanctioning", NOW).map((e) => e.eventId);
    const b = rankEvents(events, "sanctioning", NOW).map((e) => e.eventId);
    expect(a).toEqual(b);
    expect(a.length).toBe(3);
  });
  it("covers all shipped profiles without throwing", () => {
    for (const p of PROFILES) expect(rankEvents(events, p.key, NOW)).toHaveLength(3);
  });
});

describe("reliability weighting in event ranking", () => {
  it("an event backed by low-reliability sources ranks below an otherwise-equal high-reliability one", async () => {
    const { rankEvents } = await import("./rank");
    const base = {
      track: "military", type: "strike", claimCount: 2,
      platforms: ["telegram"], latestAt: "2026-07-06T12:00:00Z",
    };
    const ranked = rankEvents(
      [
        { ...base, eventId: 1, avgConfidence: 0.2 }, // e.g. Press TV-only sourcing
        { ...base, eventId: 2, avgConfidence: 0.9 },
      ],
      "balanced",
      new Date("2026-07-06T13:00:00Z").getTime(),
    );
    expect(ranked[0].eventId).toBe(2);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });
});

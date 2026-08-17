import { describe, expect, it } from "vitest";
import { ConflictDomainError } from "./errors";
import { etWallClockToUtcMs } from "./et-time";

// US DST in 2026: begins 02:00 EST Sunday 2026-03-08 (clocks jump to 03:00
// EDT — 02:00..02:59 local never exists); ends 02:00 EDT Sunday 2026-11-01
// (clocks fall back to 01:00 EST — 01:00..01:59 local happens twice).

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

describe("etWallClockToUtcMs", () => {
  it("converts a daylight-time (EDT, -04:00) wall clock", () => {
    const r = etWallClockToUtcMs("2026-07-24", 14, 0);
    expect(r.resolution).toBe("unique");
    expect(iso(r.instantMs)).toBe("2026-07-24T18:00:00.000Z");
  });

  it("converts a standard-time (EST, -05:00) wall clock", () => {
    const r = etWallClockToUtcMs("2026-01-15", 14, 0);
    expect(r.resolution).toBe("unique");
    expect(iso(r.instantMs)).toBe("2026-01-15T19:00:00.000Z");
  });

  it("ET midnight is 04:00Z in summer", () => {
    const r = etWallClockToUtcMs("2026-07-24", 0, 0);
    expect(r.resolution).toBe("unique");
    expect(iso(r.instantMs)).toBe("2026-07-24T04:00:00.000Z");
  });

  it("the spring-forward gap does not exist: no instant, never a guess", () => {
    const r = etWallClockToUtcMs("2026-03-08", 2, 30);
    expect(r.resolution).toBe("nonexistent_local_time");
    expect(r.instantMs).toBeNull();
  });

  it("the spring-forward day is EST before and EDT after the jump", () => {
    const before = etWallClockToUtcMs("2026-03-08", 1, 30);
    expect(before.resolution).toBe("unique");
    expect(iso(before.instantMs)).toBe("2026-03-08T06:30:00.000Z"); // -05:00
    const after = etWallClockToUtcMs("2026-03-08", 13, 0);
    expect(after.resolution).toBe("unique");
    expect(iso(after.instantMs)).toBe("2026-03-08T17:00:00.000Z"); // -04:00
  });

  it("the repeated fall-back hour resolves to its FIRST occurrence (daylight offset)", () => {
    const r = etWallClockToUtcMs("2026-11-01", 1, 30);
    expect(r.resolution).toBe("ambiguous_first_occurrence");
    // first occurrence is EDT (-04:00): 01:30 EDT = 05:30Z; the second
    // (EST) occurrence 06:30Z is deliberately NOT chosen — fixed rule
    expect(iso(r.instantMs)).toBe("2026-11-01T05:30:00.000Z");
  });

  it("the fall-back day is EST after the transition", () => {
    const r = etWallClockToUtcMs("2026-11-01", 13, 0);
    expect(r.resolution).toBe("unique");
    expect(iso(r.instantMs)).toBe("2026-11-01T18:00:00.000Z"); // -05:00
  });

  it("throws typed on a malformed day or out-of-range time", () => {
    for (const call of [
      () => etWallClockToUtcMs("2026-02-30", 12, 0), // impossible calendar date
      () => etWallClockToUtcMs("not-a-day", 12, 0),
      () => etWallClockToUtcMs("2026-07-24", 24, 0),
      () => etWallClockToUtcMs("2026-07-24", -1, 0),
      () => etWallClockToUtcMs("2026-07-24", 12, 60),
      () => etWallClockToUtcMs("2026-07-24", 12.5, 0),
    ]) {
      expect(call).toThrowError(ConflictDomainError);
      try {
        call();
      } catch (e) {
        expect((e as ConflictDomainError).code).toBe("invalid_instant");
      }
    }
  });
});

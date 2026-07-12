import { describe, expect, it } from "vitest";
import { nextFire, parseSimpleCron } from "./next-fire";

// Mirrors vercel.json's digest group exactly, so a drift there is caught here too.
const DIGEST_SCHEDULES = ["0 2 * * *", "0 4 * * *", "0 10 * * *", "30 19 * * *"];

describe("parseSimpleCron", () => {
  it("parses a simple `m h * * *` schedule", () => {
    expect(parseSimpleCron("0 2 * * *")).toEqual({ minute: 0, hour: 2 });
    expect(parseSimpleCron("30 19 * * *")).toEqual({ minute: 30, hour: 19 });
  });

  it("tolerates incidental extra whitespace", () => {
    expect(parseSimpleCron("  0   2  *  *  * ")).toEqual({ minute: 0, hour: 2 });
  });

  it("skips schedules with a pinned day/month field (monthly crons)", () => {
    expect(parseSimpleCron("0 10 2 * *")).toBeNull(); // trade, 2nd of month
    expect(parseSimpleCron("0 11 3 * *")).toBeNull(); // materials, 3rd of month
  });

  it("skips interval schedules (non-numeric minute field)", () => {
    expect(parseSimpleCron("*/15 * * * *")).toBeNull(); // ingest:fast
  });

  it("rejects out-of-range minute/hour and malformed strings", () => {
    expect(parseSimpleCron("60 0 * * *")).toBeNull();
    expect(parseSimpleCron("0 24 * * *")).toBeNull();
    expect(parseSimpleCron("not a cron")).toBeNull();
    expect(parseSimpleCron("")).toBeNull();
  });
});

describe("nextFire", () => {
  it("picks the next later slot the same day from mid-day", () => {
    const now = new Date("2026-07-11T05:00:00.000Z"); // between 04:00 and 10:00
    expect(nextFire(now, DIGEST_SCHEDULES).toISOString()).toBe("2026-07-11T10:00:00.000Z");
  });

  it("rolls to the next day's earliest slot once past the last slot of the day", () => {
    const now = new Date("2026-07-11T20:00:00.000Z"); // after 19:30
    expect(nextFire(now, DIGEST_SCHEDULES).toISOString()).toBe("2026-07-12T02:00:00.000Z");
  });

  it("treats an exact-boundary now as already fired and rolls to the next occurrence", () => {
    const now = new Date("2026-07-11T02:00:00.000Z"); // exactly the finalize slot
    expect(nextFire(now, DIGEST_SCHEDULES).toISOString()).toBe("2026-07-11T04:00:00.000Z");
  });

  it("still fires the same slot a millisecond before it", () => {
    const now = new Date("2026-07-11T01:59:59.999Z");
    expect(nextFire(now, DIGEST_SCHEDULES).toISOString()).toBe("2026-07-11T02:00:00.000Z");
  });

  it("ignores non-simple schedules mixed into the list", () => {
    const now = new Date("2026-07-11T00:00:00.000Z");
    const mixed = ["*/15 * * * *", "0 10 2 * *", ...DIGEST_SCHEDULES];
    expect(nextFire(now, mixed).toISOString()).toBe("2026-07-11T02:00:00.000Z");
  });

  it("throws when no schedule in the list is simple", () => {
    expect(() => nextFire(new Date(), ["*/15 * * * *", "0 10 2 * *"])).toThrow();
  });

  it("throws on an empty schedule list", () => {
    expect(() => nextFire(new Date(), [])).toThrow();
  });
});

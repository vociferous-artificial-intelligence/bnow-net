import { describe, expect, it } from "vitest";
import { evaluate, extractPeriod } from "./check";

describe("data-dark evaluate", () => {
  const base = {
    baselineStatus: "live" as const,
    httpStatus: 200,
    bytes: 50000,
    period: "май 2025",
    prevPeriod: "май 2025",
    lastChangeDaysAgo: 10,
    cadenceDays: 30,
  };

  it("fresh period is ok", () => {
    expect(evaluate({ ...base, period: "июнь 2025", prevPeriod: "май 2025" }, "ok").status).toBe("ok");
  });
  it("same period past 2x cadence is stale", () => {
    expect(evaluate({ ...base, lastChangeDaysAgo: 70 }, "ok").status).toBe("stale");
  });
  it("classified baseline stays classified without fresh data", () => {
    const r = evaluate({ ...base, baselineStatus: "classified", httpStatus: null, period: null }, "classified");
    expect(r.status).toBe("classified");
  });
  it("classified page returning fresh data is no longer classified", () => {
    const r = evaluate(
      { ...base, baselineStatus: "classified", httpStatus: 200, period: "июнь 2026", prevPeriod: null },
      "classified",
    );
    expect(r.status).toBe("ok");
    expect(r.changed).toBe(true);
  });
  it("fetch failure is unreachable", () => {
    expect(evaluate({ ...base, httpStatus: null, period: null }, "ok").status).toBe("unreachable");
  });
  it("tiny 200 body is gone", () => {
    expect(evaluate({ ...base, bytes: 200, period: null }, "ok").status).toBe("gone");
  });
  it("flags a change when status transitions", () => {
    expect(evaluate({ ...base, httpStatus: null, period: null }, "ok").changed).toBe(true);
  });
});

describe("extractPeriod", () => {
  it("joins month + year groups", () => {
    const re = "(январь|февраль|март|апрель|май|июнь)[^<]{0,20}(20\\d\\d)";
    expect(extractPeriod("...данные за июнь 2026 года...", re)).toBe("июнь 2026");
  });
  it("returns null when no match or no regex", () => {
    expect(extractPeriod("nothing", "(20\\d\\d)")).toBeNull();
    expect(extractPeriod("2026", undefined)).toBeNull();
  });
});

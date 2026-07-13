import { describe, expect, it } from "vitest";
import { evaluate, extractPeriod, parsePeriodLabel } from "./check";

// Poll instant for all age math: 2026-07-13 (the production audit date).
const NOW = Date.UTC(2026, 6, 13);

describe("data-dark evaluate", () => {
  const base = {
    baselineStatus: "live" as const,
    httpStatus: 200,
    bytes: 50000,
    period: "июнь 2026",
    prevPeriod: "май 2026",
    lastChangeDaysAgo: 10,
    cadenceDays: 30,
    nowMs: NOW,
  };

  it("fresh period is ok", () => {
    expect(evaluate({ ...base }, "ok").status).toBe("ok");
  });

  it("staleness is judged by the PERIOD'S AGE against the poll instant", () => {
    // ~104 days old vs 2x cadence = 60 days -> stale, even though it just changed.
    const r = evaluate({ ...base, period: "март 2026", prevPeriod: "март 2026", lastChangeDaysAgo: 1 }, "ok");
    expect(r.status).toBe("stale");
    expect(r.reason).toContain("2x cadence");
  });

  it("a FIRST observation of an ancient period can never be ok (the 17.09.2013 defect)", () => {
    const r = evaluate(
      { ...base, period: "17.09.2013", prevPeriod: null, lastChangeDaysAgo: null, cadenceDays: 45 },
      "unknown",
    );
    expect(r.status).toBe("stale");
  });

  it("keeps a credible newer stored period when the parse regresses, recording the anomaly", () => {
    const r = evaluate(
      { ...base, period: "17.09.2013", prevPeriod: "10.07.2026", cadenceDays: 45 },
      "ok",
    );
    expect(r.period).toBe("10.07.2026"); // stored value kept
    expect(r.status).toBe("ok"); // freshness judged by the KEPT period
    expect(r.anomaly).toContain("older than stored");
  });

  it("unparseable labels fall back to the unchanged-across-polls rule", () => {
    const weird = { ...base, period: "квартал II", prevPeriod: "квартал II" };
    expect(evaluate({ ...weird, lastChangeDaysAgo: 70 }, "ok").status).toBe("stale");
    expect(evaluate({ ...weird, lastChangeDaysAgo: 10 }, "ok").status).toBe("ok");
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

describe("parsePeriodLabel", () => {
  it("parses dd.mm.yyyy, russian month-year, and bare year", () => {
    expect(parsePeriodLabel("17.09.2013")).toBe(Date.UTC(2013, 8, 17));
    expect(parsePeriodLabel("июнь 2026")).toBe(Date.UTC(2026, 5, 1));
    expect(parsePeriodLabel("май 2026")).toBe(Date.UTC(2026, 4, 1));
    expect(parsePeriodLabel("март 2026")).toBe(Date.UTC(2026, 2, 1)); // longest-stem: not "ма"(й)
    expect(parsePeriodLabel("2026")).toBe(Date.UTC(2026, 0, 1));
  });
  it("returns null for shapes it cannot compare", () => {
    expect(parsePeriodLabel("квартал II")).toBeNull();
    expect(parsePeriodLabel("32.13.2026")).toBeNull();
  });
});

describe("extractPeriod — latest comparable candidate wins", () => {
  it("joins month + year groups", () => {
    const re = "(январь|февраль|март|апрель|май|июнь)[^<]{0,20}(20\\d\\d)";
    expect(extractPeriod("...данные за июнь 2026 года...", re)).toBe("июнь 2026");
  });

  it("selects the LATEST date, not the first markup occurrence (the CBR form-default scenario)", () => {
    // Mirrors the real CBR key-rate page: a date-filter form defaulting to the
    // series inception (17.09.2013) appears BEFORE the data table's recent rows.
    const html = `
      <form><input name="from" value="17.09.2013"><input name="to" value="11.07.2026"></form>
      <table><tr><td>11.07.2026</td><td>20.00</td></tr><tr><td>10.07.2026</td><td>20.00</td></tr></table>`;
    expect(extractPeriod(html, "(\\d{2}\\.\\d{2}\\.20\\d\\d)")).toBe("11.07.2026");
  });

  it("picks the max year for bare-year regexes", () => {
    expect(extractPeriod("archive 2019 2021 latest 2026 report", "(20\\d\\d)")).toBe("2026");
  });

  it("falls back to the first match when no candidate parses", () => {
    expect(extractPeriod("q1 q2", "(q\\d)")).toBe("q1");
  });

  it("returns null when no match or no regex", () => {
    expect(extractPeriod("nothing", "(20\\d\\d)")).toBeNull();
    expect(extractPeriod("2026", undefined)).toBeNull();
  });
});

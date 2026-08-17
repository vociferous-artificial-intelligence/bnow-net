import { describe, expect, it } from "vitest";
import { EDITION_SELECT, toIsoDay } from "./reference-repo-sql";

// The SQL backend casts report_date::text in every SELECT, so the normal
// input is the literal yyyy-mm-dd string; the Date branch is defense in
// depth against an uncast read (Gate-2 MAJOR: node-postgres and
// @neondatabase/serverless parse a Postgres `date` into a JS Date at LOCAL
// midnight, and reading that back through toISOString() shifts the day
// backward on any host east of UTC).

describe("EDITION_SELECT (deployed SELECT list)", () => {
  it("casts report_date::text so a western-TZ dev host cannot mask a regression", () => {
    // A bare `date` read only fails east of UTC, so the always-run suite pins
    // the cast itself (Gate-2 re-review NOTE R-2).
    expect(EDITION_SELECT).toContain("report_date::text AS report_date");
  });
});

describe("toIsoDay (driver date parsing is host-TZ-sensitive)", () => {
  it("passes through the ::text-cast yyyy-mm-dd string", () => {
    expect(toIsoDay("2027-07-10")).toBe("2027-07-10");
    expect(toIsoDay("2027-07-10T00:00:00")).toBe("2027-07-10"); // defensive slice
  });

  it("reads a driver-constructed LOCAL-midnight Date via local accessors, correct in any host zone", () => {
    // exactly how the drivers build oid-1082 `date` values: local midnight.
    // toISOString() would render the PRIOR day anywhere east of UTC; the
    // local accessors recover the intended calendar day in every host zone.
    expect(toIsoDay(new Date(2027, 6, 10))).toBe("2027-07-10");
    expect(toIsoDay(new Date(2027, 0, 1))).toBe("2027-01-01"); // year boundary
  });
});

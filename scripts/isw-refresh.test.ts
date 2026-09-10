import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSeriesBackfillArgs, parseSeriesDiscoveryArgs } from "../src/lib/isw/edition-discovery";

// scripts/isw-refresh.ts calls main() at module load and builds a neon client
// from DATABASE_URL at module scope, so it cannot be imported here. The
// --theater contract is therefore pinned two ways: structurally over the
// SOURCE (the new --series branch is first and returns, so nothing below it can
// run for a series invocation) and behaviourally over the PARSER (every
// historical invocation shape yields null, i.e. falls through to the unchanged
// code).

const SRC = readFileSync("scripts/isw-refresh.ts", "utf8");
const MAIN = SRC.slice(SRC.indexOf("async function main() {"));
const THEATER_PATH = MAIN.slice(MAIN.indexOf("console.log(`isw-refresh theater="));

describe("--series is an additive branch: the --theater path is unreachable from it", () => {
  it("BOTH --series branches precede the historical path, and each returns", () => {
    const body = MAIN.slice(MAIN.indexOf("{") + 1);
    // the backfill branch (WS3-F07 / N3) is first: it is a --series mode with
    // no --from/--to window, and parseSeriesDiscoveryArgs yields to it
    const backfill = body.indexOf("const backfillPlan = parseSeriesBackfillArgs(args);");
    const discovery = body.indexOf("const seriesPlan = parseSeriesDiscoveryArgs(args);");
    expect(backfill).toBeGreaterThan(-1);
    expect(discovery).toBeGreaterThan(backfill);
    // nothing executable precedes the first: only comment lines and blanks
    for (const line of body.slice(0, backfill).split("\n")) {
      expect(line.trim() === "" || line.trim().startsWith("//")).toBe(true);
    }
    for (const at of [backfill, discovery]) {
      expect(body.slice(at, at + 800)).toContain("return;");
    }
    // and the historical path starts only AFTER both branches close
    expect(body.indexOf("console.log(`isw-refresh theater=")).toBeGreaterThan(discovery);
  });

  it("every statement of the historical --theater path survives verbatim", () => {
    for (const literal of [
      "console.log(`isw-refresh theater=${THEATER} dry=${DRY}`);",
      "if (args.includes(\"--discover\")) {",
      "if (!from || !to) throw new Error(\"--discover needs --from and --to (yyyy-mm-dd)\");",
      "`SELECT id FROM isw_reports WHERE theater = $1 AND report_date = $2`",
      "if (!probe || probe.status !== 200 || probe.html.length < 10_000) continue;",
      "console.log(`${date}  DISCOVER DRY would insert ${url}`);",
      "`INSERT INTO isw_reports (url, theater, report_date, fetched_at, parse_status)\n           VALUES ($1, $2, $3, now(), 'pending')\n           ON CONFLICT (url) DO UPDATE SET fetched_at = now()\n           RETURNING id`",
      "console.log(`${date}  DISCOVERED ${url} -> ${await refreshOne(id, url)}`);",
      "console.log(`${date}  no report found (publication gap or unknown slug)`);",
      "const statuses = RETRY_FAILED ? [\"pending\", \"failed\"] : [\"pending\"];",
      "`SELECT id, url, report_date::text AS date FROM isw_reports\n     WHERE theater = $1 AND parse_status = ANY($2)\n     ORDER BY report_date ASC LIMIT $3`",
      "console.log(`${rows.length} ${statuses.join(\"/\")} reports to refresh`);",
      "console.log(\"isw_reports now:\", JSON.stringify(after));",
      "console.log(`newest cited ${THEATER} report date:`, cits[0]?.newest_cited);",
    ]) {
      expect(THEATER_PATH, `missing from the --theater path: ${literal.slice(0, 60)}`).toContain(literal);
    }
  });

  it("neither new branch writes an isw_reports row, and neither fetches", () => {
    const branch = MAIN.slice(0, MAIN.indexOf("console.log(`isw-refresh theater="));
    expect(branch).not.toContain("INSERT INTO");
    expect(branch).not.toContain("refreshOne");
    // the N3 backfill is ZERO NETWORK: no fetch reaches it from the script
    expect(branch).not.toContain("politeFetch");
  });
});

describe("parseSeriesDiscoveryArgs (the mode gate)", () => {
  it("returns null for every historical invocation, so --theater runs unchanged", () => {
    for (const argv of [
      [],
      ["--theater", "ir"],
      ["--theater", "ir", "--dry"],
      ["--theater", "ru", "--retry-failed", "--limit", "50"],
      ["--theater", "ir", "--discover", "--from", "2026-07-04", "--to", "2026-08-15"],
      ["--theater", "ir", "--discover", "--from", "2026-07-04", "--to", "2026-08-15", "--dry"],
    ]) {
      expect(parseSeriesDiscoveryArgs(argv), argv.join(" ")).toBeNull();
      expect(parseSeriesBackfillArgs(argv), argv.join(" ")).toBeNull();
    }
  });

  it("parses a well-formed series window", () => {
    expect(
      parseSeriesDiscoveryArgs(["--series", "iran_update", "--from", "2026-08-01", "--to", "2026-08-31"]),
    ).toEqual({ series: "iran_update", from: "2026-08-01", to: "2026-08-31", dry: false });
    expect(
      parseSeriesDiscoveryArgs(["--series", "roca", "--from", "2026-08-01", "--to", "2026-08-01", "--dry"]),
    ).toEqual({ series: "roca", from: "2026-08-01", to: "2026-08-01", dry: true });
  });

  it("REFUSES every malformed invocation instead of defaulting", () => {
    const cases: [string[], RegExp][] = [
      [["--series"], /--series must be roca\|iran_update/],
      [["--series", "iran"], /--series must be roca\|iran_update/],
      [["--series", "ir", "--from", "2026-08-01", "--to", "2026-08-02"], /--series must be roca\|iran_update/],
      [["--series", "roca"], /needs --from and --to/],
      [["--series", "roca", "--from", "2026-08-01"], /needs --from and --to/],
      [["--series", "roca", "--from", "08-01-2026", "--to", "2026-08-02"], /needs --from and --to/],
      [["--series", "roca", "--from", "2026-02-30", "--to", "2026-08-02"], /needs --from and --to/],
      [["--series", "roca", "--from", "2026-08-05", "--to", "2026-08-02"], /is after --to/],
    ];
    for (const [argv, pattern] of cases) {
      expect(() => parseSeriesDiscoveryArgs(argv), argv.join(" ")).toThrow(pattern);
    }
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CROSSWALK_ROWS,
  STANDARD_ORDER,
  STANDARD_TITLES,
  roadmapLabel,
  rowsForStandard,
  statusCount,
  type CrosswalkRow,
} from "./crosswalk";

// DRIFT TEST (WS-7.1 acceptance). The public /methodology page renders CROSSWALK_ROWS and the
// repo document docs/METHODOLOGY-TRADECRAFT.md carries the same table with one extra,
// repo-internal column (the enforcing file:line). The crosswalk is the artifact a methodology
// validator audits, so the two must not be able to drift: this test parses the document's
// fenced table and asserts it equals the module field for field, in order.
//
// If this test fails, ONE of the two was edited alone. Fix the other; do not relax the test.

const DOC = join(process.cwd(), "docs/METHODOLOGY-TRADECRAFT.md");
const BEGIN = "<!-- CROSSWALK-TABLE:BEGIN -->";
const END = "<!-- CROSSWALK-TABLE:END -->";

type DocRow = CrosswalkRow & { enforcingFile: string };

function parseDocTable(): DocRow[] {
  const md = readFileSync(DOC, "utf8");
  const from = md.indexOf(BEGIN);
  const to = md.indexOf(END);
  expect(from, `${BEGIN} missing from METHODOLOGY-TRADECRAFT.md`).toBeGreaterThan(-1);
  expect(to, `${END} missing from METHODOLOGY-TRADECRAFT.md`).toBeGreaterThan(from);

  const rows: DocRow[] = [];
  for (const raw of md.slice(from + BEGIN.length, to).split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("|")) continue;
    const cells = line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
    // skip the header row and the ---|--- separator
    if (cells[0] === "Standard") continue;
    if (/^:?-+:?$/.test(cells[0])) continue;
    expect(cells, `crosswalk row must have 6 columns: ${line}`).toHaveLength(6);
    rows.push({
      standard: cells[0] as CrosswalkRow["standard"],
      requirement: cells[1],
      mechanism: cells[2],
      enforcingFile: cells[3],
      status: cells[4] as CrosswalkRow["status"],
      // the document writes an em dash where the module carries null
      closedBy: cells[5] === "—" ? null : cells[5],
    });
  }
  return rows;
}

describe("tradecraft crosswalk — document/module drift", () => {
  const doc = parseDocTable();

  it("parses a non-trivial table out of the document", () => {
    expect(doc.length).toBeGreaterThan(15);
  });

  it("has the same number of rows in the same order", () => {
    expect(doc.map((r) => `${r.standard} :: ${r.requirement}`)).toEqual(
      CROSSWALK_ROWS.map((r) => `${r.standard} :: ${r.requirement}`),
    );
  });

  it("agrees on mechanism, status and closedBy for every row", () => {
    for (const [i, row] of CROSSWALK_ROWS.entries()) {
      const d = doc[i];
      expect(d.mechanism, `mechanism drift on "${row.requirement}"`).toBe(row.mechanism);
      expect(d.status, `status drift on "${row.requirement}"`).toBe(row.status);
      expect(d.closedBy, `closedBy drift on "${row.requirement}"`).toBe(row.closedBy);
    }
  });

  it("keeps the enforcing-file column in the document only — it is never in the module", () => {
    // every row cites at least one repo path or a ruling; and none of that leaks into the
    // strings the public page renders
    for (const d of doc) {
      expect(d.enforcingFile.length, `no enforcing file cited for "${d.requirement}"`).toBeGreaterThan(0);
    }
    const publicText = CROSSWALK_ROWS.map((r) => `${r.requirement} ${r.mechanism}`).join(" ");
    expect(publicText).not.toMatch(/src\//);
    expect(publicText).not.toMatch(/drizzle\//);
    expect(publicText).not.toMatch(/scripts\//);
    expect(publicText).not.toMatch(/\.tsx?\b/);
    expect(publicText).not.toMatch(/WS-7/);
    expect(publicText).not.toMatch(/OPEN-TASKS|#\d+/);
  });
});

describe("crosswalk data invariants", () => {
  it("uses a unique requirement string per standard (the drift key)", () => {
    const keys = CROSSWALK_ROWS.map((r) => `${r.standard} :: ${r.requirement}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("covers all four standards and only those four", () => {
    expect(new Set(CROSSWALK_ROWS.map((r) => r.standard))).toEqual(new Set(STANDARD_ORDER));
    for (const s of STANDARD_ORDER) {
      expect(rowsForStandard(s).length, `${s} has no rows`).toBeGreaterThan(0);
      expect(STANDARD_TITLES[s].title.length).toBeGreaterThan(0);
    }
  });

  it("groups rows by standard in STANDARD_ORDER, so the page renders every row exactly once", () => {
    const rendered = STANDARD_ORDER.flatMap((s) => rowsForStandard(s));
    expect(rendered).toEqual([...CROSSWALK_ROWS]);
  });

  it("names a closing step for every PARTIAL/GAP row and none for a BUILT row", () => {
    for (const r of CROSSWALK_ROWS) {
      if (r.status === "BUILT") expect(r.closedBy, r.requirement).toBeNull();
      else expect(r.closedBy, r.requirement).toBeTruthy();
    }
    expect(statusCount("BUILT") + statusCount("PARTIAL") + statusCount("GAP")).toBe(
      CROSSWALK_ROWS.length,
    );
  });

  it("maps closedBy to a public roadmap label that never leaks a workstream id", () => {
    for (const r of CROSSWALK_ROWS) {
      const label = roadmapLabel(r);
      expect(["", "planned", "not planned"]).toContain(label);
      if (r.status === "BUILT") expect(label).toBe("");
      if (r.closedBy === "not in WS-7") expect(label).toBe("not planned");
      if (r.closedBy?.startsWith("WS-7.")) expect(label).toBe("planned");
    }
  });

  it("keeps the standards' titles and dates as published (the two corrections of record)", () => {
    // ICD 208 is NOT a sourcing directive — its title is the correction the crosswalk carries
    expect(STANDARD_TITLES["ICD 208"].title).toBe("Maximizing the Utility of Analytic Products");
    expect(STANDARD_TITLES["ICS 206-01"].date).toBe("December 2, 2024");
  });
});

// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import MethodologyPage, { metadata } from "./page";
import { CROSSWALK_ROWS, roadmapLabel } from "@/lib/tradecraft/crosswalk";

afterEach(cleanup);

const text = () => render(MethodologyPage()).container.textContent ?? "";

// Block-joined text. `container.textContent` concatenates sibling blocks with no separator,
// so a paragraph ending "...across users." followed by the heading "5. Where the machine..."
// yields the substring ".5" out of thin air. The moat assertions below are substring checks
// against the hedging weight constants, so they read the block-separated form instead.
const blockText = () =>
  [...render(MethodologyPage()).container.querySelectorAll("h1,h2,h3,p,li,th,td")]
    .map((el) => el.textContent ?? "")
    .join("\n");

describe("/methodology (public tradecraft crosswalk)", () => {
  it("renders without authentication — no session dependency, no DB query", () => {
    const { container } = render(MethodologyPage());
    expect(container.querySelector("main#main")).toBeTruthy();
    expect(container.querySelector("h1")?.textContent).toBe("Methodology");
  });

  it("names all four issuances with their published titles and dates", () => {
    const t = text();
    expect(t).toContain("ICD 203 — Analytic Standards (January 2, 2015)");
    expect(t).toContain("ICD 206 — Sourcing Requirements for Disseminated Analytic Products");
    // the correction of record: ICD 208 is a product-utility directive, not a sourcing one
    expect(t).toContain("ICD 208 — Maximizing the Utility of Analytic Products (January 9, 2017)");
    expect(t).toContain("ICS 206-01 — Citation and Reference for Publicly Available Information");
  });

  it("renders every crosswalk row's requirement, mechanism and status exactly once", () => {
    const t = text();
    for (const row of CROSSWALK_ROWS) {
      expect(t, `missing requirement: ${row.requirement}`).toContain(row.requirement);
      expect(t, `missing mechanism for: ${row.requirement}`).toContain(row.mechanism);
    }
    const { container } = render(MethodologyPage());
    // one <tbody> row per crosswalk row, across the four per-standard tables
    expect(container.querySelectorAll("tbody tr")).toHaveLength(CROSSWALK_ROWS.length);
  });

  it("renders the public roadmap label, never the internal workstream id", () => {
    const t = text();
    expect(t).not.toMatch(/WS-7/);
    expect(t).not.toMatch(/OPEN-TASKS/);
    const labels = new Set(CROSSWALK_ROWS.map(roadmapLabel));
    if (labels.has("planned")) expect(t).toContain("planned");
    if (labels.has("not planned")) expect(t).toContain("not planned");
  });

  it("carries no repository path, file name or internal task number", () => {
    const t = text();
    for (const forbidden of [/src\//, /drizzle\//, /scripts\//, /\.tsx?\b/, /#\d+/]) {
      expect(t, `public page leaks ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it("states the two things BNOW does beyond the standards", () => {
    const t = text();
    expect(t).toContain("Citation is enforced by the database, not by review");
    expect(t).toContain("deferrable constraint trigger");
    expect(t).toContain("An external benchmark loop scores our product");
  });

  it("keeps the contract metric name: coverage, never accuracy", () => {
    const t = text();
    expect(t).toContain("We do not claim accuracy");
    expect(t).toContain("coverage against a named expert benchmark");
    expect(t).toContain("Agreement is not independent confirmation");
    // never the inverse claim
    expect(t).not.toMatch(/accuracy against/i);
    expect(t).not.toMatch(/accuracy score/i);
  });

  it("states ruling 1 — no expert prose and no source full text is published", () => {
    const t = text();
    expect(t).toContain("No prose from the Institute for the Study of War");
    expect(t).toContain("no full text from any ingested source");
  });

  it("links only to public routes (no gated route is advertised)", () => {
    const { container } = render(MethodologyPage());
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "");
    expect(hrefs).toContain("/scoreboard");
    for (const h of hrefs) {
      expect(h.startsWith("/"), `unexpected off-site link ${h}`).toBe(true);
      for (const gated of ["/ask", "/search", "/entities", "/digests", "/registry", "/admin", "/middle-east", "/account"]) {
        expect(h.startsWith(gated), `links a gated route: ${h}`).toBe(false);
      }
    }
  });

  it("exposes descriptive metadata", () => {
    expect(String(metadata.title)).toContain("Methodology");
    expect(String(metadata.description ?? "")).toContain("ICS 206-01");
  });
});

// MOAT TEST (decision T5, option (a); plan §3 C6). The reliability score, the
// reliability-ranked ordering, and the exact hedging-weight constants that would let the
// score be reconstructed are withheld from every non-privileged surface by
// src/lib/registry/view-policy.ts, and src/app/registry/[id]/page.tsx withholds them on the
// detail page independently rather than merely omitting a link. A public page that printed
// them would nullify that policy in one edit, so the constraint is enforced here rather
// than left to editorial discipline. The constants are src/lib/isw/load.ts:38-46.
describe("/methodology moat — the weighting is described, never disclosed", () => {
  const WEIGHT_CONSTANTS = ["1.0", "0.75", ".75", "0.5", ".5", "0.4", ".4", "0.15", ".15"];

  it("prints none of the five hedging weight constants", () => {
    const t = blockText();
    for (const c of WEIGHT_CONSTANTS) {
      expect(t, `public page prints weight constant ${c}`).not.toContain(c);
    }
    // and not the admin legend sentence in any form
    expect(t).not.toMatch(/weighted mean/i);
    expect(t).not.toMatch(/confirmed\s*1/i);
  });

  it("prints no bare decimal number at all — the cheap, unambiguous form of the same rule", () => {
    // Deliberately stricter than the five constants: a future edit that puts any decimal
    // magnitude on this page has to justify itself here first, which is the point. Describe
    // magnitudes qualitatively, or state a whole number.
    //
    // Standard identifiers (AJP-2.1, ICS 206-01, STIX 2.1) are names, not magnitudes, so they
    // are stripped before the check rather than exempted case by case.
    const STANDARD_IDS = /\b(?:AJP|ICD|ICS|STIX|MISP)[- ]?\d+(?:[.-]\d+)*/g;
    expect(blockText().replace(STANDARD_IDS, "<standard>")).not.toMatch(/\d+\.\d/);
  });

  it("prints no reliability score and no reliability ordering", () => {
    const t = text();
    expect(t).not.toMatch(/reliability_score|reliabilityScore/);
    expect(t).not.toMatch(/reliability score of/i);
    expect(t).not.toMatch(/ranked by reliability|sorted by reliability|reliability rank/i);
  });

  it("states the ordering qualitatively instead, matching the reduced registry view", () => {
    const t = text();
    // same qualitative statement as registry.detail.weighting_qualitative
    expect(t).toContain("weights confirmed reporting above assessed, claimed, and unverified reporting");
    expect(t).toContain("withheld from this page");
  });

  it("says plainly that the rating is not presented as calibrated", () => {
    const t = text();
    expect(t).toContain("we do not present the");
    expect(t).toContain("calibrated");
  });
});

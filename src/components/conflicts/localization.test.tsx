// @vitest-environment jsdom
// Localization-safety pins for the conflict package (Gate-7 product MINOR-6).
//
// (a) BIDI: every numeric run this package emits starts with a digit, so
//     inside an RTL paragraph the bidi algorithm reorders it
//     ("1 of 1 declared Key Takeaways (100%)" → "of 1 … (100%) 1") and the
//     numerator visually detaches from its ratio. The number-bearing spans
//     carry dir="ltr" isolation; the repo had no house convention, so this
//     package establishes one for itself.
// (b) LOGICAL ALIGNMENT: the two tables previously used physical
//     text-left/text-right, which do not flip under dir="rtl" the way the
//     rest of the package's logical properties (ps-/ms-/border-s-) do.

import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LaneTable } from "./lane-table";
import { Ratio } from "./model";

afterEach(cleanup);

describe("bidi isolation on numeric runs", () => {
  it("Ratio isolates its numeric run as LTR", () => {
    render(
      <p dir="rtl">
        <Ratio count={{ matched: 1, denominator: 1 }} />
      </p>,
    );
    const span = screen.getByText(/declared Key Takeaways/);
    expect(span.getAttribute("dir")).toBe("ltr");
  });

  it("the lane table's Counts runs are LTR-isolated too", () => {
    render(
      <LaneTable
        lanes={[
          {
            lane: "frontline_maneuver",
            units: 1,
            corpusRecall: { matched: 1, partial: 0, miss: 0 },
            publishedRetention: { matched: 1, partial: 0, miss: 0 },
            diagnostic: null,
          },
        ]}
        taxonomyVersion="roca-lanes-v1"
      />,
    );
    const counts = screen.getAllByText(/matched · .* partial · .* miss/);
    expect(counts.length).toBeGreaterThan(0);
    for (const node of counts) expect(node.getAttribute("dir")).toBe("ltr");
  });
});

describe("logical (not physical) alignment across the package", () => {
  // scans the whole component directory rather than a hand-listed pair, so a
  // component added later (or one deleted, as benchmark-run-list.tsx was when
  // the surfaces moved to real observations) cannot silently leave the pin
  it("no component source uses text-left/text-right", () => {
    const dir = join(process.cwd(), "src", "components", "conflicts");
    const files = readdirSync(dir).filter((f) => f.endsWith(".tsx") && !f.includes(".test."));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const src = readFileSync(join(dir, file), "utf8");
      expect(src, `${file} must use logical text-start/text-end`).not.toMatch(
        /className="[^"]*text-(left|right)\b/,
      );
    }
  });
});

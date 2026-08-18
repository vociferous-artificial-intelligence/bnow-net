// @vitest-environment jsdom
// Pre-gate MINOR-3: the no_proven_snapshot render branches
// (benchmark-headline's non-gap unavailable variant and the run-list's
// unavailable row) had zero coverage — the only committed unavailable golden
// is a publication gap. These tests hand-build a minimal-but-valid
// ConflictUnavailableResultV1 (identity fields mirror the committed roca
// goldens; the component contract does not require the persistence gate, and
// the page tests build fixtures the same way) and pin the WORDED renders:
// never a percentage, never an N-of-M ratio, always the not-zero note.

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConflictUnavailableResultV1 } from "@/lib/conflicts/eval-profile";
import type { ConflictBenchmarkEntry } from "@/lib/conflicts/product-view";
import { BenchmarkHeadline } from "./benchmark-headline";
import { BenchmarkRunList } from "./benchmark-run-list";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

function unavailableResult(
  evaluationKind: "operational_cutoff" | "at_publication" | "finalized",
): ConflictUnavailableResultV1 {
  return {
    version: 1,
    conflictId: "russia_ukraine",
    methodologyEpoch: "conflict-epoch-1",
    laneTaxonomyVersion: "roca-lanes-v1",
    evidencePolicyVersion: "ru-ua-ev-v1",
    evaluationKind,
    state: "unavailable",
    report: {
      series: "roca",
      editionKey: "roca:2026-08-10:final",
      reportDate: "2026-08-10",
      cutoffAt: "2026-08-10T19:45:00.000Z",
      publishedAt: "2026-08-10T23:30:00.000Z",
      scopeVersion: "roca-scope-v1",
    },
    unavailableReason: "no_proven_snapshot",
  };
}

const NO_RATIO_PATTERNS = [/\(\d+%\)/, /\d+ of \d+/];

describe("BenchmarkHeadline — no_proven_snapshot branch", () => {
  it("renders the worded provenance statement for a snapshot kind — never a ratio or percentage", () => {
    render(<BenchmarkHeadline result={unavailableResult("operational_cutoff")} />);
    const headline = screen.getByTestId("benchmark-headline");
    expect(headline.textContent).toContain(
      "Unavailable — operational cutoff evaluation (no proven snapshot)",
    );
    expect(headline.textContent).toContain("No immutable snapshot artifact");
    expect(headline.textContent).toContain("never a 0%");
    for (const pattern of NO_RATIO_PATTERNS) {
      expect(headline.textContent).not.toMatch(pattern);
    }
  });

  it("words every snapshot-anchored kind through the same branch (the kind is embedded in the copy)", () => {
    render(<BenchmarkHeadline result={unavailableResult("at_publication")} />);
    const headline = screen.getByTestId("benchmark-headline");
    expect(headline.textContent).toContain(
      "Unavailable — at publication evaluation (no proven snapshot)",
    );
    expect(headline.textContent).toContain("never a 0%");
    for (const pattern of NO_RATIO_PATTERNS) {
      expect(headline.textContent).not.toMatch(pattern);
    }
  });
});

describe("BenchmarkRunList — unavailable row", () => {
  it("renders words in the coverage cell and the word n/a in the matcher cell — never a dash or ratio", () => {
    const entry: ConflictBenchmarkEntry = {
      benchmarkKey: "synthetic-unavailable-demo",
      goldenKey: "synthetic-unavailable-demo",
      scenarioId: "synthetic-unavailable-demo",
      variantId: null,
      scenarioTitle: "Synthetic unavailable demonstration",
      result: unavailableResult("operational_cutoff"),
    };
    render(<BenchmarkRunList slug="russia-ukraine" entries={[entry]} />);
    const row = screen.getByRole("row", { name: /Synthetic unavailable demonstration/ });
    expect(row.textContent).toContain("unavailable — no proven snapshot");
    // the matcher CELL is the word "n/a" exactly — never a bare dash or blank
    const cells = within(row).getAllByRole("cell");
    expect(cells[3].textContent).toBe("n/a");
    expect(row.textContent).toContain("2026-08-10"); // the report day still renders
    for (const pattern of NO_RATIO_PATTERNS) {
      expect(row.textContent).not.toMatch(pattern);
    }
  });
});

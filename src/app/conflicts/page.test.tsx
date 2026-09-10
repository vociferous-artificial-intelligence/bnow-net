// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// The feature-off guard is spied so this always-run suite fails if the call is
// deleted or reordered behind data access (prompt §14 guard-order rule; the
// HTTP-level proof lives in src/integration/conflict-feature-off.itest.ts).
const featureMock = vi.hoisted(() =>
  vi.fn<() => void>(() => {
    throw new Error("FEATURE_OFF_TEST");
  }),
);
vi.mock("@/lib/conflicts/feature", () => ({ requireConflictsUi: featureMock }));

// The DB client is the only thing faked: the page runs the REAL read model —
// latestObservationsFor's fail-closed parse, the SQL edition repository's row
// mapping, and selectDailyFinal — against seeded rows.
const dbMock = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/db", () => ({ rawSql: dbMock }));

import ConflictsIndexPage from "./page";
import {
  IRAN_LEGACY_GOLDEN,
  KEYWORD_GOLDEN,
  editionRow,
  fakeConflictQuery,
  observationRow,
  resultForEdition,
} from "@/lib/conflicts/db-view.testkit";

const RU_DAY = new Date().toISOString().slice(0, 10);

function seed(opts: { observations?: boolean } = {}) {
  const ru = resultForEdition(KEYWORD_GOLDEN, "roca", RU_DAY, "daily");
  const ir = resultForEdition(IRAN_LEGACY_GOLDEN, "iran_update", RU_DAY, "plain");
  const fake = fakeConflictQuery(
    opts.observations === false
      ? {}
      : {
          observations: [observationRow(ru, { id: 1 }), observationRow(ir, { id: 2 })],
          editions: [
            editionRow("roca", RU_DAY, "daily"),
            editionRow("iran_update", RU_DAY, "plain"),
          ],
        },
  );
  dbMock.query.mockImplementation(fake.query);
  return fake;
}

beforeEach(() => seed());

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  featureMock.mockImplementation(() => {
    throw new Error("FEATURE_OFF_TEST");
  });
});

describe("feature-off guard (first statement)", () => {
  it("blocks the page before ANY conflict data access", async () => {
    await expect(ConflictsIndexPage()).rejects.toThrow("FEATURE_OFF_TEST");
    expect(featureMock).toHaveBeenCalled();
    expect(dbMock.query).not.toHaveBeenCalled();
  });

  it("runs before the first query when the flag is on", async () => {
    featureMock.mockImplementation(() => {});
    render(await ConflictsIndexPage());
    expect(dbMock.query).toHaveBeenCalled();
    expect(featureMock.mock.invocationCallOrder[0]).toBeLessThan(
      dbMock.query.mock.invocationCallOrder[0],
    );
  });
});

describe("index card numeric hygiene (Gate-7 product MINOR-3)", () => {
  it("publishes the caveat and the read-the-n instruction beside the card's coverage %", async () => {
    featureMock.mockImplementation(() => {});
    render(await ConflictsIndexPage());
    // the card's % is the FIRST coverage number a visitor sees and sits
    // outside any benchmark module — both ideas must travel with it
    const caveat = screen.getAllByTestId("index-card-caveat");
    expect(caveat.length).toBe(2);
    expect(caveat[0].textContent).toContain("agreement is not independent confirmation");
    expect(caveat[0].textContent).toContain("read the n, not just the percentage");
  });
});

describe("index rendering (flag on)", () => {
  it("lists both conflicts with teaser-tier content only", async () => {
    featureMock.mockImplementation(() => {});
    render(await ConflictsIndexPage());

    expect(screen.getByRole("main")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Conflicts" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Russia–Ukraine War" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Iran and Regional Conflict" })).toBeTruthy();
    expect(screen.getByTestId("terminology-explainer")).toBeTruthy();
    // teaser tier: NO claim text, NO reference-takeaway text
    expect(document.body.textContent).not.toContain("reportedly repelled");
    expect(document.body.textContent).not.toContain("Oskil riverbank");
  });

  it("shows n/d beside every coverage percentage", async () => {
    featureMock.mockImplementation(() => {});
    render(await ConflictsIndexPage());
    expect(document.body.textContent).toMatch(/\d+ of \d+ declared Key Takeaways \(\d+%\)/);
  });

  it("carries the memo-C13 compound-undetermined banner over real rows", async () => {
    featureMock.mockImplementation(() => {});
    render(await ConflictsIndexPage());
    const banner = screen.getByTestId("compound-undetermined-banner");
    expect(banner.textContent).toContain("Compound handling undetermined — not soak-eligible");
    expect(banner.textContent).toContain("must not be quoted to a customer");
    // and the fixture build's synthetic-corpus banner is GONE — these are real
    // observations, and labelling them synthetic would be the opposite lie
    expect(screen.queryByTestId("synthetic-banner")).toBeNull();
    expect(document.body.textContent).not.toContain("SYNTHETIC TEST FIXTURE");
  });

  it("renders an ABSENCE of observations as an absence, never a 0%", async () => {
    featureMock.mockImplementation(() => {});
    seed({ observations: false });
    render(await ConflictsIndexPage());
    expect(document.body.textContent).toContain("No conflict evaluation has been recorded");
    expect(document.body.textContent).toContain("never a 0%");
    // nothing to label when nothing rendered
    expect(screen.queryByTestId("compound-undetermined-banner")).toBeNull();
  });

  it("reads only the featured day per conflict (one edition query each)", async () => {
    featureMock.mockImplementation(() => {});
    const fake = seed();
    render(await ConflictsIndexPage());
    const editionReads = fake.calls.filter((c) => c.sql.includes("benchmark_report_editions"));
    expect(editionReads).toHaveLength(2);
  });
});

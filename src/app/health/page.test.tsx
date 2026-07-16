// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// /health is an async server component running raw count queries directly — the db
// module is mocked wholesale so this test never needs DATABASE_URL, matching the
// pattern in src/app/scoreboard/page.test.tsx.

const executeMock = vi.fn();
vi.mock("@/db", () => ({
  db: { execute: (...args: unknown[]) => executeMock(...args) },
}));

const HealthPage = (await import("./page")).default;

afterEach(cleanup);
afterEach(() => {
  executeMock.mockReset();
});

function countedTables(container: HTMLElement): string[] {
  return [...container.querySelectorAll("tbody tr")].map(
    (row) => row.querySelector("td")?.textContent ?? "",
  );
}

/**
 * db.execute receives drizzle `sql.raw` objects, not strings — the statement text lives
 * in queryChunks. Serializing reaches it, so "we never queried this table" is asserted
 * against the real SQL rather than passing vacuously against "[object Object]".
 */
function executedSql(): string {
  return JSON.stringify(executeMock.mock.calls);
}

describe("public health counts", () => {
  it("publishes only pipeline-shape tables, never user or access-intent counts", async () => {
    executeMock.mockResolvedValue({ rows: [{ n: 42 }] });
    const { container } = render(await HealthPage());

    const tables = countedTables(container);
    expect(tables).toEqual([
      "countries",
      "sources",
      "source_citations",
      "raw_documents",
      "events",
      "claims",
      "claim_sources",
      "digests",
    ]);
    // Removed 2026-07-16 — this page is unauthenticated, so these leaked private-beta
    // size, inbound demand, and scoring/corpus volume to anyone who asked.
    // Removed rows must not be counted at all, not merely hidden after querying.
    for (const removed of ["users", "subscribe_intents", "validation_runs", "isw_reports"]) {
      expect(tables).not.toContain(removed);
      expect(executedSql()).not.toContain(`FROM ${removed}`);
    }
    // sources and raw_documents are deliberately kept and not reinterpreted.
    expect(executedSql()).toContain("FROM sources");
    expect(executedSql()).toContain("FROM raw_documents");
  });

  it("reports DB OK with an ISO diagnostic timestamp when every count succeeds", async () => {
    executeMock.mockResolvedValue({ rows: [{ n: 7 }] });
    const { container } = render(await HealthPage());

    expect(container.querySelector('[data-testid="db-status"]')?.textContent).toBe("DB OK");
    expect(container.textContent).toMatch(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/);
  });

  it("reports DB DOWN when a count fails rather than rendering a partial all-clear", async () => {
    executeMock.mockRejectedValue(new Error("connection refused"));
    const { container } = render(await HealthPage());

    expect(container.querySelector('[data-testid="db-status"]')?.textContent).toBe("DB DOWN");
  });
});

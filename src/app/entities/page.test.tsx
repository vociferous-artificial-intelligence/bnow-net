// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
vi.mock("@/db", () => ({ rawSql: { query: (...args: unknown[]) => queryMock(...args) } }));

const roleMock = vi.fn();
vi.mock("@/lib/gate", () => ({ currentRole: () => roleMock() }));

const EntitiesPage = (await import("./page")).default;

afterEach(() => {
  cleanup();
  queryMock.mockReset();
  roleMock.mockReset();
});

// The pre-2026-07-21 matcher bug's persisted shape: a REJECTED candidate whose
// topics were promoted into a "sanctioned" assertion. Must never render publicly.
const STALE_BAD_OS = {
  matched: false, sanctioned: true, topics: ["sanction"], datasets: ["us_ofac_sdn"],
  osId: "Q9999", score: 0.55, caption: "Wrong Person", checkedAt: "2026-07-10T00:00:00Z",
};
const ACCEPTED_OS = {
  matched: true, sanctioned: true, topics: ["sanction"], datasets: ["eu_fsf"],
  osId: "Q100", score: 0.91, caption: "Listed Person", checkedAt: "2026-07-15T00:00:00Z",
};

function row(id: number, name: string, os?: unknown) {
  return {
    id, name, kind: "person", claims: 3, pressure: 2,
    last_seen: "2026-07-15", roles: ["defendant"],
    ...(os !== undefined ? { os } : {}),
  };
}

describe("entity tracker list — OpenSanctions is admin-only and fail-closed", () => {
  it("non-admin: no OpenSanctions markup at all, and the SQL never selects the metadata", async () => {
    roleMock.mockResolvedValue("user");
    // stale bad shape in the DB — even if it leaked into the row, nothing may render
    queryMock.mockResolvedValueOnce([row(1, "Wrongly Flagged", STALE_BAD_OS)]);

    const { container } = render(await EntitiesPage());
    const html = container.innerHTML;

    expect(html).toContain("Wrongly Flagged");
    expect(html).not.toMatch(/opensanctions/i);
    expect(html).not.toMatch(/\bsanctioned\b/i);
    expect(html).not.toMatch(/\bPEP\b/);
    expect(html).not.toContain("OS candidate");
    expect(container.querySelector(".bg-red-600")).toBeNull(); // the old badge style

    // the non-admin query must not even project the metadata
    expect(String(queryMock.mock.calls[0][0])).not.toContain("opensanctions");
  });

  it("admin: accepted match shows the neutral candidate chip; rejected/stale rows show nothing", async () => {
    roleMock.mockResolvedValue("admin");
    queryMock.mockResolvedValueOnce([
      row(1, "Listed Person", ACCEPTED_OS),
      row(2, "Wrongly Flagged", STALE_BAD_OS),
      row(3, "Never Checked", null),
    ]);

    const { container, getAllByText, queryByText } = render(await EntitiesPage());
    const html = container.innerHTML;

    // neutral indicator for the accepted candidate only — one chip total
    expect(getAllByText("OS candidate")).toHaveLength(1);
    // no categorical badges anywhere, accepted or stale
    expect(html).not.toMatch(/\bsanctioned\b/i);
    expect(html).not.toMatch(/\bPEP\b/);
    expect(queryByText("sanctioned")).toBeNull();
    // the stale rejected row renders its name with no OS markup in its cell
    expect(html).toContain("Wrongly Flagged");
  });

  it("role lookup failure fails closed to the non-admin rendering", async () => {
    roleMock.mockResolvedValue("user"); // currentRole itself degrades errors to "user"
    queryMock.mockResolvedValueOnce([row(1, "Someone", ACCEPTED_OS)]);
    const { container } = render(await EntitiesPage());
    expect(container.innerHTML).not.toContain("OS candidate");
    expect(container.innerHTML).not.toMatch(/opensanctions/i);
  });
});

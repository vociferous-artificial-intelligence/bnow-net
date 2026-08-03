// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
vi.mock("@/db", () => ({ rawSql: { query: (...args: unknown[]) => queryMock(...args) } }));
vi.mock("@/i18n/server", () => ({ getLocale: async () => "en" }));

// OpenSanctions presentation is admin-only (2026-07-21 match-safety ruling);
// default every test to the fail-closed non-admin role.
const roleMock = vi.fn();
// AGENTS.md ruling 21: the page must call its own gate BEFORE any data access — a
// layout gate does not cancel the page's render, so gating only there leaks the
// serialized page. Spied (not a bare no-op) so this always-run suite fails if the
// call is ever deleted or reordered; the HTTP-level proof lives in
// src/integration/authz-page-gate.itest.ts, which npm test does not run.
const gateMock = vi.fn(async () => null);
vi.mock("@/lib/gate", () => ({
  currentRole: () => roleMock(),
  requireAcceptedUser: () => gateMock(),
}));

const EntityDetailPage = (await import("./page")).default;

afterEach(() => {
  cleanup();
  queryMock.mockReset();
  roleMock.mockReset();
  gateMock.mockClear();
});

beforeEach(() => {
  roleMock.mockResolvedValue("user");
});

const ENTITY = { id: 7, name: "Example Person", kind: "person", meta: {} };
const CLAIM = {
  id: 42,
  text: "Example traceable claim",
  hedging: "confirmed",
  claim_type: "fact",
  d: "2026-07-12",
  role: "subject",
  iso2: "ru",
  country_name: "Russia",
  track: "military",
  digest_date: "2026-07-13",
};
const EVIDENCE = {
  claim_id: 42,
  doc_id: 9,
  doc_url: "https://example.com/report",
  doc_title: "Example report",
  adapter: "rss",
  published_at: null,
  fetched_at: "2026-07-13T14:15:00Z",
  source_id: 3,
  source_name: "Example News",
  source_key: "example.com",
  source_domain: "example.com",
  reliability: "0.8",
  source_platform: "independent_media",
};

describe("entity timeline evidence", () => {
  it("bulk-loads evidence once and deep-links with the owning digest date", async () => {
    queryMock
      .mockResolvedValueOnce([ENTITY])
      .mockResolvedValueOnce([CLAIM])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([EVIDENCE]);

    const element = await EntityDetailPage({ params: Promise.resolve({ id: "7" }) });
    render(element);

    expect(screen.getByText("Example traceable claim")).toBeTruthy();
    expect(screen.getAllByText("Example News")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Copy for report" })).toBeTruthy();
    expect(screen.getByText("Earliest published").parentElement?.textContent).toContain("Unknown");
    const digest = screen.getByRole("link", { name: "digest →" });
    expect(digest.getAttribute("href")).toBe("/digests/ru/2026-07-13#c42");
    expect(screen.getByRole("link", { name: /Search all claims/ }).getAttribute("href")).toBe(
      "/search?q=Example%20Person",
    );

    const evidenceCall = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes("WHERE cs.claim_id = ANY"),
    );
    expect(evidenceCall?.[1]).toEqual([[42]]);
    expect(queryMock).toHaveBeenCalledTimes(4);
  });

  it("does not issue an evidence query when the capped timeline is empty", async () => {
    queryMock
      .mockResolvedValueOnce([ENTITY])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const element = await EntityDetailPage({ params: Promise.resolve({ id: "7" }) });
    render(element);

    expect(screen.getByText("No claims recorded.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copy for report" })).toBeNull();
    expect(queryMock).toHaveBeenCalledTimes(3);
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes("WHERE cs.claim_id = ANY"))).toBe(false);
  });
});

// ---- OpenSanctions candidate review (2026-07-21 match-safety ruling) -----------

// The pre-fix bug's persisted shape: a REJECTED candidate whose topics were
// promoted into a top-level "sanctioned" assertion. Production still holds such
// rows; every render path must fail closed on them.
const STALE_BAD_META = {
  opensanctions: {
    matched: false, sanctioned: true, topics: ["sanction"], datasets: ["us_ofac_sdn"],
    osId: "Q9999", score: 0.55, caption: "Wrong Person", checkedAt: "2026-07-10T00:00:00Z",
  },
};
const ACCEPTED_META = {
  opensanctions: {
    matched: true, sanctioned: true, topics: ["sanction", "role.pep"],
    datasets: ["eu_fsf", "us_ofac_sdn"], osId: "Q100", score: 0.91,
    caption: "Listed Person", checkedAt: "2026-07-15T00:00:00Z",
  },
};

function mockEntityQueries(meta: Record<string, unknown>) {
  queryMock
    .mockResolvedValueOnce([{ ...ENTITY, meta }])
    .mockResolvedValueOnce([]) // claims
    .mockResolvedValueOnce([]); // links
}

describe("entity detail — OpenSanctions is admin-only, qualified, fail-closed", () => {
  it("non-admin: stale contradictory metadata renders NO OpenSanctions markup", async () => {
    roleMock.mockResolvedValue("user");
    mockEntityQueries(STALE_BAD_META);

    const { container } = render(
      await EntityDetailPage({ params: Promise.resolve({ id: "7" }) }),
    );
    const html = container.innerHTML;
    expect(html).not.toMatch(/opensanctions/i);
    expect(html).not.toMatch(/\bsanctioned\b/i);
    expect(html).not.toMatch(/\bPEP\b/);
    expect(html).not.toContain("Q9999");
    expect(html).not.toContain("Wrong Person");
    expect(container.querySelector(".bg-red-600")).toBeNull();
  });

  it("non-admin: even an ACCEPTED match renders nothing (admin-only surface)", async () => {
    roleMock.mockResolvedValue("analyst");
    mockEntityQueries(ACCEPTED_META);
    const { container } = render(
      await EntityDetailPage({ params: Promise.resolve({ id: "7" }) }),
    );
    expect(container.innerHTML).not.toMatch(/opensanctions/i);
    expect(container.innerHTML).not.toContain("Listed Person");
  });

  it("admin: stale rejected row is labelled rejected with non-assertive diagnostics — never sanctioned", async () => {
    roleMock.mockResolvedValue("admin");
    mockEntityQueries(STALE_BAD_META);

    const { container } = render(
      await EntityDetailPage({ params: Promise.resolve({ id: "7" }) }),
    );
    const html = container.innerHTML;
    expect(
      screen.getByText(/algorithm rejected all candidates — no accepted identity match/),
    ).toBeTruthy();
    expect(screen.getByText(/Top rejected candidate \(diagnostics only/)).toBeTruthy();
    // the rejected candidate's word "sanctioned" never appears; its topic string is
    // shown only inside the explicit diagnostics sentence
    expect(html).not.toMatch(/\bsanctioned\b/i);
    expect(container.querySelector(".bg-red-600")).toBeNull();
    expect(html).toContain("Wrong Person");
    expect(html).toContain("candidate record topics: sanction");
  });

  it("admin: accepted match shows the qualified candidate review (score semantics, topics, checkedAt)", async () => {
    roleMock.mockResolvedValue("admin");
    mockEntityQueries(ACCEPTED_META);

    const { container } = render(
      await EntityDetailPage({ params: Promise.resolve({ id: "7" }) }),
    );
    const html = container.innerHTML;
    expect(screen.getByText(/algorithm accepted a candidate/)).toBeTruthy();
    expect(html).toContain("Listed Person");
    // score is explicitly identity-match confidence, never risk
    expect(html).toContain("identity-match");
    expect(html).toContain("0.91");
    expect(html).toContain("not risk");
    // topics stay distinct categories — both chips render, nothing collapses
    expect(screen.getByText("sanction")).toBeTruthy();
    expect(screen.getByText("role.pep")).toBeTruthy();
    expect(html).toContain("eu_fsf, us_ofac_sdn");
    expect(html).toContain("https://www.opensanctions.org/entities/Q100/");
    // checkedAt freshness, clearly formatted; name+type-only qualification present
    expect(html).toContain("Checked 2026-07-15 (UTC)");
    expect(html).toContain("name and entity type only");
    expect(html).toContain("not been human-reviewed");
    // no categorical badge — the old red assertion style is gone for good
    expect(html).not.toMatch(/\bsanctioned\b/i);
    expect(container.querySelector(".bg-red-600")).toBeNull();
  });
});

// AGENTS.md ruling 21 — the page is its own authorization boundary. The /entities
// layout also gates, but a layout redirect does not cancel the page's render, so
// the gate must run HERE and must run before the first query. Deleting
// `await requireAcceptedUser()` from page.tsx fails this test.
describe("page-level authorization gate", () => {
  it("calls requireAcceptedUser before issuing any query", async () => {
    queryMock
      .mockResolvedValueOnce([ENTITY])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await EntityDetailPage({ params: Promise.resolve({ id: "7" }) });

    expect(gateMock).toHaveBeenCalled();
    expect(gateMock.mock.invocationCallOrder[0]).toBeLessThan(
      queryMock.mock.invocationCallOrder[0],
    );
  });
});

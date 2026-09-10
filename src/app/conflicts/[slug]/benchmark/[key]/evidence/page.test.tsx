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

const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("TEST_NOT_FOUND");
  }),
);
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));

// AGENTS.md ruling 21: the page must call its own authorization gate BEFORE
// anything else — spied so this always-run suite fails if the call is deleted
// or reordered. The HTTP-level proof (bare GET + RSC: 1 against a production
// build, with the flag ON and a seeded observation) lives in
// src/integration/conflict-feature-off.itest.ts.
const gateMock = vi.hoisted(() => vi.fn(async () => ({ email: "user@example.com" })));
vi.mock("@/lib/gate", () => ({ requireAcceptedUser: gateMock }));

// Access-tier pin (contract §11): the feature-off guard runs IMMEDIATELY after
// the authorization gate, before data access.
const featureMock = vi.hoisted(() =>
  vi.fn<() => void>(() => {
    throw new Error("FEATURE_OFF_TEST");
  }),
);
vi.mock("@/lib/conflicts/feature", () => ({ requireConflictsUi: featureMock }));

const dbMock = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/db", () => ({ rawSql: dbMock }));

import BenchmarkEvidencePage from "./page";
import {
  KEYWORD_GOLDEN,
  editionRow,
  fakeConflictQuery,
  observationRow,
  resultForEdition,
} from "@/lib/conflicts/db-view.testkit";
import { publishedUnionClaimIds } from "@/lib/conflicts/db-product-view";

const today = new Date();
const DAY = new Date(
  Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1),
)
  .toISOString()
  .slice(0, 10);
const KEY = `roca-${DAY}-daily`;
const CLAIM_TEXT = "Ukrainian forces reportedly held their positions near the river crossing";

const result = resultForEdition(KEYWORD_GOLDEN, "roca", DAY, "daily");
const CLAIM_IDS = publishedUnionClaimIds(result);

const pageFor = (slug: string, key: string) =>
  BenchmarkEvidencePage({ params: Promise.resolve({ slug, key }) });

function seed(opts: { claims?: boolean } = {}) {
  const fake = fakeConflictQuery({
    observations: [observationRow(result)],
    editions: [editionRow("roca", DAY, "daily")],
    claims:
      opts.claims === false
        ? []
        : CLAIM_IDS.map((id) => ({
            claim_id: id,
            text: `${CLAIM_TEXT} (${id})`,
            claim_date: DAY,
          })),
    docs:
      opts.claims === false
        ? []
        : CLAIM_IDS.map((id) => ({
            claim_id: id,
            doc_id: 900 + id,
            adapter: "rss",
            url: "https://frontline-wire.example/report",
            published_at: `${DAY}T05:00:00Z`,
            fetched_at: `${DAY}T05:30:00Z`,
            lang: "en",
            platform: "independent_media",
            domain: "frontline-wire.example",
            mirror_of_doc_id: null,
          })),
  });
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

describe("page-level authorization gate", () => {
  it("calls requireAcceptedUser before the feature guard, both before any data access", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine", KEY));

    expect(gateMock).toHaveBeenCalled();
    expect(featureMock).toHaveBeenCalled();
    expect(dbMock.query).toHaveBeenCalled();
    expect(gateMock.mock.invocationCallOrder[0]).toBeLessThan(
      featureMock.mock.invocationCallOrder[0],
    );
    expect(featureMock.mock.invocationCallOrder[0]).toBeLessThan(
      dbMock.query.mock.invocationCallOrder[0],
    );
  });

  it("gates even the feature-off render: gate first, then the guard 404s, no data touched", async () => {
    await expect(pageFor("russia-ukraine", KEY)).rejects.toThrow("FEATURE_OFF_TEST");
    expect(gateMock).toHaveBeenCalled();
    expect(gateMock.mock.invocationCallOrder[0]).toBeLessThan(
      featureMock.mock.invocationCallOrder[0],
    );
    expect(dbMock.query).not.toHaveBeenCalled();
  });
});

describe("the gated what-changed view", () => {
  it("renders LIVE claim text with hedge, origin digest, timestamps, and source trail", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine", KEY));

    expect(document.body.textContent).toContain(CLAIM_TEXT);
    expect(document.body.textContent).toMatch(/from the \w+ · \w+ digest/);
    expect(document.body.textContent).toMatch(/hedge: \w+/);
    expect(document.body.textContent).toContain("frontline-wire.example");
    expect(document.body.textContent).toContain("earliest BNOW ingest");
    // matched takeaway identified by id + lane, NEVER by takeaway text
    expect(document.body.textContent).not.toContain("Oskil riverbank");
    // read-only union framing (no new synthesis)
    expect(document.body.textContent).toContain("not a new conflict digest");
  });

  it("names the real edition and carries the memo-C13 banner, not the retired synthetic one", async () => {
    featureMock.mockImplementation(() => {});
    render(await pageFor("russia-ukraine", KEY));
    expect(document.body.textContent).toContain(`roca:${DAY}:daily`);
    expect(screen.getByTestId("compound-undetermined-banner")).toBeTruthy();
    expect(screen.queryByTestId("synthetic-banner")).toBeNull();
    expect(document.body.textContent).not.toContain("Fixture demonstration");
  });

  it("COUNTS a union claim the live join no longer returns, and renders no text for it", async () => {
    featureMock.mockImplementation(() => {});
    seed({ claims: false });
    render(await pageFor("russia-ukraine", KEY));

    const withheld = screen.getByTestId("withheld-claims");
    expect(withheld.textContent).toContain(`${CLAIM_IDS.length} claim`);
    expect(withheld.textContent).toContain("no longer renderable");
    expect(withheld.textContent).toContain("rather than reconstructed");
    expect(document.body.textContent).not.toContain(CLAIM_TEXT);
    // an empty list is shown as empty, never as "nothing changed"
    expect(screen.getByTestId("evidence-empty").textContent).toContain(
      "No published digest claim",
    );
  });

  it("404s an unknown key AFTER the gates, and a non-final edition's key too", async () => {
    featureMock.mockImplementation(() => {});
    for (const key of ["no-such-key", `roca-${DAY}-evening`]) {
      notFoundMock.mockClear();
      await expect(pageFor("russia-ukraine", key), key).rejects.toThrow("TEST_NOT_FOUND");
      expect(gateMock, key).toHaveBeenCalled();
    }
  });

  it("404s an unknown slug after the gates", async () => {
    featureMock.mockImplementation(() => {});
    await expect(pageFor("not-a-conflict", KEY)).rejects.toThrow("TEST_NOT_FOUND");
    expect(gateMock).toHaveBeenCalled();
    expect(dbMock.query).not.toHaveBeenCalled();
  });
});

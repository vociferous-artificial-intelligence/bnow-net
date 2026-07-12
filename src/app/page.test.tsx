// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The home page is an async server component doing rawSql queries directly (no
// drizzle schema) and reading the session via @/lib/session — mocked wholesale so
// this test never needs DATABASE_URL or a request context, same pattern as
// src/app/ask/page.test.tsx and src/app/digests/[country]/[date]/page.test.tsx.

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/db", () => ({
  rawSql: { query: (...args: unknown[]) => queryMock(...args) },
}));

vi.mock("@/i18n/server", () => ({
  getLocale: async () => "en",
}));

const emailMock = vi.fn<() => Promise<string | null>>();
vi.mock("@/lib/session", () => ({
  currentUserEmail: () => emailMock(),
}));

const queryMock = vi.fn();

const STATS_ROW = { sources: 10, citations: 20, docs: 30, runs: 5 };

const Home = (await import("./page")).default;

afterEach(cleanup);
afterEach(() => {
  queryMock.mockReset();
  emailMock.mockReset();
});

// Query order inside the signed-in try block's Promise.all (page.tsx): freshnessRows,
// digestRows (ranked digest-date window query), validationRows, corroboratedRows,
// claimsByDateRows, recentAskRows. Every signed-in test below must resolve all six, in
// this order, after the top-level stats query.
//
// Fixture rows are DRIVER-REALISTIC on purpose: the Neon HTTP driver returns uncast
// bigint (e.g. row_number()) as a STRING and timestamptz as a Date instance. A
// friendlier-than-reality mock (rn as a JS number) masked the 2026-07-12 prod bug
// where `row.rn === 1` never matched — keep these shapes ugly.
function mockSignedInQueries(overrides: {
  freshness?: unknown[];
  digest?: unknown[];
  validation?: unknown[];
  corroborated?: unknown[];
  claimsByDate?: unknown[];
  recentAsks?: unknown[];
} = {}) {
  queryMock
    .mockResolvedValueOnce([STATS_ROW]) // top stats query
    .mockResolvedValueOnce(overrides.freshness ?? [])
    .mockResolvedValueOnce(overrides.digest ?? [])
    .mockResolvedValueOnce(overrides.validation ?? [])
    .mockResolvedValueOnce(overrides.corroborated ?? [])
    .mockResolvedValueOnce(overrides.claimsByDate ?? [])
    .mockResolvedValueOnce(overrides.recentAsks ?? []);
}

describe("signed-in home: Ask entry point (W5)", () => {
  it("renders a zero-JS GET form pointing at /ask under the validation tiles", async () => {
    emailMock.mockResolvedValue("user@example.com");
    mockSignedInQueries();

    const element = await Home();
    const { container } = render(element);

    const form = container.querySelector('form[action="/ask"][method="get"]');
    expect(form).toBeTruthy();
    const input = form?.querySelector('input[name="q"]');
    expect(input).toBeTruthy();
    expect(form?.textContent).toContain("Ask");
  });
});

describe("signed-in home: quick links rail (W2)", () => {
  it("renders under the hero, above the theater status panel, with per-theater digest dates", async () => {
    emailMock.mockResolvedValue("user@example.com");
    mockSignedInQueries({
      digest: [
        // rn as STRING + last_generated as Date: exactly what the driver delivers.
        { iso2: "ru", digest_date: "2026-07-12", rn: "1", last_generated: new Date("2026-07-12T04:02:00.000Z") },
        { iso2: "ru", digest_date: "2026-07-11", rn: "2", last_generated: new Date("2026-07-12T02:02:00.000Z") },
      ],
    });

    const element = await Home();
    const { container } = render(element);

    const railHref = (href: string) => container.querySelector(`a[href="${href}"]`);
    expect(railHref("/digests/ru/2026-07-12")).toBeTruthy();
    expect(railHref("/digests/ru/2026-07-11")).toBeTruthy();
    expect(railHref("/scoreboard")).toBeTruthy();
    expect(railHref("/signals")).toBeTruthy();
    // R5 (2026-07-12): the source registry is admin-only now, so its rail link
    // (formerly asserted present here) is gone.
    expect(railHref("/registry")).toBeNull();
  });
});

describe("signed-in home: theater status panel extensions (W1)", () => {
  it("wires bucket-keyed claims counts and the scoreboard deep link through from the DB rows", async () => {
    emailMock.mockResolvedValue("user@example.com");
    mockSignedInQueries({
      digest: [
        { iso2: "ru", digest_date: "2026-07-12", rn: "1", last_generated: new Date("2026-07-12T04:02:00.000Z") },
      ],
      validation: [
        {
          iso2: "ru",
          coverage_pct: 25,
          timeliness_hours: 14.7,
          run_at: "2026-07-12T07:00:00.000Z",
          digest_date: "2026-07-12",
        },
      ],
      claimsByDate: [
        { iso2: "ru", d: "2026-07-12", n: 7 },
        // A different bucket's count must NOT leak into the displayed row.
        { iso2: "ru", d: "2026-07-11", n: 99 },
      ],
    });

    const element = await Home();
    const { container } = render(element);

    expect(container.querySelector('a[href="/scoreboard/ru/2026-07-12"]')).toBeTruthy();
    // The claims row is labeled with the displayed bucket's date (the R2 invariant)
    // and carries that bucket's count — scoped to the row's <dd>, not a substring.
    const claimsDt = Array.from(container.querySelectorAll("dt")).find(
      (el) => el.textContent === "Digest claims, 2026-07-12",
    );
    expect(claimsDt?.nextElementSibling?.textContent).toBe("7");
  });

  it("regression: the digest fold survives the driver's string rn (2026-07-12 prod bug)", async () => {
    emailMock.mockResolvedValue("user@example.com");
    mockSignedInQueries({
      digest: [
        { iso2: "ru", digest_date: "2026-07-12", rn: "1", last_generated: new Date("2026-07-12T10:05:00.000Z") },
      ],
    });

    const element = await Home();
    const { container } = render(element);

    // Before the fix, string rn made latestDate fold to null and this label fell
    // back to "none yet" ("not yet generated") with digests present.
    const digestDt = Array.from(container.querySelectorAll("dt")).find(
      (el) => el.textContent === "Latest digest",
    );
    expect(digestDt?.nextElementSibling?.textContent).toContain("2026-07-12");
    expect(digestDt?.nextElementSibling?.textContent).not.toContain("none yet");
  });
});

describe("signed-in home: recent asks (W6)", () => {
  it("renders up to 5 past questions as /ask?q= prefill links when the user has any", async () => {
    emailMock.mockResolvedValue("user@example.com");
    mockSignedInQueries({
      recentAsks: [
        { question: "What happened near Kupiansk?", last_at: "2026-07-12T01:00:00.000Z" },
        { question: "Iran nuclear program status?", last_at: "2026-07-11T20:00:00.000Z" },
      ],
    });

    const element = await Home();
    const { container } = render(element);

    const link1 = container.querySelector(
      `a[href="/ask?q=${encodeURIComponent("What happened near Kupiansk?")}"]`,
    );
    expect(link1).toBeTruthy();
    expect(link1?.textContent).toBe("What happened near Kupiansk?");
    const link2 = container.querySelector(
      `a[href="/ask?q=${encodeURIComponent("Iran nuclear program status?")}"]`,
    );
    expect(link2).toBeTruthy();
  });

  it("renders no recent-asks block at all when the user has no past questions", async () => {
    emailMock.mockResolvedValue("user@example.com");
    mockSignedInQueries();

    const element = await Home();
    const { container } = render(element);

    expect(container.querySelector('a[href^="/ask?q="]')).toBeNull();
  });
});

describe("signed-out home: untouched marketing sections", () => {
  it("renders no /ask form anywhere, and still renders the marketing feature cards", async () => {
    emailMock.mockResolvedValue(null);
    queryMock.mockResolvedValueOnce([STATS_ROW]); // only the top stats query runs

    const element = await Home();
    const { container } = render(element);

    expect(container.querySelector('form[action="/ask"]')).toBeNull();
    // Marketing feature cards (signed-out only) still render, resolved through the
    // real en dictionary — proves the signed-out branch was left untouched.
    expect(screen.getByText("Reliability, derived not asserted")).toBeTruthy();
    // R5 (2026-07-12): the tertiary proof line's and the reliability card's
    // /registry links are both gone — the source registry is admin-only now.
    expect(container.querySelector('a[href="/registry"]')).toBeNull();
  });
});

describe("signed-out home: additive Iran/Gulf card (W3)", () => {
  it("renders the new card after the marketing grid without touching it", async () => {
    emailMock.mockResolvedValue(null);
    queryMock.mockResolvedValueOnce([STATS_ROW]); // only the top stats query runs

    const element = await Home();
    const { container } = render(element);

    // Marketing cards (unchanged) still present.
    expect(screen.getByText("Reliability, derived not asserted")).toBeTruthy();
    // New additive card.
    expect(
      screen.getByRole("heading", { name: "Iran / Gulf theater — live daily intelligence" }),
    ).toBeTruthy();
    expect(container.querySelector('a[href="/countries#ir"]')).toBeTruthy();
    // Still no /ask form and no paid-pipeline import surface for signed-out users.
    expect(container.querySelector('form[action="/ask"]')).toBeNull();
  });
});

describe("signed-in home: section order (R3, analyst-home-v2 sprint)", () => {
  it("renders headline -> rail -> theater panel -> ask form -> recent asks -> validation tiles, top to bottom", async () => {
    emailMock.mockResolvedValue("user@example.com");
    mockSignedInQueries({
      recentAsks: [{ question: "What happened near Kupiansk?", last_at: "2026-07-12T01:00:00.000Z" }],
    });

    const element = await Home();
    const { container } = render(element);

    const headline = screen.getByRole("heading", { level: 1, name: "Today's intelligence picture" });
    // { selector: "p" } narrows to the rail's own paragraph — without it, every
    // ancestor whose full textContent happens to contain "Quick links" (section,
    // main) would also match and getByText would throw on multiple elements.
    const rail = screen.getByText(/Quick links/, { selector: "p" }).closest("section")!;
    const panel = container.querySelector('[aria-label="Data freshness by theater"]')!;
    const askForm = container.querySelector('form[action="/ask"]')!;
    const recentAsks = screen.getByText("Your recent questions").closest("section")!;
    const validationTiles = container.querySelector('[aria-label="Validation vs ISW"]')!;

    for (const el of [headline, rail, panel, askForm, recentAsks, validationTiles]) {
      expect(el).toBeTruthy();
    }

    // Node.DOCUMENT_POSITION_FOLLOWING = 4: bit set on `b` when `a` precedes `b`.
    const isBefore = (a: Element, b: Element) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

    const inOrder = [headline, rail, panel, askForm, recentAsks, validationTiles];
    for (let i = 0; i < inOrder.length - 1; i++) {
      expect(isBefore(inOrder[i], inOrder[i + 1])).toBe(true);
    }
  });
});

describe("signed-in home: compact headline, no marketing CTAs (R3)", () => {
  it("renders only the one-line headline — no subtitle, no digest/pricing CTA, no Live-now line", async () => {
    emailMock.mockResolvedValue("user@example.com");
    mockSignedInQueries();

    const element = await Home();
    const { container } = render(element);

    expect(screen.getByRole("heading", { level: 1, name: "Today's intelligence picture" })).toBeTruthy();
    expect(screen.queryByText("Read today's digest")).toBeNull();
    expect(container.querySelector('a[href="/pricing"]')).toBeNull();
    expect(screen.queryByText(/^Live now/)).toBeNull();
    // The old marketing subtitle must not leak into the signed-in render either.
    expect(screen.queryByText(/Per-country intelligence feeds from open news/)).toBeNull();
  });
});

describe("signed-out home: CTA + hero untouched (regression guard)", () => {
  it("still renders the marketing headline, subtitle, subscribe CTA and Live-now line", async () => {
    emailMock.mockResolvedValue(null);
    queryMock.mockResolvedValueOnce([STATS_ROW]); // only the top stats query runs

    const element = await Home();
    const { container } = render(element);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Transparent source reliability ratings for conflict-zone OSINT",
      }),
    ).toBeTruthy();
    const subscribeLink = container.querySelector('a[href="/pricing"]');
    expect(subscribeLink?.textContent).toBe("Become a founding subscriber");
    expect(screen.getByText(/^Live now/)).toBeTruthy();
  });
});

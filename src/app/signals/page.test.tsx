// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Signal } from "@/lib/analyst/signals";

const captureMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics/client", () => ({ captureProductEvent: captureMock }));

// Auth-boundary test for /signals (IA-REFINEMENT-REVIEW.md TASK 3 / TASK 5.1):
// the specifics a signal carries in `detail` — here, named individuals — must be WITHHELD
// from the server-rendered HTML for an unauthenticated visitor, at the data layer, and
// only appear for a signed-in one. This renders the real page server component with only
// its dependencies mocked (computeSignals / session / db), so it exercises the actual
// gating branch, not a stand-in. `toPublicSignal`, `evidenceForSignal` etc. run for real.

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/i18n/server", () => ({ getLocale: async () => "en" }));

const emailMock = vi.fn<() => Promise<string | null>>();
vi.mock("@/lib/session", () => ({ currentUserEmail: () => emailMock() }));

// The gated specifics require CURRENT legal acceptance, not merely a session — mock the
// acceptance check so a signed-in-but-not-accepted visitor is exercised too.
const acceptMock = vi.fn<() => Promise<boolean>>();
vi.mock("@/lib/legal/acceptance", () => ({ hasCurrentAcceptanceByEmail: () => acceptMock() }));

const computeMock = vi.fn<() => Promise<Signal[]>>();
vi.mock("@/lib/analyst/run", () => ({ computeSignals: () => computeMock() }));

const queryMock = vi.fn();
vi.mock("@/db", () => ({ rawSql: { query: (...a: unknown[]) => queryMock(...a) } }));

const SignalsPage = (await import("./page")).default;

// A purge signal in the post-2026-07-13 shape: `detail` carries role/count
// language only; names appear ONLY inside the accepted-user evidence rows
// (claim texts with hedge + sources). The auth boundary must hold for both.
const PURGE: Signal = {
  key: "purge:ru:14d",
  kind: "purge",
  theater: "ru",
  severity: "elevated",
  headline: "6 officials under prosecution/dismissal in 14d",
  detail:
    "Cluster of recent reported prosecutions/dismissals: 6 named officials across 3 claims in 14d. " +
    "Analyst review required — this is an automated pattern, not a confirmed campaign; see the " +
    "evidence below for exact claims with hedging and sources.",
  evidenceClaimIds: [11, 12, 13],
  evidenceRefs: [],
  at: "2026-07-12T00:00:00Z",
};
const NAMES = ["Ivanov", "Petrov", "Sidorov"];
// Evidence rows (the accepted-user drill-down): claim text names an individual,
// with hedging and a source doc — this is where names are ALLOWED to appear.
const EVIDENCE_ROWS = [
  {
    claim_id: 11,
    text: "Ivanov was arrested on embezzlement charges",
    hedging: "claimed",
    claim_date: "2026-07-10",
    country_iso2: "ru",
    country_name: "Russia",
    digest_date: "2026-07-10",
    doc_id: 900,
    doc_url: "https://t.me/example/1",
    doc_title: "post",
    adapter: "telegram_mtproto",
    source_id: 5,
    source_name: "Example channel",
    source_key: "t.me/example",
    source_domain: "t.me",
    reliability: "0.62",
    source_platform: "telegram",
    published_at: "2026-07-10T08:00:00Z",
    fetched_at: "2026-07-10T08:03:00Z",
  },
];

afterEach(cleanup);
afterEach(() => {
  emailMock.mockReset();
  computeMock.mockReset();
  queryMock.mockReset();
  acceptMock.mockReset();
  captureMock.mockReset();
});

describe("/signals auth boundary", () => {
  it("withholds names and the whole detail string from anonymous HTML, keeping the teaser", async () => {
    emailMock.mockResolvedValue(null); // signed out
    computeMock.mockResolvedValue([PURGE]);

    const { container } = render(await SignalsPage());
    const html = container.innerHTML;

    // Teaser (safe) is present.
    expect(html).toContain("6 officials under prosecution/dismissal");
    expect(container.textContent).toContain("sign in to inspect the evidence");
    // The public evidence count is shown (3 supporting claims).
    expect(container.textContent).toMatch(/3\s/);
    // Specifics are ABSENT — no name, no detail phrasing.
    for (const name of NAMES) expect(html).not.toContain(name);
    expect(html).not.toContain("Targets incl.");
    expect(html).not.toContain("factional purge");
    expect(html).not.toContain("data-copy-surface");
    // The gated evidence query never ran for the anonymous request.
    expect(queryMock).not.toHaveBeenCalled();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("shows an accepted analyst the review-qualified detail plus evidence with hedge and sources", async () => {
    emailMock.mockResolvedValue("analyst@example.com");
    acceptMock.mockResolvedValue(true); // current legal acceptance on record
    computeMock.mockResolvedValue([PURGE]);
    queryMock.mockResolvedValue(EVIDENCE_ROWS); // evidence drill-down query

    const { container } = render(await SignalsPage());
    const html = container.innerHTML;

    expect(html).toContain("6 officials under prosecution/dismissal"); // teaser still there
    // Detail is role/count language with the review qualification — no name list.
    expect(container.textContent).toContain("Analyst review required");
    expect(html).not.toContain("Targets incl.");
    expect(html).not.toContain("factional purge");
    // Names surface ONLY through the evidence claim texts, with hedge + traceable source.
    expect(container.textContent).toContain("Ivanov was arrested on embezzlement charges");
    expect(container.textContent).toContain("claimed"); // the hedging chip
    expect(html).toContain("Example channel"); // the human-readable source chip
    expect(html).not.toContain("0.62"); // score policy: Signals never renders reliability
    expect(container.querySelector('[data-copy-surface="signal"]')).toBeTruthy();
    expect(captureMock).toHaveBeenCalledWith("signal_detail_viewed", {
      theater: "ru",
      signal_type: "purge",
      evidence_count_bucket: "2-5",
    });
  });

  it("withholds detail from a signed-in visitor who has NOT accepted, nudging to /welcome/legal", async () => {
    emailMock.mockResolvedValue("analyst@example.com");
    acceptMock.mockResolvedValue(false); // signed in, but no current acceptance
    computeMock.mockResolvedValue([PURGE]);

    const { container } = render(await SignalsPage());
    const html = container.innerHTML;

    // Teaser present; specifics absent — same protection as the anonymous case.
    expect(html).toContain("6 officials under prosecution/dismissal");
    for (const name of NAMES) expect(html).not.toContain(name);
    expect(html).not.toContain("Targets incl.");
    // The nudge points at acceptance (not sign-in — the user is already signed in).
    expect(container.textContent).toContain("accept the Terms to inspect the evidence");
    expect(container.querySelector('a[href="/welcome/legal"]')).toBeTruthy();
    expect(html).not.toContain("data-copy-surface");
    // The gated evidence query never ran for the un-accepted request.
    expect(queryMock).not.toHaveBeenCalled();
    expect(captureMock).not.toHaveBeenCalled();
  });
});

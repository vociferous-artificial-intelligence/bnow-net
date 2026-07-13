// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Signal } from "@/lib/analyst/signals";

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

const computeMock = vi.fn<() => Promise<Signal[]>>();
vi.mock("@/lib/analyst/run", () => ({ computeSignals: () => computeMock() }));

const queryMock = vi.fn();
vi.mock("@/db", () => ({ rawSql: { query: (...a: unknown[]) => queryMock(...a) } }));

const SignalsPage = (await import("./page")).default;

// A purge signal whose detail names living individuals (the crown-jewels leak).
const PURGE: Signal = {
  key: "purge:ru:14d",
  kind: "purge",
  theater: "ru",
  severity: "elevated",
  headline: "6 officials under prosecution/dismissal in 14d",
  detail: "Clustered elite pressure — possible factional purge. Targets incl.: Ivanov, Petrov, Sidorov.",
  evidenceClaimIds: [11, 12, 13],
  evidenceRefs: [],
  at: "2026-07-12T00:00:00Z",
};
const NAMES = ["Ivanov", "Petrov", "Sidorov"];

afterEach(cleanup);
afterEach(() => {
  emailMock.mockReset();
  computeMock.mockReset();
  queryMock.mockReset();
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
    // The gated evidence query never ran for the anonymous request.
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("shows the detail specifics to a signed-in visitor", async () => {
    emailMock.mockResolvedValue("analyst@example.com");
    computeMock.mockResolvedValue([PURGE]);
    queryMock.mockResolvedValue([]); // evidence drill-down query (no rows needed for this assertion)

    const { container } = render(await SignalsPage());
    const html = container.innerHTML;

    expect(html).toContain("6 officials under prosecution/dismissal"); // teaser still there
    expect(html).toContain("Targets incl.");
    for (const name of NAMES) expect(html).toContain(name);
  });
});

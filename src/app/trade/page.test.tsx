// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// 390px audit (2026-07-13): the two wide trade tables must scroll inside their
// own overflow container — the document itself never scrolls horizontally.

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const divergenceMock = vi.fn();
const fetchWindowMock = vi.fn();
vi.mock("@/lib/trade/run", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/trade/run")>();
  return {
    ...actual, // keep the real fetchWindowLabel — the page renders its wording
    getDivergence: (...a: unknown[]) => divergenceMock(...a),
    tradeFetchWindow: (...a: unknown[]) => fetchWindowMock(...a),
  };
});

const { default: TradePage } = await import("./page");

afterEach(() => {
  cleanup();
  divergenceMock.mockReset();
  fetchWindowMock.mockReset();
});

function row(over: Record<string, unknown> = {}) {
  return {
    reporterCode: 784,
    reporterName: "UAE",
    hsCode: "847130",
    baselineYear: "2021",
    baselineUsd: 1_000_000,
    latestYear: "2026",
    latestUsd: 12_900_000,
    multiple: 12.9,
    deltaUsd: 11_900_000,
    flagged: true,
    reason: "12.9x baseline",
    ...over,
  };
}

describe("trade tables at mobile widths", () => {
  it("wraps every table in an overflow-x-auto container", async () => {
    divergenceMock.mockResolvedValue([row(), row({ hsCode: "TOTAL", flagged: false })]);
    fetchWindowMock.mockResolvedValue(null);
    const { container } = render(await TradePage());
    const tables = Array.from(container.querySelectorAll("table"));
    expect(tables.length).toBe(2);
    for (const table of tables) {
      const wrapper = table.parentElement;
      expect(wrapper?.className, "table missing its overflow container").toContain("overflow-x-auto");
    }
  });
});

describe("provenance wording (2026-07-13: cohort-scoped fetch window)", () => {
  it("renders an explicit range when reporters refreshed at different times", async () => {
    divergenceMock.mockResolvedValue([row()]);
    fetchWindowMock.mockResolvedValue({
      oldest: "2026-06-02 09:00:00+00",
      newest: "2026-07-10 12:00:00+00",
    });
    const { container } = render(await TradePage());
    expect(container.textContent).toContain("fetched between 2026-06-02 and 2026-07-10");
    expect(fetchWindowMock).toHaveBeenCalledWith("X"); // the displayed cohort's flow
  });

  it("renders a single date when the cohort was fetched together, and nothing when empty", async () => {
    divergenceMock.mockResolvedValue([row()]);
    fetchWindowMock.mockResolvedValue({
      oldest: "2026-06-02 09:00:00+00",
      newest: "2026-06-02 09:05:00+00",
    });
    const { container } = render(await TradePage());
    expect(container.textContent).toContain("last fetched 2026-06-02");

    cleanup();
    divergenceMock.mockResolvedValue([row()]);
    fetchWindowMock.mockResolvedValue(null);
    const { container: empty } = render(await TradePage());
    expect(empty.textContent).not.toContain("last fetched");
    expect(empty.textContent).not.toContain("fetched between");
  });
});

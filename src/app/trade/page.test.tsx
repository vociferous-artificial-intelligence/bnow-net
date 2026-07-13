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
vi.mock("@/lib/trade/run", () => ({ getDivergence: (...a: unknown[]) => divergenceMock(...a) }));

const { default: TradePage } = await import("./page");

afterEach(() => {
  cleanup();
  divergenceMock.mockReset();
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
    const { container } = render(await TradePage());
    const tables = Array.from(container.querySelectorAll("table"));
    expect(tables.length).toBe(2);
    for (const table of tables) {
      const wrapper = table.parentElement;
      expect(wrapper?.className, "table missing its overflow container").toContain("overflow-x-auto");
    }
  });
});

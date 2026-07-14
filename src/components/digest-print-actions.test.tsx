// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DigestPrintActions } from "./digest-print-actions";

const captureMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics/client", () => ({ captureProductEvent: captureMock }));

const LABELS = {
  actions: "Print / Save PDF",
  brief: "Print brief",
  evidence: "Print with evidence",
  failure: "Unable to open the print dialog.",
};

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.printPage;
  delete document.documentElement.dataset.printMode;
  vi.unstubAllGlobals();
  captureMock.mockReset();
});

function actions() {
  return <DigestPrintActions labels={LABELS} theater="ru" digestAge="1-7d" />;
}

describe("DigestPrintActions", () => {
  it("marks the mounted page and selects brief mode before printing", () => {
    const print = vi.fn(() => {
      expect(document.documentElement.dataset.printPage).toBe("digest");
      expect(document.documentElement.dataset.printMode).toBe("brief");
    });
    vi.stubGlobal("print", print);

    render(actions());
    expect(document.documentElement.dataset.printPage).toBe("digest");
    fireEvent.click(screen.getByRole("button", { name: "Print brief" }));
    expect(print).toHaveBeenCalledOnce();
    expect(captureMock).toHaveBeenCalledWith("digest_print_initiated", {
      theater: "ru",
      print_mode: "brief",
      digest_age_bucket: "1-7d",
    });
    expect(captureMock.mock.invocationCallOrder[0]).toBeLessThan(print.mock.invocationCallOrder[0]);
  });

  it("selects evidence mode and clears it after afterprint", () => {
    vi.stubGlobal("print", vi.fn());
    render(actions());

    fireEvent.click(screen.getByRole("button", { name: "Print with evidence" }));
    expect(document.documentElement.dataset.printMode).toBe("evidence");
    window.dispatchEvent(new Event("afterprint"));
    expect(document.documentElement.hasAttribute("data-print-mode")).toBe(false);
  });

  it("cleans both semantic attributes up on unmount", () => {
    vi.stubGlobal("print", vi.fn());
    const view = render(actions());
    fireEvent.click(screen.getByRole("button", { name: "Print brief" }));

    view.unmount();
    expect(document.documentElement.hasAttribute("data-print-page")).toBe(false);
    expect(document.documentElement.hasAttribute("data-print-mode")).toBe(false);
  });

  it("clears print mode and announces a synchronous print failure", () => {
    vi.stubGlobal("print", vi.fn(() => {
      throw new Error("print unavailable");
    }));
    render(actions());

    fireEvent.click(screen.getByRole("button", { name: "Print brief" }));
    expect(document.documentElement.hasAttribute("data-print-mode")).toBe(false);
    expect(screen.getByRole("status").textContent).toBe(LABELS.failure);
    expect((screen.getByRole("button", { name: "Print brief" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("digest print stylesheet", () => {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

  it("scopes light print output and shared-chrome hiding to digest pages", () => {
    expect(css).toMatch(/@page\s*{[^}]*margin:/);
    expect(css).toContain('html[data-print-page="digest"] body > header');
    expect(css).toContain('html[data-print-page="digest"] body > footer');
    expect(css).toContain('html[data-print-page="digest"] [data-site-mobile-nav]');
    expect(css).toContain("background: #ffffff !important");
    expect(css).toContain("color: #111827 !important");
  });

  it("defaults to a brief and exposes the complete appendix only in evidence mode", () => {
    expect(css).toMatch(/\[data-print="appendix"\]\s*{[\s\S]*?display: none !important/);
    expect(css).toContain('[data-print-mode="evidence"] [data-print="appendix"]');
  });

  it("wraps printed evidence and has conservative page-break rules plus an escape hatch", () => {
    expect(css).toContain('[data-print="selected-evidence"] *');
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain('[data-print="claim"]');
    expect(css).toContain('[data-print="event-summary"]');
    expect(css).toMatch(/\[data-print="event-summary"\]\s*{[^}]*break-after:\s*avoid/);
    expect(css).toContain('[data-print-break="auto"]');
  });
});

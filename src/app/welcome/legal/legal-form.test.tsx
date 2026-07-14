// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// Stub the server action so the client form has a callable reference (never invoked in these
// tests) without importing the auth/DB graph behind actions.ts.
vi.mock("./actions", () => ({ acceptAction: vi.fn(async () => ({ error: null })) }));
const { resetAnalyticsClient } = vi.hoisted(() => ({ resetAnalyticsClient: vi.fn() }));
vi.mock("@/lib/analytics/client", () => ({ resetAnalyticsClient }));

const { LegalAcceptanceForm } = await import("./legal-form");

afterEach(cleanup);

function checkboxes(): HTMLInputElement[] {
  return screen.getAllByRole("checkbox") as HTMLInputElement[];
}

describe("LegalAcceptanceForm", () => {
  it("renders two required and one optional checkbox, all initially unchecked", () => {
    render(<LegalAcceptanceForm next="/" />);
    const boxes = checkboxes();
    expect(boxes).toHaveLength(3);
    for (const b of boxes) expect(b.checked).toBe(false);
  });

  it("carries the safe next as a hidden field", () => {
    const { container } = render(<LegalAcceptanceForm next="/ask" />);
    const hidden = container.querySelector('input[type="hidden"][name="next"]') as HTMLInputElement;
    expect(hidden.value).toBe("/ask");
  });

  it("opens each document in a new tab (so opening never toggles or resets a checkbox)", () => {
    render(<LegalAcceptanceForm next="/" />);
    const terms = screen.getByRole("link", { name: "Terms of Use" });
    const privacy = screen.getByRole("link", { name: "Privacy Notice" });
    expect(terms.getAttribute("href")).toBe("/terms");
    expect(terms.getAttribute("target")).toBe("_blank");
    expect(privacy.getAttribute("href")).toBe("/privacy");
    expect(privacy.getAttribute("target")).toBe("_blank");
    // The links are <a>, not <label>s — clicking them cannot toggle a checkbox.
    expect(terms.closest("label")).toBeNull();
    expect(privacy.closest("label")).toBeNull();
  });

  it("keeps 'Accept and continue' disabled until both required boxes are checked", () => {
    render(<LegalAcceptanceForm next="/" />);
    const submit = screen.getByRole("button", { name: /Accept and continue/ }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    const adult = screen.getByRole("checkbox", { name: /at least 18/i });
    const privacy = screen.getByRole("checkbox", { name: /acknowledge that I have read/i });
    fireEvent.click(adult);
    expect(submit.disabled).toBe(true); // only one checked
    fireEvent.click(privacy);
    expect(submit.disabled).toBe(false); // both checked

    fireEvent.click(privacy); // uncheck one again → disabled again
    expect(submit.disabled).toBe(true);
  });

  it("does not require or precheck optional product analytics", () => {
    render(<LegalAcceptanceForm next="/" />);
    const optional = screen.getByRole("checkbox", { name: /Allow optional product analytics/i });
    expect((optional as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole("checkbox", { name: /at least 18/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /acknowledge that I have read/i }));
    expect((screen.getByRole("button", { name: /Accept and continue/ }) as HTMLButtonElement).disabled)
      .toBe(false);
  });

  it("immediately stops an existing client when reaccepting without analytics", () => {
    render(<LegalAcceptanceForm next="/" />);
    fireEvent.click(screen.getByRole("checkbox", { name: /at least 18/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /acknowledge that I have read/i }));
    fireEvent.click(screen.getByRole("button", { name: /Accept and continue/ }));
    expect(resetAnalyticsClient).toHaveBeenCalledOnce();
  });

  it("states the 18+ attestation and the question-storage acknowledgement", () => {
    const { container } = render(<LegalAcceptanceForm next="/" />);
    const text = container.textContent ?? "";
    expect(text).toContain("at least 18 years old");
    expect(text).toContain("stores my submitted");
    expect(text).toContain("Accept and continue");
  });
});

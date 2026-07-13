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

const { LegalAcceptanceForm } = await import("./legal-form");

afterEach(cleanup);

function checkboxes(): HTMLInputElement[] {
  return screen.getAllByRole("checkbox") as HTMLInputElement[];
}

describe("LegalAcceptanceForm", () => {
  it("renders two checkboxes, both initially UNCHECKED (no dark patterns / prechecking)", () => {
    render(<LegalAcceptanceForm next="/" />);
    const boxes = checkboxes();
    expect(boxes).toHaveLength(2);
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

  it("keeps 'Accept and continue' disabled until BOTH boxes are checked", () => {
    render(<LegalAcceptanceForm next="/" />);
    const submit = screen.getByRole("button", { name: /Accept and continue/ }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    const [adult, privacy] = checkboxes();
    fireEvent.click(adult);
    expect(submit.disabled).toBe(true); // only one checked
    fireEvent.click(privacy);
    expect(submit.disabled).toBe(false); // both checked

    fireEvent.click(privacy); // uncheck one again → disabled again
    expect(submit.disabled).toBe(true);
  });

  it("states the 18+ attestation and the question-storage acknowledgement", () => {
    const { container } = render(<LegalAcceptanceForm next="/" />);
    const text = container.textContent ?? "";
    expect(text).toContain("at least 18 years old");
    expect(text).toContain("stores my submitted");
    expect(text).toContain("Accept and continue");
  });
});

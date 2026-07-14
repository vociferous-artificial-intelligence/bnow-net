// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Stub the server action so the client form has a callable reference (never invoked in
// these tests) without importing the DB/email graph behind actions.ts.
vi.mock("./actions", () => ({ requestAccess: vi.fn(async () => ({ status: "success" })) }));

const { AccessForm } = await import("./access-form");

afterEach(cleanup);

const LABELS = {
  emailLabel: "Work email",
  linkedinLabel: "LinkedIn profile or company page",
  linkedinHint: "A linkedin.com profile or company-page URL.",
  usecaseLabel: "What do you monitor day to day?",
  usecaseHint: "A sentence or two is plenty.",
  optional: "optional",
  submit: "Request beta access",
  pending: "Submitting…",
  successTitle: "Request received",
  successBody: "Thanks — we review every request personally and will follow up by email.",
  errEmail: "Please enter a valid work email address.",
  errLinkedin: "That doesn't look like a linkedin.com URL.",
  errGeneric: "Something went wrong on our side.",
};

describe("AccessForm", () => {
  it("labels every visible field and marks email required", () => {
    render(<AccessForm labels={LABELS} />);
    const email = screen.getByLabelText(/Work email/) as HTMLInputElement;
    expect(email.required).toBe(true);
    expect(email.type).toBe("email");
    expect(email.getAttribute("autocomplete")).toBe("email");

    const linkedin = screen.getByLabelText(/LinkedIn profile or company page/) as HTMLInputElement;
    expect(linkedin.required).toBe(false);
    expect(linkedin.getAttribute("autocomplete")).toBe("url");

    const usecase = screen.getByLabelText(/What do you monitor day to day\?/) as HTMLTextAreaElement;
    expect(usecase.required).toBe(false);
    expect(usecase.maxLength).toBe(1000);
  });

  it("describes the optional fields via aria-describedby hints", () => {
    render(<AccessForm labels={LABELS} />);
    const linkedin = screen.getByLabelText(/LinkedIn profile or company page/);
    const hintId = linkedin.getAttribute("aria-describedby")!;
    expect(document.getElementById(hintId)?.textContent).toBe(LABELS.linkedinHint);
    const usecase = screen.getByLabelText(/What do you monitor day to day\?/);
    const usecaseHintId = usecase.getAttribute("aria-describedby")!;
    expect(document.getElementById(usecaseHintId)?.textContent).toBe(LABELS.usecaseHint);
  });

  it("hides the honeypot from assistive tech and the tab order", () => {
    const { container } = render(<AccessForm labels={LABELS} />);
    const hp = container.querySelector('input[name="website"]') as HTMLInputElement;
    expect(hp).toBeTruthy();
    expect(hp.tabIndex).toBe(-1);
    expect(hp.getAttribute("autocomplete")).toBe("off");
    const wrapper = hp.closest('[aria-hidden="true"]');
    expect(wrapper).toBeTruthy();
    // Visually removed (off-screen), not display:none — some bots skip hidden inputs.
    expect((wrapper as HTMLElement).className).toContain("-left-[9999px]");
  });

  it("carries only the normalized attribution fields as hidden values", () => {
    const { container } = render(
      <AccessForm
        labels={LABELS}
        attribution={{
          utmSource: "newsletter",
          utmMedium: "email",
          utmCampaign: "private-beta_01",
          landingPath: "/access",
          referrerHost: "publisher.example",
        }}
      />,
    );
    const values = Object.fromEntries(
      [...container.querySelectorAll<HTMLInputElement>('input[type="hidden"]')].map((input) => [
        input.name,
        input.value,
      ]),
    );
    expect(values).toEqual({
      utm_source: "newsletter",
      utm_medium: "email",
      utm_campaign: "private-beta_01",
      landing_path: "/access",
      referrer_host: "publisher.example",
    });
  });

  it("submit button carries the CTA copy and no error/success chrome renders initially", () => {
    render(<AccessForm labels={LABELS} />);
    expect(screen.getByRole("button", { name: LABELS.submit })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

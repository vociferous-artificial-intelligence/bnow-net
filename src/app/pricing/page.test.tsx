// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// The page must NOT redirect anymore. Spy on permanentRedirect so a regression that restores the
// redirect (which would throw NEXT_REDIRECT before any content renders) is caught explicitly.
const permanentRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  permanentRedirect: (...a: unknown[]) => permanentRedirect(...a),
}));

import PricingPage, { metadata } from "./page";

afterEach(() => {
  cleanup();
  permanentRedirect.mockReset();
});

function text(): string {
  return render(PricingPage()).container.textContent ?? "";
}

describe("/pricing (Paddle verification pricing & refunds page)", () => {
  it("renders a real page with main#main and an H1 containing 'Pricing & Refunds'", () => {
    const { container } = render(PricingPage());
    expect(container.querySelector("main#main")).toBeTruthy();
    expect(container.querySelector("h1")?.textContent).toContain("Pricing & Refunds");
  });

  it("no longer redirects — permanentRedirect is never invoked", () => {
    render(PricingPage());
    expect(permanentRedirect).not.toHaveBeenCalled();
  });

  it("identifies BNOW.NET as a subscription OSINT / data-intelligence service for professionals", () => {
    const t = text();
    expect(t).toContain("subscription OSINT and data-intelligence service");
    expect(t).toContain("analysts, risk teams, journalists, and professional desks");
  });

  it("describes the conservative deliverables for the live theaters", () => {
    const t = text();
    expect(t).toContain("Source-linked conflict-monitoring digests");
    expect(t).toContain("evidence-linked Ask");
    expect(t).toContain("validation");
    expect(t).toContain("uncertainty labels");
    // The live theaters, named — no unsupported theaters promised.
    expect(t).toContain("Russia, Ukraine, and Iran");
  });

  it("renders both plan names and their exact USD prices", () => {
    const t = text();
    expect(t).toContain("Standby");
    expect(t).toContain("$400");
    expect(t).toContain("Full analyst");
    expect(t).toContain("$3,000");
    expect(t).toContain("$19,800");
  });

  it("shows the annual equivalent monthly figure", () => {
    expect(text()).toContain("$1,650");
  });

  it("states prices are USD and that taxes may be added at checkout", () => {
    const t = text();
    expect(t).toContain("United States dollars (USD)");
    expect(t).toMatch(/taxes may be added at checkout/i);
  });

  it("renders a substantial local refund & cancellation section (not just an outbound link)", () => {
    const { container } = render(PricingPage());
    const t = container.textContent ?? "";
    expect(container.querySelector("#refunds")).toBeTruthy();
    expect(t).toContain("Refund and cancellation policy");
    expect(t).toContain("merchant of record");
    expect(t).toMatch(/non-refundable/i);
    expect(t).toContain("14 days");
    expect(t).toMatch(/cancel a recurring subscription/i);
    expect(t).toMatch(/end of the current paid billing period/i);
  });

  it("links to Terms, Privacy, access request, Paddle's refund policy, Paddle buyer support, and the BNOW contact", () => {
    const { container } = render(PricingPage());
    expect(container.querySelector('a[href="/terms"]')).toBeTruthy();
    expect(container.querySelector('a[href="/privacy"]')).toBeTruthy();
    expect(container.querySelector('a[href="/access"]')).toBeTruthy();
    expect(
      container.querySelector('a[href="https://www.paddle.com/legal/refund-policy"]'),
    ).toBeTruthy();
    expect(container.querySelector('a[href="https://paddle.net"]')).toBeTruthy();
    expect(container.querySelector('a[href="mailto:go@vociferous.nyc"]')).toBeTruthy();
  });

  it("configures external links safely (new tab, noopener noreferrer)", () => {
    const { container } = render(PricingPage());
    const paddle = container.querySelector<HTMLAnchorElement>(
      'a[href="https://www.paddle.com/legal/refund-policy"]',
    )!;
    expect(paddle.getAttribute("target")).toBe("_blank");
    expect(paddle.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("states that requesting access does not create a paid subscription", () => {
    expect(text()).toMatch(/does not create a paid subscription/i);
  });

  it("exposes descriptive metadata about pricing and refunds", () => {
    expect(String(metadata.title)).toContain("Pricing & Refunds");
    expect(String(metadata.description)).toMatch(/subscription/i);
    expect(String(metadata.description)).toMatch(/refund/i);
  });

  it("makes NO customer source-registry access promise", () => {
    // The source registry is admin-only (R5, 2026-07-12); a paid plan must not advertise it.
    expect(text().toLowerCase()).not.toContain("registry");
  });

  it("renders NO checkout or payment form — verification copy only, no store", () => {
    const { container } = render(PricingPage());
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
    const t = (container.textContent ?? "").toLowerCase();
    for (const phrase of ["buy now", "add to cart", "checkout now", "pay now", "subscribe now"]) {
      expect(t).not.toContain(phrase);
    }
  });

  it("does not create a second footer landmark (the global SiteFooter is the only footer)", () => {
    const { container } = render(PricingPage());
    expect(container.querySelector("footer")).toBeNull();
  });
});

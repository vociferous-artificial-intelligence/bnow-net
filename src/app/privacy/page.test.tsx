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

import PrivacyPage, { metadata } from "./page";

afterEach(cleanup);

describe("/privacy (public Privacy Notice)", () => {
  it("renders without authentication (no session dependency, no DB query)", () => {
    const { container } = render(PrivacyPage());
    // A page-level main with the skip-link target.
    expect(container.querySelector("main#main")).toBeTruthy();
    expect(container.querySelector("h1")?.textContent).toBe("Privacy Notice");
  });

  it("shows the version and effective date prominently", () => {
    const { container } = render(PrivacyPage());
    const text = container.textContent ?? "";
    expect(text).toContain("Version 1.2");
    expect(text).toContain("July 15, 2026");
  });

  it("explicitly states that Ask questions are STORED", () => {
    const text = render(PrivacyPage()).container.textContent ?? "";
    expect(text).toContain("stores the text of submitted Ask questions");
  });

  it("does NOT claim questions or emails are anonymous/pseudonymous/ephemeral", () => {
    const text = (render(PrivacyPage()).container.textContent ?? "").toLowerCase();
    for (const forbidden of ["anonymous", "pseudonymous", "ephemeral"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("documents identified opt-in PostHog analytics and its strict exclusions", () => {
    const text = render(PrivacyPage()).container.textContent ?? "";
    expect(text).toContain("explicitly grants permission");
    expect(text).toContain("internal random account UUID");
    expect(text).toContain("does not send Ask or Search text");
    expect(text).toContain("Session replay, heatmaps, broad autocapture");
  });

  it("states the live analytics posture accurately (WS1): active-only, US region, GeoIP, 7-year retention, no false 'activation pending'", () => {
    const text = render(PrivacyPage()).container.textContent ?? "";
    // the analytics are LIVE, not "pending" — the stale claim must be gone
    expect(text).not.toContain("activation is pending");
    expect(text).not.toContain("Activation remains pending");
    expect(text).not.toContain("pending a dedicated");
    // active only for opted-in, accepted, signed-in adults
    expect(text).toContain("active only for a signed-in adult user");
    // verified processing region
    expect(text).toContain("hosted in the United States");
    // GeoIP-derived coarse location disclosure (raw IP discarded)
    expect(text).toContain("does not store the raw connection IP address");
    expect(text).toContain("city- and postal-level location");
    // verified retention setting
    expect(text).toContain("seven years");
  });

  it("links to the Terms of Use and exposes the legal contact as a mailto", () => {
    const { container } = render(PrivacyPage());
    expect(container.querySelector('a[href="/terms"]')).toBeTruthy();
    expect(container.querySelector('a[href="mailto:go@vociferous.nyc"]')).toBeTruthy();
  });

  it("exposes descriptive metadata", () => {
    expect(String(metadata.title)).toContain("Privacy Notice");
    expect(String(metadata.description ?? "")).toContain("Ask questions");
  });
});

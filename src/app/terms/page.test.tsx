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

import TermsPage, { metadata } from "./page";

afterEach(cleanup);

function text(): string {
  return render(TermsPage()).container.textContent ?? "";
}

describe("/terms (public Terms of Use)", () => {
  it("renders without authentication, with a main#main and the correct heading", () => {
    const { container } = render(TermsPage());
    expect(container.querySelector("main#main")).toBeTruthy();
    expect(container.querySelector("h1")?.textContent).toBe("Terms of Use");
  });

  it("shows the version and effective date prominently", () => {
    const t = text();
    expect(t).toContain("Version 1.1");
    expect(t).toContain("July 16, 2026");
  });

  it("states the named-person source-attribution / non-endorsement rule (§9, Terms 1.1)", () => {
    const t = text();
    expect(t).toContain("cited open sources identified that person");
    expect(t).toMatch(/not BNOW’s endorsement, accusation, opinion, or independent assertion/);
  });

  it("contains the AI / OSINT limitations", () => {
    const t = text();
    expect(t).toContain("BNOW is an analytical aid");
    expect(t).toContain("Open-source reporting can be false");
    expect(t).toContain("reliability");
  });

  it("permits limited screenshot / link sharing", () => {
    const t = text();
    expect(t).toContain("screenshots or short excerpts");
    expect(t).toContain("Links to publicly accessible BNOW pages");
  });

  it("prohibits bulk reconstruction and hidden-prompt / restricted-data extraction", () => {
    const t = text();
    expect(t).toContain("reconstruct"); // reconstruct BNOW's underlying database…
    expect(t).toContain("underlying database");
    expect(t).toContain("non-public system prompts");
    expect(t).toContain("restricted source-registry data");
    // and the competing-model training prohibition
    expect(t).toContain("competing model");
  });

  it("cross-links to the Privacy Notice and exposes the legal contact as a mailto", () => {
    const { container } = render(TermsPage());
    expect(container.querySelector('a[href="/privacy"]')).toBeTruthy();
    expect(container.querySelector('a[href="mailto:go@vociferous.nyc"]')).toBeTruthy();
  });

  it("exposes a Terms of Use metadata title", () => {
    expect(String(metadata.title)).toContain("Terms of Use");
  });
});

// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteFooterView, type FooterLabels } from "./site-footer-view";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const pathnameMock = vi.fn<() => string>();
vi.mock("next/navigation", () => ({ usePathname: () => pathnameMock() }));

const LABELS: FooterLabels = {
  navLabel: "Legal and site links",
  disclaimer: "OSINT data intelligence disclaimer",
  privacy: "Privacy Notice",
  terms: "Terms of Use",
  status: "status",
  contact: "Contact",
};

afterEach(() => {
  cleanup();
  pathnameMock.mockReset();
});

describe("SiteFooterView (global footer)", () => {
  it("renders the legal + status + contact links on an ordinary page", () => {
    pathnameMock.mockReturnValue("/pricing");
    const { container } = render(<SiteFooterView labels={LABELS} />);
    expect(container.querySelector("footer")).toBeTruthy();
    expect(container.querySelector('a[href="/privacy"]')).toBeTruthy();
    expect(container.querySelector('a[href="/terms"]')).toBeTruthy();
    expect(container.querySelector('a[href="/health"]')).toBeTruthy();
    expect(container.querySelector('a[href="mailto:go@vociferous.nyc"]')).toBeTruthy();
  });

  it("renders a SINGLE footer landmark (no duplicate) on the home route", () => {
    pathnameMock.mockReturnValue("/");
    const { container } = render(<SiteFooterView labels={LABELS} />);
    // The home page no longer carries its own <footer>; only this global one renders.
    expect(container.querySelectorAll("footer")).toHaveLength(1);
  });

  it("suppresses itself on the admin surface (its own chrome)", () => {
    pathnameMock.mockReturnValue("/admin/queue");
    const { container } = render(<SiteFooterView labels={LABELS} />);
    expect(container.querySelector("footer")).toBeNull();
  });
});

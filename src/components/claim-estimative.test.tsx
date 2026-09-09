// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { makeT } from "@/i18n/dictionaries";
import { ClaimEstimative, claimEstimativeLabels } from "./claim-estimative";
import type { ClaimSourceDoc } from "./claim-evidence-model";

afterEach(cleanup);

const labels = claimEstimativeLabels(makeT("en"));

function doc(id: number, overrides: Partial<ClaimSourceDoc> = {}): ClaimSourceDoc {
  return {
    docId: id,
    url: `https://source${id}.example/item`,
    title: `Title ${id}`,
    adapter: "rss",
    sourceId: id,
    sourceName: `Source ${id}`,
    sourceKey: `source${id}.example`,
    sourceDomain: `source${id}.example`,
    platform: "news",
    reliability: 0.9,
    publishedAt: "2026-07-01T12:00:00Z",
    firstSeenAt: "2026-07-01T13:00:00Z",
    ...overrides,
  };
}

function text(node: HTMLElement): string {
  return node.querySelector('[data-testid="claim-estimative"]')!.textContent!;
}

describe("ClaimEstimative", () => {
  it("renders the band with its percentage range and the confidence, both labelled", () => {
    const { container } = render(
      <ClaimEstimative hedging="confirmed" docs={[doc(1)]} labels={labels} />,
    );
    expect(text(container)).toBe(
      "Likelihood (ICD 203): likely (55–80%) · Corroboration-derived confidence: moderate",
    );
  });

  it("NEVER says analyst confidence — the honesty constraint, on the visible label", () => {
    const { container } = render(
      <ClaimEstimative hedging="claimed" docs={[doc(1), doc(2)]} labels={labels} />,
    );
    const node = container.querySelector('[data-testid="claim-estimative"]')!;
    expect(node.textContent).toContain("Corroboration-derived confidence");
    expect(node.textContent?.toLocaleLowerCase()).not.toContain("analyst confidence");
    expect(node.innerHTML.toLocaleLowerCase()).not.toContain("analyst");
  });

  it("keeps the numeric range so a PHIA reader can map it, and relabels nothing", () => {
    // two channels on two platforms = C3; claimed x C3 = likely 55-80 / moderate
    const { container } = render(
      <ClaimEstimative
        hedging="claimed"
        docs={[doc(1), doc(2, { adapter: "telegram", sourceId: 2 })]}
        labels={labels}
      />,
    );
    expect(text(container)).toContain("likely (55–80%)");
    // no PHIA vocabulary is emitted — their bands differ and we do not convert
    expect(text(container).toLocaleLowerCase()).not.toContain("phia");
    expect(text(container).toLocaleLowerCase()).not.toContain("probable");
  });

  it("stamps the mapping version and carries the derivation in the title", () => {
    const { container } = render(
      <ClaimEstimative hedging="unverified" docs={[doc(1)]} labels={labels} />,
    );
    const node = container.querySelector('[data-testid="claim-estimative"]')!;
    expect(node.getAttribute("data-estimative-version")).toBe("estimative-map-v1");
    const title = node.getAttribute("title")!;
    expect(title).toContain("Derived from");
    expect(title).toContain('"unverified"');
    expect(title).toContain("corroboration tier C0");
    expect(title).toContain("estimative-map-v1");
  });

  it("renders `not assessable` on both axes rather than a band when there is no evidence", () => {
    const { container } = render(
      <ClaimEstimative hedging="confirmed" docs={[]} labels={labels} />,
    );
    expect(text(container)).toBe(
      "Likelihood (ICD 203): not assessable · Corroboration-derived confidence: not assessable",
    );
  });

  it("renders no reliability score and no raw confidence decimal (T3-a)", () => {
    const { container } = render(
      <ClaimEstimative hedging="confirmed" docs={[doc(1, { reliability: 0.91 })]} labels={labels} />,
    );
    const node = container.querySelector('[data-testid="claim-estimative"]')!;
    expect(node.textContent).not.toContain("0.9");
    expect(node.innerHTML).not.toMatch(/0\.\d/);
  });

  it("falls back to `unknown` for an out-of-enum hedging value rather than blanking", () => {
    const { container } = render(
      <ClaimEstimative hedging="probably-ish" docs={[doc(1)]} labels={labels} />,
    );
    expect(text(container)).toBe(
      "Likelihood (ICD 203): roughly even chance (45–55%) · Corroboration-derived confidence: low",
    );
  });

  it("prints in a saved PDF — the analyst artifact is where the band matters most", () => {
    const { container } = render(
      <ClaimEstimative hedging="confirmed" docs={[doc(1)]} labels={labels} />,
    );
    // data-print="hide" is the opt-OUT marker used across the digest page; the
    // estimative line must not carry it.
    const node = container.querySelector('[data-testid="claim-estimative"]')!;
    expect(node.getAttribute("data-print")).toBe("estimative");
  });
});

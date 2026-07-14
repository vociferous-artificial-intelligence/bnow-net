// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { makeT } from "@/i18n/dictionaries";
import type { ClaimSourceDoc } from "@/components/claim-evidence-model";
import { makeClaimEvidenceLabels } from "@/components/claim-evidence-labels";
import { claimCopyLabels } from "@/components/claim-copy-model";
import { AskResult, type AskResultLike, type ResolvedClaim } from "./ask-result";

const t = makeT("en");
const chromeProps = {
  locale: "en" as const,
  evidenceLabels: makeClaimEvidenceLabels(t),
  copyLabels: claimCopyLabels(t),
};

afterEach(cleanup);

function baseResult(overrides: Partial<AskResultLike> = {}): AskResultLike {
  return {
    answer: "Some answer citing evidence [c1] [c2].",
    citedClaimIds: [1, 2],
    evidenceCount: 5,
    provider: "openai:gpt-4o-mini",
    ...overrides,
  };
}

const evidenceDoc: ClaimSourceDoc = {
  docId: 101,
  url: "https://example.com/report",
  title: "Source report",
  adapter: "rss",
  sourceId: 11,
  sourceName: "Example News",
  sourceKey: "example.com",
  sourceDomain: "example.com",
  platform: "news",
  reliability: 0.84,
  publishedAt: "2026-06-30T22:00:00Z",
  firstSeenAt: "2026-06-30T22:05:00Z",
};

const claim = (id: number, text: string, digestDate: string | null = "2026-07-01"): ResolvedClaim => ({
  id,
  text,
  hedging: "assessed",
  iso2: "ru",
  countryName: "Russia",
  digestDate,
  copyPayload: {
    claimId: id,
    text,
    hedging: "assessed",
    asOf: digestDate ? "Jul 1, 2026" : null,
    countryName: "Russia",
    countryIso2: "ru",
    claimUrl: digestDate ? `https://bnow.net/digests/ru/${digestDate}#c${id}` : null,
    docs: [evidenceDoc],
    showScores: true,
  },
});

describe("answered state", () => {
  it("renders the answer text and the cited-evidence list", () => {
    render(
      <AskResult
        result={baseResult()}
        cited={[claim(1, "claim one"), claim(2, "claim two", null)]}
        related={[]}
        t={t} {...chromeProps}
      />,
    );
    expect(screen.getByText(/Some answer citing evidence/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Cited evidence" })).toBeTruthy();
    expect(screen.getByText("claim one")).toBeTruthy();
    expect(screen.getByText("claim two")).toBeTruthy();
    expect(screen.getByText("c1")).toBeTruthy();
    expect(screen.getByText("c2")).toBeTruthy();
    expect(screen.getAllByText("View evidence trail (1)")).toHaveLength(2);
    // The second claim has no owning digest, so it deliberately offers text-only
    // copy rather than fabricating a canonical citation.
    expect(screen.getAllByRole("button", { name: "Copy for report" })).toHaveLength(1);
    expect(document.querySelectorAll('[data-copy-surface="ask_cited"]')).toHaveLength(2);
    // no v2 chrome for a plain answered result
    expect(screen.queryByRole("heading", { name: "Related claims" })).toBeNull();
  });
});

describe("insufficient state", () => {
  it("shows the answer text plus the quiet insufficient-evidence callout", () => {
    render(
      <AskResult
        result={baseResult({
          state: "insufficient",
          answer: "No matching evidence in the current dataset.",
          citedClaimIds: [],
          evidenceCount: 0,
        })}
        cited={[]}
        related={[]}
        t={t} {...chromeProps}
      />,
    );
    expect(screen.getByText("No matching evidence in the current dataset.")).toBeTruthy();
    expect(
      screen.getByText(
        "No sufficient evidence in the covered corpus — try narrowing to a country, actor, or event type.",
      ),
    ).toBeTruthy();
  });

  it("derives insufficient from evidenceCount 0 on a legacy-shaped payload with no state field", () => {
    render(
      <AskResult
        result={baseResult({ citedClaimIds: [], evidenceCount: 0 })}
        cited={[]}
        related={[]}
        t={t} {...chromeProps}
      />,
    );
    expect(
      screen.getByText(
        "No sufficient evidence in the covered corpus — try narrowing to a country, actor, or event type.",
      ),
    ).toBeTruthy();
  });
});

describe("no-coverage callout (W1)", () => {
  it("renders the distinct no-coverage callout when the window is entirely beyond currency", () => {
    render(
      <AskResult
        result={baseResult({
          state: "insufficient",
          // neutral answer body so callout assertions don't collide with the answer text
          answer: "The requested period is in the future.",
          citedClaimIds: [],
          evidenceCount: 0,
          window: { from: "2026-07-13", to: "2026-07-20", matchedPhrase: "next week" },
          dataCurrentThrough: "2026-07-11",
        })}
        cited={[]}
        related={[]}
        t={t} {...chromeProps}
      />,
    );
    // full callout in one node (the window-echo line also carries the dates, so an
    // over-broad date regex would match two elements — match the whole sentence).
    expect(
      screen.getByText(/No claims yet cover 2026-07-13.2026-07-20\. Data current through 2026-07-11\./),
    ).toBeTruthy();
    // the generic insufficient copy must NOT also render
    expect(screen.queryByText(/covered corpus/)).toBeNull();
  });

  it("renders a single from-date (no range) when from == to", () => {
    render(
      <AskResult
        result={baseResult({
          state: "insufficient",
          answer: "The requested day is in the future.",
          citedClaimIds: [],
          evidenceCount: 0,
          window: { from: "2026-07-20", to: "2026-07-20", matchedPhrase: "on july 20" },
          dataCurrentThrough: "2026-07-11",
        })}
        cited={[]}
        related={[]}
        t={t} {...chromeProps}
      />,
    );
    expect(screen.getByText(/No claims yet cover 2026-07-20\. Data current through 2026-07-11\./)).toBeTruthy();
  });

  it("shows currency on a generic insufficient result too (window straddles / no window)", () => {
    render(
      <AskResult
        result={baseResult({
          state: "insufficient",
          answer: "No matching evidence in the current dataset.",
          citedClaimIds: [],
          evidenceCount: 0,
          window: null,
          dataCurrentThrough: "2026-07-11",
        })}
        cited={[]}
        related={[]}
        t={t} {...chromeProps}
      />,
    );
    // generic callout AND the freshness-honest currency line
    expect(screen.getByText(/covered corpus.*Data current through 2026-07-11\./)).toBeTruthy();
    expect(screen.queryByText(/No claims yet cover/)).toBeNull();
  });

  it("shows no currency line when dataCurrentThrough is absent (legacy shape)", () => {
    render(
      <AskResult
        result={baseResult({
          state: "insufficient",
          answer: "No matching evidence in the current dataset.",
          citedClaimIds: [],
          evidenceCount: 0,
        })}
        cited={[]}
        related={[]}
        t={t} {...chromeProps}
      />,
    );
    expect(
      screen.getByText(
        "No sufficient evidence in the covered corpus — try narrowing to a country, actor, or event type.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Data current through/)).toBeNull();
  });
});

describe("refused state", () => {
  it("renders only the refusal callout, never the bare placeholder answer text", () => {
    render(
      <AskResult
        result={baseResult({ state: "refused", answer: "(no answer)", citedClaimIds: [], evidenceCount: 5 })}
        cited={[]}
        related={[]}
        t={t} {...chromeProps}
      />,
    );
    expect(
      screen.getByText("The model declined to answer this phrasing — rewording usually resolves it."),
    ).toBeTruthy();
    expect(screen.queryByText("(no answer)")).toBeNull();
  });
});

describe("limit and error states", () => {
  it("renders the answer text plainly for provider 'limit', no callout", () => {
    render(
      <AskResult
        result={baseResult({
          provider: "limit",
          answer: "Daily question limit reached (20/day).",
          citedClaimIds: [],
          evidenceCount: 0,
        })}
        cited={[]}
        related={[]}
        t={t} {...chromeProps}
      />,
    );
    expect(screen.getByText("Daily question limit reached (20/day).")).toBeTruthy();
    expect(screen.queryByText(/covered corpus/)).toBeNull();
  });

  it("renders the answer text plainly for an explicit 'error' state, no callout", () => {
    render(
      <AskResult
        result={baseResult({ state: "error", answer: "Query failed: timeout. Evidence was retrieved; try again." })}
        cited={[]}
        related={[]}
        t={t} {...chromeProps}
      />,
    );
    expect(screen.getByText(/Query failed: timeout/)).toBeTruthy();
    expect(screen.queryByText(/covered corpus/)).toBeNull();
    expect(screen.queryByText(/declined to answer/)).toBeNull();
  });
});

describe("sampled disclosure", () => {
  it("shows the sampled count above the answer when sampled is true", () => {
    render(
      <AskResult
        result={baseResult({ sampled: true, totalMatching: 137 })}
        cited={[]}
        related={[]}
        t={t} {...chromeProps}
      />,
    );
    expect(screen.getByText(/Evidence sampled from/)).toBeTruthy();
    expect(screen.getByText(/137/)).toBeTruthy();
    expect(screen.getByText(/matching claims — see the digest for full coverage\./)).toBeTruthy();
  });

  it("shows nothing when sampled is absent (legacy shape)", () => {
    render(<AskResult result={baseResult()} cited={[]} related={[]} t={t} {...chromeProps} />);
    expect(screen.queryByText(/Evidence sampled from/)).toBeNull();
  });
});

describe("window echo", () => {
  it("echoes a bounded range: from X to Y", () => {
    render(
      <AskResult
        result={baseResult({
          window: { from: "2026-07-01", to: "2026-07-10", matchedPhrase: "last week" },
        })}
        cited={[]}
        related={[]}
        t={t} {...chromeProps}
      />,
    );
    expect(screen.getByText("Searched claims from 2026-07-01 to 2026-07-10")).toBeTruthy();
  });

  it("echoes an open-ended since-only window", () => {
    render(
      <AskResult
        result={baseResult({
          window: { from: "2026-07-01", matchedPhrase: "since july 1" },
        })}
        cited={[]}
        related={[]}
        t={t} {...chromeProps}
      />,
    );
    expect(screen.getByText("Searched claims since 2026-07-01")).toBeTruthy();
    expect(screen.queryByText(/to 2026/)).toBeNull();
  });

  it("echoes an open-ended through-only window", () => {
    render(
      <AskResult
        result={baseResult({
          window: { to: "2026-07-10", matchedPhrase: "until july 10" },
        })}
        cited={[]}
        related={[]}
        t={t} {...chromeProps}
      />,
    );
    expect(screen.getByText("Searched claims through 2026-07-10")).toBeTruthy();
  });

  it("renders no echo when window is null (legacy shape)", () => {
    render(<AskResult result={baseResult({ window: null })} cited={[]} related={[]} t={t} {...chromeProps} />);
    expect(screen.queryByText(/Searched claims/)).toBeNull();
  });
});

describe("related claims block", () => {
  it("renders a Related claims heading and list when relatedClaimIds resolve", () => {
    render(
      <AskResult
        result={baseResult({ relatedClaimIds: [3, 4] })}
        cited={[claim(1, "claim one"), claim(2, "claim two")]}
        related={[claim(3, "related one"), claim(4, "related two")]}
        t={t} {...chromeProps}
      />,
    );
    const heading = screen.getByRole("heading", { name: "Related claims" });
    expect(heading).toBeTruthy();
    expect(screen.getByText("related one")).toBeTruthy();
    expect(screen.getByText("related two")).toBeTruthy();
  });

  it("omits the Related claims block when relatedClaimIds is empty", () => {
    render(
      <AskResult
        result={baseResult({ relatedClaimIds: [] })}
        cited={[claim(1, "claim one")]}
        related={[]}
        t={t} {...chromeProps}
      />,
    );
    expect(screen.queryByRole("heading", { name: "Related claims" })).toBeNull();
  });

  it("omits the Related claims block on a legacy-shaped payload (no relatedClaimIds field)", () => {
    render(<AskResult result={baseResult()} cited={[claim(1, "claim one")]} related={[]} t={t} {...chromeProps} />);
    expect(screen.queryByRole("heading", { name: "Related claims" })).toBeNull();
  });
});

describe("digest deep link (W3)", () => {
  it("links straight to the claim anchor, not the top of the digest page", () => {
    render(
      <AskResult
        result={baseResult()}
        cited={[claim(123, "claim with a date", "2026-07-11")]}
        related={[]}
        t={t} {...chromeProps}
      />,
    );
    const link = screen.getByRole("link", { name: "digest →" });
    expect(link.getAttribute("href")).toBe("/digests/ru/2026-07-11#c123");
  });

  it("renders no digest link for an undated claim", () => {
    render(
      <AskResult
        result={baseResult()}
        cited={[claim(124, "claim with no date", null)]}
        related={[]}
        t={t} {...chromeProps}
      />,
    );
    expect(screen.queryByRole("link", { name: "digest →" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy for report" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
    expect(screen.getByRole("button", { name: "Copy text only", hidden: true })).toBeTruthy();
  });
});

describe("legacy-shape input", () => {
  it("renders exactly like today when no v2 fields are present at all", () => {
    // A bare object matching today's AskAnswer (answer/citedClaimIds/evidenceCount/
    // terms/provider) — no state, relatedClaimIds, window, totalMatching or sampled.
    const legacy: AskResultLike = {
      answer: "Top matching evidence:\n• claim one [c1]",
      citedClaimIds: [1],
      evidenceCount: 3,
      provider: "stub",
    };
    render(<AskResult result={legacy} cited={[claim(1, "claim one")]} related={[]} t={t} {...chromeProps} />);
    expect(screen.getByText(/Top matching evidence/)).toBeTruthy();
    expect(screen.getByText("3 evidence rows · 1 cited · stub")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Cited evidence" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Related claims" })).toBeNull();
    expect(screen.queryByText(/Evidence sampled from/)).toBeNull();
    expect(screen.queryByText(/Searched claims/)).toBeNull();
    expect(screen.queryByText(/covered corpus/)).toBeNull();
  });
});

describe("answer body word wrapping (390px audit, 2026-07-13)", () => {
  it("breaks long unbroken tokens so the answer can never widen the document", () => {
    const { container } = render(
      <AskResult result={baseResult({ answer: "See https://example.com/" + "a".repeat(300) })} cited={[]} related={[]} t={t} {...chromeProps} />,
    );
    const body = Array.from(container.querySelectorAll("div")).find((d) =>
      d.className.includes("whitespace-pre-wrap"),
    );
    expect(body?.className).toContain("break-words");
  });
});

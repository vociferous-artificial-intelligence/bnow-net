import { describe, expect, it } from "vitest";
import {
  buildClaimCopyContent,
  canCopyClaimCitation,
  canCopyIcs206Citation,
  citationButtonLabel,
  escapeClaimCopyHtml,
  type ClaimCopyLabels,
  type ClaimCopyPayload,
} from "./claim-copy-model";
import type { ClaimSourceDoc } from "./claim-evidence-model";

export const copyLabels: ClaimCopyLabels = {
  copyForReport: "Copy for report", moreCopyOptions: "More copy options", copyLink: "Copy link",
  copyWithEvidence: "Copy with evidence", copyTextOnly: "Copy text only", copying: "Copying…",
  copyCitation: "Copy source citation", copyCitationConformant: "Copy ICS 206-01 citation",
  reportCopied: "Report copied", linkCopied: "Link copied", evidenceCopied: "Evidence copied",
  textCopied: "Text copied", citationCopied: "Citation copied",
  copyFailed: "Copy failed", statusLabel: "Status", asOfLabel: "As of",
  likelihoodLabel: "Likelihood (ICD 203)", confidenceLabel: "Corroboration-derived confidence",
  evidenceLabel: "Evidence", sourceLabel: "Source", sourceValue: "BNOW.NET, {country} Daily Digest, claim c{claimId}",
  linkedSummary: "{docs} linked documents · {channels} channels · {platforms} platforms",
  evidenceListLabel: "Evidence list", publishedLabel: "Published",
  platformLabel: "Platform", reliabilityLabel: "Reliability", unknown: "Unknown",
  statuses: { confirmed: "Confirmed", assessed: "Assessed", claimed: "Claimed", unverified: "Unverified", unknown: "Unknown" },
  platforms: { rss_news: "News", gdelt: "GDELT", telegram: "Telegram", x: "X", procurement: "Procurement" },
};

export function copyDoc(id: number, overrides: Partial<ClaimSourceDoc> = {}): ClaimSourceDoc {
  return {
    docId: id, url: `https://source${id}.example/item`, title: `Title ${id}`, adapter: "rss",
    sourceId: id, sourceName: `Source ${id}`, sourceKey: `source${id}.example`, sourceDomain: `source${id}.example`,
    platform: "state_media", reliability: 0.5, publishedAt: `2026-07-0${id}T12:00:00Z`,
    firstSeenAt: `2026-07-0${id}T13:00:00Z`, ...overrides,
  };
}

export function copyPayload(overrides: Partial<ClaimCopyPayload> = {}): ClaimCopyPayload {
  return {
    claimId: 4762,
    text: "Ukraine and partners formed a coalition.",
    hedging: "confirmed",
    asOf: "13 July 2026",
    countryName: "Russia",
    countryIso2: "ru",
    claimUrl: "https://bnow.net/digests/ru/2026-07-13#c4762",
    docs: [copyDoc(1), copyDoc(2)],
    showScores: true,
    ...overrides,
  };
}

describe("claim report copy", () => {
  it("builds the exact attribution-safe report payload", () => {
    const content = buildClaimCopyContent(copyPayload(), "report", copyLabels, "en")!;
    expect(content.plain).toBe(
      "Ukraine and partners formed a coalition.\n" +
        "Status: Confirmed · As of: 13 July 2026\n" +
        // WS-7.4: the estimative clause sits on the status line's own row.
        // 2 docs / 2 channels / 1 platform = tier C2; confirmed x C2 =
        // very likely 80-95 / moderate in the signed ESTIMATIVE_MAP_V1.
        "Likelihood (ICD 203): very likely (80–95%) · " +
        "Corroboration-derived confidence: moderate\n" +
        "Evidence: 2 linked documents · 2 channels · 1 platforms\n" +
        "Source: BNOW.NET, Russia Daily Digest, claim c4762\n" +
        "https://bnow.net/digests/ru/2026-07-13#c4762",
    );
    expect(content.html).toContain("<strong>Status:</strong> Confirmed");
    expect(content.html).toContain(
      "Likelihood (ICD 203): very likely (80–95%) · Corroboration-derived confidence: moderate<br>",
    );
    expect(content.html).toContain('href="https://bnow.net/digests/ru/2026-07-13#c4762"');
    expect(content.plain).not.toContain("provider");
    expect(content.plain).not.toContain("docId");
  });

  it("escapes rich HTML without changing plain source/claim strings", () => {
    const payload = copyPayload({ text: `<img src=x onerror="bad"> & claim`, countryName: "R&<" });
    const content = buildClaimCopyContent(payload, "report", copyLabels, "en")!;
    expect(content.plain).toContain(`<img src=x onerror="bad"> & claim`);
    expect(content.html).toContain("&lt;img src=x onerror=&quot;bad&quot;&gt; &amp; claim");
    expect(content.html).not.toContain("<img");
    expect(escapeClaimCopyHtml("'\"<&>")).toBe("&#39;&quot;&lt;&amp;&gt;");
  });

  it("refuses citation-bearing modes when date or canonical HTTP(S) link is absent", () => {
    for (const payload of [
      copyPayload({ asOf: null }),
      copyPayload({ claimUrl: "javascript:alert(1)" }),
      copyPayload({ claimUrl: null }),
      copyPayload({ claimUrl: "http://localhost:3000/digests/ru/2026-07-13#c4762" }),
      copyPayload({ claimUrl: "https://bnow-git-preview.vercel.app/digests/ru/2026-07-13#c4762" }),
      copyPayload({ claimUrl: "https://bnow.net/digests/ru/2026-07-13?profile=desk#c4762" }),
    ]) {
      expect(canCopyClaimCitation(payload)).toBe(false);
      expect(buildClaimCopyContent(payload, "report", copyLabels, "en")).toBeNull();
      expect(buildClaimCopyContent(payload, "link", copyLabels, "en")).toBeNull();
      expect(buildClaimCopyContent(payload, "evidence", copyLabels, "en")).toBeNull();
      expect(buildClaimCopyContent(payload, "text", copyLabels, "en")?.plain).toBe(payload.text);
    }
  });
});

describe("claim evidence copy", () => {
  it("includes every document once in canonical oldest-published order, independent of UI", () => {
    const payload = copyPayload({
      docs: [
        copyDoc(3, { sourceName: "Unknown time", publishedAt: null, url: "javascript:bad" }),
        copyDoc(2, { sourceName: "Later", publishedAt: "2026-07-02T12:00:00Z" }),
        copyDoc(1, { sourceName: "Earlier <safe>", publishedAt: "2026-07-01T12:00:00Z" }),
      ],
    });
    const content = buildClaimCopyContent(payload, "evidence", copyLabels, "en")!;
    expect(content.plain.indexOf("Earlier <safe>")).toBeLessThan(content.plain.indexOf("Later"));
    expect(content.plain.indexOf("Later")).toBeLessThan(content.plain.indexOf("Unknown time"));
    expect(content.plain.match(/Earlier <safe>/g)).toHaveLength(1);
    // A copied claim goes into someone else's report — an undated document says so
    // rather than passing off our fetch time as the publication date.
    expect(content.plain).toContain("Published: Unknown");
    expect(content.plain).not.toContain("First seen");
    expect(content.html).not.toContain("First seen");
    expect(content.plain).not.toContain("javascript:bad");
    expect(content.html).toContain("Earlier &lt;safe&gt;");
    expect(content.html).not.toContain("javascript:bad");
  });

  it("omits reliability entirely when policy disallows it", () => {
    const content = buildClaimCopyContent(copyPayload({ showScores: false }), "evidence", copyLabels, "en")!;
    expect(content.plain).not.toContain("Reliability");
    expect(content.html).not.toContain("Reliability");
  });

  it("keeps link and text modes exact", () => {
    const payload = copyPayload();
    expect(buildClaimCopyContent(payload, "link", copyLabels, "en")?.plain).toBe(payload.claimUrl);
    expect(buildClaimCopyContent(payload, "text", copyLabels, "en")).toEqual({
      plain: payload.text,
      html: `<p>${payload.text}</p>`,
    });
  });
});

describe("citation mode plumbing (the fifth ClaimCopyMode)", () => {
  it("refuses on every surface that has not plumbed a stamp, and on a stub digest", () => {
    // The five non-digest payload sites construct ClaimCopyPayload independently
    // and pass no `citation`, so the optional field is exactly what lets them stay
    // untouched while still failing closed.
    expect(buildClaimCopyContent(copyPayload(), "citation", copyLabels, "en")).toBeNull();
    expect(canCopyIcs206Citation(copyPayload())).toBe(false);
    expect(
      canCopyIcs206Citation(copyPayload({ citation: { attributable: false, tools: null } })),
    ).toBe(false);
    // ...while the four existing modes are unaffected by the new field
    expect(buildClaimCopyContent(copyPayload(), "report", copyLabels, "en")).not.toBeNull();
  });

  it("emits the citation artifact once a digest stamp is present", () => {
    const payload = copyPayload({ citation: { attributable: true, tools: null } });
    expect(canCopyIcs206Citation(payload)).toBe(true);
    const content = buildClaimCopyContent(payload, "citation", copyLabels, "en")!;
    expect(content.plain).toContain("BNOW.NET — source citation (ICS 206-01 fields; tool disclosure withheld)");
    expect(content.plain).toContain("Accessed (BNOW ingest)");
    expect(content.html).toContain("<strong>Accessed (BNOW ingest):</strong>");
    // the artifact is authoritative English and does NOT read the translated
    // copy labels — a citation whose vocabulary changed per locale would not be
    // reconstructible by the desk that receives it
    const de = buildClaimCopyContent(payload, "citation", copyLabels, "de")!;
    expect(de.plain).toBe(content.plain);
  });

  it("agrees with the builder on every refusal — the cheap check cannot drift", () => {
    const stamps = [
      undefined,
      { attributable: false, tools: null },
      { attributable: true, tools: null },
      { attributable: true, tools: { provider: "openai:gpt-4o-mini", synthesis: null } },
    ] as const;
    const breakers: Array<Partial<ClaimCopyPayload>> = [
      {},
      { asOf: null },
      { asOf: "   " },
      { claimUrl: null },
      { claimUrl: "javascript:alert(1)" },
      { claimUrl: "https://bnow.net/digests/ua/2026-07-13#c4762" },
      { docs: [] },
    ];
    for (const citation of stamps) {
      for (const breaker of breakers) {
        const payload = copyPayload({ citation, ...breaker });
        expect(
          canCopyIcs206Citation(payload),
          `${JSON.stringify(citation)} ${JSON.stringify(breaker)}`,
        ).toBe(buildClaimCopyContent(payload, "citation", copyLabels, "en") !== null);
      }
    }
  });

  it("switches the button label only when the disclosure is actually present (T4-b)", () => {
    expect(citationButtonLabel(copyPayload({ citation: { attributable: true, tools: null } }), copyLabels))
      .toBe(copyLabels.copyCitation);
    expect(
      citationButtonLabel(
        copyPayload({
          citation: {
            attributable: true,
            tools: { provider: "openai:gpt-4o-mini+mapreduce", synthesis: null },
          },
        }),
        copyLabels,
      ),
    ).toBe(copyLabels.copyCitationConformant);
  });
});

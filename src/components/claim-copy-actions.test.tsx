// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClaimCopyActions } from "./claim-copy-actions";
import type { ClaimCopyLabels, ClaimCopyPayload } from "./claim-copy-model";

const captureMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics/client", () => ({ captureProductEvent: captureMock }));

const labels: ClaimCopyLabels = {
  copyForReport: "Copy for report", moreCopyOptions: "More copy options", copyLink: "Copy link",
  copyWithEvidence: "Copy with evidence", copyTextOnly: "Copy text only", copying: "Copying…",
  reportCopied: "Report copied", linkCopied: "Link copied", evidenceCopied: "Evidence copied",
  textCopied: "Text copied", copyFailed: "Copy failed", statusLabel: "Status", asOfLabel: "As of",
  evidenceLabel: "Evidence", sourceLabel: "Source", sourceValue: "BNOW.NET {country} claim {claimId}",
  linkedSummary: "{docs} linked documents · {channels} channels · {platforms} platforms",
  evidenceListLabel: "Evidence list", publishedLabel: "Published",
  platformLabel: "Platform", reliabilityLabel: "Reliability", unknown: "Unknown",
  statuses: { confirmed: "Confirmed", assessed: "Assessed", claimed: "Claimed", unverified: "Unverified", unknown: "Unknown" },
  platforms: { rss_news: "News", gdelt: "GDELT", telegram: "Telegram", x: "X", procurement: "Procurement" },
};

const payload: ClaimCopyPayload = {
  claimId: 7, text: "Claim text", hedging: "claimed", asOf: "13 July 2026", countryName: "Russia",
  countryIso2: "ru", claimUrl: "https://bnow.net/digests/ru/2026-07-13#c7", showScores: true,
  docs: [{
    docId: 44, url: "https://source.example/item", title: "Title", adapter: "rss", sourceId: 1,
    sourceName: "Source", sourceKey: "source.example", sourceDomain: "source.example", platform: "media",
    reliability: 0.7, publishedAt: "2026-07-13T12:00:00Z", firstSeenAt: "2026-07-13T13:00:00Z",
  }],
};

function setClipboard(value: Partial<Clipboard>) {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, "ClipboardItem");
  Reflect.deleteProperty(navigator, "clipboard");
  captureMock.mockReset();
});

describe("ClaimCopyActions", () => {
  it("writes rich report plain+HTML formats and announces only after resolution", async () => {
    let resolve!: () => void;
    const write = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    const captured: Array<Record<string, Blob>> = [];
    class TestClipboardItem {
      constructor(data: Record<string, Blob>) { captured.push(data); }
    }
    Object.defineProperty(globalThis, "ClipboardItem", { configurable: true, value: TestClipboardItem });
    setClipboard({ write });
    render(<ClaimCopyActions payload={payload} surface="digest" locale="en" labels={labels} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy for report" }));
    expect(write).toHaveBeenCalledTimes(1);
    expect(captured[0]).toHaveProperty("text/plain");
    expect(captured[0]).toHaveProperty("text/html");
    expect(screen.queryByText("Report copied")).toBeNull();
    expect(screen.getByRole("button", { name: "Copying…" }).getAttribute("aria-busy")).toBe("true");
    resolve();
    expect(await screen.findByText("Report copied")).toBeTruthy();
    expect(captureMock).toHaveBeenCalledWith("claim_copied", {
      surface: "digest",
      copy_mode: "report",
      theater: "ru",
      hedging_class: "claimed",
      evidence_count_bucket: "1",
    });
  });

  it("falls back to the exact plain report when ClipboardItem is unavailable", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    render(<ClaimCopyActions payload={payload} surface="search" locale="en" labels={labels} />);
    await user.click(screen.getByRole("button", { name: "Copy for report" }));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("Status: Claimed · As of: 13 July 2026"),
    );
    expect(await screen.findByText("Report copied")).toBeTruthy();
  });

  it("falls back to writeText when a browser exposes but rejects rich writes", async () => {
    const user = userEvent.setup();
    class TestClipboardItem { constructor() {} }
    Object.defineProperty(globalThis, "ClipboardItem", { configurable: true, value: TestClipboardItem });
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ write: vi.fn().mockRejectedValue(new Error("unsupported format")), writeText });
    render(<ClaimCopyActions payload={payload} surface="entity" locale="en" labels={labels} />);
    await user.click(screen.getByRole("button", { name: "Copy for report" }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Report copied")).toBeTruthy();
  });

  it("prevents duplicate writes while pending and re-enables afterward", async () => {
    let resolve!: () => void;
    const writeText = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    setClipboard({ writeText });
    render(<ClaimCopyActions payload={payload} surface="ask_cited" locale="en" labels={labels} />);
    const button = screen.getByRole("button", { name: "Copy for report" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Copying…" }).hasAttribute("disabled")).toBe(true);
    resolve();
    await waitFor(() => expect(screen.getByRole("button", { name: "Copy for report" }).hasAttribute("disabled")).toBe(false));
  });

  it("wires link/evidence/text modes to mode-specific writes and live statuses", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    render(<ClaimCopyActions payload={payload} surface="signal" locale="en" labels={labels} />);

    await user.click(screen.getByText("More copy options"));
    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenLastCalledWith(payload.claimUrl);
    expect(await screen.findByText("Link copied")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Copy with evidence" }));
    expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining("Evidence list\n1. Source"));
    expect(await screen.findByText("Evidence copied")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Copy text only" }));
    expect(writeText).toHaveBeenLastCalledWith("Claim text");
    expect(await screen.findByText("Text copied")).toBeTruthy();
  });

  it("announces failure non-destructively when clipboard is unavailable", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    render(<ClaimCopyActions payload={payload} surface="digest" locale="en" labels={labels} />);
    await user.click(screen.getByRole("button", { name: "Copy for report" }));
    expect(await screen.findByText("Copy failed")).toBeTruthy();
    expect(captureMock).not.toHaveBeenCalled();
    expect(screen.getByText("More copy options")).toBeTruthy();
  });

  it("offers only explicitly secondary text copy without canonical metadata", () => {
    setClipboard({ writeText: vi.fn() });
    render(
      <ClaimCopyActions payload={{ ...payload, asOf: null, claimUrl: null }} surface="ask_related" locale="en" labels={labels} />,
    );
    expect(screen.queryByRole("button", { name: "Copy for report" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
    expect(screen.getByRole("button", { name: "Copy text only" })).toBeTruthy();
  });
});

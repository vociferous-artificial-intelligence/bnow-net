// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AskCompletedMarker,
  DigestViewedMarker,
  SearchCompletedMarker,
  SignalDetailViewedMarker,
} from "./product-event-markers";

const captureMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics/client", () => ({ captureProductEvent: captureMock }));

afterEach(() => {
  cleanup();
  captureMock.mockReset();
});

describe("product completion markers", () => {
  it("emits digest and Search completions once per navigation/completion key", () => {
    const digest = render(
      <DigestViewedMarker navigationKey="balanced" theater="RU" digestAge="today" trackCount={4} />,
    );
    expect(captureMock).toHaveBeenCalledWith("digest_viewed", {
      theater: "ru",
      digest_age_bucket: "today",
      track_count_bucket: "4+",
    });
    digest.rerender(
      <DigestViewedMarker navigationKey="balanced" theater="RU" digestAge="today" trackCount={4} />,
    );
    expect(captureMock).toHaveBeenCalledTimes(1);
    digest.rerender(
      <DigestViewedMarker navigationKey="frontline" theater="RU" digestAge="today" trackCount={4} />,
    );
    expect(captureMock).toHaveBeenCalledTimes(2);

    render(<SearchCompletedMarker completionKey="search-1" resultCount={0} windowPresent />);
    expect(captureMock).toHaveBeenLastCalledWith("search_completed", {
      has_results: false,
      result_count_bucket: "0",
      window_present: true,
    });
  });

  it("emits Ask and accepted Signal detail with closed coarse properties", () => {
    render(
      <AskCompletedMarker
        completionKey="ask-1"
        state="answered"
        evidenceCount={6}
        retrievalMode="v2"
        windowPresent={false}
      />,
    );
    expect(captureMock).toHaveBeenLastCalledWith("ask_completed", {
      state: "answered",
      evidence_count_bucket: "6+",
      retrieval_mode: "v2",
      window_present: false,
    });

    render(
      <SignalDetailViewedMarker
        navigationKey="signal-1"
        theater="ir"
        signalType="purge"
        evidenceCount={3}
      />,
    );
    expect(captureMock).toHaveBeenLastCalledWith("signal_detail_viewed", {
      theater: "ir",
      signal_type: "purge",
      evidence_count_bucket: "2-5",
    });
  });

  it("drops unknown signal types instead of forwarding arbitrary values", () => {
    render(
      <SignalDetailViewedMarker
        navigationKey="signal-unknown"
        theater="ru"
        signalType="person name from data"
        evidenceCount={2}
      />,
    );
    expect(captureMock).not.toHaveBeenCalled();
  });
});

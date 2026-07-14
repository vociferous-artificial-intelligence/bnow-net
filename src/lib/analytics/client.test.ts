// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureProductEvent,
  installAnalyticsResetListener,
  isAnalyticsInitializationCurrent,
  prepareAnalyticsInitialization,
  registerAnalyticsClient,
  resetAnalyticsClient,
  shouldStartProductSession,
} from "./client";

describe("analytics client facade", () => {
  const capture = vi.fn();
  const reset = vi.fn();
  const optOut = vi.fn();

  beforeEach(() => {
    capture.mockReset(); reset.mockReset(); optOut.mockReset();
    window.sessionStorage.clear();
    resetAnalyticsClient();
    reset.mockReset(); optOut.mockReset();
  });

  it("queues only while an eligible dynamic initialization is pending, then flushes", () => {
    const generation = prepareAnalyticsInitialization(true);
    captureProductEvent("search_completed", { has_results: false, result_count_bucket: "0", window_present: false });
    expect(capture).not.toHaveBeenCalled();
    expect(registerAnalyticsClient({ capture, reset, opt_out_capturing: optOut }, generation)).toBe(true);
    expect(capture).toHaveBeenCalledWith("search_completed", { has_results: false, result_count_bucket: "0", window_present: false });
  });

  it("fails closed when eligibility disappears and clears identity on reset", () => {
    const generation = prepareAnalyticsInitialization(true);
    registerAnalyticsClient({ capture, reset, opt_out_capturing: optOut }, generation);
    prepareAnalyticsInitialization(false);
    captureProductEvent("search_completed", { has_results: true, result_count_bucket: "1-5", window_present: false });
    expect(capture).not.toHaveBeenCalled();
    const nextGeneration = prepareAnalyticsInitialization(true);
    registerAnalyticsClient({ capture, reset, opt_out_capturing: optOut }, nextGeneration);
    reset.mockReset();
    optOut.mockReset();
    resetAnalyticsClient();
    expect(reset).toHaveBeenCalledWith(true);
    expect(optOut).toHaveBeenCalledOnce();
  });

  it("invalidates a deferred initialization when permission is withdrawn", () => {
    const deferredGeneration = prepareAnalyticsInitialization(true);
    expect(isAnalyticsInitializationCurrent(deferredGeneration)).toBe(true);

    resetAnalyticsClient();

    expect(isAnalyticsInitializationCurrent(deferredGeneration)).toBe(false);
    expect(registerAnalyticsClient(
      { capture, reset, opt_out_capturing: optOut },
      deferredGeneration,
    )).toBe(false);
    captureProductEvent("search_completed", {
      has_results: true,
      result_count_bucket: "1-5",
      window_present: false,
    });
    expect(capture).not.toHaveBeenCalled();
  });

  it("broadcasts withdrawal independently of the SDK and stops another tab", () => {
    const listeners = new Set<() => void>();
    const postMessage = vi.fn(() => {
      for (const listener of listeners) listener();
    });
    class FakeBroadcastChannel {
      addEventListener(_type: string, listener: () => void) { listeners.add(listener); }
      removeEventListener(_type: string, listener: () => void) { listeners.delete(listener); }
      postMessage = postMessage;
      close() {}
    }
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const stopListening = installAnalyticsResetListener();
    const generation = prepareAnalyticsInitialization(true);
    registerAnalyticsClient({ capture, reset, opt_out_capturing: optOut }, generation);

    resetAnalyticsClient();

    expect(postMessage).toHaveBeenCalledWith("reset");
    captureProductEvent("search_completed", {
      has_results: true,
      result_count_bucket: "1-5",
      window_present: false,
    });
    expect(capture).not.toHaveBeenCalled();
    stopListening();
    vi.unstubAllGlobals();
  });

  it("emits one product session per tab and clears the guard on reset", () => {
    expect(shouldStartProductSession()).toBe(true);
    expect(shouldStartProductSession()).toBe(false);
    resetAnalyticsClient();
    expect(shouldStartProductSession()).toBe(true);
  });
});

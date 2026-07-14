// @vitest-environment jsdom
import React from "react";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const init = vi.fn();
const identify = vi.fn();
const capture = vi.fn();
const optIn = vi.fn();
const optOut = vi.fn();
const reset = vi.fn();
const routeState = vi.hoisted(() => ({ pathname: "/digests/ru/2026-07-14" }));

vi.mock("next/navigation", () => ({ usePathname: () => routeState.pathname }));
vi.mock("posthog-js", () => ({
  default: {
    init,
    identify,
    capture,
    opt_in_capturing: optIn,
    opt_out_capturing: optOut,
    reset,
  },
}));
vi.mock("@/lib/analytics/config", async (original) => {
  const actual = await original<typeof import("@/lib/analytics/config")>();
  return {
    ...actual,
    analyticsPublicConfig: (production: boolean) => production
      ? { key: "phc_bnow_test", host: "https://us.i.posthog.com" }
      : null,
    canonicalAnalyticsRuntime: () => true,
  };
});

const { PostHogProvider } = await import("./posthog-provider");
const IDENTITY = {
  distinctId: "fae2f561-bfe2-4aa4-817a-0e8c16fb1a98",
  role: "analyst" as const,
  signupAt: "2026-07-14T10:00:00Z",
  betaCohort: "private_beta_2026_07" as const,
};

describe("PostHogProvider permission and privacy gate", () => {
  beforeEach(() => {
    for (const mock of [init, identify, capture, optIn, optOut, reset]) mock.mockReset();
    window.sessionStorage.clear();
    routeState.pathname = "/digests/ru/2026-07-14";
    window.history.replaceState({}, "", "/digests/ru/2026-07-14");
  });

  it("does not dynamically initialize without an eligible identity", async () => {
    render(<PostHogProvider identity={null} productionDeployment><div>product</div></PostHogProvider>);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(init).not.toHaveBeenCalled();
    expect(identify).not.toHaveBeenCalled();
  });

  it("initializes once with all automatic collection disabled, then identifies by UUID", async () => {
    render(<PostHogProvider identity={IDENTITY} productionDeployment><div>product</div></PostHogProvider>);
    await waitFor(() => expect(init).toHaveBeenCalledOnce());
    const options = init.mock.calls[0][1];
    expect(options).toMatchObject({
      api_host: "https://us.i.posthog.com",
      person_profiles: "identified_only",
      persistence: "memory",
      save_referrer: false,
      save_campaign_params: false,
      disable_capture_url_hashes: true,
      disableDeviceModel: true,
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      capture_dead_clicks: false,
      capture_performance: false,
      capture_exceptions: false,
      disable_session_recording: true,
      disable_surveys: true,
      disable_product_tours: true,
      disable_external_dependency_loading: true,
      enable_heatmaps: false,
      rageclick: false,
      advanced_disable_flags: true,
      opt_out_capturing_by_default: true,
    });
    expect(typeof options.before_send).toBe("function");
    expect(identify).toHaveBeenCalledWith(
      IDENTITY.distinctId,
      { role: "analyst" },
      { signup_at: IDENTITY.signupAt, beta_cohort: "private_beta_2026_07" },
    );
    expect(JSON.stringify(identify.mock.calls)).not.toContain("@");
    expect(capture).toHaveBeenCalledWith("$pageview", {
      normalized_path: "/digests/:theater/:date",
      entry_surface: "digest",
    });
  });

  it("retires the old client before identifying a different account", async () => {
    const { rerender } = render(
      <PostHogProvider identity={IDENTITY} productionDeployment><div>product</div></PostHogProvider>,
    );
    await waitFor(() => expect(identify).toHaveBeenCalledWith(
      IDENTITY.distinctId,
      expect.anything(),
      expect.anything(),
    ));
    const nextIdentity = {
      ...IDENTITY,
      distinctId: "c5aa3e93-0762-46ac-b323-da967220a90b",
    };

    rerender(
      <PostHogProvider identity={nextIdentity} productionDeployment><div>product</div></PostHogProvider>,
    );

    await waitFor(() => expect(identify).toHaveBeenCalledWith(
      nextIdentity.distinctId,
      expect.anything(),
      expect.anything(),
    ));
    expect(reset).toHaveBeenCalled();
    const nextIdentifyCall = identify.mock.calls.findIndex(([id]) => id === nextIdentity.distinctId);
    const nextIdentifyOrder = identify.mock.invocationCallOrder[nextIdentifyCall];
    expect(reset.mock.invocationCallOrder.some((order) => order < nextIdentifyOrder)).toBe(true);
  });

  it("preserves the one-per-tab product session marker across excluded routes", async () => {
    const { rerender } = render(
      <PostHogProvider identity={IDENTITY} productionDeployment><div>product</div></PostHogProvider>,
    );
    await waitFor(() => expect(capture).toHaveBeenCalledWith(
      "product_session_started",
      expect.anything(),
    ));

    routeState.pathname = "/privacy";
    rerender(<PostHogProvider identity={IDENTITY} productionDeployment><div>product</div></PostHogProvider>);
    await waitFor(() => expect(reset).toHaveBeenCalled());

    routeState.pathname = "/digests/ru/2026-07-14";
    rerender(<PostHogProvider identity={IDENTITY} productionDeployment><div>product</div></PostHogProvider>);
    await waitFor(() => expect(init).toHaveBeenCalledTimes(2));
    expect(capture.mock.calls.filter(([event]) => event === "product_session_started")).toHaveLength(1);
  });
});

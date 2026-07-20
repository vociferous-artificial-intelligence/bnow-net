import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyticsPublicConfig, canonicalAnalyticsRuntime } from "./config";
import { askStartedEventEnabled, daysSinceSignupBucket, routeSurface } from "./events";
import { normalizedPagePath, sanitizeOutgoingEvent, sanitizeProductProperties } from "./sanitize";

const INTERNAL_UUID = "6b326af1-2f44-4cd8-a08b-8d885fb198e0";
const PUBLIC_KEY = "phc_bnow_test";

function captured(event: string, properties: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { uuid: crypto.randomUUID(), event, properties: { token: PUBLIC_KEY, ...properties }, ...extra } as never;
}

describe("analytics configuration and route policy", () => {
  it("fails closed without exact production/key/host configuration", () => {
    expect(analyticsPublicConfig(false, { NEXT_PUBLIC_POSTHOG_KEY: "phc_x", NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com" })).toBeNull();
    expect(analyticsPublicConfig(true, { NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com" })).toBeNull();
    expect(analyticsPublicConfig(true, { NEXT_PUBLIC_POSTHOG_KEY: "phc_x", NEXT_PUBLIC_POSTHOG_HOST: "https://evil.example" })).toBeNull();
    expect(analyticsPublicConfig(true, { NEXT_PUBLIC_POSTHOG_KEY: "phc_x", NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com" })).toEqual({ key: "phc_x", host: "https://us.i.posthog.com" });
  });

  it("accepts only HTTPS bnow.net and explicit subscriber surfaces", () => {
    expect(canonicalAnalyticsRuntime({ protocol: "https:", hostname: "bnow.net" } as Location)).toBe(true);
    expect(canonicalAnalyticsRuntime({ protocol: "http:", hostname: "bnow.net" } as Location)).toBe(false);
    expect(canonicalAnalyticsRuntime({ protocol: "https:", hostname: "bnow-net.vercel.app" } as Location)).toBe(false);
    expect(routeSurface("/digests/ru/2026-07-14")).toBe("digest");
    expect(routeSurface("/admin/access")).toBeNull();
    expect(routeSurface("/welcome/legal")).toBeNull();
  });

  it("uses signup-relative coarse day buckets", () => {
    const now = new Date("2026-07-14T12:00:00Z");
    expect(daysSinceSignupBucket("2026-07-14T01:00:00Z", now)).toBe("0");
    expect(daysSinceSignupBucket("2026-07-10T01:00:00Z", now)).toBe("3-7");
    expect(daysSinceSignupBucket("2026-06-01T01:00:00Z", now)).toBe("15+");
  });
});

describe("ask_started — typed but DISABLED (AI Search Phase 0, 2026-07-19)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("the enablement gate is OFF by default and in every current environment", () => {
    expect(askStartedEventEnabled()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_ANALYTICS_ASK_STARTED", "");
    expect(askStartedEventEnabled()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_ANALYTICS_ASK_STARTED", "true"); // only the literal "1" enables
    expect(askStartedEventEnabled()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_ANALYTICS_ASK_STARTED", "1");
    expect(askStartedEventEnabled()).toBe(true);
  });

  it("the typed shape is content-free: entry enum only, everything else rejected", () => {
    expect(sanitizeProductProperties("ask_started", { entry: "form" })).toEqual({ entry: "form" });
    expect(sanitizeProductProperties("ask_started", { entry: "intent" })).toEqual({ entry: "intent" });
    expect(sanitizeProductProperties("ask_started", { entry: "other" })).toBeNull();
    expect(sanitizeProductProperties("ask_started", { entry: "form", question: "secret" })).toBeNull();
    expect(sanitizeProductProperties("ask_started", { entry: "form", q: "secret" })).toBeNull();
    expect(sanitizeProductProperties("ask_started", {})).toBeNull();
  });
});

describe("analytics payload boundary", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("rejects arbitrary or forbidden component properties", () => {
    expect(sanitizeProductProperties("search_completed", {
      has_results: true,
      result_count_bucket: "1-5",
      window_present: false,
      query: "secret terms",
    })).toBeNull();
    expect(sanitizeProductProperties("feedback_initiated", {
      surface: "analyst@example.com",
    })).toBeNull();
  });

  it("rebuilds a product event and removes every SDK-added URL/campaign/device property", () => {
    const result = sanitizeOutgoingEvent(captured("search_completed", {
      distinct_id: "6b326af1-2f44-4cd8-a08b-8d885fb198e0",
      has_results: true,
      result_count_bucket: "1-5",
      window_present: false,
      $current_url: "https://bnow.net/search?q=secret",
      $referrer: "https://mail.example/?token=secret",
      $utm_source: "private-campaign",
      $browser: "Chrome",
    }, {
      $set: { email: "leak@example.com" },
      $set_once: { query: "secret" },
      $unset: ["private_field"],
    }), PUBLIC_KEY);
    expect(result?.properties).toEqual({
      token: PUBLIC_KEY,
      distinct_id: "6b326af1-2f44-4cd8-a08b-8d885fb198e0",
      has_results: true,
      result_count_bucket: "1-5",
      window_present: false,
      environment: "production",
      site_domain: "bnow.net",
    });
    expect(result).not.toHaveProperty("$set");
    expect(result).not.toHaveProperty("$set_once");
    expect(result).not.toHaveProperty("$unset");
    expect(JSON.stringify(result)).not.toMatch(/secret|referrer|utm|browser|search\?q/i);
  });

  it("normalizes manual pageviews and drops unknown automatic events", () => {
    const page = sanitizeOutgoingEvent(captured("$pageview", {
      distinct_id: INTERNAL_UUID,
      normalized_path: "/ask?question=secret#fragment",
      entry_surface: "ask",
      $current_url: "https://bnow.net/ask?question=secret",
    }, { $set: { email: "leak@example.com" } }), PUBLIC_KEY);
    expect(page?.properties).toEqual({
      token: PUBLIC_KEY,
      distinct_id: INTERNAL_UUID,
      normalized_path: "/ask",
      entry_surface: "ask",
      $current_url: "https://bnow.net/ask",
      $pathname: "/ask",
      environment: "production",
      site_domain: "bnow.net",
    });
    expect(page).not.toHaveProperty("$set");
    expect(sanitizeOutgoingEvent(captured("$autocapture", { distinct_id: INTERNAL_UUID }), PUBLIC_KEY)).toBeNull();
    expect(sanitizeOutgoingEvent(captured("$exception", { distinct_id: INTERNAL_UUID }), PUBLIC_KEY)).toBeNull();
  });

  it("templates validated dynamic routes and rejects user-controlled path segments", () => {
    expect(normalizedPagePath("/countries/ru")).toBe("/countries/:theater");
    expect(normalizedPagePath("/digests/ru/2026-07-14?token=secret")).toBe("/digests/:theater/:date");
    expect(normalizedPagePath("/scoreboard/ua/2026-07-14")).toBe("/scoreboard/:theater/:date");
    expect(normalizedPagePath("/entities/analyst@example.com")).toBe("/entities/:id");
    expect(normalizedPagePath("/countries/analyst@example.com")).toBeNull();
    expect(normalizedPagePath("/digests/secret-token/2026-07-14")).toBeNull();
    expect(normalizedPagePath("/scoreboard/ru/2026-07-14/private-text")).toBeNull();
  });

  it("allows only minimized identify properties and never an email distinct id", () => {
    const identify = sanitizeOutgoingEvent(captured("$identify", { distinct_id: INTERNAL_UUID, $current_url: "https://bnow.net/account" }, {
      $set: { role: "analyst", email: "analyst@example.com" },
      $set_once: { signup_at: "2026-07-14T10:00:00Z", beta_cohort: "private_beta_2026_07", name: "Analyst" },
      $unset: ["email"],
    }), PUBLIC_KEY);
    expect(identify?.$set).toEqual({ role: "analyst" });
    expect(identify?.$set_once).toEqual({ signup_at: "2026-07-14T10:00:00Z", beta_cohort: "private_beta_2026_07" });
    expect(JSON.stringify(identify)).not.toContain("analyst@example.com");
    expect(identify).not.toHaveProperty("$unset");
    expect(sanitizeOutgoingEvent(captured("digest_viewed", { distinct_id: "analyst@example.com" }), PUBLIC_KEY)).toBeNull();
  });

  it("preserves only the configured public project token required by the SDK", () => {
    const event = captured("search_completed", {
      distinct_id: INTERNAL_UUID,
      has_results: false,
      result_count_bucket: "0",
      window_present: false,
    });
    expect(sanitizeOutgoingEvent(event, PUBLIC_KEY)?.properties.token).toBe(PUBLIC_KEY);
    expect(sanitizeOutgoingEvent(event, "phc_another_project")).toBeNull();
  });
});

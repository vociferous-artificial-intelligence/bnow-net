import { describe, expect, it } from "vitest";
import {
  ACCESS_LANDING_PATH,
  accessAttributionFromForm,
  normalizeCampaignValue,
  normalizeLandingPath,
  normalizeReferrerHost,
  referrerHostFromUrl,
} from "./attribution";

describe("access-request attribution", () => {
  it("normalizes conservative campaign tokens and rejects arbitrary query content", () => {
    expect(normalizeCampaignValue(" LinkedIn-Paid_01 ")).toBe("linkedin-paid_01");
    for (const value of ["", "has spaces", "x=y", "a/b", "🔥", "x".repeat(101), ["a"]]) {
      expect(normalizeCampaignValue(value)).toBeNull();
    }
  });

  it("allows only the known internal landing path", () => {
    expect(normalizeLandingPath(ACCESS_LANDING_PATH)).toBe("/access");
    expect(normalizeLandingPath("/ask?q=secret")).toBeNull();
    expect(normalizeLandingPath("https://bnow.net/access")).toBeNull();
  });

  it("stores a hostname only and rejects URL-shaped hidden values", () => {
    expect(normalizeReferrerHost("News.Example.COM.")).toBe("news.example.com");
    for (const value of [
      "https://news.example.com/path?q=secret",
      "user@news.example.com",
      "news.example.com:8443",
      "news.example.com/path",
      "bad_host.example",
    ]) {
      expect(normalizeReferrerHost(value)).toBeNull();
    }
  });

  it("extracts only a safe hostname from an initial HTTP(S) referrer", () => {
    expect(referrerHostFromUrl("https://News.Example.com/story?q=private#part")).toBe(
      "news.example.com",
    );
    expect(referrerHostFromUrl("https://user:pass@example.com/path")).toBeNull();
    expect(referrerHostFromUrl("javascript:alert(1)")).toBeNull();
  });

  it("revalidates every hidden form value and nulls malformed attribution", () => {
    const form = new FormData();
    form.set("utm_source", "Newsletter");
    form.set("utm_medium", "has spaces");
    form.set("utm_campaign", "beta-01");
    form.set("landing_path", "/access");
    form.set("referrer_host", "publisher.example");
    expect(accessAttributionFromForm(form)).toEqual({
      utmSource: "newsletter",
      utmMedium: null,
      utmCampaign: "beta-01",
      landingPath: "/access",
      referrerHost: "publisher.example",
    });
  });
});

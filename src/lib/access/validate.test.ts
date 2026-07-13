import { describe, expect, it } from "vitest";
import {
  EMAIL_MAX,
  LINKEDIN_MAX,
  normalizeAccessEmail,
  validateLinkedinUrl,
} from "./validate";

describe("normalizeAccessEmail", () => {
  it("trims and lowercases a plausible address", () => {
    expect(normalizeAccessEmail("  Analyst@Example.COM ")).toBe("analyst@example.com");
  });

  it.each(["", "   ", "not-an-email", "a@b", "a b@c.com", "a@b c.com", "@example.com"])(
    "rejects %j",
    (raw) => {
      expect(normalizeAccessEmail(raw)).toBeNull();
    },
  );

  it("rejects null/undefined and overlong input", () => {
    expect(normalizeAccessEmail(null)).toBeNull();
    expect(normalizeAccessEmail(undefined)).toBeNull();
    expect(normalizeAccessEmail(`${"a".repeat(EMAIL_MAX)}@example.com`)).toBeNull();
  });
});

describe("validateLinkedinUrl", () => {
  it("returns null for empty input — the field is optional", () => {
    expect(validateLinkedinUrl("")).toBeNull();
    expect(validateLinkedinUrl("   ")).toBeNull();
    expect(validateLinkedinUrl(null)).toBeNull();
    expect(validateLinkedinUrl(undefined)).toBeNull();
  });

  it("accepts normal /in/ and /company/ URLs", () => {
    expect(validateLinkedinUrl("https://www.linkedin.com/in/some-analyst")).toBe(
      "https://www.linkedin.com/in/some-analyst",
    );
    expect(validateLinkedinUrl("https://linkedin.com/company/some-desk")).toBe(
      "https://linkedin.com/company/some-desk",
    );
  });

  it("prepends https:// to a bare linkedin.com URL as a convenience", () => {
    expect(validateLinkedinUrl("linkedin.com/in/some-analyst")).toBe(
      "https://linkedin.com/in/some-analyst",
    );
    expect(validateLinkedinUrl("www.linkedin.com/in/some-analyst")).toBe(
      "https://www.linkedin.com/in/some-analyst",
    );
  });

  it("accepts true subdomains only", () => {
    expect(validateLinkedinUrl("https://uk.linkedin.com/in/some-analyst")).toBe(
      "https://uk.linkedin.com/in/some-analyst",
    );
  });

  it.each([
    "https://evil-linkedin.com/in/x",
    "https://linkedin.com.evil.com/in/x",
    "https://notlinkedin.com/in/x",
    "https://linkedin.co/in/x",
    "https://xn--linkedn-cxb.com/in/x",
  ])("rejects lookalike host %s", (raw) => {
    expect(validateLinkedinUrl(raw)).toBe("invalid");
  });

  it.each([
    "http://linkedin.com/in/x",
    "javascript:alert(1)",
    "ftp://linkedin.com/in/x",
    "data:text/html,x",
  ])("rejects non-https scheme %s", (raw) => {
    expect(validateLinkedinUrl(raw)).toBe("invalid");
  });

  it("rejects embedded credentials and ports", () => {
    expect(validateLinkedinUrl("https://user:pass@linkedin.com/in/x")).toBe("invalid");
    expect(validateLinkedinUrl("https://user@linkedin.com/in/x")).toBe("invalid");
    expect(validateLinkedinUrl("https://linkedin.com:8080/in/x")).toBe("invalid");
    expect(validateLinkedinUrl("linkedin.com:8080/in/x")).toBe("invalid");
  });

  it("rejects overlong input", () => {
    expect(validateLinkedinUrl(`https://linkedin.com/in/${"a".repeat(LINKEDIN_MAX)}`)).toBe(
      "invalid",
    );
  });

  it("rejects garbage that cannot parse as a URL", () => {
    expect(validateLinkedinUrl("ht!tp:// not a url")).toBe("invalid");
  });
});

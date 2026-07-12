import { afterEach, describe, expect, it } from "vitest";

import { feedbackEmail, feedbackMailto } from "./feedback";

const ORIGINAL = process.env.FEEDBACK_EMAIL;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.FEEDBACK_EMAIL;
  else process.env.FEEDBACK_EMAIL = ORIGINAL;
});

describe("feedbackEmail", () => {
  it("returns null when FEEDBACK_EMAIL is unset (affordance hidden, fail-closed)", () => {
    delete process.env.FEEDBACK_EMAIL;
    expect(feedbackEmail()).toBeNull();
    expect(feedbackMailto("anything")).toBeNull();
  });

  it("returns null for a blank value", () => {
    process.env.FEEDBACK_EMAIL = "   ";
    expect(feedbackEmail()).toBeNull();
  });

  it("trims and returns a configured address", () => {
    process.env.FEEDBACK_EMAIL = " ops@example.com ";
    expect(feedbackEmail()).toBe("ops@example.com");
  });
});

describe("feedbackMailto", () => {
  it("builds a mailto with an encoded subject", () => {
    process.env.FEEDBACK_EMAIL = "ops@example.com";
    expect(feedbackMailto("[BNOW digest] ru 2026-07-12")).toBe(
      "mailto:ops@example.com?subject=%5BBNOW%20digest%5D%20ru%202026-07-12",
    );
  });
});

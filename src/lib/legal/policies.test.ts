import { describe, expect, it } from "vitest";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  TERMS_EFFECTIVE_DATE,
  isCurrentVersions,
} from "./policies";

// The attributed-signals sprint (2026-07-15) bumps the Terms to 1.1 for the
// named-person source-attribution rule (Terms §9) WITHOUT touching the Privacy
// Notice. This pins that the bump forces returning users through re-acceptance
// while Privacy stays put — the two documents version independently.
describe("legal policy versions (attributed-signals Terms 1.1 bump)", () => {
  it("Terms is 1.1 and Privacy is unchanged at 1.2", () => {
    expect(CURRENT_TERMS_VERSION).toBe("1.1");
    expect(CURRENT_PRIVACY_VERSION).toBe("1.2");
    // effective on the actual production rollout date (2026-07-16, not 07-15)
    expect(TERMS_EFFECTIVE_DATE).toBe("2026-07-16");
  });

  it("a user on the prior Terms (1.0) + current Privacy is NOT current → re-accept", () => {
    expect(isCurrentVersions("1.0", CURRENT_PRIVACY_VERSION)).toBe(false);
  });

  it("only the current (Terms 1.1 + Privacy 1.2) pair is current", () => {
    expect(isCurrentVersions("1.1", "1.2")).toBe(true);
    // a Terms bump must not silently make a stale Privacy pair look current
    expect(isCurrentVersions("1.1", "1.1")).toBe(false);
    expect(isCurrentVersions(CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION)).toBe(true);
  });
});

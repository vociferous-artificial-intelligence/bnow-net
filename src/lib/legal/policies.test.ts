import { describe, expect, it } from "vitest";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  PRIVACY_EFFECTIVE_DATE,
  TERMS_EFFECTIVE_DATE,
  isCurrentVersions,
} from "./policies";

// The AI Search/Ask release (2026-07-21) bumps the Privacy Notice to 1.3 for the
// fixed Ask retention disclosure (content 30 days, events 7 days, cache 7 days)
// WITHOUT touching the Terms. This pins that the bump forces returning users
// through re-acknowledgement while the Terms stay put — the two documents
// version independently.
describe("legal policy versions (Ask-retention Privacy 1.3 bump)", () => {
  it("Terms is unchanged at 1.1 and Privacy is 1.3", () => {
    expect(CURRENT_TERMS_VERSION).toBe("1.1");
    expect(CURRENT_PRIVACY_VERSION).toBe("1.3");
    // each document's effective date is its actual production rollout date
    expect(TERMS_EFFECTIVE_DATE).toBe("2026-07-16");
    expect(PRIVACY_EFFECTIVE_DATE).toBe("2026-07-21");
  });

  it("a user on the prior Privacy (1.2) + current Terms is NOT current → re-accept", () => {
    expect(isCurrentVersions(CURRENT_TERMS_VERSION, "1.2")).toBe(false);
  });

  it("only the current (Terms 1.1 + Privacy 1.3) pair is current", () => {
    expect(isCurrentVersions("1.1", "1.3")).toBe(true);
    // a Privacy bump must not silently make a stale Terms pair look current
    expect(isCurrentVersions("1.0", "1.3")).toBe(false);
    expect(isCurrentVersions(CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION)).toBe(true);
  });
});

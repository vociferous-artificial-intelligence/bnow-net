import { describe, expect, it } from "vitest";
import type { Role } from "@/lib/gate";
import { citationDisclosureView, resolveClaimCitationStamp } from "./disclosure-policy";
import type { ClaimToolStamp } from "./ics206";

// Operator decision T4 (2026-09-07): the AI-tool disclosure capability is BUILT
// and shipped DARK on every surface. These tests are the mechanical guard the
// decision asks for — a capability that exists in code must not leak on by
// default, and the check must not be cosmetic.

const ROLES: Array<Role | "anon"> = ["anon", "user", "analyst", "admin"];
// Every tier string the product can currently produce or plausibly try next.
// "beta" is what the AccessContext stub hard-codes (ask/access-context.ts:42).
const TIERS = [undefined, null, "", "  ", "beta", "free", "pro", "team", "enterprise", "admin"];

const STAMP: ClaimToolStamp = {
  provider: "openai:gpt-4o-mini+mapreduce",
  synthesis: {
    workload: "reduce",
    provider: "openai",
    model: "gpt-4o-mini",
    reasoningEffort: null,
    registryVersion: "analysis-reg-v1",
    approval: "baseline",
  },
};

describe("AI-tool disclosure policy (T4: withheld on every surface)", () => {
  it("is OFF for every currently resolvable role and every tier", () => {
    for (const role of ROLES) {
      for (const tier of TIERS) {
        expect(
          citationDisclosureView({ role, tier }).showToolDisclosure,
          `role=${role} tier=${String(tier)}`,
        ).toBe(false);
      }
    }
  });

  it("does not let the privileged roles unlock it — role is never the gate", () => {
    // T4's hold covers signed-in users AND admins. Reaching for the familiar
    // registry pattern (analyst/admin => full view) would break the decision, so
    // this pins that the two privileged roles behave exactly like an anon viewer.
    const anon = citationDisclosureView({ role: "anon" });
    expect(citationDisclosureView({ role: "admin" })).toEqual(anon);
    expect(citationDisclosureView({ role: "analyst" })).toEqual(anon);
  });
});

describe("resolveClaimCitationStamp", () => {
  it("strips the tool stamp entirely while the disclosure is withheld", () => {
    // ClaimCopyActions is a client component: anything left on the payload is
    // serialized into the page's RSC flight payload and readable in view-source.
    // Withheld must therefore mean ABSENT, not merely un-rendered.
    const resolved = resolveClaimCitationStamp(STAMP, citationDisclosureView({ role: "admin" }));
    expect(resolved.tools).toBeNull();
    expect(resolved.attributable).toBe(true);
    expect(JSON.stringify(resolved)).not.toContain("gpt-4o-mini");
    expect(JSON.stringify(resolved)).not.toContain("openai");
  });

  it("carries the stamp only for an entitled view, and answers ruling 3 either way", () => {
    // The entitled branch is unreachable through citationDisclosureView today
    // (ENTITLED_TIERS is empty); constructing the view directly proves the
    // capability is real rather than a constant false, which is the point of
    // building it now.
    const disclosed = resolveClaimCitationStamp(STAMP, { showToolDisclosure: true });
    expect(disclosed.tools).toEqual(STAMP);
    expect(disclosed.attributable).toBe(true);

    for (const view of [{ showToolDisclosure: true }, { showToolDisclosure: false }]) {
      expect(
        resolveClaimCitationStamp({ provider: "stub", synthesis: null }, view).attributable,
      ).toBe(false);
      expect(
        resolveClaimCitationStamp({ provider: null, synthesis: null }, view).attributable,
      ).toBe(false);
    }
  });
});

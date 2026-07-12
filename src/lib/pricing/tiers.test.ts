import { describe, expect, it } from "vitest";
import { buildTiers, intentPlanCode, TIER_ORDER, type DbPlan } from "./tiers";

// Fixture mirrors the live `plans` table shape (see AGENTS.md snapshot / db/schema.ts).
const LIVE_PLANS: DbPlan[] = [
  { code: "standby", name: "Standby", price_cents: 40000, interval: "month" },
  { code: "full_monthly", name: "Full", price_cents: 300000, interval: "month" },
  { code: "full_annual", name: "Full (Annual)", price_cents: 1980000, interval: "year" },
];

describe("buildTiers", () => {
  it("returns exactly the four tiers in stable order", () => {
    const tiers = buildTiers(LIVE_PLANS);
    expect(tiers.map((t) => t.id)).toEqual([...TIER_ORDER]);
  });

  it("keeps stable order even when DB rows arrive in a different order", () => {
    const shuffled = [LIVE_PLANS[2], LIVE_PLANS[0], LIVE_PLANS[1]];
    const tiers = buildTiers(shuffled);
    expect(tiers.map((t) => t.id)).toEqual(["standby", "full", "regional", "enterprise"]);
  });

  it("standby is DB-backed with the real price when the row exists", () => {
    const [standby] = buildTiers(LIVE_PLANS);
    expect(standby.pricing.kind).toBe("db");
    if (standby.pricing.kind !== "db") throw new Error("unreachable");
    expect(standby.pricing.billing).toEqual([
      { code: "standby", interval: "month", priceUsd: 400, monthlyEquivalentUsd: 400 },
    ]);
    expect(standby.pricing.annualDiscountPct).toBeNull();
  });

  it("standby degrades to on_request when no DB row exists (never fabricates a price)", () => {
    const [standby] = buildTiers([LIVE_PLANS[1], LIVE_PLANS[2]]);
    expect(standby.pricing).toEqual({ kind: "on_request" });
  });

  it("full analyst merges monthly + annual into one DB tier with both billing options", () => {
    const [, full] = buildTiers(LIVE_PLANS);
    expect(full.pricing.kind).toBe("db");
    if (full.pricing.kind !== "db") throw new Error("unreachable");
    expect(full.pricing.billing).toHaveLength(2);
    expect(full.pricing.billing[0]).toEqual({
      code: "full_monthly",
      interval: "month",
      priceUsd: 3000,
      monthlyEquivalentUsd: 3000,
    });
    expect(full.pricing.billing[1]).toEqual({
      code: "full_annual",
      interval: "year",
      priceUsd: 19800,
      monthlyEquivalentUsd: 1650,
    });
  });

  it("computes the annual discount from real fixture prices, not a hardcoded percentage", () => {
    // 19800/yr = 1650/mo equivalent vs 3000/mo monthly rate -> 45% off, exactly.
    const [, full] = buildTiers(LIVE_PLANS);
    if (full.pricing.kind !== "db") throw new Error("unreachable");
    expect(full.pricing.annualDiscountPct).toBe(45);
  });

  it("recomputes the discount if the DB prices change (not pinned to one fixture)", () => {
    const plans: DbPlan[] = [
      { code: "full_monthly", name: "Full", price_cents: 200000, interval: "month" },
      { code: "full_annual", name: "Full (Annual)", price_cents: 1200000, interval: "year" },
    ];
    // 1200000/100/12 = 1000/mo vs 2000/mo monthly -> 50% off.
    const [, full] = buildTiers(plans);
    if (full.pricing.kind !== "db") throw new Error("unreachable");
    expect(full.pricing.annualDiscountPct).toBe(50);
  });

  it("full tier shows one billing option with no discount when only monthly exists", () => {
    const [, full] = buildTiers([LIVE_PLANS[0], LIVE_PLANS[1]]);
    expect(full.pricing.kind).toBe("db");
    if (full.pricing.kind !== "db") throw new Error("unreachable");
    expect(full.pricing.billing).toHaveLength(1);
    expect(full.pricing.annualDiscountPct).toBeNull();
  });

  it("full tier shows one billing option with no discount when only annual exists", () => {
    const [, full] = buildTiers([LIVE_PLANS[0], LIVE_PLANS[2]]);
    expect(full.pricing.kind).toBe("db");
    if (full.pricing.kind !== "db") throw new Error("unreachable");
    expect(full.pricing.billing).toHaveLength(1);
    expect(full.pricing.annualDiscountPct).toBeNull();
  });

  it("full tier degrades to on_request when neither monthly nor annual DB row exists", () => {
    const [, full] = buildTiers([LIVE_PLANS[0]]);
    expect(full.pricing).toEqual({ kind: "on_request" });
  });

  it("regional and enterprise are always on_request — no DB code path exists for them", () => {
    const tiers = buildTiers(LIVE_PLANS);
    const regional = tiers.find((t) => t.id === "regional")!;
    const enterprise = tiers.find((t) => t.id === "enterprise")!;
    expect(regional.pricing).toEqual({ kind: "on_request" });
    expect(enterprise.pricing).toEqual({ kind: "on_request" });
  });

  it("handles an empty plans array (DB unreachable / all plans inactive) without throwing", () => {
    const tiers = buildTiers([]);
    expect(tiers).toHaveLength(4);
    expect(tiers.every((t) => t.pricing.kind === "on_request")).toBe(true);
  });

  it("does not divide by zero if a monthly plan is priced at 0 (defensive, not expected live)", () => {
    const plans: DbPlan[] = [
      { code: "full_monthly", name: "Full", price_cents: 0, interval: "month" },
      { code: "full_annual", name: "Full (Annual)", price_cents: 1980000, interval: "year" },
    ];
    const [, full] = buildTiers(plans);
    if (full.pricing.kind !== "db") throw new Error("unreachable");
    expect(full.pricing.annualDiscountPct).toBeNull();
  });
});

describe("intentPlanCode (FK-safety allowlist for subscribe_intents.plan_code)", () => {
  const DB_CODES = ["standby", "full_monthly", "full_annual"];

  it("passes a known DB code through unchanged with no note prefix", () => {
    expect(intentPlanCode("standby", DB_CODES)).toEqual({ planCode: "standby", notePrefix: null });
    expect(intentPlanCode("full_annual", DB_CODES)).toEqual({ planCode: "full_annual", notePrefix: null });
  });

  it("maps a static-tier code with no DB row to null + a note prefix (avoids the FK violation)", () => {
    expect(intentPlanCode("regional", DB_CODES)).toEqual({
      planCode: null,
      notePrefix: "[tier:regional] ",
    });
    expect(intentPlanCode("enterprise", DB_CODES)).toEqual({
      planCode: null,
      notePrefix: "[tier:enterprise] ",
    });
  });

  it("maps an arbitrary/tampered request value to null + prefix, never passes it through", () => {
    expect(intentPlanCode("drop table plans;--", DB_CODES)).toEqual({
      planCode: null,
      notePrefix: "[tier:drop table plans;--] ",
    });
  });

  it("trims whitespace before checking membership and before prefixing", () => {
    expect(intentPlanCode("  standby  ", DB_CODES)).toEqual({ planCode: "standby", notePrefix: null });
    expect(intentPlanCode("  regional  ", DB_CODES)).toEqual({
      planCode: null,
      notePrefix: "[tier:regional] ",
    });
  });

  it("treats empty/blank requests as nothing to record, not a prefixed tier", () => {
    expect(intentPlanCode("", DB_CODES)).toEqual({ planCode: null, notePrefix: null });
    expect(intentPlanCode("   ", DB_CODES)).toEqual({ planCode: null, notePrefix: null });
  });

  it("derives from whatever dbCodes it is given, not a hardcoded list", () => {
    // If the DB adds a new plan code, intentPlanCode must accept it without a code change.
    expect(intentPlanCode("new_tier_2026", ["new_tier_2026"])).toEqual({
      planCode: "new_tier_2026",
      notePrefix: null,
    });
    // And if the DB drops a plan, a previously-known code must now FK-safely degrade.
    expect(intentPlanCode("standby", [])).toEqual({
      planCode: null,
      notePrefix: "[tier:standby] ",
    });
  });
});

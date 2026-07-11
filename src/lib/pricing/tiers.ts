// Pure pricing-tier model. No i18n, no DB access, no JSX — page.tsx supplies copy via
// t("pricing.<tier.id>....") and passes the live `plans` row set in. Kept pure so the
// FK-safety and discount-math rules below are unit-testable without a database.

/** Shape of a row from `SELECT code, name, price_cents, interval FROM plans WHERE active`. */
export interface DbPlan {
  code: string;
  name: string;
  price_cents: number;
  interval: string; // "month" | "year" (plan_interval enum; kept as string at the boundary)
}

export interface BillingOption {
  /** plans.code — the only thing safe to submit as subscribe_intents.plan_code (FK). */
  code: string;
  interval: "month" | "year";
  /** Sticker price for this cadence (e.g. the full annual charge, not divided). */
  priceUsd: number;
  /** Normalized to a monthly figure so annual and monthly options are comparable. */
  monthlyEquivalentUsd: number;
}

export type TierPricing =
  | { kind: "db"; billing: BillingOption[]; annualDiscountPct: number | null }
  | { kind: "on_request" };

export type TierId = "standby" | "full" | "regional" | "enterprise";

export interface Tier {
  id: TierId;
  pricing: TierPricing;
}

/** Stable card order regardless of DB row order. */
export const TIER_ORDER: readonly TierId[] = ["standby", "full", "regional", "enterprise"];

function toBillingOption(p: DbPlan): BillingOption {
  const interval: "month" | "year" = p.interval === "year" ? "year" : "month";
  const priceUsd = p.price_cents / 100;
  const monthlyEquivalentUsd = interval === "year" ? priceUsd / 12 : priceUsd;
  return { code: p.code, interval, priceUsd, monthlyEquivalentUsd };
}

/**
 * Annual discount vs. the monthly rate, computed from real DB prices — never a
 * hardcoded percentage. Null when either side is missing or the monthly rate is
 * non-positive (nothing to discount against).
 */
function computeAnnualDiscountPct(monthly: DbPlan | undefined, annual: DbPlan | undefined): number | null {
  if (!monthly || !annual) return null;
  const monthlyRate = monthly.price_cents / 100;
  if (monthlyRate <= 0) return null;
  const annualMonthlyEquivalent = annual.price_cents / 100 / 12;
  const discount = 1 - annualMonthlyEquivalent / monthlyRate;
  return Math.round(discount * 100);
}

/**
 * Build the ordered tier cards from live DB plan rows.
 *
 * - Standby: DB-backed from plans.code = "standby".
 * - Full analyst: DB-backed, merging full_monthly + full_annual into one tier with
 *   up to two billing options; annual discount derived from actual prices.
 * - Regional bundles + Enterprise/API: no DB row today — always "on_request" so the
 *   page never fabricates a number for them (truth-in-UI).
 *
 * A DB-eligible tier (standby, full) still degrades to "on_request" if its plan
 * row(s) are absent or inactive-filtered-out, rather than showing a stale/fake price.
 */
export function buildTiers(dbPlans: DbPlan[]): Tier[] {
  const byCode = new Map(dbPlans.map((p) => [p.code, p]));
  const standbyPlan = byCode.get("standby");
  const fullMonthly = byCode.get("full_monthly");
  const fullAnnual = byCode.get("full_annual");

  const fullBilling: BillingOption[] = [];
  if (fullMonthly) fullBilling.push(toBillingOption(fullMonthly));
  if (fullAnnual) fullBilling.push(toBillingOption(fullAnnual));

  const tiers: Tier[] = [
    {
      id: "standby",
      pricing: standbyPlan
        ? { kind: "db", billing: [toBillingOption(standbyPlan)], annualDiscountPct: null }
        : { kind: "on_request" },
    },
    {
      id: "full",
      pricing:
        fullBilling.length > 0
          ? { kind: "db", billing: fullBilling, annualDiscountPct: computeAnnualDiscountPct(fullMonthly, fullAnnual) }
          : { kind: "on_request" },
    },
    { id: "regional", pricing: { kind: "on_request" } },
    { id: "enterprise", pricing: { kind: "on_request" } },
  ];

  return tiers;
}

/**
 * FK-safety allowlist for subscribe_intents.plan_code (which has a FOREIGN KEY to
 * plans.code — any other value throws on insert). `dbCodes` MUST come from the same
 * live query that rendered the page, never a hardcoded list, so newly added/removed
 * plans stay correct automatically.
 *
 * - Known code → passes through as plan_code, no note prefix.
 * - Anything else (new static tiers like "regional"/"enterprise", bundle slugs, junk
 *   from a tampered form) → plan_code NULL, requested tier recorded as a note prefix
 *   so the lead isn't lost.
 * - Empty/blank request → both null (nothing to record).
 */
export function intentPlanCode(
  requested: string,
  dbCodes: readonly string[],
): { planCode: string | null; notePrefix: string | null } {
  const trimmed = requested.trim();
  if (!trimmed) return { planCode: null, notePrefix: null };
  if (dbCodes.includes(trimmed)) return { planCode: trimmed, notePrefix: null };
  return { planCode: null, notePrefix: `[tier:${trimmed}] ` };
}

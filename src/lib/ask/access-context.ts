// AI Search Phase 7: the AccessContext contract Ask codes AGAINST — the real
// module is BILLING-OWNED (src/lib/billing/entitlements.ts,
// resolveAccessContext()) and DOES NOT EXIST yet. Nothing here is wired into
// any money path: the existing gates (allowance, SpendGuard, invite gate)
// remain the sole authority, and live entitlement integration is
// ENABLEMENT-BLOCKED on the billing workstream's frozen contract plus the
// Gate 7 joint boundary review.
//
// Boundary rules this contract encodes (§9.4, restated so they cannot drift):
//  - resolved ONCE at run creation, by the route/action boundary ONLY;
//  - the pipeline receives plain data — retrieval/rerank/generation/
//    validation/persistence/SSE/cache/rendering must not import billing
//    (import-graph-tested);
//  - accepted in-flight runs finish under their initial context; SSE/result/
//    cancel endpoints check RUN OWNERSHIP only, never billing per event;
//  - payment NEVER overrides a SpendGuard cap — entitlements can only ever
//    RESTRICT further, and this module imports nothing from the usage layer.

export interface AccessContext {
  /** provider-neutral tier label — never a Paddle/processor object */
  tier: string;
  /** stable product modes (Auto/Fast/Deep) the subject may request */
  modesAllowed: string[];
  /** pooled analysis units remaining, null = not metered (beta) */
  unitsRemaining: number | null;
  /** per-day run limit the billing plan grants, null = the existing
   *  ASK_USER_DAILY_LIMIT stays authoritative */
  maxPerDay: number | null;
  /** organization/workspace key for pooled accounting, null = personal */
  orgKey: string | null;
}

export type ResolveAccessContext = (userEmail: string) => Promise<AccessContext>;

/** The BETA stub: everything the existing gates allow, nothing more granted.
 *  Fail-closed shape parity: if the future billing module throws, the caller
 *  must refuse paid Ask (limit state) — mirrored by stubResolveAccessContext
 *  never throwing (it grants nothing the current gates don't already govern). */
export const stubResolveAccessContext: ResolveAccessContext = async () => ({
  tier: "beta",
  modesAllowed: ["auto"],
  unitsRemaining: null,
  maxPerDay: null,
  orgKey: null,
});

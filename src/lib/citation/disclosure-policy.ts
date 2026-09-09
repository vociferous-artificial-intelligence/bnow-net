import type { Role } from "@/lib/gate";
import { isStubToolStamp, type ClaimCitationStamp, type ClaimToolStamp } from "./ics206";

// AI-tool disclosure gate (operator decision T4 + T4-b, 2026-09-07). The
// capability is BUILT and shipped DARK: no surface — public page, signed-in
// view, or citation mode — discloses which engine or model produced a claim,
// pending a market signal that full tool disclosure is demanded. The 2026-07-16
// decision to hide the digest provider stands unreversed.
//
// This is a POLICY FUNCTION, not a boolean constant, and this file is the ONLY
// place that decides it — the `src/lib/registry/view-policy.ts` pattern. When
// the billing entitlement lands (src/lib/billing/entitlements.ts,
// resolveAccessContext(), which DOES NOT EXIST yet — see
// src/lib/ask/access-context.ts), enabling the disclosure for the paid tier is
// a change to ENTITLED_TIERS below, in one security-reviewable place, rather
// than a rebuild of every citation call site.
//
// The gate keys on TIER, never on role. T4's hold covers signed-in users AND
// admins, so making role the gate would leak the disclosure to the two
// privileged roles the moment anyone reached for the familiar registry
// pattern. `role` stays on the viewer because a future policy may need to
// RESTRICT further by it (entitlements can only ever narrow — access-context.ts
// §9.4), never to widen; disclosure-policy.test.ts pins that no role unlocks it.

export type CitationViewer = {
  /** Resolved by the page from currentRole(); "anon" also covers a degraded lookup. */
  role: Role | "anon";
  /** Billing tier, null until the entitlements module exists. Never inferred from role. */
  tier?: string | null;
};

export type CitationDisclosureView = {
  /** The per-stage AI-tool disclosure block renders and its stamp may cross to the client. */
  showToolDisclosure: boolean;
};

/**
 * Tiers entitled to the AI-tool disclosure. EMPTY by operator decision T4 — the
 * capability exists so that enabling it is configuration, not construction. A
 * tier is only added here alongside a decision-log entry that reverses T4's hold.
 */
const ENTITLED_TIERS: ReadonlySet<string> = new Set<string>();

const WITHHELD: CitationDisclosureView = { showToolDisclosure: false };
const DISCLOSED: CitationDisclosureView = { showToolDisclosure: true };

/**
 * Fail-closed by construction: a viewer with no tier, an unknown tier, or (in
 * the current configuration) any tier at all resolves to the withheld view.
 */
export function citationDisclosureView(viewer: CitationViewer): CitationDisclosureView {
  const tier = viewer.tier?.trim();
  return tier && ENTITLED_TIERS.has(tier) ? DISCLOSED : WITHHELD;
}

/**
 * Applies the policy SERVER-SIDE, before the copy payload is built. This
 * placement is the whole protection: ClaimCopyActions is a "use client"
 * component, so every field of its `payload` prop is serialized into the RSC
 * flight payload embedded in the page HTML. A withheld stamp left on the
 * payload would be readable in view-source by exactly the people T4 withholds
 * it from — "not rendered" is not "not disclosed". Withheld therefore means
 * ABSENT: `tools` is null and no model name crosses the boundary.
 *
 * `attributable` is the only thing the dark path needs. It answers ruling 3
 * (a stub-provider digest never copies as a citation) without carrying the
 * provider string that would answer it by inspection.
 */
export function resolveClaimCitationStamp(
  stamp: ClaimToolStamp,
  view: CitationDisclosureView,
): ClaimCitationStamp {
  return {
    attributable: !isStubToolStamp(stamp),
    tools: view.showToolDisclosure ? stamp : null,
  };
}

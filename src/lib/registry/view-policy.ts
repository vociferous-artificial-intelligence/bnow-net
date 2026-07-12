import type { Role } from "@/lib/gate";

// Registry moat gate (Decision D1, operator-confirmed 2026-07-11): the full
// ranked/scored source registry — the reliability score, reliability-rank
// ordering, and the exact hedging-weight constants that would let the score
// be reconstructed — is an analyst/admin privilege. A regular signed-in user
// (or "anon", which currentRole() also returns on a failed/degraded role
// lookup — see gate.ts) gets a reduced view: same search/filter/methodology
// surface, but every moat field above is absent from BOTH the index pages
// and the per-source detail page. Sequential source ids make id-walking a
// live threat, so the detail page must independently withhold these fields,
// not merely omit a link to them from the index.
//
// This is the ONLY place that decides what the reduced view shows. Pages
// consume the returned booleans and must not re-derive the policy inline —
// that is what keeps this file the single security-reviewable source of
// truth for the gate.

export type RegistryView = {
  /** Reliability score renders anywhere (index column, detail header/table). */
  showReliability: boolean;
  /** `?sort=reliability` is honored; false forces citation-count ordering. */
  allowReliabilitySort: boolean;
  /** The exact hedging-weight constants render (detail-page legend). */
  showWeightConstants: boolean;
};

const FULL_VIEW: RegistryView = {
  showReliability: true,
  allowReliabilitySort: true,
  showWeightConstants: true,
};

const REDUCED_VIEW: RegistryView = {
  showReliability: false,
  allowReliabilitySort: false,
  showWeightConstants: false,
};

/**
 * Fail-closed by construction: only the two known privileged roles resolve to
 * the full view. Any other value — "user", "anon", or (defensively) anything
 * outside the Role|"anon" union a future caller might pass at runtime — gets
 * the reduced view.
 */
export function registryView(role: Role | "anon"): RegistryView {
  return role === "analyst" || role === "admin" ? FULL_VIEW : REDUCED_VIEW;
}

export type RegistrySort = "citations" | "reliability";

/**
 * Sanitizes the `?sort=` query param against the resolved view. A regular
 * user must not be able to opt into reliability ordering by hand-editing the
 * URL — the moat is the ordering itself, not just the visible column.
 */
export function resolveRegistrySort(
  raw: string | undefined,
  view: RegistryView,
): RegistrySort {
  return raw === "reliability" && view.allowReliabilitySort ? "reliability" : "citations";
}

// Route identity for the conflict surfaces: stable public slugs ⇄ conflict ids.
//
// Pure and IO-free, in its own module for the same reason `evidence-row.ts` and
// `result-summary.ts` are: the slug table is needed by BOTH providers and by
// every conflict route, and it used to live in `product-view.ts`, so resolving
// a slug pulled the fixture corpus loader into the DB-backed pages' module
// graph. Ruling 3 is kept by the module graph rather than by review.

import { ConflictDomainError } from "./errors";
import type { ConflictId } from "./vocabulary";

/** Stable public URL slugs (IA decision, P6 report §1). Never re-keyed. */
export const CONFLICT_SLUGS: Readonly<Record<string, ConflictId>> = {
  "russia-ukraine": "russia_ukraine",
  "iran-regional": "iran_regional",
};

export function conflictIdForSlug(slug: string): ConflictId | null {
  const id = CONFLICT_SLUGS[slug];
  return id === undefined ? null : id;
}

export function slugForConflictId(id: ConflictId): string {
  for (const [slug, cid] of Object.entries(CONFLICT_SLUGS)) {
    if (cid === id) return slug;
  }
  // unreachable while CONFLICT_SLUGS covers CONFLICT_IDS; fail closed anyway
  throw new ConflictDomainError("unknown_conflict", `no slug for conflict ${id}`);
}

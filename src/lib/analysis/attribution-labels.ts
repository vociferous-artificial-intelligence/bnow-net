// Ruling 19's fixed attribution vocabulary, on its own leaf module.
//
// These two constants are the only words the publication guard ever ADDS to
// published prose, and they are now read by two very different places: the guard
// itself (which writes them into digest text) and the ICS 206-01 citation
// builder (src/lib/citation/ics206.ts, which reproduces the label verbatim in a
// citation artifact). The citation module is reachable from a "use client"
// component, and publication-guard.ts sits on top of the analysis provider stack
// — importing the labels from there would put src/lib/usage/spend-guard.ts and
// @/db in the client component's import graph. Today that graph edge is a
// type-only import the bundler erases; the first runtime import added to the
// guard would make it real. A leaf with no imports of its own removes the hazard
// instead of relying on nobody ever noticing it.
//
// publication-guard.ts re-exports both names, so every existing consumer and its
// tests are unaffected and there stays exactly one definition.

/** Hedging classes that mean "someone asserts this; BNOW has not confirmed it". */
export const DISPUTED_HEDGING: ReadonlySet<string> = new Set([
  "claimed",
  "unverified",
  "unknown",
]);

/** Fixed attribution labels — the only words the publication guard ever adds. */
export const ATTRIBUTION_LABEL: Record<string, string> = {
  claimed: "Sources claim:",
  unverified: "Unverified reporting:",
  unknown: "Unverified reporting:",
};

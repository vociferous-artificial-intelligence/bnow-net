// Presentation rule for an unmatched ("ours only") scoreboard claim
// (publication-safety, Workstream B 2026-07-13): only a confirmed/assessed claim
// earns the "potential lead" framing — a non-confirmed (or unknown-hedge) claim
// renders as a reported item with its hedge shown, so a low-confidence
// allegation is never visually endorsed as a lead. Pure; used by the scoreboard
// divergence detail page.

export function oursOnlyPresentation(hedging: string | undefined): {
  label: string;
  hedge: string;
} {
  if (hedging === "confirmed" || hedging === "assessed") {
    return { label: "ours only (potential lead)", hedge: hedging };
  }
  return { label: "BNOW-only reported item", hedge: hedging ?? "unverified" };
}

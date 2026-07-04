// Rule-based hedging classifier for the sentence context around an ISW citation marker.
// Categories per brief §4: confirmed / claimed / unverified / assessed.
// Order matters: more specific signals first. LLM assist can refine later.

export type Hedging = "confirmed" | "claimed" | "unverified" | "assessed" | "unknown";

interface Rule {
  hedging: Hedging;
  re: RegExp;
}

// NOTE: each regex's first capture group is used as the stored cue phrase.
const RULES: Rule[] = [
  // unverified: explicit inability to verify beats everything
  { hedging: "unverified", re: /(cannot (?:independently )?(?:verify|confirm))/i },
  { hedging: "unverified", re: /(has not (?:yet )?(?:observed|verified|confirmed))/i },
  { hedging: "unverified", re: /(unverified|unconfirmed) (?:footage|images?|reports?|claims?)/i },
  { hedging: "unverified", re: /\b(purported(?:ly)?)\b/i },

  // confirmed: geolocation / visual confirmation language
  { hedging: "confirmed", re: /(geolocated (?:footage|imagery|images?|video|photos?))/i },
  { hedging: "confirmed", re: /(footage (?:published|posted).{0,40}(?:shows|showing|confirms))/i },
  { hedging: "confirmed", re: /(visually confirmed|visual confirmation)/i },
  { hedging: "confirmed", re: /(satellite imagery (?:shows|showing|confirms|captured))/i },
  { hedging: "confirmed", re: /\b(confirmed)\b/i },

  // assessed: ISW's own analytic judgment
  { hedging: "assessed", re: /(ISW (?:assesses|assessed|has assessed|continues to assess))/i },
  { hedging: "assessed", re: /(ISW (?:has )?previously (?:assessed|reported|observed|noted))/i },
  { hedging: "assessed", re: /\b(likely|probably|almost certainly|possibly)\b/i },

  // claimed: attributed but not endorsed
  { hedging: "claimed", re: /\b(claimed|claims|claiming)\b/i },
  { hedging: "claimed", re: /\b(reportedly|allegedly|according to)\b/i },
  { hedging: "claimed", re: /\b(reported|reporting) that\b/i },
  { hedging: "claimed", re: /\b(stated|said|announced|asserted|denied|acknowledged|warned|amplified|told)\b/i },
  { hedging: "claimed", re: /\b(sources? (?:reported|indicated))\b/i },
];

// NOTE: ISW's unhedged declaratives ("Russian forces advanced near X.[n]") are
// deliberately left "unknown" — they are ISW-accepted facts, not hedged attributions,
// and forcing them into one of the four classes would corrupt the reliability signal.

export interface HedgingResult {
  hedging: Hedging;
  cue: string | null;
}

export function classifyHedging(sentence: string): HedgingResult {
  for (const rule of RULES) {
    const m = sentence.match(rule.re);
    if (m) return { hedging: rule.hedging, cue: (m[1] ?? m[0]).slice(0, 60) };
  }
  return { hedging: "unknown", cue: null };
}

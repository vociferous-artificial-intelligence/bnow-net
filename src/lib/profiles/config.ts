// Buyer profiles: re-weight the SAME claim/event set to a buyer's decision.
// One feed → several products. Read-time transform only — no ingestion or schema
// change. See docs/COMPETITIVE-AND-DEMAND.md §2.

export interface BuyerProfile {
  key: string;
  label: string;
  description: string;
  // weights (default 1.0). Higher = surfaced higher for this buyer.
  trackWeights: Record<string, number>; // military | elite_politics | ...
  eventTypeWeights: Record<string, number>; // strike | prosecution | asset_seizure | ...
  platformWeights: Record<string, number>; // gov | state_media | telegram | independent_media
  recencyHalfLifeHours: number; // smaller = weights fresh items harder
}

export const PROFILES: BuyerProfile[] = [
  {
    key: "balanced",
    label: "Balanced",
    description: "Default view — no buyer-specific weighting.",
    trackWeights: {},
    eventTypeWeights: {},
    platformWeights: {},
    recencyHalfLifeHours: 48,
  },
  {
    key: "frontline",
    label: "Frontline / threatened state",
    description:
      "Warning & mobilization: troop movements, strikes, logistics, regional recruitment. Latency and coverage first.",
    trackWeights: { military: 1.8, elite_politics: 0.6 },
    eventTypeWeights: { strike: 1.6, advance: 1.6, air_defense: 1.4, appointment: 0.7 },
    platformWeights: { telegram: 1.3, gov: 1.2 },
    recencyHalfLifeHours: 18,
  },
  {
    key: "sanctioning",
    label: "Sanctioning state",
    description:
      "Evasion, economic attrition & elite cohesion: mirror-trade, factional fracture, data suppression. Is pressure working, who's cracking.",
    trackWeights: { elite_politics: 1.8, military: 0.8 },
    eventTypeWeights: {
      prosecution: 1.7, asset_seizure: 1.7, dismissal: 1.4, elite_death: 1.4, economic: 1.5,
    },
    platformWeights: { independent_media: 1.3, gov: 1.1 },
    recencyHalfLifeHours: 72,
  },
  {
    key: "commodity",
    label: "Commodity trading desk",
    description:
      "Supply shock: refinery/port/pipeline outages, export quotas, procurement, choke-points. What's the supply delta, when.",
    trackWeights: { military: 1.4, elite_politics: 0.9 },
    eventTypeWeights: { strike: 1.8, economic: 1.7, air_defense: 0.8 },
    platformWeights: { independent_media: 1.2, state_media: 1.1 },
    recencyHalfLifeHours: 24,
  },
  {
    key: "compliance",
    label: "Bank / MNC compliance",
    description:
      "Counterparty risk: prosecutions-before-designation, sanctions status, ownership. Is this name about to become toxic.",
    trackWeights: { elite_politics: 1.9, military: 0.5 },
    eventTypeWeights: { prosecution: 1.9, asset_seizure: 1.7, dismissal: 1.3 },
    platformWeights: { independent_media: 1.2, gov: 1.1 },
    recencyHalfLifeHours: 96,
  },
];

export const PROFILE_MAP = new Map(PROFILES.map((p) => [p.key, p]));

export function getProfile(key: string | undefined): BuyerProfile {
  return PROFILE_MAP.get(key ?? "balanced") ?? PROFILES[0];
}

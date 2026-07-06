// Mirror-trade watch config: transit hubs (rerouting suspects) and evasion-relevant
// HS codes (dual-use goods that keep reaching Russia's military-industrial base).

export interface Reporter {
  code: number; // UN M49
  name: string;
}

// Transit hubs whose exports-to-Russia surged post-2022 (the rerouting suspects).
export const TRANSIT_PARTNERS: Reporter[] = [
  { code: 51, name: "Armenia" },
  { code: 398, name: "Kazakhstan" },
  { code: 417, name: "Kyrgyzstan" },
  { code: 784, name: "United Arab Emirates" },
  { code: 792, name: "Türkiye" },
  { code: 156, name: "China" },
  { code: 268, name: "Georgia" },
  { code: 688, name: "Serbia" },
];

// For narrative context: pre-war direct suppliers whose exports collapsed/diverted.
export const BASELINE_PARTNERS: Reporter[] = [
  { code: 276, name: "Germany" },
  { code: 842, name: "United States" },
  { code: 528, name: "Netherlands" },
];

export const RUSSIA_CODE = 643;

// Evasion-relevant HS codes (2-4 digit). TOTAL anchors the overall reconstruction.
export const WATCHED_HS: Array<{ code: string; label: string }> = [
  { code: "TOTAL", label: "All goods" },
  { code: "85", label: "Electrical machinery & electronics" },
  { code: "8542", label: "Integrated circuits (chips)" },
  { code: "8471", label: "Computers" },
  { code: "8517", label: "Telecom equipment" },
  { code: "84", label: "Machinery & mechanical appliances" },
  { code: "8466", label: "Machine-tool parts" },
  { code: "88", label: "Aircraft / drones" },
  { code: "87", label: "Vehicles" },
  { code: "9013", label: "Optical devices / lasers" },
];

// Years to pull: pre-war baseline through recent (annual is more complete than monthly).
export const WATCH_YEARS = ["2021", "2022", "2023", "2024"];
export const BASELINE_YEAR = "2021";

// A partner-HS series is flagged when its recent value is this multiple of the
// pre-war (2021) baseline AND materially large, suggesting rerouting rather than
// organic demand growth.
export const DIVERGENCE_MULTIPLE = 2.0;
export const MATERIAL_USD = 5_000_000; // ignore noise below $5M

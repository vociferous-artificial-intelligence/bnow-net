// Critical-materials dependency config. US structural import dependencies mapped to
// HS codes + chokepoint context. See docs/CRITICAL-MATERIALS.md.

export interface CriticalMaterial {
  hsCode: string;
  label: string;
  category: "semiconductors" | "batteries" | "rare_earths" | "energy" | "pharma" | "materials";
  chokepoint: string; // human context: the dependency narrative
  sensitiveSuppliers: number[]; // UN M49 codes of geopolitically-exposed suppliers
}

// UN M49 for the sensitive-supplier flags
export const M49 = {
  china: 156, taiwan: 490, southKorea: 410, japan: 392, malaysia: 458,
  vietnam: 704, thailand: 764, canada: 124, kazakhstan: 398, russia: 643, india: 356,
} as const;

export const US_REPORTER = 842;

export const CRITICAL_MATERIALS: CriticalMaterial[] = [
  {
    hsCode: "8542", label: "Integrated circuits (chips)", category: "semiconductors",
    chokepoint: "Advanced-node fabrication is heavily concentrated in Taiwan; back-end packaging clusters in Malaysia/Vietnam.",
    sensitiveSuppliers: [M49.taiwan, M49.china, M49.malaysia, M49.southKorea],
  },
  {
    hsCode: "8541", label: "Semiconductor devices / diodes", category: "semiconductors",
    chokepoint: "Discrete semis and power devices, East-Asia concentrated.",
    sensitiveSuppliers: [M49.china, M49.taiwan, M49.southKorea, M49.japan],
  },
  {
    hsCode: "8507", label: "Lithium-ion batteries", category: "batteries",
    chokepoint: "EV/grid battery cells concentrated in China and South Korea.",
    sensitiveSuppliers: [M49.china, M49.southKorea, M49.japan],
  },
  {
    hsCode: "2846", label: "Rare-earth compounds", category: "rare_earths",
    chokepoint: "Rare-earth production and especially processing are heavily concentrated in China.",
    sensitiveSuppliers: [M49.china],
  },
  {
    hsCode: "2805", label: "Rare-earth metals / alkali metals", category: "rare_earths",
    chokepoint: "Upstream rare-earth metals, China-dominated.",
    sensitiveSuppliers: [M49.china, M49.russia, M49.kazakhstan],
  },
  {
    hsCode: "8505", label: "Permanent magnets (NdFeB)", category: "rare_earths",
    chokepoint: "Rare-earth magnet supply (motors, defense, wind) is dominated by China.",
    sensitiveSuppliers: [M49.china],
  },
  {
    hsCode: "3818", label: "Doped semiconductor wafers", category: "semiconductors",
    chokepoint: "Silicon wafers / doped substrates — Japan-dominated upstream.",
    sensitiveSuppliers: [M49.japan, M49.china, M49.taiwan],
  },
  {
    hsCode: "2844", label: "Uranium / nuclear fuel", category: "energy",
    chokepoint: "Enriched uranium and nuclear fuel — Canada, Kazakhstan, Russia.",
    sensitiveSuppliers: [M49.russia, M49.kazakhstan, M49.canada],
  },
  {
    hsCode: "2709", label: "Crude oil", category: "energy",
    chokepoint: "Canada is the largest single foreign crude supplier to the US, pipeline-hardwired — see the measured share below.",
    sensitiveSuppliers: [M49.canada],
  },
  {
    hsCode: "2941", label: "Antibiotics (APIs)", category: "pharma",
    chokepoint: "Active pharmaceutical ingredients / precursors — China & India dominant.",
    sensitiveSuppliers: [M49.china, M49.india],
  },
  {
    hsCode: "2804", label: "Gallium / germanium / rare gases", category: "materials",
    chokepoint: "Gallium & germanium (chip/defense inputs) — China export-controlled.",
    sensitiveSuppliers: [M49.china],
  },
];

export const MATERIALS_YEARS = ["2021", "2022", "2023", "2024"];
// concentration thresholds
export const HIGH_CONCENTRATION_HHI = 0.4; // >0.4 HHI = highly concentrated
export const HIGH_TOP_SHARE = 0.5; // single supplier > 50%

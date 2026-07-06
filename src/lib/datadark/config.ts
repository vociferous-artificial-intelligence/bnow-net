// Watched Russian statistical publications. Seeds the data-dark tracker.
// 'classified' entries are documented suppressions (see RUSSIA-DATA-ROADMAP §1 sources);
// 'live' entries we actively poll for freshness. Period regexes pull the latest
// published period label from each page for staleness detection.

export interface SeriesSeed {
  key: string;
  label: string;
  agency: string;
  url: string;
  cadenceDays: number;
  baselineStatus: "live" | "classified" | "unreachable";
  note?: string;
  /** regex whose first group is a period label (year/month) on the live page */
  periodRe?: string;
}

export const SERIES_SEEDS: SeriesSeed[] = [
  // --- documented classifications (intel by their absence) ---
  {
    key: "rosstat-demography-monthly",
    label: "Monthly demographics (births/deaths/marriages)",
    agency: "Rosstat",
    url: "https://rosstat.gov.ru/folder/12781",
    cadenceDays: 30,
    baselineStatus: "classified",
    note: "Monthly natural-population data suspended Jul 2025 amid war deaths/demographic crisis.",
  },
  {
    key: "rosstat-oil-gas-output",
    label: "Oil & gas / fuel production",
    agency: "Rosstat",
    url: "https://rosstat.gov.ru/enterprise_industrial",
    cadenceDays: 30,
    baselineStatus: "classified",
    note: "Output figures classified 2023; gasoline/diesel suspended 2024 after refinery strikes; extended to Apr 2026.",
  },
  {
    key: "customs-trade-detail",
    label: "Detailed import/export customs statistics",
    agency: "Customs",
    url: "https://customs.gov.ru/statistic",
    cadenceDays: 30,
    baselineStatus: "classified",
    note: "Detailed trade statistics closed to obscure sanctions-evasion trade flows.",
  },
  {
    key: "genprok-crime-4egs",
    label: "Crime statistics portal (4-EGS)",
    agency: "Prosecutor General",
    url: "http://crimestat.ru/",
    cadenceDays: 30,
    baselineStatus: "classified",
    note: "Legal-statistics portal update ceased.",
  },
  // --- live-polled (reachable from Vercel) ---
  {
    key: "minfin-budget-execution",
    label: "Federal budget execution (oil&gas vs non-oil revenue)",
    agency: "MinFin",
    url: "https://minfin.gov.ru/ru/statistics/fedbud/execute/",
    cadenceDays: 30,
    baselineStatus: "live",
    note: "Fiscal-strain signal; still published.",
    periodRe: "(январь|февраль|март|апрель|май|июнь|июль|август|сентябрь|октябрь|ноябрь|декабрь)[^<]{0,20}(20\\d\\d)",
  },
  {
    key: "cbr-key-rate",
    label: "CBR key rate & monetary statistics",
    agency: "CBR",
    url: "https://www.cbr.ru/hd_base/keyrate/",
    cadenceDays: 45,
    baselineStatus: "live",
    periodRe: "(\\d{2}\\.\\d{2}\\.20\\d\\d)",
  },
  {
    key: "cbr-statistics",
    label: "CBR statistics hub",
    agency: "CBR",
    url: "https://www.cbr.ru/statistics/",
    cadenceDays: 45,
    baselineStatus: "live",
    periodRe: "(20\\d\\d)",
  },
];

import { RUSSIA_CODE } from "./config";

// UN Comtrade adapter. Public preview endpoint works keyless (rate-limited);
// COMTRADE_API_KEY (comtradeplus.un.org) raises limits via the authenticated host.
// Reachable from Vercel egress (not the build host) — run pulls via the cron route.

export interface ComtradeRow {
  reporterCode: number;
  reporterName: string;
  partnerCode: number;
  /** Upstream partnerDesc when the response carries it; null otherwise (the
   *  read path then falls back to the deterministic M49 map in partners.ts). */
  partnerName: string | null;
  flowCode: string;
  hsCode: string;
  period: string;
  valueUsd: number;
  netWeightKg: number | null;
}

interface RawComtradeRecord {
  reporterCode: number;
  reporterDesc?: string | null;
  partnerCode: number;
  partnerDesc?: string | null;
  flowCode: string;
  cmdCode: string;
  period: string;
  primaryValue?: number | null;
  netWgt?: number | null;
}

export function parseComtrade(json: unknown, reporterName: string): ComtradeRow[] {
  const data = (json as { data?: RawComtradeRecord[] })?.data ?? [];
  const out: ComtradeRow[] = [];
  for (const r of data) {
    if (r.partnerCode !== RUSSIA_CODE) continue; // guard: only RU bilateral
    if (typeof r.primaryValue !== "number") continue;
    out.push({
      reporterCode: r.reporterCode,
      reporterName: r.reporterDesc ?? reporterName,
      partnerCode: r.partnerCode,
      partnerName: r.partnerDesc?.trim() || null,
      flowCode: r.flowCode,
      hsCode: r.cmdCode,
      period: r.period,
      valueUsd: r.primaryValue,
      netWeightKg: typeof r.netWgt === "number" && r.netWgt > 0 ? r.netWgt : null,
    });
  }
  return out;
}

/** Parse all partner rows for a reporter (excludes the World aggregate, code 0). */
export function parseComtradeBreakdown(json: unknown): ComtradeRow[] {
  const data = (json as { data?: RawComtradeRecord[] })?.data ?? [];
  const out: ComtradeRow[] = [];
  for (const r of data) {
    if (r.partnerCode === 0) continue; // skip World aggregate — we want the breakdown
    if (typeof r.primaryValue !== "number" || r.primaryValue <= 0) continue;
    out.push({
      reporterCode: r.reporterCode,
      reporterName: r.reporterDesc ?? String(r.reporterCode),
      partnerCode: r.partnerCode,
      partnerName: r.partnerDesc?.trim() || null,
      flowCode: r.flowCode,
      hsCode: r.cmdCode,
      period: r.period,
      valueUsd: r.primaryValue,
      netWeightKg: typeof r.netWgt === "number" && r.netWgt > 0 ? r.netWgt : null,
    });
  }
  return out;
}

function baseUrl(): string {
  return process.env.COMTRADE_API_KEY
    ? "https://comtradeapi.un.org/data/v1/get"
    : "https://comtradeapi.un.org/public/v1/preview";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fetch a reporter's per-partner import (or export) breakdown for one HS + year. */
export async function fetchBreakdown(
  reporterCode: number,
  hsCode: string,
  year: string,
  flowCode: "M" | "X",
): Promise<ComtradeRow[] | null> {
  const params = new URLSearchParams({
    reporterCode: String(reporterCode),
    period: year, // keyless preview: one period per call
    cmdCode: hsCode,
    flowCode,
    // Ask Comtrade+ to include reporterDesc/partnerDesc. Live preview responses
    // historically omitted them (every stored reporter_name is "842"); the parser
    // treats the fields as optional either way. Verifiable only from Vercel egress.
    includeDesc: "true",
    ...(process.env.COMTRADE_API_KEY ? { "subscription-key": process.env.COMTRADE_API_KEY } : {}),
  });
  const url = `${baseUrl()}/C/A/HS?${params.toString()}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "BNOWBot/0.1 (+https://bnow.net/bot)",
        ...(process.env.COMTRADE_API_KEY
          ? { "Ocp-Apim-Subscription-Key": process.env.COMTRADE_API_KEY }
          : {}),
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.warn(`comtrade breakdown ${reporterCode}/${hsCode}/${year}: HTTP ${res.status}`);
      return null;
    }
    return parseComtradeBreakdown(await res.json());
  } catch (e) {
    console.warn(`comtrade breakdown ${reporterCode}/${hsCode}/${year}: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

/** Fetch export flows reporter→Russia for one year (all HS codes in one call). */
export async function fetchReporterYear(
  reporterCode: number,
  reporterName: string,
  hsCodes: string[],
  year: string,
  flowCode: "X" | "M" = "X",
): Promise<ComtradeRow[] | null> {
  const params = new URLSearchParams({
    reporterCode: String(reporterCode),
    partnerCode: String(RUSSIA_CODE),
    period: year, // keyless preview: ONE period per call
    cmdCode: hsCodes.join(","), // multiple commodities OK
    flowCode,
    includeDesc: "true", // see fetchBreakdown note — optional-field tolerant either way
    ...(process.env.COMTRADE_API_KEY
      ? { "subscription-key": process.env.COMTRADE_API_KEY }
      : {}),
  });
  const url = `${baseUrl()}/C/A/HS?${params.toString()}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "BNOWBot/0.1 (+https://bnow.net/bot)",
        ...(process.env.COMTRADE_API_KEY
          ? { "Ocp-Apim-Subscription-Key": process.env.COMTRADE_API_KEY }
          : {}),
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.warn(`comtrade ${reporterName} ${year}: HTTP ${res.status}`);
      return null;
    }
    return parseComtrade(await res.json(), reporterName);
  } catch (e) {
    console.warn(`comtrade ${reporterName} ${year}: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

/** Fetch all watched years for a reporter (one call per year, polite spacing). */
export async function fetchReporterFlows(
  reporterCode: number,
  reporterName: string,
  hsCodes: string[],
  years: string[],
  flowCode: "X" | "M" = "X",
): Promise<ComtradeRow[] | null> {
  const all: ComtradeRow[] = [];
  let anyOk = false;
  for (const year of years) {
    const rows = await fetchReporterYear(reporterCode, reporterName, hsCodes, year, flowCode);
    if (rows !== null) {
      anyOk = true;
      all.push(...rows);
    }
    await sleep(2500); // keyless rate limit
  }
  return anyOk ? all : null;
}

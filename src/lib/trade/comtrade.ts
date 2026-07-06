import { RUSSIA_CODE } from "./config";

// UN Comtrade adapter. Public preview endpoint works keyless (rate-limited);
// COMTRADE_API_KEY (comtradeplus.un.org) raises limits via the authenticated host.
// Reachable from Vercel egress (not the build host) — run pulls via the cron route.

export interface ComtradeRow {
  reporterCode: number;
  reporterName: string;
  partnerCode: number;
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

/** Fetch annual export flows reporter→Russia for the given HS codes + years. */
export async function fetchReporterFlows(
  reporterCode: number,
  reporterName: string,
  hsCodes: string[],
  years: string[],
  flowCode: "X" | "M" = "X",
): Promise<ComtradeRow[] | null> {
  const params = new URLSearchParams({
    reporterCode: String(reporterCode),
    partnerCode: String(RUSSIA_CODE),
    period: years.join(","),
    cmdCode: hsCodes.join(","),
    flowCode,
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
      console.warn(`comtrade ${reporterName}: HTTP ${res.status}`);
      return null;
    }
    return parseComtrade(await res.json(), reporterName);
  } catch (e) {
    console.warn(`comtrade ${reporterName}: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

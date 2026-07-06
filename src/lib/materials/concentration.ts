import { HIGH_CONCENTRATION_HHI, HIGH_TOP_SHARE } from "./config";

// Supplier-concentration analytics for US imports of a critical good. Pure functions.
// HHI (Herfindahl-Hirschman Index) over supplier shares = choke-point severity.

export interface SupplierFlow {
  partnerCode: number;
  partnerName: string;
  valueUsd: number;
}

export interface Concentration {
  hsCode: string;
  year: string;
  totalUsd: number;
  topSupplierCode: number | null;
  topSupplierName: string | null;
  topSharePct: number; // 0-100
  top3SharePct: number;
  hhi: number; // 0-1
  sensitiveSharePct: number; // share held by flagged sensitive suppliers
  concentrated: boolean; // HHI or top-share above threshold
  suppliers: Array<{ name: string; code: number; sharePct: number; usd: number }>;
}

export function computeConcentration(
  hsCode: string,
  year: string,
  flows: SupplierFlow[],
  sensitiveSuppliers: number[],
): Concentration | null {
  const positive = flows.filter((f) => f.valueUsd > 0);
  const total = positive.reduce((s, f) => s + f.valueUsd, 0);
  if (total <= 0) return null;

  const ranked = positive
    .map((f) => ({ name: f.partnerName, code: f.partnerCode, usd: f.valueUsd, share: f.valueUsd / total }))
    .sort((a, b) => b.usd - a.usd);

  const hhi = ranked.reduce((s, r) => s + r.share * r.share, 0);
  const top = ranked[0] ?? null;
  const top3 = ranked.slice(0, 3).reduce((s, r) => s + r.share, 0);
  const sensitiveSet = new Set(sensitiveSuppliers);
  const sensitiveShare = ranked
    .filter((r) => sensitiveSet.has(r.code))
    .reduce((s, r) => s + r.share, 0);

  return {
    hsCode,
    year,
    totalUsd: total,
    topSupplierCode: top?.code ?? null,
    topSupplierName: top?.name ?? null,
    topSharePct: +((top?.share ?? 0) * 100).toFixed(1),
    top3SharePct: +(top3 * 100).toFixed(1),
    hhi: +hhi.toFixed(3),
    sensitiveSharePct: +(sensitiveShare * 100).toFixed(1),
    concentrated: hhi >= HIGH_CONCENTRATION_HHI || (top?.share ?? 0) >= HIGH_TOP_SHARE,
    suppliers: ranked.slice(0, 6).map((r) => ({
      name: r.name, code: r.code, sharePct: +(r.share * 100).toFixed(1), usd: r.usd,
    })),
  };
}

/** Risk score 0-1: concentration × sensitive-supplier exposure. For ranking materials. */
export function riskScore(c: Concentration): number {
  const conc = Math.min(1, c.hhi / 0.6); // normalize HHI
  const exposure = c.sensitiveSharePct / 100;
  return +(0.5 * conc + 0.5 * exposure).toFixed(3);
}

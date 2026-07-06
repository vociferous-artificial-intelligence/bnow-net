import { BASELINE_YEAR, DIVERGENCE_MULTIPLE, MATERIAL_USD } from "./config";

// Divergence analytics over stored trade flows. Pure functions; DB I/O in run.ts.
// Core signal: a transit hub's exports-to-Russia jumping far above its pre-war
// baseline on dual-use goods, with no organic demand basis, indicates rerouting.

export interface FlowPoint {
  reporterCode: number;
  reporterName: string;
  hsCode: string;
  period: string; // year
  valueUsd: number;
}

export interface DivergenceRow {
  reporterCode: number;
  reporterName: string;
  hsCode: string;
  baselineYear: string;
  baselineUsd: number;
  latestYear: string;
  latestUsd: number;
  multiple: number | null; // latest / baseline; null if no baseline
  deltaUsd: number;
  flagged: boolean;
  reason: string;
}

/** Compute per (reporter, hsCode) divergence from the pre-war baseline to the latest year. */
export function computeDivergence(
  flows: FlowPoint[],
  opts?: { baselineYear?: string; multiple?: number; materialUsd?: number },
): DivergenceRow[] {
  const baselineYear = opts?.baselineYear ?? BASELINE_YEAR;
  const threshold = opts?.multiple ?? DIVERGENCE_MULTIPLE;
  const material = opts?.materialUsd ?? MATERIAL_USD;

  // group by reporter+hs
  const groups = new Map<string, FlowPoint[]>();
  for (const f of flows) {
    const k = `${f.reporterCode}|${f.hsCode}`;
    groups.set(k, [...(groups.get(k) ?? []), f]);
  }

  const rows: DivergenceRow[] = [];
  for (const points of groups.values()) {
    const byYear = new Map(points.map((p) => [p.period, p]));
    const years = [...byYear.keys()].sort();
    if (years.length === 0) continue;
    // Prefer the latest year with MATERIAL data — mirror data lags 2-3 months, so
    // the newest calendar year is often near-empty (reporter hasn't filed yet).
    const materialYears = years.filter((y) => (byYear.get(y)?.valueUsd ?? 0) >= material);
    const latestYear = materialYears[materialYears.length - 1] ?? years[years.length - 1];
    const latest = byYear.get(latestYear)!;
    const baseline = byYear.get(baselineYear) ?? null;
    const baselineUsd = baseline?.valueUsd ?? 0;
    // Only compute a multiple against a MATERIAL baseline. A near-zero baseline is
    // usually a reporting gap (the hub didn't file that year), not real zero trade —
    // dividing by it yields spurious 1000× ratios. Sub-material baselines read as "new".
    const multiple = baselineUsd >= material ? latest.valueUsd / baselineUsd : null;
    const deltaUsd = latest.valueUsd - baselineUsd;

    // flag: material size AND (grew >= threshold, or appeared from ~nothing)
    const grewAboveThreshold = multiple !== null && multiple >= threshold;
    const appearedFromNothing = baselineUsd < material && latest.valueUsd >= material;
    const flagged =
      latest.valueUsd >= material && (grewAboveThreshold || appearedFromNothing);

    rows.push({
      reporterCode: latest.reporterCode,
      reporterName: latest.reporterName,
      hsCode: latest.hsCode,
      baselineYear,
      baselineUsd,
      latestYear,
      latestUsd: latest.valueUsd,
      multiple: multiple !== null ? +multiple.toFixed(2) : null,
      deltaUsd,
      flagged,
      reason: !flagged
        ? "within organic range"
        : appearedFromNothing
          ? `appeared: $${fmtM(baselineUsd)}→$${fmtM(latest.valueUsd)} since ${baselineYear}`
          : `${multiple?.toFixed(1)}× baseline ($${fmtM(baselineUsd)}→$${fmtM(latest.valueUsd)})`,
    });
  }

  // rank: flagged first, then by absolute delta
  return rows.sort((a, b) => {
    if (a.flagged !== b.flagged) return a.flagged ? -1 : 1;
    return b.deltaUsd - a.deltaUsd;
  });
}

function fmtM(usd: number): string {
  if (usd >= 1e9) return `${(usd / 1e9).toFixed(1)}B`;
  if (usd >= 1e6) return `${(usd / 1e6).toFixed(0)}M`;
  return `${(usd / 1e3).toFixed(0)}K`;
}

export { fmtM };

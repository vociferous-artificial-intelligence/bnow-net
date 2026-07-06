// Deterministic analytical signals over already-stored data. Pure logic here;
// DB I/O in run.ts. Every signal carries the evidence (claim ids / rows) that
// triggered it — the moat is that nothing is asserted without traceable support.

export type Severity = "info" | "watch" | "elevated";

export interface Signal {
  key: string; // stable slug for this signal instance
  kind: string; // purge | procurement_surge | data_dark | trade_divergence | pressure_spike
  theater: string; // ru | ir | ...
  severity: Severity;
  headline: string;
  detail: string;
  evidenceClaimIds: number[]; // claims backing this (may be empty for non-claim signals)
  evidenceRefs: string[]; // other refs (entity ids, series keys, trade rows)
  at: string; // ISO (caller-stamped)
}

// --- purge pattern: clustered prosecutions of officials/siloviki in a short window ---
export interface PressureClaim {
  claimId: number;
  entityName: string;
  entityKind: string;
  role: string;
  claimDate: string | null; // yyyy-mm-dd
}

export function detectPurge(
  claims: PressureClaim[],
  opts: { windowDays: number; minCount: number; theater: string; nowIso: string },
): Signal | null {
  const cutoff = Date.parse(opts.nowIso) - opts.windowDays * 86400e3;
  const recent = claims.filter((c) => {
    if (c.role !== "defendant" && c.role !== "target" && c.role !== "dismissed") return false;
    const t = c.claimDate ? Date.parse(c.claimDate) : NaN;
    return isFinite(t) && t >= cutoff;
  });
  const uniqueTargets = new Set(recent.map((c) => c.entityName.toLowerCase()));
  if (uniqueTargets.size < opts.minCount) return null;
  const names = [...uniqueTargets].slice(0, 6);
  return {
    key: `purge:${opts.theater}:${opts.windowDays}d`,
    kind: "purge",
    theater: opts.theater,
    severity: uniqueTargets.size >= opts.minCount * 2 ? "elevated" : "watch",
    headline: `${uniqueTargets.size} officials under prosecution/dismissal in ${opts.windowDays}d`,
    detail: `Clustered elite pressure — possible factional purge. Targets incl.: ${names.join(", ")}.`,
    evidenceClaimIds: recent.map((c) => c.claimId),
    evidenceRefs: [],
    at: opts.nowIso,
  };
}

// --- data-dark events: newly classified / gone statistical series ---
export interface DarkSeries {
  key: string;
  label: string;
  status: string; // classified | gone | stale | ...
  changedRecently: boolean;
}

export function detectDataDark(series: DarkSeries[], theater: string, nowIso: string): Signal | null {
  const dark = series.filter((s) => s.status === "classified" || s.status === "gone");
  if (dark.length === 0) return null;
  const recent = dark.filter((s) => s.changedRecently);
  return {
    key: `data_dark:${theater}`,
    kind: "data_dark",
    theater,
    severity: recent.length > 0 ? "elevated" : "info",
    headline: `${dark.length} statistical series classified or gone`,
    detail:
      `Suppressed: ${dark.slice(0, 5).map((s) => s.label).join("; ")}` +
      (recent.length ? ` — ${recent.length} changed recently (leading indicator).` : "."),
    evidenceClaimIds: [],
    evidenceRefs: dark.map((s) => s.key),
    at: nowIso,
  };
}

// --- trade divergence: flagged dual-use rerouting through transit hubs ---
export interface DivergenceSignalRow {
  reporterName: string;
  hsLabel: string;
  reason: string;
}

export function detectTradeDivergence(
  flagged: DivergenceSignalRow[],
  nowIso: string,
): Signal | null {
  const dualUse = flagged.filter((r) => r.hsLabel !== "All goods");
  if (dualUse.length === 0) return null;
  return {
    key: "trade_divergence:ru",
    kind: "trade_divergence",
    theater: "ru",
    severity: dualUse.length >= 5 ? "elevated" : "watch",
    headline: `${dualUse.length} dual-use flows rerouting to Russia flagged`,
    detail: dualUse
      .slice(0, 5)
      .map((r) => `${r.reporterName}/${r.hsLabel}: ${r.reason}`)
      .join(" · "),
    evidenceClaimIds: [],
    evidenceRefs: dualUse.map((r) => `${r.reporterName}:${r.hsLabel}`),
    at: nowIso,
  };
}

export function rankSignals(signals: Signal[]): Signal[] {
  const order: Record<Severity, number> = { elevated: 0, watch: 1, info: 2 };
  return [...signals].sort((a, b) => order[a.severity] - order[b.severity] || a.kind.localeCompare(b.kind));
}

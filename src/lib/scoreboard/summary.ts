// Pure aggregate helpers for the validation-scoreboard summary tiles. No DB import so
// they're unit-testable without a database; the page queries validation_runs and passes
// rows shaped like ScoreboardRunLike straight through.

export interface ScoreboardRunLike {
  coverage_pct: number | null;
  // Thin-sourced proxy (docCount<2 AND hedged), stored as a 0-1 fraction — NOT literal
  // "unsupported"/hallucinated claims. See AGENTS.md standing context; UI must label this
  // "thin-sourced", never "unsupported".
  unsupported_claim_rate: number | null;
  timeliness_hours: number | null;
}

function mean(values: number[]): number | null {
  return values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

/** Mean event-coverage percent across runs with a non-null value (0-100 scale). */
export function meanCoveragePct(rows: ScoreboardRunLike[]): number | null {
  return mean(rows.filter((r) => r.coverage_pct !== null).map((r) => Number(r.coverage_pct)));
}

/** Mean thin-sourced rate as a percent (0-100), across runs with a non-null value. */
export function meanThinSourcedPct(rows: ScoreboardRunLike[]): number | null {
  const rate = mean(
    rows
      .filter((r) => r.unsupported_claim_rate !== null)
      .map((r) => Number(r.unsupported_claim_rate)),
  );
  return rate === null ? null : rate * 100;
}

/** Mean information-lead hours across runs with a non-null value. */
export function meanLeadHours(rows: ScoreboardRunLike[]): number | null {
  return mean(rows.filter((r) => r.timeliness_hours !== null).map((r) => Number(r.timeliness_hours)));
}

/**
 * MEDIAN information-lead hours — the tile labeled "median information lead" must
 * actually compute one (the pre-2026-07-11 page computed a mean under that label).
 * Median is also the product's documented lead claim, robust to the occasional
 * multi-day outlier lead.
 */
export function medianLeadHours(rows: ScoreboardRunLike[]): number | null {
  const values = rows
    .filter((r) => r.timeliness_hours !== null)
    .map((r) => Number(r.timeliness_hours))
    .sort((a, b) => a - b);
  if (values.length === 0) return null;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 1 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

/**
 * Mean coverage restricted to days that actually matched at least one event
 * (coverage_pct > 0). The all-day average is pulled down by zero-match days (no ISW
 * report matched yet, etc.); this is the honest secondary number — it must be labeled
 * "nonzero days", never substituted for the headline average.
 */
export function nonzeroDayCoverage(rows: ScoreboardRunLike[]): {
  meanPct: number | null;
  days: number;
} {
  const nonzero = rows.filter((r) => r.coverage_pct !== null && Number(r.coverage_pct) > 0);
  return { meanPct: mean(nonzero.map((r) => Number(r.coverage_pct))), days: nonzero.length };
}

/** Gap between an actual value and its target, same units as both inputs (null-safe). */
export function targetGap(actual: number | null, target: number): number | null {
  return actual === null ? null : actual - target;
}

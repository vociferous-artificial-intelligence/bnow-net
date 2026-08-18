// Offline per-report scoring summary (Phase 4, prompt §12 item G): a PURE
// formatter from one ConflictResultV1 to a human-readable markdown string,
// used by tests and offline review only — no cron, no route, no UI (Phase 6
// owns surfaces).
//
// Language rules (contract §5.9 / Gate-4 legal charter): the headline is
// always "Key Takeaway benchmark coverage" / expert-benchmark COVERAGE
// language; no accuracy/truth wording anywhere; unavailable is rendered as a
// provenance statement, never as a zero; every ratio shows its explicit
// numerator/denominator; the contribution table discloses non-additivity.
// The input results structurally contain no reference prose (unit ids +
// metadata only), so the formatter cannot leak any — pinned by the
// serialized-output audit test.

import type {
  ConflictLaneCoverageRowV1,
  ConflictResultV1,
  ConflictScoredResultV1,
} from "./eval-profile";
import type { HeadlineCount } from "./vocabulary";

function ratio(count: HeadlineCount): string {
  return `${count.matched}/${count.denominator} declared Key Takeaways`;
}

function laneRow(row: ConflictLaneCoverageRowV1): string {
  const diag = row.diagnostic === "unavailable_incomparable" ? " — unavailable (incomparable evidence)" : "";
  return (
    `| ${row.lane} | ${row.units} | ` +
    `${row.corpusRecall.matched}m/${row.corpusRecall.partial}p/${row.corpusRecall.miss}x | ` +
    `${row.publishedRetention.matched}m/${row.publishedRetention.partial}p/${row.publishedRetention.miss}x |${diag}`
  );
}

function scoredReport(result: ConflictScoredResultV1): string {
  const lines: string[] = [];
  lines.push(`# Expert-benchmark coverage — ${result.conflictId}`);
  lines.push("");
  lines.push(`Report/edition: \`${result.report.editionKey}\` (${result.report.reportDate})`);
  lines.push(`Evaluation kind: ${result.evaluationKind} · epoch ${result.methodologyEpoch}`);
  lines.push("");
  lines.push(`## ${result.headlineLabel ?? "Key Takeaway benchmark coverage"}`);
  lines.push("");
  lines.push(`- Corpus recall (pipeline question 1): ${ratio(result.headline.corpusRecall)}`);
  lines.push(
    `- Published retention (pipeline question 2): ${ratio(result.headline.publishedRetention)}`,
  );
  if (result.headline.partialDiagnostic !== undefined) {
    lines.push(
      `- Partial diagnostic: ${result.headline.partialDiagnostic} compound takeaway(s) with incomplete evidence — counted as misses above, shown here so compound under-credit stays visible`,
    );
  }
  if (result.keywordUnmatchable !== undefined) {
    lines.push(
      `- Keyword-rung note: ${result.keywordUnmatchable} takeaway(s) carry no keyword signal and stay in the FULL denominator as automatic misses`,
    );
  }
  lines.push("");
  lines.push("## Lane coverage (partitions the same declared takeaways)");
  lines.push("");
  lines.push("| lane | takeaways | corpus recall (m/p/x) | published retention (m/p/x) |");
  lines.push("|---|---|---|---|");
  for (const row of result.lanes ?? []) lines.push(laneRow(row));
  lines.push("");
  lines.push("## Matched takeaways with evidence from …");
  lines.push("");
  lines.push(
    "Contribution is multi-label and NON-ADDITIVE: one matched takeaway may appear in several buckets, so bucket totals can exceed the headline numerator and do not sum to it.",
  );
  const totals = result.contributionTotals;
  if (totals !== undefined) {
    lines.push("");
    lines.push(`- by theater: ${bucketLine(totals.byTheater)}`);
    lines.push(`- by track: ${bucketLine(totals.byTrack as Record<string, number>)}`);
    lines.push(`- by source: ${bucketLine(totals.bySource)}`);
  }
  lines.push("");
  lines.push("## Diagnostics");
  lines.push("");
  if (result.missDiagnostic !== undefined && Object.keys(result.missDiagnostic).length > 0) {
    for (const [unitId, diagnostic] of Object.entries(result.missDiagnostic)) {
      lines.push(
        `- ${unitId}: honest miss with ${diagnostic} (a real product coverage gap — the takeaway stays in the denominator)`,
      );
    }
  }
  const thin = result.thinSourced;
  if (thin !== undefined) {
    lines.push(
      `- Thin-sourced: corpus recall ${thin.corpusRecall.count}/${thin.corpusRecall.denominator} · published retention ${thin.publishedRetention.count}/${thin.publishedRetention.denominator} offered claims with <2 independent documents and a claimed/unverified hedge`,
    );
  }
  const timing = result.timing;
  if (timing !== undefined) {
    lines.push(
      `- Information lead (BNOW ingest vs report publication): corpus recall median ${hours(timing.corpusRecall.medianLeadHoursByIngest)} · source-declared publish (separate) ${hours(timing.corpusRecall.medianLeadHoursBySourceDeclared)}`,
    );
  }
  lines.push(
    `- BNOW-only in-scope items: corpus recall ${result.bnowOnly?.corpusRecall.count ?? 0} (internal count) · published retention ${result.bnowOnly?.publishedRetention.count ?? 0} (renderable population)`,
  );
  lines.push("");
  lines.push("## Method stamps");
  lines.push("");
  const matcher = result.matcher;
  if (matcher !== undefined) {
    lines.push(
      `- Matcher: kind ${matcher.kind}, label ${matcher.label}, votes k=${matcher.votesK ?? "—"}, model ${matcher.model ?? "none"}`,
    );
  }
  const window = result.window;
  if (window !== undefined) {
    lines.push(
      `- Window: ${window.startDate} → ${window.endDate} (${window.days} day(s)), END from ${window.windowEndSource}; cutoff anchor ${window.cutoffTreatment}, publication anchor ${window.publishedTreatment}`,
    );
  }
  const versions = result.versions;
  if (versions !== undefined) {
    lines.push(
      `- Versions: lanes ${result.laneTaxonomyVersion}, evidence policy ${result.evidencePolicyVersion}, roster ${versions.actorRosterVersion}, classifier ${versions.laneClassifierVersion}, scope ${versions.scopeVersion}`,
    );
  }
  lines.push(`- Run group: \`${result.runGroupKey ?? "—"}\` · snapshot ref: none (pre-capture)`);
  lines.push("");
  return lines.join("\n");
}

function bucketLine(bucket: Readonly<Record<string, number | undefined>>): string {
  const entries = Object.entries(bucket).filter((e): e is [string, number] => e[1] !== undefined);
  if (entries.length === 0) return "(none)";
  return entries.map(([key, count]) => `${key} ${count}`).join(" · ");
}

function hours(value: number | null): string {
  return value === null ? "unknown" : `${value}h`;
}

/** Format one result as a human-readable markdown summary. */
export function formatConflictResultReport(result: ConflictResultV1): string {
  if (result.state === "scored") return scoredReport(result);
  if (result.unavailableReason === "publication_gap") {
    return [
      `# Expert-benchmark coverage — ${result.conflictId}`,
      "",
      `No ${result.series} report was published for ${result.gapDate}.`,
      "",
      "This evaluation is UNAVAILABLE (publication gap): no report exists, so there is no denominator and no score — a gap is represented, never fabricated, and is not a zero.",
      "",
    ].join("\n");
  }
  return [
    `# Expert-benchmark coverage — ${result.conflictId}`,
    "",
    `Report/edition: \`${result.report.editionKey}\` (${result.report.reportDate})`,
    `Evaluation kind: ${result.evaluationKind} · epoch ${result.methodologyEpoch}`,
    "",
    `This evaluation is UNAVAILABLE (${result.unavailableReason}): no immutable snapshot artifact proves the ${result.evaluationKind} populations, so no score exists — unavailable is a provenance statement about inputs, distinct from a zero.`,
    "",
  ].join("\n");
}

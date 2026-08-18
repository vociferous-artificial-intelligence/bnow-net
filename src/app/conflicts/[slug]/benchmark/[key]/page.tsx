// /conflicts/[slug]/benchmark/[key] — one fixture benchmark record in full
// (Phase 6). Sections follow the same contract §11 seven-question order as
// the overview, scoped to this single reference report. PUBLIC-when-enabled
// teaser tier: counts, lanes, scores, labels, methodology only; the claim
// text + source-trail view is the gated /evidence route beneath this one.
//
// GUARD ORDER (binding): feature-off guard FIRST, before params and any
// conflict data access; provider dynamically imported after it.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireConflictsUi } from "@/lib/conflicts/feature";
import { REFERENCE_SERIES_LABELS } from "@/lib/conflicts/product-copy";
import { BenchmarkHeadline } from "@/components/conflicts/benchmark-headline";
import { ContributionTable } from "@/components/conflicts/contribution-table";
import { DiagnosticsModule } from "@/components/conflicts/diagnostics-module";
import {
  ScoreboardCoexistenceNote,
  SourceCountryNote,
} from "@/components/conflicts/explainers";
import { LaneTable } from "@/components/conflicts/lane-table";
import { PresenceModule } from "@/components/conflicts/presence-module";
import { QuestionSection } from "@/components/conflicts/section";
import { SyntheticBanner } from "@/components/conflicts/synthetic-banner";

export const dynamic = "force-dynamic";

export default async function BenchmarkDetailPage({
  params,
}: {
  params: Promise<{ slug: string; key: string }>;
}) {
  requireConflictsUi();
  const { slug, key } = await params;
  const { conflictIdForSlug, loadBenchmarkDetail } = await import(
    "@/lib/conflicts/product-view"
  );
  const conflictId = conflictIdForSlug(slug);
  if (conflictId === null) notFound();
  const detail = loadBenchmarkDetail(conflictId, key);
  if (detail === null) notFound();
  const { entry, definition, markers } = detail;
  const result = entry.result;
  const scored = result.state === "scored" ? result : null;

  return (
    <main id="main" className="mx-auto max-w-4xl p-6">
      <nav aria-label="Breadcrumb" className="mb-2 text-sm">
        <Link href="/conflicts" className="underline">
          Conflicts
        </Link>{" "}
        /{" "}
        <Link href={`/conflicts/${slug}`} className="underline">
          {definition.displayName}
        </Link>{" "}
        / <span>benchmark</span>
      </nav>
      <h1 className="mb-1 text-2xl font-bold">
        {definition.displayName} — benchmark record
      </h1>
      <p className="mb-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
        Fixture demonstration: {entry.scenarioTitle}
        {entry.variantId !== null && ` · variant ${entry.variantId}`}
      </p>
      <SyntheticBanner markers={markers} />

      <QuestionSection qid="q1" heading="What conflict and which report">
        <p className="max-w-2xl text-sm text-gray-700 dark:text-gray-300">
          {definition.displayName}, scored against{" "}
          {REFERENCE_SERIES_LABELS[definition.referenceSeries]}.{" "}
          {scored !== null ? (
            <>
              This record evaluates report{" "}
              <span className="font-mono text-xs">{scored.report.editionKey}</span> (report day{" "}
              <span className="tabular-nums">{scored.report.reportDate}</span>).
            </>
          ) : result.state === "unavailable" && result.unavailableReason === "publication_gap" ? (
            <>
              The reference series published no report for{" "}
              <span className="tabular-nums">{result.gapDate}</span>.
            </>
          ) : (
            <>
              This record names report{" "}
              <span className="font-mono text-xs">{result.report.editionKey}</span> but carries no
              score.
            </>
          )}
        </p>
      </QuestionSection>

      <QuestionSection qid="q2" heading="What changed, and which lanes are active">
        {scored === null ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Not applicable — this record carries no evaluation (see the benchmark module below).
          </p>
        ) : (
          <>
            <LaneTable lanes={scored.lanes ?? []} taxonomyVersion={scored.laneTaxonomyVersion} />
            <p className="mt-2 text-sm">
              <Link
                href={`/conflicts/${slug}/benchmark/${entry.benchmarkKey}/evidence`}
                className="underline"
              >
                Read the published claims behind this record
              </Link>{" "}
              <span className="text-xs text-gray-600 dark:text-gray-400">
                (subscriber sign-in required)
              </span>
            </p>
          </>
        )}
      </QuestionSection>

      <QuestionSection qid="q3" heading="Which countries, actors, and sources contributed">
        {scored === null ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Not applicable — no evaluation exists for this record.
          </p>
        ) : (
          <ContributionTable totals={scored.contributionTotals} />
        )}
        <div className="mt-3">
          <SourceCountryNote />
        </div>
      </QuestionSection>

      <QuestionSection qid="q4" heading="What the external benchmark covered">
        <BenchmarkHeadline result={result} />
        <div className="mt-3">
          <ScoreboardCoexistenceNote />
        </div>
      </QuestionSection>

      <QuestionSection qid="q5" heading="Was evidence present, and was it retained in print">
        {scored === null ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Not applicable — an unavailable record has no populations to compare.
          </p>
        ) : (
          <PresenceModule result={scored} />
        )}
      </QuestionSection>

      <QuestionSection qid="q6" heading="Unavailable, thinly sourced, and reference-only">
        {scored === null ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            The whole record is unavailable — see the provenance statement in the benchmark module
            above; unavailability is never rendered as 0%.
          </p>
        ) : (
          <DiagnosticsModule result={scored} />
        )}
      </QuestionSection>

      <QuestionSection qid="q7" heading="Drill back into the evidence">
        <ul className="space-y-1.5 text-sm">
          {definition.contributorTheaters.map((t) => (
            <li key={t.theater}>
              <Link href={`/countries/${t.theater}`} className="underline">
                {t.theater.toUpperCase()} country page
              </Link>{" "}
              ·{" "}
              <Link href={`/digests/${t.theater}`} className="underline">
                {t.theater.toUpperCase()} digest archive
              </Link>{" "}
              <span className="text-xs text-gray-600 dark:text-gray-400">
                (digests are subscriber surfaces)
              </span>
            </li>
          ))}
          <li>
            <Link href="/scoreboard" className="underline">
              Per-country validation scoreboard
            </Link>
          </li>
          {scored !== null && (
            <li>
              <Link
                href={`/conflicts/${slug}/benchmark/${entry.benchmarkKey}/evidence`}
                className="underline"
              >
                Gated evidence view
              </Link>{" "}
              — claim text with hedge, confidence, timestamps, and the full source trail.
            </li>
          )}
        </ul>
      </QuestionSection>
    </main>
  );
}

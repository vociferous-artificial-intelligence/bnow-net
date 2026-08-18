// /conflicts/[slug] — the conflict overview (Phase 6). Answers the seven
// analyst questions IN the contract §11 order (q1..q7 sections, test-pinned):
//   1 what conflict/region is covered
//   2 what changed and which lanes are active
//   3 which countries, actors, and evidence sources contributed
//   4 what the external benchmark covered, as one report-level score
//   5 corpus-recall vs published-retention presence
//   6 what was unavailable, thinly sourced, or reference-only
//   7 drill-back into country, track, claim, and source evidence
//
// GUARD ORDER (binding): public-when-enabled teaser — the feature-off guard
// is the FIRST statement, before params and before ANY conflict data access;
// the provider is imported dynamically after it. Teaser tier: counts, lanes,
// scores, labels, methodology only. Claim text and source trails live ONLY on
// the gated evidence view linked from q2/q7.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireConflictsUi } from "@/lib/conflicts/feature";
import { REFERENCE_SERIES_LABELS } from "@/lib/conflicts/product-copy";
import { BenchmarkHeadline } from "@/components/conflicts/benchmark-headline";
import { BenchmarkRunList } from "@/components/conflicts/benchmark-run-list";
import { ContributionTable } from "@/components/conflicts/contribution-table";
import { DiagnosticsModule } from "@/components/conflicts/diagnostics-module";
import {
  ScoreboardCoexistenceNote,
  SourceCountryNote,
  TerminologyExplainer,
} from "@/components/conflicts/explainers";
import { LaneTable } from "@/components/conflicts/lane-table";
import { trackLabel } from "@/components/conflicts/model";
import { PresenceModule } from "@/components/conflicts/presence-module";
import { QuestionSection } from "@/components/conflicts/section";
import { SyntheticBanner } from "@/components/conflicts/synthetic-banner";

export const dynamic = "force-dynamic";

export default async function ConflictOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  requireConflictsUi();
  const { slug } = await params;
  const { conflictIdForSlug, loadConflictProductView } = await import(
    "@/lib/conflicts/product-view"
  );
  const conflictId = conflictIdForSlug(slug);
  if (conflictId === null) notFound();
  const view = loadConflictProductView(conflictId);
  const featured = view.featured;
  const featuredScored =
    featured !== null && featured.result.state === "scored" ? featured.result : null;
  const publishedUnionCount =
    featuredScored === null
      ? null
      : new Set([
          ...(featuredScored.agreements?.publishedRetention ?? []).flatMap((a) =>
            a.claims.map((c) => c.claimId),
          ),
          ...(featuredScored.bnowOnly?.publishedRetention.items ?? []).map((i) => i.claimId),
        ]).size;

  return (
    <main id="main" className="mx-auto max-w-4xl p-6">
      <nav aria-label="Breadcrumb" className="mb-2 text-sm">
        <Link href="/conflicts" className="underline">
          Conflicts
        </Link>{" "}
        / <span>{view.definition.displayName}</span>
      </nav>
      <h1 className="mb-2 text-2xl font-bold">{view.definition.displayName}</h1>
      <SyntheticBanner markers={view.markers} />

      <QuestionSection qid="q1" heading="What conflict is covered">
        <p className="max-w-2xl text-sm text-gray-700 dark:text-gray-300">
          {view.definition.displayName} joins the{" "}
          {view.definition.contributorTheaters.map((t) => t.theater.toUpperCase()).join(", ")}{" "}
          coverage lenses across the{" "}
          {view.definition.contributorTracks.map(trackLabel).join(", ")} track
          {view.definition.contributorTracks.length === 1 ? "" : "s"}, scored against{" "}
          {REFERENCE_SERIES_LABELS[view.definition.referenceSeries]}.
        </p>
        <p className="mt-2 max-w-2xl text-xs text-gray-600 dark:text-gray-400">
          Theaters marked legacy contribute published digests only (no mapped corpus); their
          contribution is always labeled.{" "}
          {view.definition.contributorTheaters
            .filter((t) => t.comparability === "legacy_only")
            .map((t) => t.theater.toUpperCase())
            .join(", ") || "None are legacy here"}
          .
        </p>
        <div className="mt-3">
          <TerminologyExplainer />
        </div>
      </QuestionSection>

      <QuestionSection qid="q2" heading="What changed, and which lanes are active">
        {featuredScored === null || featured === null ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            No scored fixture benchmark exists for this conflict — unavailable, not 0%.
          </p>
        ) : (
          <>
            <p className="max-w-2xl text-sm text-gray-700 dark:text-gray-300">
              Latest fixture benchmark day{" "}
              <span className="tabular-nums">{featuredScored.report.reportDate}</span>:{" "}
              <span className="tabular-nums">{publishedUnionCount}</span> published digest claim
              {publishedUnionCount === 1 ? "" : "s"} entered the published-output union for this
              report window.
            </p>
            <div className="mt-3">
              <LaneTable
                lanes={featuredScored.lanes ?? []}
                taxonomyVersion={featuredScored.laneTaxonomyVersion}
              />
            </div>
            <p className="mt-2 text-sm">
              <Link
                href={`/conflicts/${slug}/benchmark/${featured.benchmarkKey}/evidence`}
                className="underline"
              >
                Read the published claims behind this day
              </Link>{" "}
              <span className="text-xs text-gray-600 dark:text-gray-400">
                (subscriber sign-in required — claim text and source trails are gated)
              </span>
            </p>
          </>
        )}
      </QuestionSection>

      <QuestionSection qid="q3" heading="Which countries, actors, and sources contributed">
        {featuredScored === null ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            No scored fixture benchmark — contribution is unavailable, not empty.
          </p>
        ) : (
          <ContributionTable totals={featuredScored.contributionTotals} />
        )}
        <div className="mt-3">
          <SourceCountryNote />
        </div>
      </QuestionSection>

      <QuestionSection qid="q4" heading="What the external benchmark covered">
        {featured === null ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            No fixture benchmark records for this conflict.
          </p>
        ) : (
          <>
            <p className="mb-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
              {featured.result.state === "scored" ? (
                <>
                  Reference report{" "}
                  <span className="font-mono text-xs">{featured.result.report.editionKey}</span> —
                  one report produces ONE conflict-level evaluation.
                </>
              ) : (
                "Latest record"
              )}
            </p>
            <BenchmarkHeadline result={featured.result} />
          </>
        )}
        <div className="mt-3">
          <ScoreboardCoexistenceNote />
        </div>
        <h3 className="mt-6 mb-2 text-sm font-semibold">All fixture benchmark records</h3>
        <BenchmarkRunList slug={slug} entries={view.entries} />
      </QuestionSection>

      <QuestionSection qid="q5" heading="Was evidence present, and was it retained in print">
        {featuredScored === null ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            No scored fixture benchmark — the pipeline comparison is unavailable, not zero.
          </p>
        ) : (
          <PresenceModule result={featuredScored} />
        )}
      </QuestionSection>

      <QuestionSection qid="q6" heading="Unavailable, thinly sourced, and reference-only">
        {featuredScored === null ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            No scored fixture benchmark — diagnostics are unavailable.
          </p>
        ) : (
          <DiagnosticsModule result={featuredScored} />
        )}
      </QuestionSection>

      <QuestionSection qid="q7" heading="Drill back into the evidence">
        <ul className="space-y-1.5 text-sm">
          {view.definition.contributorTheaters.map((t) => (
            <li key={t.theater}>
              <Link href={`/countries/${t.theater}`} className="underline">
                {t.theater.toUpperCase()} country page
              </Link>{" "}
              ·{" "}
              <Link href={`/digests/${t.theater}`} className="underline">
                {t.theater.toUpperCase()} digest archive
              </Link>{" "}
              <span className="text-xs text-gray-600 dark:text-gray-400">
                (digests are subscriber surfaces{t.comparability === "legacy_only" ? "; legacy engine" : ""})
              </span>
            </li>
          ))}
          <li>
            <Link href="/scoreboard" className="underline">
              Per-country validation scoreboard
            </Link>
          </li>
          {featured !== null && (
            <li>
              <Link
                href={`/conflicts/${slug}/benchmark/${featured.benchmarkKey}`}
                className="underline"
              >
                Latest benchmark detail
              </Link>{" "}
              — per-claim evidence with source trails is behind its gated evidence view.
            </li>
          )}
        </ul>
      </QuestionSection>
    </main>
  );
}

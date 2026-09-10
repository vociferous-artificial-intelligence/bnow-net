// /conflicts/[slug] — the conflict overview (WS-3.5: REAL observations).
// Answers the seven analyst questions IN the contract §11 order (q1..q7
// sections, test-pinned):
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
// the provider and DB client are imported dynamically after it. Teaser tier:
// counts, lanes, scores, labels, methodology only. Claim text and source trails
// live ONLY on the gated evidence view linked from q2/q7.
//
// The featured record is the newest report day whose DAILY-FINAL edition has an
// observation (memo C4, resolved in db-product-view.ts). A day whose final
// edition is unevaluated appears under "days with no result yet" and is never
// filled in from another edition of the same day.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireConflictsUi } from "@/lib/conflicts/feature";
import {
  ACTOR_CONTRIBUTION_NOTE,
  DAILY_FINAL_SELECTION_NOTE,
  LEGACY_ONLY_MATCHED_NOTE,
  REFERENCE_SERIES_LABELS,
  noObservationsNote,
} from "@/lib/conflicts/product-copy";
import { BenchmarkHeadline } from "@/components/conflicts/benchmark-headline";
import { ContributionTable } from "@/components/conflicts/contribution-table";
import { DiagnosticsModule } from "@/components/conflicts/diagnostics-module";
import {
  ScoreboardCoexistenceNote,
  SourceCountryNote,
  TerminologyExplainer,
} from "@/components/conflicts/explainers";
import { LaneTable } from "@/components/conflicts/lane-table";
import { trackLabel } from "@/components/conflicts/model";
import { ObservationDayList } from "@/components/conflicts/observation-day-list";
import { PresenceModule } from "@/components/conflicts/presence-module";
import { QuestionSection } from "@/components/conflicts/section";
import { SoakEligibilityBanner } from "@/components/conflicts/soak-eligibility-banner";

export const dynamic = "force-dynamic";

export default async function ConflictOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  requireConflictsUi();
  const { slug } = await params;
  const [{ conflictIdForSlug }, { loadDbConflictProductView }, { rawSql }] = await Promise.all([
    import("@/lib/conflicts/product-slugs"),
    import("@/lib/conflicts/db-product-view"),
    import("@/db"),
  ]);
  const conflictId = conflictIdForSlug(slug);
  if (conflictId === null) notFound();
  const query = (sql: string, p?: unknown[]) =>
    rawSql.query(sql, p) as Promise<Array<Record<string, unknown>>>;
  const view = await loadDbConflictProductView(query, conflictId);
  const featured = view.featured;

  return (
    <main id="main" className="mx-auto max-w-4xl p-6">
      <nav aria-label="Breadcrumb" className="mb-2 text-sm">
        <Link href="/conflicts" className="underline">
          Conflicts
        </Link>{" "}
        / <span>{view.definition.displayName}</span>
      </nav>
      <h1 className="mb-2 text-2xl font-bold">{view.definition.displayName}</h1>
      <SoakEligibilityBanner
        compoundUndetermined={view.compoundUndetermined}
        unitFlagsVersion={featured?.observation.unitFlagsVersion}
      />

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
        {featured === null ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {noObservationsNote(view.windowDays)}
          </p>
        ) : (
          <>
            <p className="max-w-2xl text-sm text-gray-700 dark:text-gray-300">
              Latest scored day{" "}
              <span className="tabular-nums">{featured.reportDate}</span>:{" "}
              <span className="tabular-nums">{featured.publishedUnionCount}</span> published digest
              claim{featured.publishedUnionCount === 1 ? "" : "s"} entered the published-output
              union for this report window.
            </p>
            {featured.multiEdition && (
              <p
                data-testid="daily-final-note"
                className="mt-1 max-w-2xl text-xs text-gray-600 dark:text-gray-400"
              >
                {DAILY_FINAL_SELECTION_NOTE}
              </p>
            )}
            <div className="mt-3">
              <LaneTable
                lanes={featured.result.lanes ?? []}
                taxonomyVersion={featured.result.laneTaxonomyVersion}
              />
            </div>
            {/* an empty union costs a click plus a sign-in wall to reach
                nothing — say so instead of linking (Gate-7 product NOTE-3) */}
            {featured.publishedUnionCount === 0 ? (
              <p
                data-testid="empty-evidence-note"
                className="mt-2 text-sm text-gray-600 dark:text-gray-400"
              >
                No published digest claims entered this record&apos;s published-output union, so
                there is no evidence view to open for it.
              </p>
            ) : (
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
            )}
          </>
        )}
      </QuestionSection>

      <QuestionSection qid="q3" heading="Which countries, actors, and sources contributed">
        {featured === null ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            No scored day in the window — contribution is unavailable, not empty.
          </p>
        ) : (
          <ContributionTable totals={featured.result.contributionTotals} />
        )}
        {/* pre-gate MINOR-1: the contractual heading names ACTORS — answer
            that clause honestly beside the table instead of over-promising */}
        <p
          data-testid="actor-contribution-note"
          className="mt-3 max-w-2xl text-sm text-gray-600 dark:text-gray-400"
        >
          {ACTOR_CONTRIBUTION_NOTE}
        </p>
        <div className="mt-3">
          <SourceCountryNote />
        </div>
      </QuestionSection>

      <QuestionSection qid="q4" heading="What the external benchmark covered">
        {featured === null ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {noObservationsNote(view.windowDays)}
          </p>
        ) : (
          <>
            <p className="mb-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
              Reference edition{" "}
              <span className="font-mono text-xs">{featured.editionKey}</span> — one report
              produces ONE conflict-level evaluation.
            </p>
            <BenchmarkHeadline result={featured.result} />
            {/* memo C8: legacy contributors stay MEMBERS of the numerator, so
                the honest disclosure is a companion count, not an exclusion */}
            <p
              data-testid="legacy-only-companion"
              className="mt-2 max-w-2xl text-xs text-gray-600 dark:text-gray-400"
            >
              <span className="tabular-nums font-medium">{featured.legacyOnlyMatched}</span> matched
              with legacy-only evidence. {LEGACY_ONLY_MATCHED_NOTE}
            </p>
          </>
        )}
        <div className="mt-3">
          <ScoreboardCoexistenceNote series={view.definition.referenceSeries} />
        </div>
        <h3 className="mt-6 mb-2 text-sm font-semibold">
          Scored days (last {view.windowDays} report days)
        </h3>
        <ObservationDayList
          slug={slug}
          days={view.days}
          pending={view.pending}
          windowDays={view.windowDays}
        />
      </QuestionSection>

      <QuestionSection qid="q5" heading="Was evidence present, and was it retained in print">
        {featured === null ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            No scored day in the window — the pipeline comparison is unavailable, not zero.
          </p>
        ) : (
          <PresenceModule result={featured.result} />
        )}
      </QuestionSection>

      <QuestionSection qid="q6" heading="Unavailable, thinly sourced, and reference-only">
        {featured === null ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            No scored day in the window — diagnostics are unavailable.
          </p>
        ) : (
          <DiagnosticsModule result={featured.result} />
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

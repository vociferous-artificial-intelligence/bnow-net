// /conflicts/[slug]/benchmark/[key] — one scored report day in full (WS-3.5:
// REAL observations). Sections follow the same contract §11 seven-question
// order as the overview, scoped to this single reference edition.
// PUBLIC-when-enabled teaser tier: counts, lanes, scores, labels, methodology
// only; the claim text + source-trail view is the gated /evidence route
// beneath this one.
//
// GUARD ORDER (binding): feature-off guard FIRST, before params and any
// conflict data access; provider and DB client dynamically imported after it.
//
// The `[key]` segment is an EDITION key in URL form (benchmark-key.ts), and it
// resolves only to a DAILY-FINAL observation inside the view window. A key that
// names a non-final edition, a day with no observation, or a day older than the
// window is a notFound() — the surface never renders a non-final edition's
// score as the day's.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireConflictsUi } from "@/lib/conflicts/feature";
import {
  ACTOR_CONTRIBUTION_NOTE,
  DAILY_FINAL_SELECTION_NOTE,
  LEGACY_ONLY_MATCHED_NOTE,
  REFERENCE_SERIES_LABELS,
} from "@/lib/conflicts/product-copy";
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
import { SoakEligibilityBanner } from "@/components/conflicts/soak-eligibility-banner";

export const dynamic = "force-dynamic";

export default async function BenchmarkDetailPage({
  params,
}: {
  params: Promise<{ slug: string; key: string }>;
}) {
  requireConflictsUi();
  const { slug, key } = await params;
  const [{ conflictIdForSlug }, { loadDbBenchmarkDay }, { CONFLICT_REGISTRY }, { rawSql }] =
    await Promise.all([
      import("@/lib/conflicts/product-slugs"),
      import("@/lib/conflicts/db-product-view"),
      import("@/lib/conflicts/definitions"),
      import("@/db"),
    ]);
  const conflictId = conflictIdForSlug(slug);
  if (conflictId === null) notFound();
  const query = (sql: string, p?: unknown[]) =>
    rawSql.query(sql, p) as Promise<Array<Record<string, unknown>>>;
  const day = await loadDbBenchmarkDay(query, conflictId, key);
  if (day === null) notFound();
  const definition = CONFLICT_REGISTRY[conflictId];
  const result = day.result;

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
        Report day <span className="tabular-nums">{day.reportDate}</span> · edition{" "}
        <span className="font-mono text-xs">{day.editionKey}</span>
      </p>
      <SoakEligibilityBanner
        compoundUndetermined={day.compoundUndetermined}
        unitFlagsVersion={day.observation.unitFlagsVersion}
      />

      <QuestionSection qid="q1" heading="What conflict and which report">
        <p className="max-w-2xl text-sm text-gray-700 dark:text-gray-300">
          {definition.displayName}, scored against{" "}
          {REFERENCE_SERIES_LABELS[definition.referenceSeries]}. This record evaluates edition{" "}
          <span className="font-mono text-xs">{day.editionKey}</span> (report day{" "}
          <span className="tabular-nums">{day.reportDate}</span>).
        </p>
        {day.multiEdition && (
          <>
            <p
              data-testid="daily-final-note"
              className="mt-2 max-w-2xl text-xs text-gray-600 dark:text-gray-400"
            >
              {DAILY_FINAL_SELECTION_NOTE}
            </p>
            <ul
              data-testid="editions-considered"
              className="mt-1 space-y-0.5 font-mono text-xs text-gray-600 dark:text-gray-400"
            >
              {day.orderedEditionKeys.map((editionKey) => (
                <li key={editionKey}>
                  {editionKey}
                  {editionKey === day.editionKey && " — scored (daily final)"}
                </li>
              ))}
            </ul>
          </>
        )}
      </QuestionSection>

      <QuestionSection qid="q2" heading="What changed, and which lanes are active">
        <LaneTable lanes={result.lanes ?? []} taxonomyVersion={result.laneTaxonomyVersion} />
        {/* Gate-7 product NOTE-3: an empty union is a sign-in wall in
            front of an empty view — say so rather than link */}
        {day.publishedUnionCount === 0 ? (
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
              href={`/conflicts/${slug}/benchmark/${day.benchmarkKey}/evidence`}
              className="underline"
            >
              Read the published claims behind this record
            </Link>{" "}
            <span className="text-xs text-gray-600 dark:text-gray-400">
              (subscriber sign-in required)
            </span>
          </p>
        )}
      </QuestionSection>

      <QuestionSection qid="q3" heading="Which countries, actors, and sources contributed">
        <ContributionTable totals={result.contributionTotals} />
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
        <BenchmarkHeadline result={result} />
        <p
          data-testid="legacy-only-companion"
          className="mt-2 max-w-2xl text-xs text-gray-600 dark:text-gray-400"
        >
          <span className="tabular-nums font-medium">{day.legacyOnlyMatched}</span> matched with
          legacy-only evidence. {LEGACY_ONLY_MATCHED_NOTE}
        </p>
        <div className="mt-3">
          <ScoreboardCoexistenceNote series={definition.referenceSeries} />
        </div>
      </QuestionSection>

      <QuestionSection qid="q5" heading="Was evidence present, and was it retained in print">
        <PresenceModule result={result} />
      </QuestionSection>

      <QuestionSection qid="q6" heading="Unavailable, thinly sourced, and reference-only">
        <DiagnosticsModule result={result} />
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
              {/* the legacy-engine qualifier that the overview already
                  carries — the two contributor lists now read alike
                  (Gate-7 product NOTE-2) */}
              <span className="text-xs text-gray-600 dark:text-gray-400">
                (digests are subscriber surfaces
                {t.comparability === "legacy_only" ? "; legacy engine" : ""})
              </span>
            </li>
          ))}
          <li>
            <Link href="/scoreboard" className="underline">
              Per-country validation scoreboard
            </Link>
          </li>
          {/* Same suppression as q2 (Gate-9 DEFECT-1): offering the gated view
              on a zero-union record walls an empty page behind a sign-in. */}
          {day.publishedUnionCount !== 0 && (
            <li>
              <Link
                href={`/conflicts/${slug}/benchmark/${day.benchmarkKey}/evidence`}
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

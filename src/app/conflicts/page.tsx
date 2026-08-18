// /conflicts — the conflict/region index (Phase 6, feature-off).
//
// GUARD ORDER (binding): this is a PUBLIC-when-enabled teaser surface, so the
// feature-off guard is the FIRST statement, before ANY conflict data access
// (prompt §14). The provider is imported dynamically AFTER the guard so the
// off path performs zero fixture IO. No DB module is imported anywhere on
// this route. Rendered content is teaser-tier only: counts, lanes, scores,
// labels, methodology — never claim text, never source trails.

import Link from "next/link";
import { requireConflictsUi } from "@/lib/conflicts/feature";
import { REFERENCE_SERIES_LABELS } from "@/lib/conflicts/product-copy";
import { SyntheticBanner } from "@/components/conflicts/synthetic-banner";
import { TerminologyExplainer } from "@/components/conflicts/explainers";
import { Ratio } from "@/components/conflicts/model";

export const dynamic = "force-dynamic";

export default async function ConflictsIndexPage() {
  requireConflictsUi();
  const { CONFLICT_SLUGS, loadConflictProductView } = await import(
    "@/lib/conflicts/product-view"
  );

  const views = Object.entries(CONFLICT_SLUGS).map(([slug, conflictId]) => ({
    slug,
    view: loadConflictProductView(conflictId),
  }));
  const markers = views[0]?.view.markers;

  return (
    <main id="main" className="mx-auto max-w-4xl p-6">
      <h1 className="mb-2 text-2xl font-bold">Conflicts</h1>
      <p className="mb-4 max-w-2xl text-sm text-gray-700 dark:text-gray-300">
        Conflict/region views join the per-country coverage lenses into one analytical object and
        score each external reference report once at conflict level. Country pages are unchanged
        and remain the evidence drill-down surface.
      </p>
      {markers !== undefined && <SyntheticBanner markers={markers} />}
      <div className="mb-6">
        <TerminologyExplainer />
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {views.map(({ slug, view }) => (
          <li key={slug} className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
            <h2 className="text-lg font-bold">
              <Link href={`/conflicts/${slug}`} className="underline">
                {view.definition.displayName}
              </Link>
            </h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Benchmark: {REFERENCE_SERIES_LABELS[view.definition.referenceSeries]}
            </p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Contributor theaters:{" "}
              {view.definition.contributorTheaters
                .map((t) => `${t.theater.toUpperCase()}${t.comparability === "legacy_only" ? " (legacy)" : ""}`)
                .join(", ")}
            </p>
            {view.featured !== null && view.featured.result.state === "scored" ? (
              <p className="mt-2 text-sm">
                Latest scored fixture benchmark ({view.featured.result.report.reportDate}):{" "}
                <Ratio count={view.featured.result.headline.publishedRetention} /> in the published
                output
              </p>
            ) : (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                No scored fixture benchmark — unavailable, not 0%.
              </p>
            )}
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400 tabular-nums">
              {view.entries.length} fixture benchmark record
              {view.entries.length === 1 ? "" : "s"}
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}

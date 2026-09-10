// /conflicts — the conflict/region index (WS-3.5: REAL observations).
//
// GUARD ORDER (binding): this is a PUBLIC-when-enabled teaser surface, so the
// feature-off guard is the FIRST statement, before ANY conflict data access.
// The provider and the DB client are imported dynamically AFTER the guard, so
// the off path opens no connection. Rendered content is teaser-tier only:
// counts, ratios, labels, edition keys, methodology — never claim text, never
// reference-takeaway text, never a source trail.
//
// RULING 3: the data source is `db-product-view.ts`, which cannot reach the
// fixture corpus (see its header and db-product-view.test.ts). There is no
// synthetic fallback — a conflict with no observations renders as an ABSENCE,
// which is why the synthetic-corpus banner is gone and the memo-C13 compound
// banner stands in its place.

import Link from "next/link";
import { requireConflictsUi } from "@/lib/conflicts/feature";
import {
  NON_INDEPENDENCE_CAVEAT,
  REFERENCE_SERIES_LABELS,
  noObservationsNote,
} from "@/lib/conflicts/product-copy";
import { SoakEligibilityBanner } from "@/components/conflicts/soak-eligibility-banner";
import { TerminologyExplainer } from "@/components/conflicts/explainers";
import { Ratio } from "@/components/conflicts/model";

export const dynamic = "force-dynamic";

export default async function ConflictsIndexPage() {
  requireConflictsUi();
  const [{ CONFLICT_SLUGS }, { loadDbConflictProductView }, { rawSql }] = await Promise.all([
    import("@/lib/conflicts/product-slugs"),
    import("@/lib/conflicts/db-product-view"),
    import("@/db"),
  ]);
  const query = (sql: string, params?: unknown[]) =>
    rawSql.query(sql, params) as Promise<Array<Record<string, unknown>>>;

  const views = await Promise.all(
    Object.entries(CONFLICT_SLUGS).map(async ([slug, conflictId]) => ({
      slug,
      // the index needs only the featured day, and each resolved day costs one
      // edition read — so it stops there rather than walking the window twice
      view: await loadDbConflictProductView(query, conflictId, { stopAfterResolvedDays: 1 }),
    })),
  );
  const compoundUndetermined = views.some(({ view }) => view.compoundUndetermined);

  return (
    <main id="main" className="mx-auto max-w-4xl p-6">
      <h1 className="mb-2 text-2xl font-bold">Conflicts</h1>
      <p className="mb-4 max-w-2xl text-sm text-gray-700 dark:text-gray-300">
        Conflict/region views join the per-country coverage lenses into one analytical object and
        score each external reference report once at conflict level. Country pages are unchanged
        and remain the evidence drill-down surface.
      </p>
      <SoakEligibilityBanner compoundUndetermined={compoundUndetermined} />
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
            {view.featured !== null ? (
              <>
                <p className="mt-2 text-sm">
                  Latest scored day ({view.featured.reportDate}):{" "}
                  <Ratio count={view.featured.result.headline.publishedRetention} /> in the
                  published output
                </p>
                {/* this card is the FIRST coverage number a visitor sees and
                    sits outside any benchmark module, so the caveat and the
                    read-the-n instruction travel WITH it (Gate-7 product
                    MINOR-3) — a bare % with neither is exactly the
                    out-of-context number the contract §0 caveat exists to
                    prevent */}
                <p
                  data-testid="index-card-caveat"
                  className="mt-1 max-w-2xl text-xs text-gray-600 dark:text-gray-400"
                >
                  {NON_INDEPENDENCE_CAVEAT} Small denominators are shown as-is — read the n, not
                  just the percentage.
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                {noObservationsNote(view.windowDays)}
              </p>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}

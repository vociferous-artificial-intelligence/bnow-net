// /conflicts/[slug]/benchmark/[key]/evidence — the GATED "what changed"
// evidence view (Phase 6): the read-only union of claims that genuinely
// appeared in the designated published digests for this benchmark record,
// with claim text, hedge, confidence, timestamps, and full source trails.
//
// ACCESS TIER (binding — contract §11 access-tier pin): this surface renders
// PUBLISHED DIGEST CLAIM TEXT, so it inherits at least the digest surfaces'
// access tier. GUARD ORDER, absolute:
//   1. requireAcceptedUser() — the ruling-21 page-level authorization gate,
//      the FIRST statement (layouts are never the boundary);
//   2. requireConflictsUi() — the feature-off guard, IMMEDIATELY second;
//   3. only then params/data access (provider dynamically imported after).
// Covered by the production-build HTTP body tests in
// src/integration/conflict-feature-off.itest.ts and by the always-run
// "page-level authorization gate" unit case in page.test.tsx.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAcceptedUser } from "@/lib/gate";
import { requireConflictsUi } from "@/lib/conflicts/feature";
import { EvidenceList } from "@/components/conflicts/evidence-list";
import { QuestionSection } from "@/components/conflicts/section";
import { SyntheticBanner } from "@/components/conflicts/synthetic-banner";

export const dynamic = "force-dynamic";

export default async function BenchmarkEvidencePage({
  params,
}: {
  params: Promise<{ slug: string; key: string }>;
}) {
  await requireAcceptedUser();
  requireConflictsUi();
  const { slug, key } = await params;
  const { conflictIdForSlug, loadEvidenceView } = await import(
    "@/lib/conflicts/product-view"
  );
  const conflictId = conflictIdForSlug(slug);
  if (conflictId === null) notFound();
  const view = loadEvidenceView(conflictId, key);
  if (view === null) notFound();
  const { entry, definition, markers, rows } = view;

  return (
    <main id="main" className="mx-auto max-w-3xl p-6">
      <nav aria-label="Breadcrumb" className="mb-2 text-sm">
        <Link href="/conflicts" className="underline">
          Conflicts
        </Link>{" "}
        /{" "}
        <Link href={`/conflicts/${slug}`} className="underline">
          {definition.displayName}
        </Link>{" "}
        /{" "}
        <Link href={`/conflicts/${slug}/benchmark/${entry.benchmarkKey}`} className="underline">
          benchmark
        </Link>{" "}
        / <span>evidence</span>
      </nav>
      <h1 className="mb-1 text-2xl font-bold">
        {definition.displayName} — published evidence
      </h1>
      <p className="mb-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
        Fixture demonstration: {entry.scenarioTitle}
        {entry.variantId !== null && ` · variant ${entry.variantId}`}
      </p>
      <SyntheticBanner markers={markers} />

      <QuestionSection qid="evidence" heading="What changed — the published union">
        {rows === null ? (
          <p className="max-w-2xl text-sm text-gray-700 dark:text-gray-300">
            This benchmark record is unavailable (no evaluation exists), so there is no published
            union to show — unavailability is a provenance statement, never an empty list and never
            a zero.
          </p>
        ) : (
          <EvidenceList rows={rows} taxonomyVersion={entry.result.laneTaxonomyVersion} />
        )}
      </QuestionSection>
    </main>
  );
}

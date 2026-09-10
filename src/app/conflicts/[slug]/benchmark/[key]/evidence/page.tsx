// /conflicts/[slug]/benchmark/[key]/evidence — the GATED "what changed"
// evidence view (WS-3.5: REAL observations): the read-only union of claims that
// genuinely appeared in the designated published digests for this scored day,
// with claim text, hedge, confidence, timestamps, and full source trails.
//
// ACCESS TIER (binding — contract §11 access-tier pin): this surface renders
// PUBLISHED DIGEST CLAIM TEXT, so it inherits at least the digest surfaces'
// access tier. GUARD ORDER, absolute:
//   1. requireAcceptedUser() — the ruling-21 page-level authorization gate,
//      the FIRST statement (layouts are never the boundary);
//   2. requireConflictsUi() — the feature-off guard, IMMEDIATELY second;
//   3. only then params/data access (provider and DB client dynamically
//      imported after).
// Covered by the production-build HTTP body tests in
// src/integration/conflict-feature-off.itest.ts — which is the recorded
// discharge of the ROUTES-row obligation for this route (AGENTS.md ruling 21;
// the authz-page-gate harness runs flag-ABSENT, so its positive control cannot
// pass here) — and by the always-run "page-level authorization gate" unit case
// in page.test.tsx.
//
// The claim TEXT is joined LIVE from `claims`, not read from the observation:
// ruling 1 keeps prose out of `conflict_validation_observations` entirely, so
// the stored result carries claim IDS and the analytical fields only. A union
// claim that no longer renders (digest regenerated, source links gone, a
// stub-adapter document appeared) is COUNTED and omitted, never reconstructed.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAcceptedUser } from "@/lib/gate";
import { requireConflictsUi } from "@/lib/conflicts/feature";
import { WITHHELD_CLAIM_NOTE } from "@/lib/conflicts/product-copy";
import { EvidenceList } from "@/components/conflicts/evidence-list";
import { QuestionSection } from "@/components/conflicts/section";
import { SoakEligibilityBanner } from "@/components/conflicts/soak-eligibility-banner";

export const dynamic = "force-dynamic";

export default async function BenchmarkEvidencePage({
  params,
}: {
  params: Promise<{ slug: string; key: string }>;
}) {
  await requireAcceptedUser();
  requireConflictsUi();
  const { slug, key } = await params;
  const [{ conflictIdForSlug }, { loadDbEvidenceView }, { rawSql }] = await Promise.all([
    import("@/lib/conflicts/product-slugs"),
    import("@/lib/conflicts/db-product-view"),
    import("@/db"),
  ]);
  const conflictId = conflictIdForSlug(slug);
  if (conflictId === null) notFound();
  const query = (sql: string, p?: unknown[]) =>
    rawSql.query(sql, p) as Promise<Array<Record<string, unknown>>>;
  const view = await loadDbEvidenceView(query, conflictId, key);
  if (view === null) notFound();
  const { day, definition, rows, withheldClaimIds } = view;

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
        <Link href={`/conflicts/${slug}/benchmark/${day.benchmarkKey}`} className="underline">
          benchmark
        </Link>{" "}
        / <span>evidence</span>
      </nav>
      <h1 className="mb-1 text-2xl font-bold">
        {definition.displayName} — published evidence
      </h1>
      <p className="mb-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
        Report day <span className="tabular-nums">{day.reportDate}</span> · edition{" "}
        <span className="font-mono text-xs">{day.editionKey}</span>
      </p>
      <SoakEligibilityBanner
        compoundUndetermined={day.compoundUndetermined}
        unitFlagsVersion={day.observation.unitFlagsVersion}
      />

      <QuestionSection qid="evidence" heading="What changed — the published union">
        <EvidenceList rows={rows} taxonomyVersion={day.result.laneTaxonomyVersion} />
        {withheldClaimIds.length > 0 && (
          <p
            data-testid="withheld-claims"
            className="mt-4 max-w-2xl text-xs text-gray-600 dark:text-gray-400"
          >
            <span className="tabular-nums font-medium">{withheldClaimIds.length}</span> claim
            {withheldClaimIds.length === 1 ? "" : "s"} in this evaluation&apos;s union no longer
            render (ids{" "}
            <span className="font-mono tabular-nums">{withheldClaimIds.join(", ")}</span>).{" "}
            {WITHHELD_CLAIM_NOTE}
          </p>
        )}
      </QuestionSection>
    </main>
  );
}

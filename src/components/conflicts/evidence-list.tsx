// The gated "what changed" evidence view (analyst question 2's drill-in;
// register #4 / prompt §14): a READ-ONLY union of claims that genuinely
// appeared in the designated published digests, with originating theater/
// track, source trail, hedge, confidence, and timestamps retained — never
// strengthened. Claim TEXT renders here and ONLY here (the access-tier pin:
// this component may be mounted only behind requireAcceptedUser + the
// feature guard). Takeaway text never renders (ids/lanes only).

import type { PublishedEvidenceRow } from "@/lib/conflicts/product-view";
import { laneById, type LaneTaxonomyVersion } from "@/lib/conflicts/lanes";
import { EVIDENCE_VIEW_NOTE } from "@/lib/conflicts/product-copy";
import { Instant, hedgeLabel, trackLabel } from "./model";

function SourceTrail({ docs }: { docs: PublishedEvidenceRow["docs"] }) {
  return (
    <ul className="mt-2 space-y-1">
      {docs.map((doc) => (
        <li
          key={doc.docId}
          className="flex flex-wrap items-baseline gap-x-2 text-xs text-gray-600 dark:text-gray-400"
        >
          <span className="break-all font-medium">{doc.sourceDomain}</span>
          <span>
            via {doc.adapter}
            {doc.platform !== null && ` (${doc.platform})`}
          </span>
          {doc.mirrorOfDocId !== null && (
            <span className="text-amber-700 dark:text-amber-400">
              mirror of doc {doc.mirrorOfDocId} — never independent corroboration
            </span>
          )}
          <span>
            published <Instant iso={doc.publishedAt} /> · fetched <Instant iso={doc.fetchedAt} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function EvidenceList({
  rows,
  taxonomyVersion,
}: {
  rows: readonly PublishedEvidenceRow[];
  taxonomyVersion: LaneTaxonomyVersion;
}) {
  return (
    <div>
      <p className="max-w-2xl text-sm text-gray-700 dark:text-gray-300">{EVIDENCE_VIEW_NOTE}</p>
      {rows.length === 0 ? (
        <p data-testid="evidence-empty" className="mt-4 py-6 text-center text-gray-500 dark:text-gray-400">
          No published digest claim entered this evaluation&apos;s published-retention population —
          an empty union is shown as empty, never invented.
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {rows.map((row) => (
            <li
              key={row.claimId}
              className="rounded-lg border border-gray-200 p-4 dark:border-gray-800"
            >
              <p className="break-words text-sm">{row.text}</p>
              <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
                <span>
                  from the {row.theater.toUpperCase()} · {trackLabel(row.track)} digest
                </span>
                {row.legacy && (
                  <span className="text-amber-700 dark:text-amber-400">legacy engine</span>
                )}
                <span>hedge: {hedgeLabel(row.hedge)}</span>
                {row.confidence !== null && (
                  <span className="tabular-nums">confidence {row.confidence}</span>
                )}
                <span className="tabular-nums">claim day {row.claimDate}</span>
                {row.earliestIngestAt !== null && (
                  <span>
                    earliest BNOW ingest <Instant iso={row.earliestIngestAt} />
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                {row.matchedUnits.length > 0 ? (
                  <>
                    matches takeaway{row.matchedUnits.length === 1 ? "" : "s"}{" "}
                    {row.matchedUnits.map((unit, i) => (
                      <span key={`${unit.unitId}-${i}`}>
                        {i > 0 && ", "}
                        <span className="font-mono">{unit.unitId}</span> (
                        {laneById(taxonomyVersion, unit.lane).label}
                        {unit.coverage === "partial" && ", partial coverage"})
                      </span>
                    ))}
                  </>
                ) : row.bnowOnlyLane !== null ? (
                  <>
                    BNOW-only reported item in scope (
                    {laneById(taxonomyVersion, row.bnowOnlyLane).label}) — the hedge above is shown,
                    not strengthened
                  </>
                ) : null}
              </p>
              <SourceTrail docs={row.docs} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

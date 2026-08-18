// Diagnostics (analyst question 6): what was unavailable, thinly sourced, or
// reference-only. Rules bound here: unavailable renders as words, never 0;
// thin-sourced counts always carry their explicit denominators; timing
// medians carry the pair-weighting documentation beside the number (Gate-4
// binding obligation (b)) and render "unknown", never 0, for null medians;
// reference-only takeaways surface as ids + lane/flags only — never takeaway
// text. The methodology stamps live in a native <details> like the
// scoreboard's, reachable without JavaScript.

import type {
  ConflictReferenceOnlyRecordV1,
  ConflictScoredResultV1,
} from "@/lib/conflicts/eval-profile";
import { laneById } from "@/lib/conflicts/lanes";
import {
  THIN_SOURCED_NOTE,
  TIMING_PAIR_WEIGHTED_NOTE,
} from "@/lib/conflicts/product-copy";

function hoursLabel(value: number | null): string {
  return value === null ? "unknown" : `${value}h`;
}

function ReferenceOnlyList({
  heading,
  records,
  taxonomyVersion,
}: {
  heading: string;
  records: readonly ConflictReferenceOnlyRecordV1[];
  taxonomyVersion: ConflictScoredResultV1["laneTaxonomyVersion"];
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
      <h4 className="text-sm font-semibold">{heading}</h4>
      {records.length === 0 ? (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">none</p>
      ) : (
        <ul className="mt-1 space-y-1 text-sm">
          {records.map((rec) => (
            <li key={rec.unitId} className="break-words">
              <span className="font-mono text-xs">{rec.unitId}</span> ·{" "}
              {laneById(taxonomyVersion, rec.lane).label} · {rec.verdict}
              {rec.compound && " · compound"}
              {rec.negative && " · negative/quiet-day"}
              {rec.missDiagnostic === "incomparable_coverage" && (
                <span className="text-amber-700 dark:text-amber-400">
                  {" "}
                  · honest miss with incomparable evidence class (a real coverage gap — stays in the
                  denominator)
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DiagnosticsModule({ result }: { result: ConflictScoredResultV1 }) {
  const thin = result.thinSourced;
  const timing = result.timing;
  const bnowOnly = result.bnowOnly;
  return (
    <div className="space-y-4">
      {thin !== undefined && (
        <div>
          <h4 className="text-sm font-semibold">Thin-sourced claims</h4>
          <p className="mt-1 text-sm tabular-nums">
            corpus recall {thin.corpusRecall.count} of {thin.corpusRecall.denominator} offered
            claims · published retention {thin.publishedRetention.count} of{" "}
            {thin.publishedRetention.denominator} offered claims
          </p>
          <p className="mt-1 max-w-2xl text-xs text-gray-600 dark:text-gray-400">
            {THIN_SOURCED_NOTE}
          </p>
        </div>
      )}
      {timing !== undefined && (
        <div>
          <h4 className="text-sm font-semibold">Information lead</h4>
          <p className="mt-1 text-sm tabular-nums">
            corpus recall: median lead by BNOW ingest {hoursLabel(timing.corpusRecall.medianLeadHoursByIngest)} · by
            source-declared publish {hoursLabel(timing.corpusRecall.medianLeadHoursBySourceDeclared)} (
            {timing.corpusRecall.agreements} agreement
            {timing.corpusRecall.agreements === 1 ? "" : "s"})
          </p>
          <p className="mt-0.5 text-sm tabular-nums">
            published retention: by ingest {hoursLabel(timing.publishedRetention.medianLeadHoursByIngest)} · by
            source-declared publish {hoursLabel(timing.publishedRetention.medianLeadHoursBySourceDeclared)} (
            {timing.publishedRetention.agreements} agreement
            {timing.publishedRetention.agreements === 1 ? "" : "s"})
          </p>
          <p
            data-testid="timing-pair-weighted-note"
            className="mt-1 max-w-2xl text-xs text-gray-600 dark:text-gray-400"
          >
            {TIMING_PAIR_WEIGHTED_NOTE} Unknown instants render as unknown, never as 0.
          </p>
        </div>
      )}
      {bnowOnly !== undefined && (
        <div>
          <h4 className="text-sm font-semibold">BNOW-only in-scope items</h4>
          <p className="mt-1 text-sm tabular-nums">
            published retention {bnowOnly.publishedRetention.count} (renderable population) · corpus
            recall {bnowOnly.corpusRecall.count} (internal count only — corpus-recall-only claims
            are never listed)
          </p>
        </div>
      )}
      {result.referenceOnly !== undefined && (
        <div>
          <h4 className="text-sm font-semibold">Reference-only takeaways</h4>
          <p className="mt-1 max-w-2xl text-xs text-gray-600 dark:text-gray-400">
            Declared takeaways no BNOW claim matched in the named population, listed by stable id
            and lane. Takeaway text is the reference series&apos; own and is never reproduced here.
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <ReferenceOnlyList
              heading="vs corpus recall"
              records={result.referenceOnly.corpusRecall}
              taxonomyVersion={result.laneTaxonomyVersion}
            />
            <ReferenceOnlyList
              heading="vs published retention"
              records={result.referenceOnly.publishedRetention}
              taxonomyVersion={result.laneTaxonomyVersion}
            />
          </div>
        </div>
      )}
      <details
        data-testid="conflict-methodology"
        className="max-w-2xl rounded-lg border border-gray-200 p-4 dark:border-gray-800"
      >
        <summary className="cursor-pointer text-sm font-semibold">
          Method stamps (window, versions, selection)
        </summary>
        <ul className="mt-3 space-y-1.5 text-sm text-gray-700 dark:text-gray-300">
          <li>
            Evaluation kind: {result.evaluationKind} · methodology epoch {result.methodologyEpoch}
          </li>
          {result.window !== undefined && (
            <li className="tabular-nums">
              Window: {result.window.startDate} → {result.window.endDate} ({result.window.days} day
              {result.window.days === 1 ? "" : "s"}), end anchored on {result.windowEndSource}
            </li>
          )}
          {result.versions !== undefined && (
            <li className="break-words">
              Versions: lanes {result.laneTaxonomyVersion} · evidence policy{" "}
              {result.evidencePolicyVersion} · roster {result.versions.actorRosterVersion} ·
              classifier {result.versions.laneClassifierVersion} · scope{" "}
              {result.versions.scopeVersion}
            </li>
          )}
          {result.selection !== undefined && (
            <li className="tabular-nums">
              Selection: corpus recall {result.selection.corpusRecall.selectedCount} of{" "}
              {result.selection.corpusRecall.eligibleCount} eligible · published retention{" "}
              {result.selection.publishedRetention.selectedCount} of{" "}
              {result.selection.publishedRetention.eligibleCount} eligible (bounded at{" "}
              {result.selection.limits.maxCandidates} candidates)
            </li>
          )}
          <li>
            Input snapshot:{" "}
            {result.snapshot?.ref == null
              ? "none (pre-capture; labeled retrospective inputs)"
              : `${result.snapshot.ref.captureKind} captured ${result.snapshot.ref.capturedAt}`}
          </li>
        </ul>
      </details>
    </div>
  );
}

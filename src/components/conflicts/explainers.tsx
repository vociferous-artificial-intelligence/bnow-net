// The contract §11 required explainers, shared across conflict surfaces:
// (b) source-country relevance, (c) terminology where first used, and
// (d) the scoreboard-coexistence cross-reference. The non-independence
// caveat (a) deliberately does NOT live here — it renders inside the
// benchmark module itself (benchmark-headline.tsx), beside the score.

import Link from "next/link";
import {
  SCOREBOARD_COEXISTENCE_NOTE,
  SOURCE_COUNTRY_NOTE,
  TERMINOLOGY_EXPLAINER,
} from "@/lib/conflicts/product-copy";

export function TerminologyExplainer() {
  return (
    <details
      data-testid="terminology-explainer"
      className="max-w-2xl rounded-lg border border-gray-200 p-4 dark:border-gray-800"
    >
      <summary className="cursor-pointer text-sm font-semibold">
        Conflict, country, and benchmark — what each term means here
      </summary>
      <ul className="mt-3 list-disc space-y-1.5 ps-4 text-sm text-gray-700 dark:text-gray-300">
        <li>{TERMINOLOGY_EXPLAINER.conflict}</li>
        <li>{TERMINOLOGY_EXPLAINER.country}</li>
        <li>{TERMINOLOGY_EXPLAINER.benchmark}</li>
      </ul>
    </details>
  );
}

export function SourceCountryNote() {
  return (
    <p
      data-testid="source-country-note"
      className="max-w-2xl text-sm text-gray-700 dark:text-gray-300"
    >
      {SOURCE_COUNTRY_NOTE}
    </p>
  );
}

export function ScoreboardCoexistenceNote() {
  return (
    <p
      data-testid="scoreboard-coexistence-note"
      className="max-w-2xl text-sm text-gray-700 dark:text-gray-300"
    >
      {SCOREBOARD_COEXISTENCE_NOTE}{" "}
      <Link href="/scoreboard" className="underline">
        Open the per-country validation scoreboard
      </Link>
      .
    </p>
  );
}

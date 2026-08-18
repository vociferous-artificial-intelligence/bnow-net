// Truth-in-UI banner (ruling 3) for the fixture-backed feature-off build:
// every conflict surface renders the fixture corpus's OWN disclaimer marker
// prominently, so no synthetic scenario can be read as fact. Removing this
// banner is an enablement-time decision that requires real (non-fixture)
// results and a decision-log entry.

import { SYNTHETIC_CORPUS_HEADING } from "@/lib/conflicts/product-copy";
import type { CorpusMarkers } from "@/lib/conflicts/product-view";

export function SyntheticBanner({ markers }: { markers: CorpusMarkers }) {
  return (
    <aside
      role="note"
      aria-label={SYNTHETIC_CORPUS_HEADING}
      data-testid="synthetic-banner"
      className="mb-6 rounded-lg border border-amber-600 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500 dark:bg-amber-950 dark:text-amber-200"
    >
      <p className="font-semibold">{SYNTHETIC_CORPUS_HEADING}</p>
      <p className="mt-1 break-words">{markers.disclaimer}</p>
      <p className="mt-1 text-xs">Corpus provenance: {markers.provenance}</p>
    </aside>
  );
}

// Memo C13's binding label, in the same slot and the same prominence the
// fixture build's synthetic-corpus banner occupied — and for the same reason.
// The synthetic banner said "these numbers are not real"; this one says "these
// numbers are real but systematically over-credited". Both are conditions a
// reader must meet BEFORE the figures, so both are a banner, never a footnote.
//
// It renders whenever a displayed observation carries the undetermined-compound
// unit-flags version. When a human-calibrated compound version replaces it the
// banner disappears by itself — nothing has to be remembered and removed.

import {
  COMPOUND_UNDETERMINED_HEADING,
  COMPOUND_UNDETERMINED_NOTE,
} from "@/lib/conflicts/product-copy";

export function SoakEligibilityBanner({
  compoundUndetermined,
  unitFlagsVersion,
}: {
  compoundUndetermined: boolean;
  unitFlagsVersion?: string;
}) {
  if (!compoundUndetermined) return null;
  return (
    <aside
      role="note"
      aria-label={COMPOUND_UNDETERMINED_HEADING}
      data-testid="compound-undetermined-banner"
      className="mb-6 rounded-lg border border-amber-600 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500 dark:bg-amber-950 dark:text-amber-200"
    >
      <p className="font-semibold">{COMPOUND_UNDETERMINED_HEADING}</p>
      <p className="mt-1 break-words">{COMPOUND_UNDETERMINED_NOTE}</p>
      {unitFlagsVersion !== undefined && (
        <p className="mt-1 font-mono text-xs">unit flags: {unitFlagsVersion}</p>
      )}
    </aside>
  );
}

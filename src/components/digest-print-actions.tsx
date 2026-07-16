"use client";

import { useEffect, useRef, useState } from "react";
import { captureProductEvent } from "@/lib/analytics/client";
import { FOCUS_RING } from "./nav-dropdown";
import { analyticsTheater, type DigestAgeBucket } from "./analytics/product-event-model";

export interface DigestPrintLabels {
  actions: string;
  brief: string;
  evidence: string;
  failure: string;
}

const ITEM_CLASS =
  "block w-full px-3 py-2 text-start text-sm hover:bg-gray-100 focus:bg-gray-100 dark:hover:bg-gray-900 dark:focus:bg-gray-900";

/**
 * One disclosure holding both print modes, sitting beside the digest title
 * (2026-07-16). It was two competing top-level buttons taking a full row above the
 * date navigation, which read as the page's primary actions — printing is a handoff
 * step, not the job.
 *
 * Native <details>: keyboard-operable and carrying its own accessible name (the
 * summary) and expanded state with no ARIA to hand-maintain. Both modes, their
 * analytics, and the data-print-mode contract with globals.css are unchanged — brief
 * stays the default/native print, full evidence stays opt-in.
 */
export function DigestPrintActions({
  labels,
  theater,
  digestAge,
}: {
  labels: DigestPrintLabels;
  theater: string;
  digestAge: DigestAgeBucket;
}) {
  const [error, setError] = useState(false);
  const disclosureRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.printPage = "digest";

    const clearMode = () => {
      delete root.dataset.printMode;
    };
    window.addEventListener("afterprint", clearMode);

    return () => {
      window.removeEventListener("afterprint", clearMode);
      clearMode();
      delete root.dataset.printPage;
    };
  }, []);

  const print = (mode: "brief" | "evidence") => {
    const root = document.documentElement;
    setError(false);
    // Collapse before printing: the panel is print-hidden anyway, but leaving it open
    // behind the print dialog and after it returns is just debris.
    if (disclosureRef.current) disclosureRef.current.open = false;
    root.dataset.printMode = mode;
    captureProductEvent("digest_print_initiated", {
      theater: analyticsTheater(theater),
      print_mode: mode,
      digest_age_bucket: digestAge,
    });
    try {
      window.print();
    } catch {
      delete root.dataset.printMode;
      setError(true);
    }
  };

  return (
    <div data-print="hide" className="flex flex-col items-start gap-1 sm:items-end">
      <details ref={disclosureRef} className="relative">
        <summary
          className={`inline-flex cursor-pointer list-none items-center gap-1.5 rounded border border-gray-300 px-2.5 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800 [&::-webkit-details-marker]:hidden ${FOCUS_RING}`}
        >
          {labels.actions}
          <svg aria-hidden="true" viewBox="0 0 12 12" className="h-2.5 w-2.5">
            <path d="M1 4l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </summary>
        <div className="absolute start-0 z-10 mt-1 min-w-max rounded-lg border border-gray-200 bg-white py-1 shadow-lg sm:start-auto sm:end-0 dark:border-gray-800 dark:bg-gray-950">
          <button type="button" onClick={() => print("brief")} className={`${ITEM_CLASS} ${FOCUS_RING}`}>
            {labels.brief}
          </button>
          <button type="button" onClick={() => print("evidence")} className={`${ITEM_CLASS} ${FOCUS_RING}`}>
            {labels.evidence}
          </button>
        </div>
      </details>
      <span role="status" aria-live="polite" className="text-sm text-red-700 dark:text-red-300">
        {error ? labels.failure : ""}
      </span>
    </div>
  );
}

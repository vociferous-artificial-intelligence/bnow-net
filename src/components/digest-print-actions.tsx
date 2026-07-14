"use client";

import { useEffect, useState } from "react";

export interface DigestPrintLabels {
  actions: string;
  brief: string;
  evidence: string;
  failure: string;
}

export function DigestPrintActions({ labels }: { labels: DigestPrintLabels }) {
  const [error, setError] = useState(false);

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
    root.dataset.printMode = mode;
    try {
      window.print();
    } catch {
      delete root.dataset.printMode;
      setError(true);
    }
  };

  return (
    <div
      role="group"
      aria-label={labels.actions}
      data-print="hide"
      className="mb-4 flex flex-wrap items-center gap-2"
    >
      <span className="text-sm font-medium">{labels.actions}</span>
      <button
        type="button"
        onClick={() => print("brief")}
        className="rounded border border-gray-300 px-2.5 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
      >
        {labels.brief}
      </button>
      <button
        type="button"
        onClick={() => print("evidence")}
        className="rounded border border-gray-300 px-2.5 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
      >
        {labels.evidence}
      </button>
      <span role="status" aria-live="polite" className="text-sm text-red-700 dark:text-red-300">
        {error ? labels.failure : ""}
      </span>
    </div>
  );
}

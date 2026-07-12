"use client";

import { useEffect } from "react";
import Link from "next/link";
import { isLocale, makeT, type Locale } from "@/i18n/dictionaries";

// Literal English used until the supervisor merges the proposed "error.*" keys into
// src/i18n/dictionaries.ts (out of this file's ownership for this task). Every string
// still resolves through t(), so the merge activates translations with no code change —
// this table just backstops the interim gap where t() would otherwise echo the raw key.
const FALLBACK_EN: Record<string, string> = {
  "error.heading": "Something failed while rendering this page.",
  "error.body": "The error has been logged. Retrying usually resolves transient data issues.",
  "error.reference": "Reference",
};

function useDictLocale(): Locale {
  // error.tsx is a client-only boundary (React error boundaries cannot run on the
  // server), so it never SSRs — reading `document` synchronously here does not risk a
  // hydration mismatch. The root layout sets <html lang>, so this recovers the active
  // locale without a server round-trip.
  const lang = typeof document !== "undefined" ? document.documentElement.lang : undefined;
  return isLocale(lang) ? lang : "en";
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Never render error.message to the user (it may leak internals); logging it is fine.
    console.error("[error boundary]", error.digest ?? "(no digest)", error);
  }, [error]);

  const locale = useDictLocale();
  const dictT = makeT(locale);
  const t = (key: string) => {
    const val = dictT(key);
    return val === key ? (FALLBACK_EN[key] ?? key) : val;
  };

  return (
    <main id="main" className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-semibold">{t("error.heading")}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">{t("error.body")}</p>
      {error.digest && (
        <p className="rounded-lg border border-gray-200 px-3 py-1 font-mono text-xs text-gray-400 dark:border-gray-800 dark:text-gray-600">
          {t("error.reference")}: {error.digest}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700"
        >
          {t("common.retry")}
        </button>
        <Link
          href="/"
          className="rounded-lg border border-gray-300 px-5 py-2.5 font-semibold hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
        >
          {dictT("nav.home")}
        </Link>
        <Link
          href="/health"
          className="rounded-lg border border-gray-300 px-5 py-2.5 font-semibold hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
        >
          {dictT("common.status")}
        </Link>
      </div>
    </main>
  );
}

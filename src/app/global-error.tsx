"use client";

import { useEffect } from "react";
import { isLocale, makeT, type Locale } from "@/i18n/dictionaries";

// Same interim fallback as error.tsx (see comment there) — kept duplicated rather than
// shared because this file owns nothing outside itself and must stay independently
// self-contained: it replaces the root layout, so it cannot import anything that assumes
// globals.css or the Geist font variables are present.
const FALLBACK_EN: Record<string, string> = {
  "error.heading": "Something failed while rendering this page.",
};

function useDictLocale(): Locale {
  // Rendered only when the root layout itself throws, so <html lang> was likely never
  // set by this navigation — best-effort read, "en" is the expected common case here.
  const lang = typeof document !== "undefined" ? document.documentElement.lang : undefined;
  return isLocale(lang) ? lang : "en";
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Never render error.message to the user (it may leak internals); logging it is fine.
    console.error("[global-error]", error.digest ?? "(no digest)", error);
  }, [error]);

  const locale = useDictLocale();
  const dictT = makeT(locale);
  const heading = dictT("error.heading");
  const retry = dictT("common.retry");

  return (
    <html lang={locale}>
      <body>
        {/* Inline styles only: globals.css and Tailwind's dark: variants are wired up by
            the root layout this file replaces, so neither is guaranteed to be loaded. */}
        <style>{`
          body { margin:0; background:#ffffff; color:#171717;
            font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
          .error-retry { border-radius:0.5rem; padding:0.625rem 1.25rem; font-weight:600;
            color:#fff; background:#2563eb; border:none; cursor:pointer; }
          .error-retry:hover { background:#1d4ed8; }
          @media (prefers-color-scheme: dark) {
            body { background:#0a0a0a; color:#ededed; }
          }
        `}</style>
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>
            {heading === "error.heading" ? FALLBACK_EN["error.heading"] : heading}
          </h1>
          <button type="button" onClick={reset} className="error-retry">
            {retry}
          </button>
        </main>
      </body>
    </html>
  );
}

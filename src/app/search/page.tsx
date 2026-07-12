import Link from "next/link";
import { Pool } from "@neondatabase/serverless";
import { getLocale } from "@/i18n/server";
import { makeT } from "@/i18n/dictionaries";
import { parseTimeWindow } from "@/lib/ask/window";
import { extractTerms } from "@/lib/ask/retrieve";
import { lexicalClaimSearch, stripWindowPhrase, type LexicalClaimRow } from "@/lib/ask/lexical";

export const dynamic = "force-dynamic";

// Rendered page cap — independent of the ASK pipeline's ASK_LEXICAL_TOP knob
// (src/lib/ask/config.ts): this is a dense claim-search listing, not an LLM
// evidence pool, so it gets its own fixed cap rather than reusing ask's tuning.
const RESULT_LIMIT = 50;

// Money-path note — deliberate CONTRAST with /ask (OPEN-TASKS #48 + the
// double-billing architecture rule): GET /ask?q=... never executes the paid
// pipeline; only an explicit form submission through the server action does,
// because ask() is a paid LLM call. Here, GET /search?q=... EXECUTES
// immediately, and that is correct: lexicalClaimSearch (src/lib/ask/lexical.ts)
// is $0 deterministic SQL — no SpendGuard, no provider call, no ask_usage row.
// Refresh/back-nav/shared links/prefetch cost nothing extra to re-run, so there
// is nothing here for the /ask rule to protect. Do not "fix" this to match /ask.

const HEDGE_COLORS: Record<string, string> = {
  confirmed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  assessed: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  claimed: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  unverified: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  unknown: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const locale = await getLocale();
  const t = makeT(locale);
  const { q } = await searchParams;
  const question = (q ?? "").slice(0, 400);
  const trimmed = question.trim();
  const hasQuery = trimmed.length > 0;

  let rows: LexicalClaimRow[] = [];
  let totalMatching = 0;
  if (hasQuery) {
    const window = parseTimeWindow(trimmed);
    const qStripped = stripWindowPhrase(trimmed, window);
    const terms = extractTerms(qStripped);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const result = await lexicalClaimSearch(pool, { qStripped, terms, window, limit: RESULT_LIMIT });
      rows = result.rows;
      totalMatching = result.matchCount;
    } finally {
      await pool.end();
    }
  }

  return (
    <main id="main" className="mx-auto max-w-3xl p-6">
      <p className="mb-1 text-sm text-gray-500">
        <Link href="/" className="underline">BNOW.NET</Link> · {t("search.breadcrumb")}
      </p>
      <h1 className="mb-1 text-2xl font-bold">{t("search.title")}</h1>
      <p className="mb-4 max-w-2xl text-sm text-gray-500">{t("search.intro")}</p>

      <form method="get" className="mb-6 flex flex-wrap gap-3">
        <input
          type="text"
          name="q"
          defaultValue={question}
          placeholder={t("search.placeholder")}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
        />
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700"
        >
          {t("search.submit")}
        </button>
      </form>

      {hasQuery &&
        (rows.length === 0 ? (
          <p className="py-8 text-center text-gray-400">{t("search.empty")}</p>
        ) : (
          <>
            <p className="mb-3 text-xs text-gray-400">
              {t("search.count", { n: rows.length, total: totalMatching })}
            </p>
            <ul className="space-y-2">
              {rows.map((r) => (
                <li key={r.id} className="rounded border border-gray-200 p-3 text-sm dark:border-gray-800">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                    <span className={`rounded px-1.5 py-0.5 ${HEDGE_COLORS[r.hedging] ?? HEDGE_COLORS.unknown}`}>
                      {r.hedging}
                    </span>
                    <span>{r.iso2.toUpperCase()}</span>
                    {r.d && <span>{r.d}</span>}
                  </div>
                  <p>{r.text}</p>
                  {r.d && (
                    <Link
                      href={`/digests/${r.iso2}/${r.d}#c${r.id}`}
                      className="mt-1 inline-block text-xs underline"
                    >
                      {t("countries.view_digest")}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </>
        ))}
    </main>
  );
}

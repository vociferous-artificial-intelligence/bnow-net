import Link from "next/link";
import { requireUser } from "@/lib/gate";
import { askWithLimits } from "@/lib/ask/limits";
import { rawSql } from "@/db";

export const dynamic = "force-dynamic";

const EXAMPLES = [
  "Which Russian officials were prosecuted recently?",
  "What is happening with Iran's nuclear enrichment?",
  "Which entities are sanctioned and under pressure?",
  "What strikes were reported in Ukraine this week?",
];

async function runQuery(formData: FormData) {
  "use server";
  const q = String(formData.get("question") ?? "").trim().slice(0, 400);
  const { redirect } = await import("next/navigation");
  redirect(`/ask?q=${encodeURIComponent(q)}`);
}

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const { q } = await searchParams;
  const question = q?.slice(0, 400);
  const result =
    question && question.length >= 3
      ? await askWithLimits(question, user?.email ?? null)
      : null;

  // resolve cited claims → source links for click-through
  let cited: Array<{ id: number; text: string; iso2: string; date: string | null }> = [];
  if (result && result.citedClaimIds.length > 0) {
    cited = (await rawSql.query(
      `SELECT cl.id, cl.text, c.iso2, cl.claim_date::text AS date
       FROM claims cl JOIN countries c ON c.id = cl.country_id
       WHERE cl.id = ANY($1::int[])`,
      [result.citedClaimIds],
    )) as typeof cited;
  }
  const citedById = new Map(cited.map((c) => [c.id, c]));

  return (
    <main className="mx-auto max-w-3xl p-6">
      <p className="mb-1 text-sm text-gray-500">
        <Link href="/" className="underline">BNOW.NET</Link> · ask the data
      </p>
      <h1 className="mb-1 text-2xl font-bold">Interrogate the intelligence</h1>
      <p className="mb-4 max-w-2xl text-sm text-gray-500">
        Ask in plain language. Answers are built strictly from our claim database and cite
        the evidence — every fact links back to its source documents. No outside knowledge,
        no speculation.
      </p>

      <form action={runQuery} className="mb-4 flex gap-2">
        <input
          name="question"
          defaultValue={question ?? ""}
          placeholder="e.g. which oligarchs are under prosecution?"
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
        />
        <button className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          Ask
        </button>
      </form>

      {!result && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <Link
              key={e}
              href={`/ask?q=${encodeURIComponent(e)}`}
              className="rounded-full bg-gray-100 px-3 py-1 text-xs hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
            >
              {e}
            </Link>
          ))}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
            <div className="whitespace-pre-wrap text-sm leading-relaxed">{result.answer}</div>
            <p className="mt-3 text-xs text-gray-400">
              {result.evidenceCount} evidence rows · {result.citedClaimIds.length} cited ·{" "}
              {result.provider}
            </p>
          </div>

          {cited.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold">Cited evidence</h2>
              <ul className="space-y-2">
                {result.citedClaimIds.map((id) => {
                  const c = citedById.get(id);
                  if (!c) return null;
                  return (
                    <li key={id} className="rounded border border-gray-100 p-2 text-sm dark:border-gray-800">
                      <span className="mr-2 font-mono text-xs text-gray-400">c{id}</span>
                      {c.text}{" "}
                      {c.date && (
                        <Link href={`/digests/${c.iso2}/${c.date.slice(0, 10)}`} className="text-xs underline">
                          digest →
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

import Link from "next/link";
import { computeSignals } from "@/lib/analyst/run";

export const dynamic = "force-dynamic";

const SEV_STYLE: Record<string, string> = {
  elevated: "border-red-400 dark:border-red-700",
  watch: "border-amber-400 dark:border-amber-700",
  info: "border-gray-300 dark:border-gray-700",
};
const SEV_BADGE: Record<string, string> = {
  elevated: "bg-red-600 text-white",
  watch: "bg-amber-500 text-white",
  info: "bg-gray-400 text-white",
};

export default async function SignalsPage() {
  let signals: Awaited<ReturnType<typeof computeSignals>> = [];
  try {
    signals = await computeSignals(new Date().toISOString());
  } catch {
    // dependencies may be empty
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <p className="mb-1 text-sm text-gray-500">
        <Link href="/" className="underline">BNOW.NET</Link> · analyst signals
      </p>
      <h1 className="mb-1 text-2xl font-bold">Active signals</h1>
      <p className="mb-6 max-w-2xl text-sm text-gray-500">
        Deterministic cross-cutting flags computed over the entity graph, procurement,
        data-transparency and trade layers. Each carries the evidence that triggered it —
        no black-box scoring. Analytical judgments, not confirmed facts.
      </p>

      {signals.length === 0 ? (
        <p className="py-8 text-center text-gray-400">No active signals.</p>
      ) : (
        <div className="space-y-3">
          {signals.map((s) => (
            <div key={s.key} className={`rounded-lg border-2 p-4 ${SEV_STYLE[s.severity]}`}>
              <div className="mb-1 flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-xs font-semibold uppercase ${SEV_BADGE[s.severity]}`}>
                  {s.severity}
                </span>
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-800">
                  {s.theater.toUpperCase()} · {s.kind}
                </span>
                <h2 className="font-semibold">{s.headline}</h2>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300">{s.detail}</p>
              {s.evidenceClaimIds.length > 0 && (
                <p className="mt-1 text-xs text-gray-400">
                  {s.evidenceClaimIds.length} supporting claim(s) · traceable to sources
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

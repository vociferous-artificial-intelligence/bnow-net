import Link from "next/link";
import { redirect } from "next/navigation";
import { rawSql } from "@/db";

export const dynamic = "force-dynamic";

const STRIPE_ENABLED = process.env.FEATURE_STRIPE === "true";

async function captureIntent(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().slice(0, 200);
  const plan = String(formData.get("plan") ?? "").slice(0, 40);
  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect("/pricing?err=email");
  const { rawSql: sql } = await import("@/db");
  await sql.query(
    `INSERT INTO subscribe_intents (email, plan_code, note) VALUES ($1, $2, $3)`,
    [email, plan || null, note],
  );
  redirect("/pricing?thanks=1");
}

const PLAN_COPY: Record<string, { blurb: string; features: string[] }> = {
  standby: {
    blurb: "Monitoring tier for teams that need the signal, not the firehose.",
    features: ["Daily digests (RU/UA)", "Validation scoreboard", "30-day claim history"],
  },
  full_monthly: {
    blurb: "Full access for analysts and desks.",
    features: [
      "Everything in Standby",
      "Source-registry explorer + reliability data",
      "Full claim-to-source drill-down & history",
      "New theaters as they launch",
    ],
  },
  full_annual: {
    blurb: "Founding-subscriber annual: full access, locked-in rate.",
    features: ["Everything in Full", "40–50% off monthly", "Direct feedback channel"],
  },
};

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ thanks?: string; err?: string }>;
}) {
  const sp = await searchParams;
  const plans = (await rawSql.query(
    `SELECT code, name, price_cents, interval FROM plans WHERE active ORDER BY price_cents`,
    [],
  )) as Array<{ code: string; name: string; price_cents: number; interval: string }>;

  return (
    <main className="mx-auto max-w-4xl p-6">
      <p className="mb-1 text-sm text-gray-500">
        <Link href="/" className="underline">BNOW.NET</Link> · pricing
      </p>
      <h1 className="mb-2 text-2xl font-bold">Founding subscriber pricing</h1>
      <p className="mb-8 max-w-2xl text-sm text-gray-500">
        {STRIPE_ENABLED
          ? "Subscribe directly below."
          : "Checkout opens shortly. Leave your email and we will onboard you personally — founding-subscriber terms honored."}
      </p>

      {sp.thanks && (
        <div className="mb-6 rounded-lg bg-green-100 p-3 text-sm text-green-800 dark:bg-green-900 dark:text-green-100">
          Got it — we&apos;ll be in touch within a day.
        </div>
      )}
      {sp.err && (
        <div className="mb-6 rounded-lg bg-red-100 p-3 text-sm text-red-800 dark:bg-red-900 dark:text-red-100">
          Please enter a valid email address.
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        {plans.map((p) => {
          const copy = PLAN_COPY[p.code];
          const monthly =
            p.interval === "year" ? p.price_cents / 100 / 12 : p.price_cents / 100;
          return (
            <div
              key={p.code}
              className={`flex flex-col rounded-xl border p-5 ${
                p.code === "full_annual"
                  ? "border-blue-400 dark:border-blue-600"
                  : "border-gray-200 dark:border-gray-800"
              }`}
            >
              {p.code === "full_annual" && (
                <span className="mb-2 self-start rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  founding subscriber
                </span>
              )}
              <h2 className="font-semibold">{p.name}</h2>
              <div className="mt-1 mb-1 text-3xl font-bold tabular-nums">
                ${monthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                <span className="text-sm font-normal text-gray-400">/mo</span>
              </div>
              {p.interval === "year" && (
                <p className="text-xs text-gray-400">
                  billed annually (${(p.price_cents / 100).toLocaleString()})
                </p>
              )}
              <p className="mt-2 text-sm text-gray-500">{copy?.blurb}</p>
              <ul className="mt-3 mb-4 flex-1 space-y-1 text-sm">
                {copy?.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-green-600">✓</span> {f}
                  </li>
                ))}
              </ul>
              <form action={captureIntent} className="space-y-2">
                <input type="hidden" name="plan" value={p.code} />
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="work email"
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
                />
                <button
                  type="submit"
                  className="w-full rounded bg-blue-600 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  {STRIPE_ENABLED ? "Subscribe" : "Request access"}
                </button>
              </form>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-xs text-gray-400">
        Prices are launch placeholders for founding subscribers; enterprise/API terms on
        request. Full tier shown at the $3K/mo midpoint of the announced $2–4K range.
      </p>
    </main>
  );
}

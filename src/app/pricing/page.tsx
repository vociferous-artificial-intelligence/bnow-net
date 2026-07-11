import Link from "next/link";
import { redirect } from "next/navigation";
import { rawSql } from "@/db";
import { getLocale } from "@/i18n/server";
import { makeT } from "@/i18n/dictionaries";
import { buildTiers, intentPlanCode, type BillingOption, type Tier, type TierId } from "@/lib/pricing/tiers";

export const dynamic = "force-dynamic";

const STRIPE_ENABLED = process.env.FEATURE_STRIPE === "true";

type T = ReturnType<typeof makeT>;

async function captureIntent(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().slice(0, 200);
  const requestedPlan = String(formData.get("plan") ?? "").trim().slice(0, 60);

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect("/pricing?err=email");

  // FK-safety: subscribe_intents.plan_code references plans.code. Re-select the live
  // codes at submit time (not the render-time closure — this action is module-level
  // and a stale page load must not resurrect a retired plan code) and run every
  // requested tier through the same allowlist buildTiers used to render the page.
  const dbCodes = (
    (await rawSql.query(`SELECT code FROM plans WHERE active`, [])) as Array<{ code: string }>
  ).map((r) => r.code);
  const { planCode, notePrefix } = intentPlanCode(requestedPlan, dbCodes);

  await rawSql.query(
    `INSERT INTO subscribe_intents (email, plan_code, note) VALUES ($1, $2, $3)`,
    [email, planCode, notePrefix ? notePrefix.trim().slice(0, 500) : null],
  );
  redirect("/pricing?thanks=1");
}

function formatUsd(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

const CARD_BASE = "flex flex-col rounded-xl border p-5 border-gray-200 dark:border-gray-800";
const CARD_HIGHLIGHT = "flex flex-col rounded-xl border p-5 border-blue-400 dark:border-blue-600";
const EMAIL_INPUT =
  "w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900";
const SUBMIT_PRIMARY =
  "w-full rounded bg-blue-600 py-1.5 text-sm font-semibold text-white hover:bg-blue-700";
const SUBMIT_SECONDARY =
  "w-full rounded border border-gray-300 py-1.5 text-sm font-semibold hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900";

const FEATURE_KEYS: Record<TierId, string[]> = {
  standby: [
    "pricing.standby.feature.digests",
    "pricing.standby.feature.scoreboard",
    "pricing.standby.feature.history",
    "pricing.standby.feature.upgrade",
  ],
  full: [
    "pricing.full.feature.everything_standby",
    "pricing.full.feature.registry",
    "pricing.full.feature.drilldown",
    "pricing.full.feature.new_theaters",
  ],
  regional: ["pricing.regional.feature.geography", "pricing.regional.feature.crisis_resilient"],
  enterprise: [
    "pricing.enterprise.feature.api",
    "pricing.enterprise.feature.multiseat",
    "pricing.enterprise.feature.validation_reporting",
    "pricing.enterprise.feature.custom_theaters",
  ],
};

function DbPricing({ billing, annualDiscountPct, t }: {
  billing: BillingOption[];
  annualDiscountPct: number | null;
  t: T;
}) {
  if (billing.length === 1) {
    const opt = billing[0];
    return (
      <div>
        <div className="text-3xl font-bold tabular-nums">
          {formatUsd(opt.monthlyEquivalentUsd)}
          <span className="text-sm font-normal text-gray-400">/mo</span>
        </div>
        {opt.interval === "year" && (
          <p className="text-xs text-gray-400">
            {t("pricing.billed_annually", { total: formatUsd(opt.priceUsd) })}
          </p>
        )}
      </div>
    );
  }
  const monthly = billing.find((b) => b.interval === "month");
  const annual = billing.find((b) => b.interval === "year");
  return (
    <div className="space-y-1">
      {annual && (
        <div>
          <div className="text-3xl font-bold tabular-nums">
            {formatUsd(annual.monthlyEquivalentUsd)}
            <span className="text-sm font-normal text-gray-400">/mo</span>
          </div>
          <p className="text-xs text-gray-400">
            {t("pricing.billed_annually", { total: formatUsd(annual.priceUsd) })}
            {annualDiscountPct !== null &&
              ` · ${t("pricing.save_pct", { pct: annualDiscountPct })}`}
          </p>
        </div>
      )}
      {monthly && (
        <p className="text-xs text-gray-500">
          {t("pricing.or_monthly", { amount: formatUsd(monthly.monthlyEquivalentUsd) })}
        </p>
      )}
    </div>
  );
}

function RequestForm({ tier, t }: { tier: Tier; t: T }) {
  const verb = STRIPE_ENABLED ? t("pricing.cta.subscribe") : t("pricing.cta.request");

  if (tier.pricing.kind === "db" && tier.pricing.billing.length === 2) {
    const monthly = tier.pricing.billing.find((b) => b.interval === "month")!;
    const annual = tier.pricing.billing.find((b) => b.interval === "year")!;
    const pct = tier.pricing.annualDiscountPct;
    return (
      <form action={captureIntent} className="space-y-2">
        <input
          type="email"
          name="email"
          required
          placeholder={t("pricing.email_placeholder")}
          className={EMAIL_INPUT}
        />
        <div className="flex gap-2">
          <button type="submit" name="plan" value={monthly.code} className={SUBMIT_SECONDARY}>
            {`${verb} — ${t("pricing.cta.monthly_suffix")}`}
          </button>
          <button type="submit" name="plan" value={annual.code} className={SUBMIT_PRIMARY}>
            {pct !== null
              ? `${verb} — ${t("pricing.cta.annual_suffix", { pct })}`
              : `${verb} — ${t("pricing.cta.annual_suffix_plain")}`}
          </button>
        </div>
      </form>
    );
  }

  // Single billing option (DB tier with only one row) or an on_request tier: one
  // hidden plan value, one CTA. On-request tiers always say "Request access" —
  // never "Subscribe" — because there is no price to check out against yet.
  const planValue = tier.pricing.kind === "db" ? tier.pricing.billing[0].code : tier.id;
  const label = tier.pricing.kind === "db" ? verb : t("pricing.cta.request");

  return (
    <form action={captureIntent} className="space-y-2">
      <input type="hidden" name="plan" value={planValue} />
      <input
        type="email"
        name="email"
        required
        placeholder={t("pricing.email_placeholder")}
        className={EMAIL_INPUT}
      />
      <button type="submit" className={SUBMIT_PRIMARY}>
        {label}
      </button>
    </form>
  );
}

function TierCard({ tier, t }: { tier: Tier; t: T }) {
  const highlighted = tier.id === "full";
  const savingsBadge =
    tier.pricing.kind === "db" &&
    tier.pricing.billing.length === 2 &&
    tier.pricing.annualDiscountPct !== null
      ? tier.pricing.annualDiscountPct
      : null;

  return (
    <div className={highlighted ? CARD_HIGHLIGHT : CARD_BASE}>
      {savingsBadge !== null && (
        <span className="mb-2 self-start rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-200">
          {t("pricing.save_pct_badge", { pct: savingsBadge })}
        </span>
      )}
      <h2 className="font-semibold">{t(`pricing.${tier.id}.name`)}</h2>
      <p className="mt-2 text-sm text-gray-500">{t(`pricing.${tier.id}.blurb`)}</p>

      <div className="mt-3 mb-1">
        {tier.pricing.kind === "db" ? (
          <DbPricing billing={tier.pricing.billing} annualDiscountPct={tier.pricing.annualDiscountPct} t={t} />
        ) : (
          <div className="text-lg font-semibold text-gray-500">{t("pricing.on_request.label")}</div>
        )}
      </div>

      <ul className="mt-3 mb-2 flex-1 space-y-1 text-sm">
        {FEATURE_KEYS[tier.id].map((k) => (
          <li key={k} className="flex gap-2">
            <span className="text-green-600">✓</span> {t(k)}
          </li>
        ))}
      </ul>

      {tier.id === "regional" && (
        <ul className="mb-4 space-y-1 text-xs text-gray-500">
          <li>• {t("pricing.regional.bundle.ru_ua")}</li>
          <li>• {t("pricing.regional.bundle.gulf")}</li>
        </ul>
      )}

      <RequestForm tier={tier} t={t} />
    </div>
  );
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ thanks?: string; err?: string }>;
}) {
  const sp = await searchParams;
  const locale = await getLocale();
  const t = makeT(locale);

  const plans = (await rawSql.query(
    `SELECT code, name, price_cents, interval FROM plans WHERE active ORDER BY price_cents`,
    [],
  )) as Array<{ code: string; name: string; price_cents: number; interval: string }>;

  const tiers = buildTiers(plans);

  return (
    <main id="main" className="mx-auto max-w-6xl p-6">
      <p className="mb-1 text-sm text-gray-500">
        <Link href="/" className="underline">BNOW.NET</Link> · {t("pricing.breadcrumb")}
      </p>
      <h1 className="mb-2 text-2xl font-bold">{t("pricing.title")}</h1>
      <p className="mb-8 max-w-2xl text-sm text-gray-500">
        {STRIPE_ENABLED ? t("pricing.intro.stripe_on") : t("pricing.intro.stripe_off")}
      </p>

      {sp.thanks && (
        <div className="mb-6 rounded-lg bg-green-100 p-3 text-sm text-green-800 dark:bg-green-900 dark:text-green-100">
          {t("pricing.thanks")}
        </div>
      )}
      {sp.err && (
        <div className="mb-6 rounded-lg bg-red-100 p-3 text-sm text-red-800 dark:bg-red-900 dark:text-red-100">
          {t("pricing.err_email")}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiers.map((tier) => (
          <TierCard key={tier.id} tier={tier} t={t} />
        ))}
      </div>

      <p className="mt-8 text-xs text-gray-400">{t("pricing.footnote")}</p>
    </main>
  );
}

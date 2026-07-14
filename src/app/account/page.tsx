import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { rawSql } from "@/db";
import { getLocale } from "@/i18n/server";
import { DISPLAY_TZ, toInstant } from "@/lib/time/day-boundary";
import { currentAcceptanceForEmail } from "@/lib/legal/acceptance";
import { AnalyticsPreferenceForm } from "./analytics-preference-form";
import { AccountSignOutForm } from "./sign-out-form";

export const dynamic = "force-dynamic";

async function doSignOut() {
  "use server";
  await signOut({ redirect: false });
  redirect("/");
}

/** "Jul 12, 2026, 10:45 AM ET" — a records-grade ET timestamp (year included). Null-safe. */
function formatAcceptedAt(value: string, locale: string): string | null {
  const d = toInstant(value);
  if (!d) return null;
  return `${new Intl.DateTimeFormat(locale, {
    timeZone: DISPLAY_TZ,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d)} ET`;
}

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/signin");
  const email = session.user.email;

  // Account is a subscriber surface: a user without current acceptance is sent to the acceptance
  // screen rather than shown a "not accepted" state. currentAcceptanceForEmail returns the
  // CURRENT-version record (or null), so this both enforces and supplies the display data.
  const acceptance = await currentAcceptanceForEmail(email);
  if (!acceptance) redirect("/welcome/legal?next=/account");

  const locale = await getLocale();
  const acceptedDisplay = formatAcceptedAt(acceptance.acceptedAt, locale);

  const subs = (await rawSql.query(
    `SELECT s.plan_code, s.status, p.name FROM subscriptions s
     JOIN plans p ON p.code = s.plan_code
     JOIN users u ON u.id = s.user_id WHERE u.email = $1`,
    [email],
  )) as Array<{ plan_code: string; status: string; name: string }>;

  // While checkout is disabled the account frames access as the private analyst
  // beta — but the "active" claim is still DERIVED from the real subscription
  // state, never inferred from missing Stripe IDs or asserted unconditionally.
  // With Stripe enabled the original plan/status rows render unchanged. Read at
  // render (not module scope) so both branches are testable.
  const stripeEnabled = process.env.FEATURE_STRIPE === "true";
  const hasActiveAccess = subs.some((s) => s.status === "active");

  return (
    <main id="main" className="mx-auto max-w-md p-6 pt-24">
      <p className="mb-1 text-sm text-gray-500">
        <Link href="/" className="underline">BNOW.NET</Link> · account
      </p>
      <h1 className="mb-4 break-all text-xl font-bold">{email}</h1>
      {subs.length > 0 ? (
        !stripeEnabled && hasActiveAccess ? (
          <p className="mb-6 text-sm font-medium">
            Private analyst beta — <span className="text-green-700 dark:text-green-400">active</span>
          </p>
        ) : (
          <ul className="mb-6 space-y-1 text-sm">
            {subs.map((s, i) => (
              <li key={i}>
                {s.name} — <span className="text-gray-500">{s.status}</span>
              </li>
            ))}
          </ul>
        )
      ) : (
        <p className="mb-6 text-sm text-gray-500">
          No access on this account yet.{" "}
          <Link href="/access" className="underline">Request beta access</Link>.
        </p>
      )}

      {/* Legal: the versions the user currently accepts + the server-generated acceptance time.
          No internal acceptance id or method string is exposed. */}
      <section className="mb-6 rounded-lg border border-gray-200 p-4 text-sm dark:border-gray-800">
        <h2 className="mb-2 font-semibold">Legal</h2>
        <dl className="space-y-1 text-gray-600 dark:text-gray-300">
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">Terms of Use</dt>
            <dd>
              <Link href="/terms" className="underline">Version {acceptance.termsVersion}</Link>
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">Privacy Notice</dt>
            <dd>
              <Link href="/privacy" className="underline">Version {acceptance.privacyVersion}</Link>
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">Accepted</dt>
            <dd className="text-right">{acceptedDisplay ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="mb-6 rounded-lg border border-gray-200 p-4 text-sm dark:border-gray-800">
        <h2 className="mb-2 font-semibold">Optional product analytics</h2>
        <p className="mb-3 text-gray-600 dark:text-gray-300">
          Help BNOW understand whether beta analysts reach useful evidence. Events use a random
          internal account ID and exclude Ask/Search text, claim text, source URLs, email, and
          session replay. See the <Link href="/privacy" className="underline">Privacy Notice</Link>.
        </p>
        <AnalyticsPreferenceForm granted={acceptance.analyticsPreference === "granted"} />
      </section>

      <AccountSignOutForm action={doSignOut} />
    </main>
  );
}

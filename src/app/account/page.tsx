import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { rawSql } from "@/db";
import { getLocale } from "@/i18n/server";
import { DISPLAY_TZ, toInstant } from "@/lib/time/day-boundary";
import { currentAcceptanceForEmail } from "@/lib/legal/acceptance";

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

  return (
    <main id="main" className="mx-auto max-w-md p-6 pt-24">
      <p className="mb-1 text-sm text-gray-500">
        <Link href="/" className="underline">BNOW.NET</Link> · account
      </p>
      <h1 className="mb-4 text-xl font-bold">{email}</h1>
      {subs.length > 0 ? (
        <ul className="mb-6 space-y-1 text-sm">
          {subs.map((s, i) => (
            <li key={i}>
              {s.name} — <span className="text-gray-500">{s.status}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-6 text-sm text-gray-500">
          No subscription yet. <Link href="/pricing" className="underline">See pricing</Link> —
          founding-subscriber onboarding is manual while checkout is offline.
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

      <form action={doSignOut}>
        <button className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900">
          Sign out
        </button>
      </form>
    </main>
  );
}

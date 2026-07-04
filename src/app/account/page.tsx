import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { rawSql } from "@/db";

export const dynamic = "force-dynamic";

async function doSignOut() {
  "use server";
  await signOut({ redirect: false });
  redirect("/");
}

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/signin");

  const subs = (await rawSql.query(
    `SELECT s.plan_code, s.status, p.name FROM subscriptions s
     JOIN plans p ON p.code = s.plan_code
     JOIN users u ON u.id = s.user_id WHERE u.email = $1`,
    [session.user.email],
  )) as Array<{ plan_code: string; status: string; name: string }>;

  return (
    <main className="mx-auto max-w-md p-6 pt-24">
      <p className="mb-1 text-sm text-gray-500">
        <Link href="/" className="underline">BNOW.NET</Link> · account
      </p>
      <h1 className="mb-4 text-xl font-bold">{session.user.email}</h1>
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
      <form action={doSignOut}>
        <button className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900">
          Sign out
        </button>
      </form>
    </main>
  );
}

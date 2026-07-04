import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function requestLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  await signIn("email", { email, redirect: false });
  redirect("/signin?sent=1");
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/account");
  const sp = await searchParams;

  return (
    <main className="mx-auto max-w-sm p-6 pt-24">
      <p className="mb-1 text-sm text-gray-500">
        <Link href="/" className="underline">BNOW.NET</Link>
      </p>
      <h1 className="mb-4 text-xl font-bold">Sign in</h1>
      {sp.sent ? (
        <div className="rounded-lg bg-green-100 p-3 text-sm text-green-800 dark:bg-green-900 dark:text-green-100">
          Magic link sent. Check your inbox
          {!process.env.RESEND_API_KEY && " (demo mode: link is in the server log)"}.
        </div>
      ) : (
        <form action={requestLink} className="space-y-3">
          <input
            type="email"
            name="email"
            required
            placeholder="you@example.com"
            className="w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
          />
          <button
            type="submit"
            className="w-full rounded bg-blue-600 py-2 font-semibold text-white hover:bg-blue-700"
          >
            Email me a sign-in link
          </button>
        </form>
      )}
    </main>
  );
}

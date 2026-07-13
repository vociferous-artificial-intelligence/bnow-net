import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Post-auth landing changed from "/" to the legal-acceptance screen (with a safe internal
// `?next=/`): the emailed callback URL carries `redirectTo`, so a verified link lands the user
// on /welcome/legal, where the authoritative clickwrap acceptance happens. Requesting a magic
// link is NOT the persisted legal acceptance — it only sends the email; the authenticated
// acceptance step is the recorded event (docs + src/lib/legal/acceptance.ts).
const POST_AUTH_REDIRECT = "/welcome/legal?next=/";

async function requestLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  await signIn("email", { email, redirect: false, redirectTo: POST_AUTH_REDIRECT });
  redirect("/signin?sent=1");
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/");
  const sp = await searchParams;

  return (
    <main id="main" className="mx-auto max-w-sm p-6 pt-24">
      <p className="mb-1 text-sm text-gray-500">
        <Link href="/" className="underline">BNOW.NET</Link>
      </p>
      <h1 className="mb-4 text-xl font-bold">Sign in</h1>
      {sp.sent ? (
        <div className="rounded-lg bg-green-100 p-3 text-sm text-green-800 dark:bg-green-900 dark:text-green-100">
          Magic link sent. Check your inbox
          {!process.env.POSTMARK_SERVER_TOKEN &&
            !process.env.RESEND_API_KEY &&
            " (demo mode: link is in the server log)"}
          .
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

      {/* Pre-auth disclosure: 18+, what the email is used for, and that acceptance of the Terms
          and Privacy Notice happens after sign-in. Links go to the public documents. */}
      <p className="mt-6 border-t border-gray-200 pt-4 text-xs leading-relaxed text-gray-500 dark:border-gray-800">
        BNOW.NET is for users 18 and older. We use your email address to authenticate your account.
        After following your sign-in link, you will be asked to agree to the{" "}
        <Link href="/terms" className="underline hover:text-gray-700 dark:hover:text-gray-300">
          Terms of Use
        </Link>{" "}
        and acknowledge the{" "}
        <Link href="/privacy" className="underline hover:text-gray-700 dark:hover:text-gray-300">
          Privacy Notice
        </Link>{" "}
        before using subscriber features.
      </p>
    </main>
  );
}

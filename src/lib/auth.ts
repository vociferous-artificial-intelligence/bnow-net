import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db, schema } from "@/db";

// Magic-link auth. With RESEND_API_KEY the link goes out by email; without it
// the link is logged server-side (good enough for demo; see BLOCKERS.md #8).

async function deliverMagicLink(params: { identifier: string; url: string }) {
  const { identifier, url } = params;
  if (process.env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? "BNOW.NET <auth@bnow.net>",
        to: identifier,
        subject: "Your BNOW.NET sign-in link",
        text: `Sign in to BNOW.NET:\n\n${url}\n\nThis link expires in 24 hours.`,
      }),
    });
    if (!res.ok) throw new Error(`resend failed: ${res.status}`);
    return;
  }
  // fallback: server log (visible in `vercel logs` / local terminal)
  console.log(`[auth] magic link for ${identifier}: ${url}`);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  session: { strategy: "database" },
  trustHost: true,
  providers: [
    {
      id: "email",
      type: "email",
      name: "Email",
      from: process.env.EMAIL_FROM ?? "auth@bnow.net",
      maxAge: 24 * 60 * 60,
      options: {},
      sendVerificationRequest: deliverMagicLink,
    },
  ],
});

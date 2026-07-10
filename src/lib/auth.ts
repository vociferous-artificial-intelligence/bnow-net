import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db, schema } from "@/db";
import { senderAddress } from "./email/from";
import { buildMagicLinkEmail } from "./email/magic-link";

// Magic-link auth, delivered through the shared email seam (Postmark live as of
// 2026-07-05; Resend supported; server-log fallback when neither key exists).

async function deliverMagicLink(params: { identifier: string; url: string }) {
  const { identifier, url } = params;
  const { sendEmail } = await import("./email/send");
  const res = await sendEmail(buildMagicLinkEmail({ to: identifier, url }));
  if (!res.delivered) {
    // outbox/console fallback: surface the link in server logs for demo mode
    console.log(`[auth] magic link for ${identifier}: ${url}`);
  }
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
      from: senderAddress(),
      maxAge: 24 * 60 * 60,
      options: {},
      sendVerificationRequest: deliverMagicLink,
    },
  ],
});

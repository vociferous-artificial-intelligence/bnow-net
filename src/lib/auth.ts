import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db, schema } from "@/db";
import { senderAddress } from "./email/from";
import { deliverMagicLink } from "./auth-delivery";

// Magic-link auth, delivered through the shared email seam (Postmark live as of
// 2026-07-05; Resend supported; server-log fallback when neither key exists).
// Delivery — including the SIGNIN_MODE invite gate — lives in auth-delivery.ts.

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

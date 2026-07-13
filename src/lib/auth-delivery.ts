import { buildMagicLinkEmail } from "./email/magic-link";
import { siteBaseUrl } from "./site-url";
import type { OutboundEmail } from "./email/send";

// Magic-link delivery seam + the private-beta invite gate (Workstream A4,
// 2026-07-13). SIGNIN_MODE:
//
//   open   (default, incl. unset/unknown) — byte-identical to the pre-gate
//          behavior: any address gets a link, no DB query, no added latency or
//          failure modes. The deploy itself changes nothing.
//   invite — a link is issued ONLY to (a) an existing users row, (b) an
//            ADMIN_EMAILS address, or (c) an approved beta request
//            (subscribe_intents.request_status='approved'). Enforced HERE, at
//            link issuance — never in page UI. Fails closed: a DB error means
//            no link.
//
// The sign-in page shows the same generic "check your email" confirmation for
// every address in both modes — this module must never become an oracle for
// whether an address is invited or registered. An uninvited address receives a
// short courtesy email pointing at /access; it carries NO sign-in link and no
// eligibility detail. Flipping production to invite is an operator decision.

export type SigninMode = "open" | "invite";

export function signinMode(): SigninMode {
  return process.env.SIGNIN_MODE === "invite" ? "invite" : "open";
}

// Same allowlist parsing as requireAdmin (gate.ts), kept as its own small copy
// rather than a shared extraction so the admin gates' behavior is untouched.
function adminAllowlist(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// @/db requires DATABASE_URL at module load; import lazily (gate.ts precedent)
// so this module stays importable without a DB — open mode never touches it.
async function rawSql() {
  return (await import("@/db")).rawSql;
}

/** Invite-mode eligibility. Existing accounts are grandfathered (any users row). */
export async function isInvited(identifier: string): Promise<boolean> {
  const email = identifier.trim().toLowerCase();
  if (!email) return false;
  if (adminAllowlist().includes(email)) return true;
  const sql = await rawSql();
  const rows = (await sql.query(
    `SELECT 1 AS ok FROM users WHERE lower(email) = $1
     UNION ALL
     SELECT 1 AS ok FROM subscribe_intents WHERE lower(email) = $1 AND request_status = 'approved'
     LIMIT 1`,
    [email],
  )) as unknown[];
  return rows.length > 0;
}

function buildCourtesyEmail(to: string): OutboundEmail {
  return {
    to,
    subject: "BNOW.NET is in a private analyst beta",
    text: [
      "Sign-in to BNOW.NET is limited to invited analysts during the private beta,",
      "and this address isn't set up for sign-in yet.",
      "",
      `You can request beta access here: ${siteBaseUrl()}/access`,
      "",
      "If you've already requested access, we review every request personally and",
      "will follow up by email.",
    ].join("\n"),
    // Auth-adjacent mail: never let Postmark rewrite links or track opens.
    trackLinks: "None",
    trackOpens: false,
  };
}

export async function deliverMagicLink(params: { identifier: string; url: string }): Promise<void> {
  const { identifier, url } = params;
  const { sendEmail } = await import("./email/send");

  if (signinMode() === "invite") {
    let invited = false;
    try {
      invited = await isInvited(identifier);
    } catch {
      invited = false; // fail closed: no eligibility answer -> no link
    }
    if (!invited) {
      try {
        await sendEmail(buildCourtesyEmail(identifier));
      } catch {
        // Outward behavior must be identical whether or not the courtesy email
        // could be delivered — and identical to the invited path's resolution.
      }
      return; // never deliver a sign-in link (Auth.js already stored the token; it dies unused)
    }
  }

  const res = await sendEmail(buildMagicLinkEmail({ to: identifier, url }));
  if (!res.delivered) {
    // outbox/console fallback: surface the link in server logs for demo mode
    console.log(`[auth] magic link for ${identifier}: ${url}`);
  }
}

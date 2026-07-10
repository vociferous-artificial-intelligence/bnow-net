import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { senderAddress } from "./from";

// Email seam: Resend when RESEND_API_KEY exists, file outbox otherwise
// (data/outbox/ locally; skipped silently on read-only FS).

export type TrackLinks = "None" | "HtmlAndText" | "HtmlOnly" | "TextOnly";

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Postmark only. Omitted from the request when unset, leaving the server default. */
  trackLinks?: TrackLinks;
  /** Postmark only. Omitted from the request when unset, leaving the server default. */
  trackOpens?: boolean;
}

export async function sendEmail(mail: OutboundEmail): Promise<{ delivered: boolean; via: string }> {
  if (process.env.POSTMARK_SERVER_TOKEN) {
    // borrowed scenefiend Postmark account/domain (authorized 2026-07-05) until
    // bnow.net has its own sending identity
    const body: Record<string, unknown> = {
      From: senderAddress(),
      To: mail.to,
      Subject: mail.subject,
      TextBody: mail.text,
      HtmlBody: mail.html,
      MessageStream: process.env.POSTMARK_MESSAGE_STREAM ?? "outbound",
    };
    // Send the key only when the caller has an opinion: an absent key inherits the
    // Postmark server default, while `false` actively overrides it.
    if (mail.trackLinks !== undefined) body.TrackLinks = mail.trackLinks;
    if (mail.trackOpens !== undefined) body.TrackOpens = mail.trackOpens;
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "X-Postmark-Server-Token": process.env.POSTMARK_SERVER_TOKEN,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`postmark: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return { delivered: true, via: "postmark" };
  }
  if (process.env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: senderAddress("BNOW.NET <digest@bnow.net>"),
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      }),
    });
    if (!res.ok) throw new Error(`resend: ${res.status}`);
    return { delivered: true, via: "resend" };
  }

  try {
    const dir = join(process.cwd(), "data", "outbox");
    mkdirSync(dir, { recursive: true });
    const fname = `${new Date().toISOString().replace(/[:.]/g, "-")}-${mail.to.replace(/[^a-z0-9@.]/gi, "_")}.md`;
    writeFileSync(join(dir, fname), `To: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n`);
    return { delivered: false, via: `outbox:${fname}` };
  } catch {
    console.log(`[email:stub] to=${mail.to} subject=${mail.subject}`);
    return { delivered: false, via: "console" };
  }
}

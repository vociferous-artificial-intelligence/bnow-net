import type { OutboundEmail } from "./send";

// Postmark rewrites every link to track.pstmrk.it when link tracking is on. A
// magic link is single-use, so the tracking redirect can burn the Auth.js token
// before the user's browser ever reaches the callback. Both toggles must be
// explicit: link tracking is enabled per-server in Postmark, not per-message.

export function buildMagicLinkEmail(params: { to: string; url: string }): OutboundEmail {
  const { to, url } = params;
  return {
    to,
    subject: "Your BNOW.NET sign-in link",
    text: [
      "Sign in to BNOW.NET:",
      "",
      url,
      "",
      "This link works once and expires in 24 hours.",
      "If you didn't request it, you can ignore this email.",
    ].join("\n"),
    trackLinks: "None",
    trackOpens: false,
  };
}

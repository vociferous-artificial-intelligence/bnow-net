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
    // The callback URL stays on its own line, verbatim (no wrapping, no tracking
    // rewrite — see trackLinks/trackOpens below). The guidance is one sentence per
    // line so email clients can rewrap without splitting a key phrase, and so the
    // single-use + preferred-browser rule reads unambiguously: opening the link in
    // ANY browser consumes it, so a user whose mail app opens a different browser
    // must COPY the still-unopened link first and paste it where they want BNOW.
    text: [
      "Sign in to BNOW.NET:",
      "",
      url,
      "",
      "This sign-in link is single-use and expires in 24 hours.",
      "Open it in the browser where you want to use BNOW.NET.",
      "If your email app opens links in a different browser by default, copy the link above (before opening it anywhere) and paste it into your preferred browser first — once the link is opened in any browser it cannot be reused.",
      "",
      "If you didn't request it, you can ignore this email.",
    ].join("\n"),
    trackLinks: "None",
    trackOpens: false,
  };
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FROM, senderAddress } from "./from";
import { buildMagicLinkEmail } from "./magic-link";
import { sendEmail } from "./send";

const ENV_KEYS = [
  "EMAIL_FROM",
  "POSTMARK_FROM_EMAIL",
  "POSTMARK_SERVER_TOKEN",
  "POSTMARK_MESSAGE_STREAM",
  "RESEND_API_KEY",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
});

/** Stubs fetch and returns the array the Postmark JSON bodies land in. */
function capturePostmark(): Array<Record<string, unknown>> {
  process.env.POSTMARK_SERVER_TOKEN = "test-token";
  const bodies: Array<Record<string, unknown>> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response("{}", { status: 200 });
    }),
  );
  return bodies;
}

const MAGIC_URL = "https://bnow.net/api/auth/callback/email?token=abc&email=a%40b.co";

describe("buildMagicLinkEmail", () => {
  it("disables Postmark link and open tracking", () => {
    const mail = buildMagicLinkEmail({ to: "a@b.co", url: MAGIC_URL });
    expect(mail.trackLinks).toBe("None");
    expect(mail.trackOpens).toBe(false);
  });

  it("carries the callback URL verbatim and states the one-use, 24h terms", () => {
    const mail = buildMagicLinkEmail({ to: "a@b.co", url: MAGIC_URL });
    expect(mail.text).toContain(MAGIC_URL);
    expect(mail.text).toMatch(/works once/i);
    expect(mail.text).toMatch(/24 hours/i);
  });
});

describe("sendEmail via Postmark: tracking", () => {
  it("sends TrackLinks None / TrackOpens false for a magic link", async () => {
    const bodies = capturePostmark();
    const res = await sendEmail(buildMagicLinkEmail({ to: "a@b.co", url: MAGIC_URL }));

    expect(res).toEqual({ delivered: true, via: "postmark" });
    expect(bodies).toHaveLength(1);
    expect(bodies[0].TrackLinks).toBe("None");
    expect(bodies[0].TrackOpens).toBe(false);
    expect(bodies[0].TextBody).toContain(MAGIC_URL);
  });

  it("omits both keys for a normal email, inheriting the server default", async () => {
    const bodies = capturePostmark();
    await sendEmail({ to: "a@b.co", subject: "Daily digest", text: "body" });

    // Absent, not `false` — forcing tracking off here would silently change the
    // behavior of every non-auth email.
    expect(bodies[0]).not.toHaveProperty("TrackLinks");
    expect(bodies[0]).not.toHaveProperty("TrackOpens");
    expect(bodies[0].MessageStream).toBe("outbound");
  });

  it("passes through any explicit tracking choice", async () => {
    const bodies = capturePostmark();
    await sendEmail({
      to: "a@b.co",
      subject: "s",
      text: "t",
      trackLinks: "HtmlOnly",
      trackOpens: true,
    });

    expect(bodies[0].TrackLinks).toBe("HtmlOnly");
    expect(bodies[0].TrackOpens).toBe(true);
  });
});

describe("senderAddress", () => {
  it("prefers EMAIL_FROM over POSTMARK_FROM_EMAIL", () => {
    process.env.EMAIL_FROM = "A <a@bnow.net>";
    process.env.POSTMARK_FROM_EMAIL = "B <b@bnow.net>";
    expect(senderAddress()).toBe("A <a@bnow.net>");
  });

  it("falls back to POSTMARK_FROM_EMAIL when EMAIL_FROM is unset", () => {
    process.env.POSTMARK_FROM_EMAIL = "B <b@bnow.net>";
    expect(senderAddress()).toBe("B <b@bnow.net>");
  });

  it("falls back to the brand-correct BNOW default when neither is set", () => {
    expect(senderAddress()).toBe(DEFAULT_FROM);
    // The fallback is always a bnow.net sender — never a partner/other-brand
    // domain. Prod either uses POSTMARK_FROM_EMAIL or fails visibly at Postmark.
    expect(DEFAULT_FROM).toBe("BNOW.NET <no-reply@bnow.net>");
    expect(DEFAULT_FROM).toContain("@bnow.net");
    expect(DEFAULT_FROM).not.toContain("scenefiend");
  });

  it("treats a blank env var as unset", () => {
    process.env.EMAIL_FROM = "   ";
    process.env.POSTMARK_FROM_EMAIL = "B <b@bnow.net>";
    expect(senderAddress()).toBe("B <b@bnow.net>");
  });

  it("honors a caller-supplied fallback", () => {
    expect(senderAddress("BNOW.NET <digest@bnow.net>")).toBe("BNOW.NET <digest@bnow.net>");
  });

  it("resolves the From header on the outgoing Postmark request", async () => {
    const bodies = capturePostmark();
    process.env.POSTMARK_FROM_EMAIL = "B <b@bnow.net>";
    await sendEmail({ to: "a@b.co", subject: "s", text: "t" });
    expect(bodies[0].From).toBe("B <b@bnow.net>");
  });
});

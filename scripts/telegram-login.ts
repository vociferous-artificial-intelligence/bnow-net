/**
 * One-time Telegram MTProto login → saves a reusable StringSession.
 *
 * Usage (must be an interactive terminal):
 *   npx tsx scripts/telegram-login.ts          # phone number + login code
 *   npx tsx scripts/telegram-login.ts --qr     # scan a QR code from the Telegram app
 *
 * Prefer --qr when auth.sendCode is flood-limited ("A wait of N seconds is
 * required"): QR login goes through auth.exportLoginToken, a different method with
 * its own limits. Scan it from the phone: Settings → Devices → Link Desktop Device.
 *
 * Credentials come from .env.local (loaded by ./env) or the shell:
 * TELEGRAM_API_ID / TELEGRAM_API_HASH, falling back to API_ID / API_HASH.
 *
 * Notes:
 *   - Telegram sends the login code to your Telegram APP (not SMS) when you're
 *     already signed in on another device.
 *   - If the account has Two-Step Verification enabled (Settings → Privacy and
 *     Security → Two-Step Verification) you are asked for that cloud password
 *     after the code. It is NOT the login code.
 *   - The password prompt is hidden by default: `!`-run output is captured into
 *     the agent transcript, and a visible prompt would write your cloud password
 *     into it. Set TELEGRAM_SHOW_PASSWORD=1 to echo it. Echo is suppressed by
 *     giving readline an output proxy that drops writes while muted — NOT by
 *     patching `_writeToOutput`, which does not exist on node:readline/promises.
 *   - The session is written to .telegram.session (mode 600, gitignored). It is a
 *     bearer credential for the whole account — anyone holding it reconnects as
 *     you, reads DMs, and is never challenged for the 2FA password. It is never
 *     printed; only a fingerprint is shown. Revoke it in the Telegram app under
 *     Settings → Devices, where this client appears as "BNOW ingest".
 *
 * No top-level await: tsx compiles this to CJS (package.json has no
 * "type":"module"), and esbuild rejects top-level await in CJS output.
 */

import { createHash } from "node:crypto";
import { chmodSync, existsSync, writeFileSync } from "node:fs";
import { stdin, stdout } from "node:process";
import * as readline from "node:readline/promises";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";

const SESSION_FILE = ".telegram.session";

/** Errors that no amount of re-prompting will fix. */
const FATAL = [
  "API_ID_INVALID",
  "API_ID_PUBLISHED_FLOOD",
  "PHONE_NUMBER_INVALID",
  "PHONE_NUMBER_BANNED",
  "PHONE_NUMBER_FLOOD",
];

/** Consecutive login errors tolerated before we stop, so a wrong password can
 *  never spin forever (the old script's PASSWORD_HASH_INVALID loop). */
const MAX_ERRORS = 5;

export interface Credentials {
  apiId: number;
  apiHash: string;
}

/** Resolve + validate app credentials. Exported for tests. */
export function resolveCredentials(env: Record<string, string | undefined>): Credentials {
  const rawId = env.TELEGRAM_API_ID ?? env.API_ID ?? "";
  const rawHash = env.TELEGRAM_API_HASH ?? env.API_HASH ?? "";
  if (!rawId || !rawHash) {
    throw new Error(
      "Missing TELEGRAM_API_ID / TELEGRAM_API_HASH (get them at https://my.telegram.org).",
    );
  }
  const apiId = Number(rawId);
  if (!Number.isInteger(apiId) || apiId <= 0) {
    throw new Error(`TELEGRAM_API_ID must be a positive integer, got ${JSON.stringify(rawId)}`);
  }
  if (!/^[0-9a-f]{32}$/i.test(rawHash)) {
    throw new Error("TELEGRAM_API_HASH must be 32 hex characters");
  }
  return { apiId, apiHash: rawHash };
}

/** sha256 prefix — identifies a session without revealing it. Exported for tests. */
export function sessionFingerprint(session: string): string {
  return createHash("sha256").update(session).digest("hex").slice(0, 12);
}

/** A single readline interface whose echo we can switch off, by routing its output
 *  through a proxy that drops writes while muted. One interface for the whole run:
 *  closing and reopening one per prompt can discard input already buffered on stdin. */
function createPrompter(): { rl: readline.Interface; echo: { muted: boolean } } {
  const echo = { muted: false };
  const proxy = new Writable({
    write(chunk, _encoding, callback) {
      if (!echo.muted) stdout.write(chunk as Buffer);
      callback();
    },
  });
  const rl = readline.createInterface({ input: stdin, output: proxy, terminal: true });
  return { rl, echo };
}

/** Prompt until the answer is non-empty, so a stray Enter never submits "". */
async function ask(rl: readline.Interface, query: string): Promise<string> {
  for (;;) {
    const answer = (await rl.question(query)).trim();
    if (answer) return answer;
    stdout.write("  (empty input — try again)\n");
  }
}

/** Same, with terminal echo suppressed unless TELEGRAM_SHOW_PASSWORD=1. */
async function askSecret(
  rl: readline.Interface,
  echo: { muted: boolean },
  query: string,
): Promise<string> {
  if (process.env.TELEGRAM_SHOW_PASSWORD === "1") return ask(rl, `${query}: `);

  for (;;) {
    // readline would print the prompt through the muted proxy, so write it directly.
    stdout.write(`${query} (hidden — nothing appears as you type): `);
    echo.muted = true;
    let answer: string;
    try {
      answer = (await rl.question("")).trim();
    } finally {
      echo.muted = false;
      stdout.write("\n");
    }
    if (answer) return answer;
    stdout.write("  (empty input — try again)\n");
  }
}

async function main() {
  await import("./env"); // loads .env.local into process.env (does not override the shell)

  const useQr = process.argv.includes("--qr");
  const { apiId, apiHash } = resolveCredentials(process.env);

  // Checked before the TTY guard: refusing to clobber a session needs no terminal,
  // and it is the more actionable error when both conditions hold.
  if (existsSync(SESSION_FILE) && process.env.FORCE_RELOGIN !== "1") {
    throw new Error(
      `${SESSION_FILE} already exists — refusing to overwrite a live session. Re-run with ` +
        `FORCE_RELOGIN=1 to replace it (the old session stays valid until you terminate it ` +
        `in the Telegram app).`,
    );
  }
  if (!stdin.isTTY) {
    throw new Error(
      "This login is interactive and stdin is not a terminal — every prompt would read EOF " +
        "and loop. Run it in a real terminal:\n" +
        "  cd /home/go/code/bnow.net && npx tsx scripts/telegram-login.ts",
    );
  }

  const { TelegramClient } = await import("telegram");
  const { StringSession } = await import("telegram/sessions");
  const { LogLevel } = await import("telegram/extensions/Logger");

  const { rl, echo } = createPrompter();
  // readline swallows SIGINT by default, and gramJS's open sockets keep node
  // alive, so Ctrl+C needs an explicit exit on both channels.
  rl.on("SIGINT", () => {
    stdout.write("\nAborted.\n");
    process.exit(130);
  });
  process.on("SIGINT", () => process.exit(130));
  process.on("SIGTERM", () => process.exit(143));

  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 5,
    // Names this client honestly in Settings → Devices so it is easy to revoke.
    deviceModel: "BNOW ingest",
    appVersion: "0.1.0",
  });
  client.setLogLevel(LogLevel.ERROR);

  console.log(
    (useQr
      ? [
          "QR login. A code will render below — scan it from the Telegram app:",
          "Settings → Devices → Link Desktop Device.",
          "This path uses auth.exportLoginToken, so it works even when the",
          "phone-code method (auth.sendCode) is flood-limited.",
        ]
      : [
          "Logging in. Telegram sends the code to your app (not SMS) when you're",
          "already signed in on another device.",
        ]
    )
      .concat([
        "If the account has Two-Step Verification, you'll then be asked for that",
        "cloud password — not the login code.",
        "",
      ])
      .join("\n"),
  );

  let errors = 0;
  const onError = async (err: Error) => {
    console.error(`  login error: ${err.message}`);
    if (FATAL.some((code) => err.message.includes(code))) return true; // stop
    if (++errors >= MAX_ERRORS) {
      console.error(`  giving up after ${MAX_ERRORS} failed attempts`);
      return true;
    }
    return false; // re-prompt (mistyped code or password)
  };
  const password = (hint?: string) =>
    askSecret(rl, echo, `Two-Step Verification password${hint ? ` (hint: ${hint})` : ""}`);

  if (useQr) {
    const { toString: renderQr } = await import("qrcode");
    // client.start() connects implicitly; signInUserWithQrCode does not.
    await client.connect();
    await client.signInUserWithQrCode(
      { apiId, apiHash },
      {
        qrCode: async ({ token }) => {
          // Telegram rotates the token every ~30s; this callback fires per rotation.
          const url = `tg://login?token=${token.toString("base64url")}`;
          stdout.write(await renderQr(url, { type: "terminal", small: true }));
          stdout.write("\nTelegram app → Settings → Devices → Link Desktop Device → scan.\n");
          stdout.write("(the code refreshes periodically; scan whichever is on screen)\n");
        },
        password,
        onError,
      },
    );
  } else {
    await client.start({
      phoneNumber: () => ask(rl, "Phone number, international format (e.g. +15551234567): "),
      phoneCode: (viaApp) =>
        ask(rl, `Login code (sent ${viaApp ? "in the Telegram app" : "by SMS"}): `),
      password,
      onError,
    });
  }

  const session = String(client.session.save());
  if (!session) throw new Error("login reported success but produced an empty session string");

  const me = await client.getMe();
  const who = "username" in me && me.username ? `@${me.username}` : `user id ${String(me.id)}`;

  writeFileSync(SESSION_FILE, `${session}\n`, { mode: 0o600 });
  chmodSync(SESSION_FILE, 0o600); // tighten even if the file already existed

  console.log(`\nSigned in as ${who}.`);
  console.log(`StringSession saved to ${SESSION_FILE} (mode 600), fingerprint ${sessionFingerprint(session)}.`);
  console.log("The session string was not printed. Revoke it in Telegram: Settings → Devices.");

  rl.close();
  await client.disconnect();
  process.exit(0); // gramJS keeps its update loop open; nothing else ends the process
}

// Guard so tests can import the pure helpers without launching a login.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

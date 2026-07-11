/**
 * MTProto connectivity + session check (TASK 0 of the MTProto sprint).
 *
 * Two modes, decided by what credentials exist:
 *   - No session:   unauthenticated connect + help.GetNearestDc — proves the
 *                    MTProto handshake works from this network (egress sanity).
 *   - Session:      connect + getMe — proves the saved StringSession is live.
 *                    Reads TELEGRAM_SESSION env first, then .telegram.session.
 *
 * Flags: --wss forces the WebSocket transport (TCP is the default).
 * Prints timings; NEVER prints the session (fingerprint only, same as login).
 *
 * Usage: npx tsx scripts/telegram-getme.ts [--wss]
 *   (MTProto TCP dials DC IPs directly, so the WSL2 DNS pin is not needed;
 *    WSS resolves *.web.telegram.org and may need it.)
 */

import { readFileSync } from "node:fs";
import { resolveCredentials, sessionFingerprint } from "./telegram-login";

function loadSession(): string | null {
  if (process.env.TELEGRAM_SESSION) return process.env.TELEGRAM_SESSION.trim();
  try {
    return readFileSync(".telegram.session", "utf8").trim() || null;
  } catch {
    return null;
  }
}

async function main() {
  await import("./env");
  const { apiId, apiHash } = resolveCredentials(process.env);
  const useWSS = process.argv.includes("--wss");
  const session = loadSession();

  const { TelegramClient, Api } = await import("telegram");
  const { StringSession } = await import("telegram/sessions");
  const { LogLevel } = await import("telegram/extensions/Logger");

  const client = new TelegramClient(new StringSession(session ?? ""), apiId, apiHash, {
    connectionRetries: 1,
    useWSS,
    deviceModel: "BNOW ingest",
    appVersion: "0.1.0",
  });
  client.setLogLevel(LogLevel.ERROR);

  const t0 = Date.now();
  try {
    await client.connect();
    const connectMs = Date.now() - t0;
    console.log(`connect (${useWSS ? "wss" : "tcp"}): ${connectMs}ms`);

    if (session) {
      const t1 = Date.now();
      const me = await client.getMe();
      const who = "username" in me && me.username ? `@${me.username}` : `user id ${String(me.id)}`;
      console.log(`getMe: ${who} in ${Date.now() - t1}ms (session fp ${sessionFingerprint(session)})`);
    } else {
      const t1 = Date.now();
      const dc = await client.invoke(new Api.help.GetNearestDc());
      console.log(
        `no session — unauthenticated GetNearestDc: country=${dc.country} thisDc=${dc.thisDc} nearestDc=${dc.nearestDc} in ${Date.now() - t1}ms`,
      );
      console.log("egress OK; run scripts/telegram-login.ts to mint the session for getMe.");
    }
  } finally {
    await client.destroy().catch(() => {});
  }
  process.exit(0); // gramJS keeps timers alive; nothing else ends the process
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

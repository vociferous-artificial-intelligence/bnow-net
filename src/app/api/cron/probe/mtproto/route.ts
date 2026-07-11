import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// MTProto egress probe (MTProto sprint TASK 0.2): proves a gramJS connect +
// unauthenticated help.GetNearestDc works from Vercel's network, per transport
// (raw TCP to the DC IPs, and WSS to *.web.telegram.org), and measures cold
// connect time since it eats cron budget. When TELEGRAM_SESSION is set it also
// runs getMe to prove the saved session. CRON_SECRET-gated like /api/cron/probe.
// The session value is never echoed — only whether it was present.

interface TransportResult {
  ok: boolean;
  connectMs?: number;
  nearestDcMs?: number;
  dc?: { country: string; thisDc: number; nearestDc: number };
  getMe?: { ok: boolean; ms: number; username: string | null };
  error?: string;
}

async function probeTransport(useWSS: boolean, session: string | null): Promise<TransportResult> {
  // Everything from the ONE root module: mixing `telegram` with subpath imports
  // (`telegram/sessions`) gives the bundler two module instances, and gramJS's
  // constructor rejects a StringSession made from the other copy (instanceof).
  const { TelegramClient, Api, sessions } = await import("telegram");
  const { StringSession } = sessions;

  const apiId = Number(process.env.TELEGRAM_API_ID ?? "");
  const apiHash = process.env.TELEGRAM_API_HASH ?? "";
  if (!Number.isInteger(apiId) || apiId <= 0 || !apiHash) {
    return { ok: false, error: "TELEGRAM_API_ID/HASH unset" };
  }

  const client = new TelegramClient(new StringSession(session ?? ""), apiId, apiHash, {
    connectionRetries: 1,
    useWSS,
    deviceModel: "BNOW ingest",
    appVersion: "0.1.0",
  });
  client.setLogLevel("error" as Parameters<typeof client.setLogLevel>[0]);

  const out: TransportResult = { ok: false };
  const hardStop = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("probe timeout (25s)")), 25_000),
  );
  try {
    const t0 = Date.now();
    await Promise.race([client.connect(), hardStop]);
    out.connectMs = Date.now() - t0;

    const t1 = Date.now();
    const dc = await Promise.race([client.invoke(new Api.help.GetNearestDc()), hardStop]);
    out.nearestDcMs = Date.now() - t1;
    out.dc = { country: dc.country, thisDc: dc.thisDc, nearestDc: dc.nearestDc };
    out.ok = true;

    if (session) {
      const t2 = Date.now();
      try {
        const me = await Promise.race([client.getMe(), hardStop]);
        out.getMe = {
          ok: true,
          ms: Date.now() - t2,
          username: "username" in me && me.username ? me.username : null,
        };
      } catch (e) {
        out.getMe = { ok: false, ms: Date.now() - t2, username: null };
        out.error = e instanceof Error ? e.message : String(e);
      }
    }
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  } finally {
    await client.destroy().catch(() => {});
  }
  return out;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const transport = req.nextUrl.searchParams.get("transport") ?? "both";
  const session = process.env.TELEGRAM_SESSION?.trim() || null;
  const started = Date.now();

  const results: Record<string, TransportResult> = {};
  if (transport === "tcp" || transport === "both") {
    results.tcp = await probeTransport(false, session);
  }
  if (transport === "wss" || transport === "both") {
    results.wss = await probeTransport(true, session);
  }

  return NextResponse.json({
    ok: Object.values(results).some((r) => r.ok),
    sessionPresent: session !== null,
    results,
    ms: Date.now() - started,
  });
}

import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Egress probe: checks reachability of an external URL from Vercel's network.
// Exists because this project's build host and Vercel disagree about which
// hosts are reachable (see AGENTS.md quirks). CRON_SECRET-gated.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.searchParams.get("url");
  if (!url || !/^https?:\/\//.test(url)) {
    return NextResponse.json({ error: "url param required" }, { status: 400 });
  }
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          req.nextUrl.searchParams.get("ua") === "browser"
            ? "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36"
            : "BNOWBot/0.1 (+https://bnow.net/bot)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(25_000),
    });
    const body = await res.text();
    return NextResponse.json({
      ok: true,
      status: res.status,
      contentType: res.headers.get("content-type"),
      bytes: body.length,
      head: body.slice(0, 200),
      ms: Date.now() - started,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      ms: Date.now() - started,
    });
  }
}

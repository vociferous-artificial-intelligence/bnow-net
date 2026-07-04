import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Polite disk-cached fetcher. Legal guardrails (brief §8.6):
// - >=2s spacing per host, custom UA, nothing fetched twice (disk cache).
// - Cache is internal-only; never served to users.

const CACHE_DIR = join(process.cwd(), "data", "cache", "pages");
const UA = "BNOWBot/0.1 (+https://bnow.net/bot; research contact go@vociferous.nyc)";
const HOST_SPACING_MS = 2100;

const lastHitByHost = new Map<string, number>();

export function cacheKey(url: string): string {
  return createHash("sha1").update(url).digest("hex");
}

export function cachePath(url: string): string {
  return join(CACHE_DIR, `${cacheKey(url)}.html`);
}

export function isCached(url: string): boolean {
  return existsSync(cachePath(url));
}

export function readCache(url: string): string | null {
  const p = cachePath(url);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface FetchResult {
  url: string;
  html: string;
  fromCache: boolean;
  status: number;
}

/** Fetch with disk cache + per-host politeness. Returns null on hard failure. */
export async function politeFetch(url: string): Promise<FetchResult | null> {
  const cached = readCache(url);
  if (cached !== null) return { url, html: cached, fromCache: true, status: 200 };

  const host = new URL(url).host;
  const last = lastHitByHost.get(host) ?? 0;
  const wait = last + HOST_SPACING_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastHitByHost.set(host, Date.now());

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
        redirect: "follow",
        signal: AbortSignal.timeout(45_000),
      });
      if (res.status === 429 || res.status >= 500) {
        await sleep(5000 * (attempt + 1));
        continue;
      }
      if (!res.ok) return { url, html: "", fromCache: false, status: res.status };
      const html = await res.text();
      try {
        mkdirSync(CACHE_DIR, { recursive: true });
        writeFileSync(cachePath(url), html);
      } catch {
        // read-only FS (Vercel) — skip disk cache, still return the page
      }
      return { url, html, fromCache: false, status: res.status };
    } catch {
      await sleep(3000 * (attempt + 1));
    }
  }
  return null;
}

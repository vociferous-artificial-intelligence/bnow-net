import { Pool } from "@neondatabase/serverless";

// Corpus-currency helper: the newest claim_date in the corpus, as yyyy-mm-dd. Used
// by /ask to state "data current through {date}" and to short-circuit questions
// whose time window falls entirely AFTER the data we have. Read pattern mirrors
// src/lib/ask/limits.ts (Pool from @neondatabase/serverless, pool.end() in finally).
//
// Fail-soft everywhere: no DATABASE_URL or any query error → null (a null currency
// never blocks the pipeline; ask() falls open to the real retrieval path). Results
// are cached in-process so the answer path doesn't add a DB round-trip per question:
//   - a real date is cached POSITIVE_TTL_MS (~5 min) — the corpus advances a few
//     times a day, so minutes of staleness is harmless;
//   - a null (no URL / error / empty corpus) is cached NEGATIVE_TTL_MS (~30s) so a
//     briefly-down DB is not hammered, but currency recovers fast once it returns.
// The clock is injectable (`now`) and the cache resettable (_resetCurrencyCacheForTests)
// so the cache semantics are unit-testable without real time or a real DB.

const POSITIVE_TTL_MS = 5 * 60_000; // 5 minutes
const NEGATIVE_TTL_MS = 30_000; // 30 seconds

interface CacheEntry {
  value: string | null;
  expiresAt: number;
}

let cache: CacheEntry | null = null;

/** Drop the in-process cache — tests only, so each case starts cold. */
export function _resetCurrencyCacheForTests(): void {
  cache = null;
}

/** max(claim_date) from the claims table as yyyy-mm-dd, or null when unavailable.
 *  `claim_date` is a DATE column selected `::text` so no driver timezone
 *  localization can shift the day (the standing trap in this repo). */
export async function dataCurrentThrough(now: () => number = Date.now): Promise<string | null> {
  const t = now();
  if (cache && t < cache.expiresAt) return cache.value;

  if (!process.env.DATABASE_URL) {
    cache = { value: null, expiresAt: t + NEGATIVE_TTL_MS };
    return null;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(`SELECT max(claim_date)::text AS d FROM claims`);
    const value = (rows[0]?.d as string | null) ?? null;
    cache = { value, expiresAt: t + (value != null ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS) };
    return value;
  } catch (e) {
    console.warn(
      `dataCurrentThrough: query failed, returning null: ${e instanceof Error ? e.message : e}`,
    );
    cache = { value: null, expiresAt: t + NEGATIVE_TTL_MS };
    return null;
  } finally {
    await pool.end();
  }
}

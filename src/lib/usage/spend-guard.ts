// Generic budget guard for paid providers (twitterapi.io, OpenSanctions, ...).
// Every paid request must pass tryReserve() first and record() after; caps are
// enforced BEFORE the call and the guard FAILS CLOSED when the provider's total
// cap env var is unset. Usage persists to provider_usage (one row per UTC day)
// so caps hold across serverless invocations and sessions.

// @/db requires DATABASE_URL at module load; import it lazily so pure
// consumers (unit tests, parsers) can import guard logic without a DB.
async function sql() {
  return (await import("@/db")).rawSql;
}

export interface SpendGuardConfig {
  provider: string;
  /** Total (sprint/quota) USD cap. null with no totalRequestCap -> fail closed. */
  totalCapUsd: number | null;
  /** Total request/call cap for quota-metered providers (e.g. OpenSanctions
   *  monthly call quota). Either this or totalCapUsd must be set. */
  totalRequestCap?: number | null;
  /** Per-UTC-day USD cap. null -> fail closed (the digest path leaves this null
   *  in production when LLM_DIGEST_USD_CAP is unset). */
  dailyUsdCap: number | null;
  dailyRequestCap: number;
  runRequestCap: number;
}

export interface UsageSnapshot {
  totalUsd: number;
  totalRequests: number;
  dayUsd: number;
  dayRequests: number;
}

export interface UsageStore {
  load(provider: string, dayIso: string): Promise<UsageSnapshot>;
  record(
    provider: string,
    dayIso: string,
    requests: number,
    units: number,
    usd: number,
  ): Promise<void>;
}

export type ReserveResult = { ok: true } | { ok: false; reason: string };

export function utcDayIso(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export class SpendGuard {
  private snapshot: UsageSnapshot | null = null;
  private runRequests = 0;
  private runUsd = 0;
  private runUnits = 0;

  constructor(
    readonly cfg: SpendGuardConfig,
    private store: UsageStore,
  ) {}

  /** Load persisted usage once per run (in-run counters track the rest). */
  async init(): Promise<void> {
    this.snapshot = await this.store.load(this.cfg.provider, utcDayIso());
  }

  /** Check every cap before a paid request. Never throws; refusal carries why. */
  tryReserve(): ReserveResult {
    const c = this.cfg;
    const hasUsdCap = c.totalCapUsd !== null && Number.isFinite(c.totalCapUsd);
    const hasReqCap = c.totalRequestCap != null && Number.isFinite(c.totalRequestCap);
    if (!hasUsdCap && !hasReqCap) {
      return { ok: false, reason: `${c.provider}: total cap env unset — failing closed` };
    }
    if (c.dailyUsdCap === null || !Number.isFinite(c.dailyUsdCap)) {
      return { ok: false, reason: `${c.provider}: daily USD cap env unset — failing closed` };
    }
    if (!this.snapshot) {
      return { ok: false, reason: `${c.provider}: guard not initialized — failing closed` };
    }
    const s = this.snapshot;
    if (hasUsdCap && s.totalUsd + this.runUsd >= (c.totalCapUsd as number)) {
      return {
        ok: false,
        reason: `${c.provider}: total spend $${(s.totalUsd + this.runUsd).toFixed(4)} >= cap $${c.totalCapUsd}`,
      };
    }
    if (hasReqCap && s.totalRequests + this.runRequests >= (c.totalRequestCap as number)) {
      return {
        ok: false,
        reason: `${c.provider}: total requests ${s.totalRequests + this.runRequests} >= cap ${c.totalRequestCap}`,
      };
    }
    if (s.dayUsd + this.runUsd >= c.dailyUsdCap) {
      return {
        ok: false,
        reason: `${c.provider}: today's spend $${(s.dayUsd + this.runUsd).toFixed(4)} >= daily cap $${c.dailyUsdCap}`,
      };
    }
    if (s.dayRequests + this.runRequests >= c.dailyRequestCap) {
      return {
        ok: false,
        reason: `${c.provider}: today's requests ${s.dayRequests + this.runRequests} >= daily cap ${c.dailyRequestCap}`,
      };
    }
    if (this.runRequests >= c.runRequestCap) {
      return {
        ok: false,
        reason: `${c.provider}: run requests ${this.runRequests} >= run cap ${c.runRequestCap}`,
      };
    }
    return { ok: true };
  }

  /** Record actual usage after a request (persists immediately). */
  async record(requests: number, units: number, usd: number): Promise<void> {
    this.runRequests += requests;
    this.runUnits += units;
    this.runUsd += usd;
    await this.store.record(this.cfg.provider, utcDayIso(), requests, units, usd);
  }

  get runStats() {
    return { requests: this.runRequests, units: this.runUnits, usd: this.runUsd };
  }
}

/** Production store backed by provider_usage. */
export const pgUsageStore: UsageStore = {
  async load(provider, dayIso) {
    const rows = (await (await sql()).query(
      `SELECT coalesce(sum(est_usd), 0)::float AS total_usd,
              coalesce(sum(requests), 0)::int AS total_requests,
              coalesce(sum(est_usd) FILTER (WHERE day = $2), 0)::float AS day_usd,
              coalesce(sum(requests) FILTER (WHERE day = $2), 0)::int AS day_requests
       FROM provider_usage WHERE provider = $1`,
      [provider, dayIso],
    )) as Array<{
      total_usd: number;
      total_requests: number;
      day_usd: number;
      day_requests: number;
    }>;
    const r = rows[0];
    return {
      totalUsd: r.total_usd,
      totalRequests: r.total_requests,
      dayUsd: r.day_usd,
      dayRequests: r.day_requests,
    };
  },
  async record(provider, dayIso, requests, units, usd) {
    await (await sql()).query(
      `INSERT INTO provider_usage (provider, day, requests, units, est_usd)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (provider, day) DO UPDATE SET
         requests = provider_usage.requests + EXCLUDED.requests,
         units = provider_usage.units + EXCLUDED.units,
         est_usd = provider_usage.est_usd + EXCLUDED.est_usd,
         updated_at = now()`,
      [provider, dayIso, requests, units, usd],
    );
  },
};

/** Read a numeric env var with a default (NaN -> default). */
export function envNum(name: string, dflt: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return dflt;
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

/** Total-cap env var: unset/invalid -> null -> guard fails closed. */
export function envCap(name: string): number | null {
  const v = process.env[name];
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// -- per-provider state (poll watermarks) --------------------------------------

export async function loadProviderState<T extends Record<string, unknown>>(
  provider: string,
): Promise<T | null> {
  const rows = (await (await sql()).query(`SELECT state FROM provider_state WHERE provider = $1`, [
    provider,
  ])) as Array<{ state: T }>;
  return rows[0]?.state ?? null;
}

export async function saveProviderState(
  provider: string,
  state: Record<string, unknown>,
): Promise<void> {
  await (await sql()).query(
    `INSERT INTO provider_state (provider, state) VALUES ($1, $2)
     ON CONFLICT (provider) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
    [provider, JSON.stringify(state)],
  );
}

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

/** Accounting window for the TOTAL (sprint/quota) cap.
 *  - "all_time": sum every historical provider_usage row (sprint/lifetime cap —
 *    the default; X and the LLM providers rely on this and must keep it).
 *  - "calendar_month": sum only rows from the first UTC day of the current month
 *    onward, so the total cap resets at each UTC month boundary WITHOUT deleting
 *    history (OpenSanctions' 2,000-request monthly account quota).
 *  Per-day and per-run caps are unaffected by this setting. */
export type TotalPeriod = "all_time" | "calendar_month";

export interface SpendGuardConfig {
  provider: string;
  /** Total (sprint/quota) USD cap. null with no totalRequestCap -> fail closed. */
  totalCapUsd: number | null;
  /** Total request/call cap for quota-metered providers (e.g. OpenSanctions
   *  monthly call quota). Either this or totalCapUsd must be set. */
  totalRequestCap?: number | null;
  /** Accounting window for the total cap. Omitted -> "all_time" (byte-equivalent
   *  to the pre-monthly behavior every existing provider depends on). */
  totalPeriod?: TotalPeriod;
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
  /** Load usage. `totalStartIso` (a UTC `YYYY-MM-DD`) bounds the TOTAL window:
   *  null -> all history (all_time); set -> only rows with day >= that date
   *  (calendar_month). The DAY totals are always the single `dayIso` regardless. */
  load(provider: string, dayIso: string, totalStartIso: string | null): Promise<UsageSnapshot>;
  record(
    provider: string,
    dayIso: string,
    requests: number,
    units: number,
    usd: number,
  ): Promise<void>;
}

/** Machine-readable refusal reason, so callers can categorize a stop (run vs
 *  daily vs total/monthly cap) without string-matching the human `reason`. */
export type ReserveCode =
  | "cap_unset"
  | "daily_usd_unset"
  | "not_initialized"
  | "total_usd"
  | "total_requests"
  | "daily_usd"
  | "daily_requests"
  | "run_requests";

export type ReserveResult = { ok: true } | { ok: false; reason: string; code: ReserveCode };

export function utcDayIso(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** First UTC day of `d`'s month as `YYYY-MM-01`. Uses UTC getters, so the month
 *  boundary is independent of the machine's local timezone. */
export function monthStartIso(d = new Date()): string {
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${d.getUTCFullYear()}-${mm}-01`;
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

  /** Load persisted usage once per run (in-run counters track the rest). `now`
   *  is injectable for deterministic tests; it fixes both the UTC day and (for
   *  calendar_month) the UTC month start read from the store. */
  async init(now = new Date()): Promise<void> {
    const totalStartIso = this.cfg.totalPeriod === "calendar_month" ? monthStartIso(now) : null;
    this.snapshot = await this.store.load(this.cfg.provider, utcDayIso(now), totalStartIso);
  }

  /** Check every cap before a paid request. Never throws; refusal carries why. */
  tryReserve(): ReserveResult {
    const c = this.cfg;
    const hasUsdCap = c.totalCapUsd !== null && Number.isFinite(c.totalCapUsd);
    const hasReqCap = c.totalRequestCap != null && Number.isFinite(c.totalRequestCap);
    if (!hasUsdCap && !hasReqCap) {
      return { ok: false, code: "cap_unset", reason: `${c.provider}: total cap env unset — failing closed` };
    }
    if (c.dailyUsdCap === null || !Number.isFinite(c.dailyUsdCap)) {
      return { ok: false, code: "daily_usd_unset", reason: `${c.provider}: daily USD cap env unset — failing closed` };
    }
    if (!this.snapshot) {
      return { ok: false, code: "not_initialized", reason: `${c.provider}: guard not initialized — failing closed` };
    }
    const s = this.snapshot;
    if (hasUsdCap && s.totalUsd + this.runUsd >= (c.totalCapUsd as number)) {
      return {
        ok: false,
        code: "total_usd",
        reason: `${c.provider}: total spend $${(s.totalUsd + this.runUsd).toFixed(4)} >= cap $${c.totalCapUsd}`,
      };
    }
    if (hasReqCap && s.totalRequests + this.runRequests >= (c.totalRequestCap as number)) {
      return {
        ok: false,
        code: "total_requests",
        reason: `${c.provider}: total requests ${s.totalRequests + this.runRequests} >= cap ${c.totalRequestCap}`,
      };
    }
    if (s.dayUsd + this.runUsd >= c.dailyUsdCap) {
      return {
        ok: false,
        code: "daily_usd",
        reason: `${c.provider}: today's spend $${(s.dayUsd + this.runUsd).toFixed(4)} >= daily cap $${c.dailyUsdCap}`,
      };
    }
    if (s.dayRequests + this.runRequests >= c.dailyRequestCap) {
      return {
        ok: false,
        code: "daily_requests",
        reason: `${c.provider}: today's requests ${s.dayRequests + this.runRequests} >= daily cap ${c.dailyRequestCap}`,
      };
    }
    if (this.runRequests >= c.runRequestCap) {
      return {
        ok: false,
        code: "run_requests",
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

/** Coarse stop category for cron observability (non-sensitive). A total-cap
 *  refusal reads as "monthly_cap" for a calendar_month provider, "total_cap"
 *  otherwise; ok -> null. Never string-matches the human reason. */
export type StopCategory =
  | "run_cap"
  | "daily_cap"
  | "monthly_cap"
  | "total_cap"
  | "cap_unset"
  | "not_initialized"
  | null;

export function stopCategory(res: ReserveResult, period: TotalPeriod = "all_time"): StopCategory {
  if (res.ok) return null;
  switch (res.code) {
    case "run_requests":
      return "run_cap";
    case "daily_usd":
    case "daily_requests":
      return "daily_cap";
    case "total_usd":
    case "total_requests":
      return period === "calendar_month" ? "monthly_cap" : "total_cap";
    case "cap_unset":
    case "daily_usd_unset":
      return "cap_unset";
    case "not_initialized":
      return "not_initialized";
  }
}

/** Production store backed by provider_usage. */
export const pgUsageStore: UsageStore = {
  async load(provider, dayIso, totalStartIso) {
    // $3 (totalStartIso) null -> total window is all history (all_time);
    // set -> only rows on/after that UTC day (calendar_month). Day totals are
    // always the single $2 day. History rows are never mutated by a window.
    const rows = (await (await sql()).query(
      `SELECT coalesce(sum(est_usd) FILTER (WHERE $3::date IS NULL OR day >= $3::date), 0)::float AS total_usd,
              coalesce(sum(requests) FILTER (WHERE $3::date IS NULL OR day >= $3::date), 0)::int AS total_requests,
              coalesce(sum(est_usd) FILTER (WHERE day = $2::date), 0)::float AS day_usd,
              coalesce(sum(requests) FILTER (WHERE day = $2::date), 0)::int AS day_requests
       FROM provider_usage WHERE provider = $1`,
      [provider, dayIso, totalStartIso],
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

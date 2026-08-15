import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MAP_HEALTH_STATE,
  MAP_HEALTH_PROVIDER,
  buildMapHealthEmail,
  evaluateMapHealth,
  loadTheaterFreshness,
  runMapHealthCheck,
  type MapHealthConfig,
  type MapHealthCounters,
  type MapHealthState,
  type TheaterFreshness,
} from "./map-health";

const CONFIG: MapHealthConfig = { cooldownMs: 6 * 3600 * 1000, staleDays: 2 };
const NOW = Date.parse("2026-08-15T12:00:00Z");

function counters(over: Partial<MapHealthCounters> = {}): MapHealthCounters {
  return {
    selected: 1000,
    claims: 0,
    llmCalls: 0,
    batchErrors: 0,
    processedMarked: 0,
    budgetStopCategory: null,
    ...over,
  };
}

function fresh(theater: string, stale = false, over: Partial<TheaterFreshness> = {}): TheaterFreshness {
  return {
    theater,
    newestEligibleDay: "2026-08-15",
    newestMappedDay: stale ? "2026-07-29" : "2026-08-15",
    staleDays: stale ? 17 : 0,
    stale,
    ...over,
  };
}

const ALL_FRESH = { freshness: [fresh("ru"), fresh("ua"), fresh("ir")] };

describe("evaluateMapHealth — budget-stop severity", () => {
  it("a total-cap stop fires an unhealthy alert on first sight", () => {
    const e = evaluateMapHealth(
      counters({ budgetStopCategory: "total_cap" }),
      ALL_FRESH,
      DEFAULT_MAP_HEALTH_STATE,
      CONFIG,
      NOW,
    );
    expect(e.fire).toBe(true);
    expect(e.kind).toBe("unhealthy");
    expect(e.reasons).toEqual(["budget_stop_total"]);
    expect(e.nextState.episodeKey).toBe("budget_stop_total");
    expect(e.nextState.lastAlertAtMs).toBe(NOW);
  });

  it("monthly_cap and cap_unset/not_initialized classify as operator-action stops", () => {
    for (const [cat, reason] of [
      ["monthly_cap", "budget_stop_total"],
      ["cap_unset", "cap_unset"],
      ["not_initialized", "cap_unset"],
    ] as const) {
      const e = evaluateMapHealth(
        counters({ budgetStopCategory: cat }),
        ALL_FRESH,
        DEFAULT_MAP_HEALTH_STATE,
        CONFIG,
        NOW,
      );
      expect(e.kind).toBe("unhealthy");
      expect(e.reasons).toEqual([reason]);
    }
  });

  it("a daily-cap stop is its own (distinct) episode", () => {
    const e = evaluateMapHealth(
      counters({ budgetStopCategory: "daily_cap" }),
      ALL_FRESH,
      DEFAULT_MAP_HEALTH_STATE,
      CONFIG,
      NOW,
    );
    expect(e.kind).toBe("unhealthy");
    expect(e.reasons).toEqual(["budget_stop_daily"]);
  });

  it("the benign per-run ceiling (run_cap) and a clean run are healthy", () => {
    for (const cat of ["run_cap", null]) {
      const e = evaluateMapHealth(
        counters({ budgetStopCategory: cat, claims: 42, llmCalls: 5 }),
        ALL_FRESH,
        DEFAULT_MAP_HEALTH_STATE,
        CONFIG,
        NOW,
      );
      expect(e.fire).toBe(false);
      expect(e.nextState.episodeKey).toBeNull();
    }
  });
});

describe("evaluateMapHealth — episode dedup, cooldown, recovery", () => {
  const stopped = counters({ budgetStopCategory: "total_cap" });

  it("the same episode within the cooldown does not re-fire", () => {
    const prior: MapHealthState = { episodeKey: "budget_stop_total", lastAlertAtMs: NOW - 1000 };
    const e = evaluateMapHealth(stopped, ALL_FRESH, prior, CONFIG, NOW);
    expect(e.fire).toBe(false);
    expect(e.nextState.episodeKey).toBe("budget_stop_total");
    expect(e.nextState.lastAlertAtMs).toBe(NOW - 1000); // unchanged
  });

  it("the same episode past the cooldown re-fires once", () => {
    const prior: MapHealthState = {
      episodeKey: "budget_stop_total",
      lastAlertAtMs: NOW - CONFIG.cooldownMs - 1,
    };
    const e = evaluateMapHealth(stopped, ALL_FRESH, prior, CONFIG, NOW);
    expect(e.fire).toBe(true);
    expect(e.kind).toBe("unhealthy");
  });

  it("a changed episode key fires immediately even within the cooldown", () => {
    const prior: MapHealthState = { episodeKey: "budget_stop_total", lastAlertAtMs: NOW - 1000 };
    const e = evaluateMapHealth(
      counters({ budgetStopCategory: "daily_cap" }),
      ALL_FRESH,
      prior,
      CONFIG,
      NOW,
    );
    expect(e.fire).toBe(true);
    expect(e.nextState.episodeKey).toBe("budget_stop_daily");
  });

  it("exactly one recovery notice when the episode clears", () => {
    const prior: MapHealthState = { episodeKey: "budget_stop_total", lastAlertAtMs: NOW - 1000 };
    const clear = evaluateMapHealth(counters({ claims: 10 }), ALL_FRESH, prior, CONFIG, NOW);
    expect(clear.fire).toBe(true);
    expect(clear.kind).toBe("recovery");
    expect(clear.nextState.episodeKey).toBeNull();
    // the following healthy run stays silent
    const next = evaluateMapHealth(counters({ claims: 9 }), ALL_FRESH, clear.nextState, CONFIG, NOW + 1);
    expect(next.fire).toBe(false);
  });
});

describe("evaluateMapHealth — per-theater staleness (current versions)", () => {
  it("one stale theater is an episode even when this run's own counters are clean", () => {
    const ctx = { freshness: [fresh("ru"), fresh("ua"), fresh("ir", true)] };
    const e = evaluateMapHealth(counters({ claims: 50, llmCalls: 4 }), ctx, DEFAULT_MAP_HEALTH_STATE, CONFIG, NOW);
    expect(e.fire).toBe(true);
    expect(e.reasons).toEqual(["stale_ir"]);
  });

  it("staleness composes with a budget stop into one sorted episode key", () => {
    const ctx = { freshness: [fresh("ru", true), fresh("ir", true)] };
    const e = evaluateMapHealth(
      counters({ budgetStopCategory: "total_cap" }),
      ctx,
      DEFAULT_MAP_HEALTH_STATE,
      CONFIG,
      NOW,
    );
    expect(e.nextState.episodeKey).toBe("budget_stop_total,stale_ir,stale_ru");
  });
});

describe("loadTheaterFreshness", () => {
  it("computes lag from the two scalar subqueries and flags staleness at the threshold", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const query = async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      const theater = params[0];
      if (theater === "ir") return [{ newest_eligible: "2026-08-15", newest_mapped: "2026-07-29" }];
      if (theater === "ru") return [{ newest_eligible: "2026-08-15", newest_mapped: "2026-08-14" }];
      return [{ newest_eligible: null, newest_mapped: null }];
    };
    const out = await loadTheaterFreshness(query, CONFIG, ["ir", "ru", "ua"]);
    const ir = out.find((f) => f.theater === "ir")!;
    expect(ir.staleDays).toBe(17);
    expect(ir.stale).toBe(true);
    const ru = out.find((f) => f.theater === "ru")!;
    expect(ru.staleDays).toBe(1);
    expect(ru.stale).toBe(false); // below the 2-day threshold
    const ua = out.find((f) => f.theater === "ua")!;
    expect(ua.stale).toBe(false); // no eligible docs -> never stale
    // the query carries the theater, the stub-exclusion pattern, and the
    // CURRENT (track, extractor_version) pairs as parameters
    expect(calls[0].params[0]).toBe("ir");
    expect(String(calls[0].params[1])).toContain("[STUB FIXTURE]");
    expect(calls[0].sql).toContain("doc_map_state");
    expect(calls[0].params.length).toBeGreaterThan(3);
  });

  it("nothing mapped under current versions -> infinite lag -> stale", async () => {
    const query = async () => [{ newest_eligible: "2026-08-15", newest_mapped: null }];
    const out = await loadTheaterFreshness(query, CONFIG, ["ir"]);
    expect(out[0].stale).toBe(true);
    expect(out[0].staleDays).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("buildMapHealthEmail — safe fields only", () => {
  it("carries counters, categories and freshness but no content or secrets", () => {
    const mail = buildMapHealthEmail(
      "ops@example.com",
      "unhealthy",
      ["budget_stop_total", "stale_ir"],
      counters({ budgetStopCategory: "total_cap" }),
      { freshness: [fresh("ir", true)] },
      NOW,
    );
    expect(mail.subject).toContain("map stage unhealthy");
    expect(mail.text).toContain("budget_stop_total, stale_ir");
    expect(mail.text).toContain("ir: newest eligible 2026-08-15, newest mapped 2026-07-29 (STALE");
    expect(mail.text).toContain("budgetStop=total_cap");
    expect(mail.trackLinks).toBe("None");
    expect(mail.trackOpens).toBe(false);
    for (const banned of ["sk-", "Bearer ", "OPENAI", "CRON_SECRET", "DATABASE_URL"]) {
      expect(mail.text).not.toContain(banned);
    }
  });
});

describe("runMapHealthCheck — runner", () => {
  function deps(over: Partial<Parameters<typeof runMapHealthCheck>[1]> = {}) {
    return {
      loadState: vi.fn().mockResolvedValue(null),
      saveState: vi.fn().mockResolvedValue(undefined),
      sendEmail: vi.fn().mockResolvedValue({ delivered: true, via: "postmark" }),
      recipient: () => "ops@example.com",
      now: () => NOW,
      query: vi.fn().mockResolvedValue([{ newest_eligible: "2026-08-15", newest_mapped: "2026-08-15" }]),
      ...over,
    };
  }

  it("fires one email on an unhealthy episode and persists the next state", async () => {
    const d = deps();
    const out = await runMapHealthCheck(counters({ budgetStopCategory: "total_cap" }), d, CONFIG);
    expect(out.evaluated).toBe(true);
    expect(out.alert).toBe("unhealthy");
    expect(out.delivery).toBe("sent");
    expect(d.sendEmail).toHaveBeenCalledTimes(1);
    expect(d.saveState).toHaveBeenCalledWith(
      MAP_HEALTH_PROVIDER,
      expect.objectContaining({ episodeKey: "budget_stop_total" }),
    );
  });

  it("records no_recipient when FEEDBACK_EMAIL is unset — state still persists", async () => {
    const d = deps({ recipient: () => null });
    const out = await runMapHealthCheck(counters({ budgetStopCategory: "total_cap" }), d, CONFIG);
    expect(out.delivery).toBe("no_recipient");
    expect(d.saveState).toHaveBeenCalled();
  });

  it("an email failure is recorded, never thrown, and state still persists", async () => {
    const d = deps({ sendEmail: vi.fn().mockRejectedValue(new Error("postmark down")) });
    const out = await runMapHealthCheck(counters({ budgetStopCategory: "total_cap" }), d, CONFIG);
    expect(out.delivery).toBe("failed");
    expect(d.saveState).toHaveBeenCalled();
  });

  it("a freshness/state load failure degrades to evaluated:false without throwing", async () => {
    const d = deps({ query: vi.fn().mockRejectedValue(new Error("db down")) });
    const out = await runMapHealthCheck(counters(), d, CONFIG);
    expect(out.evaluated).toBe(false);
    expect(d.sendEmail).not.toHaveBeenCalled();
  });
});

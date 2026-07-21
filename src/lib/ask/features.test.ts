import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Release hardening: the effective-feature resolver is the ONE authority for
// every Ask flag. These tests pin the dependency lattice and the fail-closed
// behavior of every invalid combination.

const { effectiveAskFeatures, progressiveAllowedFor, resetFeatureWarnings } = await import("./features");

beforeEach(() => {
  resetFeatureWarnings();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

function stubStack(overrides: Record<string, string> = {}) {
  const base: Record<string, string> = {
    ASK_RUNS_ENFORCE: "1",
    ASK_CONTENT_RETENTION_DAYS: "30",
    ...overrides,
  };
  for (const [k, v] of Object.entries(base)) vi.stubEnv(k, v);
}

describe("effectiveAskFeatures — defaults", () => {
  it("a bare environment resolves everything OFF with no invalid combinations", () => {
    const f = effectiveAskFeatures();
    expect(f).toMatchObject({
      runsPersistence: "off",
      progressive: false,
      streamAnswer: false,
      exactCache: false,
      sessions: false,
      retention: null,
      cacheTtlDays: null,
      invalid: [],
    });
  });
});

describe("effectiveAskFeatures — persistence modes require retention", () => {
  it("ASK_RUNS_ENFORCE=1 WITHOUT retention fails closed to off (legacy gates authoritative)", () => {
    vi.stubEnv("ASK_RUNS_ENFORCE", "1");
    const f = effectiveAskFeatures();
    expect(f.runsPersistence).toBe("off");
    expect(f.invalid.some((m) => m.includes("ASK_RUNS_ENFORCE"))).toBe(true);
  });

  it("enforce with valid retention is effective; events retention defaults to content retention", () => {
    stubStack();
    const f = effectiveAskFeatures();
    expect(f.runsPersistence).toBe("enforce");
    expect(f.retention).toEqual({ contentDays: 30, eventsDays: 30 });
    expect(f.invalid).toEqual([]);
  });

  it("a distinct ASK_EVENTS_RETENTION_DAYS is honored", () => {
    stubStack({ ASK_EVENTS_RETENTION_DAYS: "7" });
    expect(effectiveAskFeatures().retention).toEqual({ contentDays: 30, eventsDays: 7 });
  });

  it("bogus retention values (0, negative, garbage) are invalid — fail closed", () => {
    for (const bad of ["0", "-3", "abc"]) {
      vi.stubEnv("ASK_RUNS_ENFORCE", "1");
      vi.stubEnv("ASK_CONTENT_RETENTION_DAYS", bad);
      expect(effectiveAskFeatures().runsPersistence).toBe("off");
      vi.unstubAllEnvs();
    }
  });

  it("shadow is an explicit OPT-IN with the same retention requirement", () => {
    vi.stubEnv("ASK_RUNS_SHADOW", "1");
    expect(effectiveAskFeatures().runsPersistence).toBe("off"); // no retention
    vi.stubEnv("ASK_CONTENT_RETENTION_DAYS", "30");
    expect(effectiveAskFeatures().runsPersistence).toBe("shadow");
  });

  it("enforce takes precedence over shadow when both are set", () => {
    stubStack({ ASK_RUNS_SHADOW: "1" });
    expect(effectiveAskFeatures().runsPersistence).toBe("enforce");
  });
});

describe("effectiveAskFeatures — the dependency lattice fails closed", () => {
  it("ASK_PROGRESSIVE without effective enforce is OFF and reported invalid", () => {
    vi.stubEnv("ASK_PROGRESSIVE", "1");
    const f = effectiveAskFeatures();
    expect(f.progressive).toBe(false);
    expect(f.invalid.some((m) => m.includes("ASK_PROGRESSIVE"))).toBe(true);
  });

  it("the full progressive stack is effective", () => {
    stubStack({ ASK_PROGRESSIVE: "1" });
    expect(effectiveAskFeatures().progressive).toBe(true);
  });

  it("ASK_STREAM_ANSWER requires effective progressive", () => {
    stubStack({ ASK_STREAM_ANSWER: "1" });
    expect(effectiveAskFeatures().streamAnswer).toBe(false);
    stubStack({ ASK_PROGRESSIVE: "1", ASK_STREAM_ANSWER: "1" });
    expect(effectiveAskFeatures().streamAnswer).toBe(true);
  });

  it("ASK_EXACT_CACHE requires effective progressive AND a valid cache TTL", () => {
    stubStack({ ASK_EXACT_CACHE: "1", ASK_PROGRESSIVE: "1" });
    expect(effectiveAskFeatures().exactCache).toBe(false); // no TTL
    vi.unstubAllEnvs();
    stubStack({ ASK_EXACT_CACHE: "1", ASK_CACHE_TTL_DAYS: "7" });
    expect(effectiveAskFeatures().exactCache).toBe(false); // no progressive
    vi.unstubAllEnvs();
    stubStack({ ASK_EXACT_CACHE: "1", ASK_PROGRESSIVE: "1", ASK_CACHE_TTL_DAYS: "7" });
    const f = effectiveAskFeatures();
    expect(f.exactCache).toBe(true);
    expect(f.cacheTtlDays).toBe(7);
  });

  it("ASK_SESSIONS requires effective enforce", () => {
    vi.stubEnv("ASK_SESSIONS", "1");
    expect(effectiveAskFeatures().sessions).toBe(false);
    stubStack({ ASK_SESSIONS: "1" });
    expect(effectiveAskFeatures().sessions).toBe(true);
  });

  it("ASK_PIPELINE=legacy + enforce (register #23): enforce is RETAINED, every v2 feature is forced off", () => {
    stubStack({
      ASK_PIPELINE: "legacy",
      ASK_PROGRESSIVE: "1",
      ASK_STREAM_ANSWER: "1",
      ASK_SESSIONS: "1",
      ASK_EXACT_CACHE: "1",
      ASK_CACHE_TTL_DAYS: "7",
    });
    const f = effectiveAskFeatures();
    expect(f.runsPersistence).toBe("enforce"); // money atomicity retained
    expect(f.progressive).toBe(false);
    expect(f.streamAnswer).toBe(false);
    expect(f.exactCache).toBe(false);
    expect(f.sessions).toBe(false);
    expect(f.invalid.some((m) => m.includes("register #23"))).toBe(true);
  });
});

describe("progressiveAllowedFor — server-side cohort policy", () => {
  it("false for everyone while the stack is not effective", () => {
    vi.stubEnv("ASK_PROGRESSIVE", "1"); // no enforce/retention
    expect(progressiveAllowedFor("a@x.com")).toBe(false);
  });

  it("cohort unset: every user (and the anonymous dev identity) once effective", () => {
    stubStack({ ASK_PROGRESSIVE: "1" });
    expect(progressiveAllowedFor("a@x.com")).toBe(true);
    expect(progressiveAllowedFor(null)).toBe(true);
  });

  it("cohort set: membership is case-insensitive and trimmed; outsiders and anonymous are refused", () => {
    stubStack({ ASK_PROGRESSIVE: "1", ASK_PROGRESSIVE_COHORT: " Insider@X.com , second@x.com " });
    expect(progressiveAllowedFor("insider@x.com")).toBe(true);
    expect(progressiveAllowedFor("SECOND@X.COM")).toBe(true);
    expect(progressiveAllowedFor("outsider@x.com")).toBe(false);
    expect(progressiveAllowedFor(null)).toBe(false);
  });
});

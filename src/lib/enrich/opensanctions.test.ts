import { afterEach, describe, expect, it, vi } from "vitest";
import { matchEntity, sanitizeForPersist } from "./opensanctions";

// Minimal live /match response builder (shape per api.opensanctions.org).
function osResponse(results: unknown[]) {
  return {
    ok: true,
    json: async () => ({ responses: { q1: { results } } }),
  };
}

function liveEnv(results: unknown[]) {
  vi.stubEnv("OPENSANCTIONS_API_KEY", "test-key");
  vi.stubEnv("OPENSANCTIONS_MODE", "");
  vi.stubGlobal("fetch", vi.fn(async () => osResponse(results)));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// Match-safety (2026-07-21): only a result the algorithm ACCEPTED (match === true)
// may populate assertive fields. The old `?? results[0]` fallback persisted the top
// REJECTED candidate — its topics then rendered as an unqualified "sanctioned" badge.
describe("matchEntity live selection is fail-closed (mocked fetch, no real provider)", () => {
  it("(1) empty results -> clean unmatched, no rejected diagnostics", async () => {
    liveEnv([]);
    const r = await matchEntity("Nobody Known", "person");
    expect(r).toEqual({
      matched: false, sanctioned: false, topics: [], datasets: [],
      osId: null, score: 0, caption: null, checkedAt: "",
    });
    expect(r!.rejected).toBeUndefined();
  });

  it("(2) every candidate rejected -> matched/sanctioned false, assertive fields empty; candidate kept ONLY as non-assertive diagnostics", async () => {
    liveEnv([
      {
        id: "Q555", caption: "Some Listed Person", score: 0.62, match: false,
        datasets: ["us_ofac_sdn"], properties: { topics: ["sanction", "role.pep"] },
      },
    ]);
    const r = await matchEntity("Common Name", "person");
    expect(r!.matched).toBe(false);
    expect(r!.sanctioned).toBe(false);
    expect(r!.topics).toEqual([]);
    expect(r!.datasets).toEqual([]);
    expect(r!.osId).toBeNull();
    expect(r!.caption).toBeNull();
    expect(r!.score).toBe(0);
    // diagnostics live in the explicitly non-assertive nested structure
    expect(r!.rejected).toEqual({
      caption: "Some Listed Person", score: 0.62,
      topics: ["sanction", "role.pep"], osId: "Q555",
    });
  });

  it("(3) accepted sanctions candidate -> represented as an algorithm match with its fields preserved", async () => {
    liveEnv([
      {
        id: "Q100", caption: "Listed Person", score: 0.91, match: true,
        datasets: ["eu_fsf", "us_ofac_sdn"], properties: { topics: ["sanction"] },
      },
    ]);
    const r = await matchEntity("Listed Person", "person");
    expect(r!.matched).toBe(true);
    expect(r!.sanctioned).toBe(true);
    expect(r!.topics).toEqual(["sanction"]);
    expect(r!.datasets).toEqual(["eu_fsf", "us_ofac_sdn"]);
    expect(r!.osId).toBe("Q100");
    expect(r!.score).toBe(0.91);
    expect(r!.caption).toBe("Listed Person");
    expect(r!.rejected).toBeUndefined();
  });

  it("(4) accepted PEP-only candidate is NOT sanctioned (categories never collapse)", async () => {
    liveEnv([
      {
        id: "Q200", caption: "A Politician", score: 0.88, match: true,
        datasets: ["peps"], properties: { topics: ["role.pep"] },
      },
    ]);
    const r = await matchEntity("A Politician", "person");
    expect(r!.matched).toBe(true);
    expect(r!.sanctioned).toBe(false);
    expect(r!.topics).toEqual(["role.pep"]);
  });

  it("(5) a later accepted element wins over a leading rejected one", async () => {
    liveEnv([
      {
        id: "Q-rejected", caption: "Wrong Person", score: 0.7, match: false,
        datasets: ["us_ofac_sdn"], properties: { topics: ["sanction"] },
      },
      {
        id: "Q-accepted", caption: "Right Person", score: 0.95, match: true,
        datasets: ["eu_fsf"], properties: { topics: ["role.pep"] },
      },
    ]);
    const r = await matchEntity("Right Person", "person");
    expect(r!.matched).toBe(true);
    expect(r!.osId).toBe("Q-accepted");
    expect(r!.caption).toBe("Right Person");
    expect(r!.topics).toEqual(["role.pep"]);
    expect(r!.sanctioned).toBe(false);
  });
});

// With no OPENSANCTIONS_API_KEY (test env), the fixture stub answers deterministically.
describe("opensanctions stub", () => {
  it("flags a seeded sanctioned person", async () => {
    const r = await matchEntity("Timur Ivanov", "person");
    expect(r).not.toBeNull();
    expect(r!.matched).toBe(true);
    expect(r!.sanctioned).toBe(true);
    expect(r!.topics).toContain("sanction");
    expect(r!.datasets.length).toBeGreaterThan(0);
  });
  it("is case-insensitive on names", async () => {
    const r = await matchEntity("  FSB  ", "agency");
    expect(r!.sanctioned).toBe(true);
  });
  it("returns unmatched for unknown names, never null in stub mode", async () => {
    const r = await matchEntity("Ivan Nobody", "person");
    expect(r).not.toBeNull();
    expect(r!.matched).toBe(false);
    expect(r!.sanctioned).toBe(false);
  });
});

// (13) truth-in-UI: a stub answer records the CHECK (so the rescore is resumable)
// but must never persist a fabricated sanctions/PEP assertion. A live rescore
// later upgrades the same row with real data.
describe("sanitizeForPersist", () => {
  it("strips a stub's fabricated match/sanction, keeping only checkedAt", () => {
    const s = sanitizeForPersist({
      matched: true,
      sanctioned: true,
      topics: ["sanction", "role.pep"],
      datasets: ["us_ofac"],
      osId: "NK-stub-123",
      score: 0.9,
      caption: "Fake Person",
      checkedAt: "2026-08-01T00:00:00.000Z",
      stub: true,
    });
    expect(s.stub).toBe(true);
    expect(s.matched).toBe(false);
    expect(s.sanctioned).toBe(false);
    expect(s.topics).toEqual([]);
    expect(s.datasets).toEqual([]);
    expect(s.osId).toBeNull();
    expect(s.score).toBe(0);
    expect(s.caption).toBeNull();
    expect(s.checkedAt).toBe("2026-08-01T00:00:00.000Z"); // the check is still recorded
  });

  it("passes a real (non-stub) live result through unchanged", () => {
    const live = {
      matched: true,
      sanctioned: true,
      topics: ["sanction"],
      datasets: ["us_ofac"],
      osId: "Q123",
      score: 0.95,
      caption: "Real Person",
      checkedAt: "2026-08-01T00:00:00.000Z",
    };
    expect(sanitizeForPersist(live)).toEqual(live);
  });
});

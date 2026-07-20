import { afterEach, describe, expect, it, vi } from "vitest";
import type { AskAnswerV2 } from "@/lib/ask/types";

// actions.ts is a "use server" module, but under vitest (no Next.js server-action
// bundling) it's just a plain async function — importable and unit-testable like
// any other module, per the workstream brief.

// actions.ts uses requireAcceptedUser (auth + current legal acceptance) rather than requireUser;
// mocked to a valid accepted user so these tests focus on the money-path guard.
vi.mock("@/lib/gate", () => ({
  requireAcceptedUser: vi.fn().mockResolvedValue({ email: "user@example.com" }),
}));

vi.mock("@/i18n/server", () => ({
  getLocale: vi.fn().mockResolvedValue("en"),
}));

const askWithLimitsMock = vi.fn();
const recordEntryTimingsMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/ask/limits", () => ({
  askWithLimits: (...args: unknown[]) => askWithLimitsMock(...args),
  recordEntryTimings: (...args: unknown[]) => recordEntryTimingsMock(...args),
}));

const queryMock = vi.fn();
vi.mock("@/db", () => ({
  rawSql: { query: (...args: unknown[]) => queryMock(...args) },
}));

const { askAction } = await import("./actions");

function fullAnswer(): AskAnswerV2 {
  return {
    answer: "Some answer [c1].",
    citedClaimIds: [1],
    evidenceCount: 2,
    terms: [],
    provider: "stub",
    state: "answered",
    relatedClaimIds: [],
    window: null,
    totalMatching: 2,
    sampled: false,
    retrievalMode: "legacy",
  };
}

afterEach(() => {
  askWithLimitsMock.mockReset();
  queryMock.mockReset();
  recordEntryTimingsMock.mockClear();
});

function formWith(question: string): FormData {
  const fd = new FormData();
  fd.set("question", question);
  return fd;
}

describe("askAction — the money-path guard's server half", () => {
  it("rejects a too-short question: returns prevState (null) unchanged, never calls askWithLimits (no charge)", async () => {
    const result = await askAction(null, formWith("hi"));
    expect(result).toBeNull();
    expect(askWithLimitsMock).not.toHaveBeenCalled();
  });

  it("passes the previous state through unchanged (not just null) on a short question", async () => {
    const prevState = {
      analyticsCompletionKey: "previous",
      question: "old",
      result: fullAnswer(),
      cited: [],
      related: [],
    };
    const result = await askAction(prevState, formWith("  ab  "));
    expect(result).toBe(prevState);
    expect(askWithLimitsMock).not.toHaveBeenCalled();
  });

  it("rejects an empty question the same way", async () => {
    const result = await askAction(null, new FormData());
    expect(result).toBeNull();
    expect(askWithLimitsMock).not.toHaveBeenCalled();
  });

  it("runs the pipeline once and resolves cited/related claims plus evidence in one union query", async () => {
    askWithLimitsMock.mockResolvedValue({
      ...fullAnswer(),
      citedClaimIds: [2, 1],
      relatedClaimIds: [3, 1],
    });
    queryMock.mockResolvedValue([
      {
        id: 1,
        text: "claim one",
        hedging: "assessed",
        iso2: "ru",
        country_name: "Russia",
        digest_date: "2026-07-01",
        doc_id: 11,
        doc_url: "https://example.com/one",
        doc_title: "One",
        adapter: "rss",
        source_id: 101,
        source_name: "Example News",
        source_key: "example.com",
        source_domain: "example.com",
        source_platform: "news",
        reliability: "0.82",
        published_at: "2026-06-30T22:00:00Z",
        fetched_at: "2026-06-30T22:05:00Z",
      },
      {
        id: 1,
        text: "claim one",
        hedging: "assessed",
        iso2: "ru",
        country_name: "Russia",
        digest_date: "2026-07-01",
        doc_id: 12,
        doc_url: "https://example.net/repeat",
        doc_title: null,
        adapter: "gdelt",
        source_id: null,
        source_name: null,
        source_key: null,
        source_domain: null,
        source_platform: null,
        reliability: null,
        published_at: null,
        fetched_at: "2026-06-30T22:07:00Z",
      },
      {
        id: 2,
        text: "claim two",
        hedging: "confirmed",
        iso2: "ua",
        country_name: "Ukraine",
        digest_date: "2026-07-02",
        doc_id: 21,
        doc_url: "https://example.org/two",
        doc_title: "Two",
        adapter: "telegram_web",
        source_id: 102,
        source_name: "Channel Two",
        source_key: "t.me/two",
        source_domain: "t.me",
        source_platform: "telegram",
        reliability: 0.7,
        published_at: "2026-07-01T10:00:00Z",
        fetched_at: "2026-07-01T10:01:00Z",
      },
      {
        id: 3,
        text: "claim three",
        hedging: "unknown",
        iso2: "ir",
        country_name: "Iran",
        digest_date: null,
        doc_id: 31,
        doc_url: null,
        doc_title: "Offline evidence",
        adapter: "manual",
        source_id: null,
        source_name: null,
        source_key: null,
        source_domain: null,
        source_platform: null,
        reliability: null,
        published_at: null,
        fetched_at: "2026-07-01T10:01:00Z",
      },
    ]);

    const result = await askAction(null, formWith("did russia strike kyiv today"));

    expect(askWithLimitsMock).toHaveBeenCalledWith(
      "did russia strike kyiv today",
      "user@example.com",
      { idempotencyKey: undefined }, // no hidden key in this form -> server-generated
    );
    expect(result?.question).toBe("did russia strike kyiv today");
    expect(askWithLimitsMock).toHaveBeenCalledTimes(1);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock.mock.calls[0]?.[1]).toEqual([[2, 1, 3]]);
    const resolverSql = String(queryMock.mock.calls[0]?.[0]);
    expect(resolverSql).toContain("dg.digest_date::text AS digest_date");
    expect(resolverSql).toContain("rd.published_at::text AS published_at");
    expect(resolverSql).toContain("rd.fetched_at::text AS fetched_at");
    expect(resolverSql).not.toContain("cl.claim_date::text AS date");
    expect(result?.cited.map((claim) => claim.id)).toEqual([2, 1]);
    expect(result?.related.map((claim) => claim.id)).toEqual([3, 1]);
    expect(result?.cited[1]?.copyPayload.docs).toHaveLength(2);
    expect(result?.cited[1]?.copyPayload).toMatchObject({
      hedging: "assessed",
      asOf: "Jul 1, 2026",
      countryName: "Russia",
      countryIso2: "ru",
      claimUrl: "https://bnow.net/digests/ru/2026-07-01#c1",
      showScores: true,
    });
    expect(result?.related[0]?.copyPayload).toMatchObject({
      asOf: null,
      claimUrl: null,
    });
  });

  it("does not run the resolver when the paid result has no cited or related claims", async () => {
    askWithLimitsMock.mockResolvedValue({
      ...fullAnswer(),
      citedClaimIds: [],
      relatedClaimIds: [],
      evidenceCount: 0,
      state: "insufficient",
    });

    const result = await askAction(null, formWith("what happened in the covered period"));

    expect(askWithLimitsMock).toHaveBeenCalledTimes(1);
    expect(queryMock).not.toHaveBeenCalled();
    expect(result?.cited).toEqual([]);
    expect(result?.related).toEqual([]);
  });

  it("truncates to 400 chars before dispatch, same floor as the API route", async () => {
    askWithLimitsMock.mockResolvedValue(fullAnswer());
    queryMock.mockResolvedValue([]);
    const long = "a".repeat(500);
    await askAction(null, formWith(long));
    expect(askWithLimitsMock).toHaveBeenCalledWith("a".repeat(400), "user@example.com", {
      idempotencyKey: undefined,
    });
  });
});

// ---- Phase 0 measurement: the action patches ONLY its own run's row --------------

describe("askAction — entry-point timing patch", () => {
  it("patches hydrateMs + totalMs by the run's own runId when the payload carries one", async () => {
    askWithLimitsMock.mockResolvedValue({
      ...fullAnswer(),
      runId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    });
    queryMock.mockResolvedValue([]);

    await askAction(null, formWith("did russia strike kyiv today"));

    expect(recordEntryTimingsMock).toHaveBeenCalledTimes(1);
    const [runId, patch] = recordEntryTimingsMock.mock.calls[0] as [string, Record<string, number>];
    expect(runId).toBe("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    // The action's OWN keys only — apiTotalMs belongs to the JSON route, and the
    // pipeline keys were already written by askWithLimits (Gate 0: no conflation).
    expect(Object.keys(patch).sort()).toEqual(["hydrateMs", "totalMs"]);
    expect(patch.hydrateMs).toBeGreaterThanOrEqual(0);
    expect(patch.totalMs).toBeGreaterThanOrEqual(patch.hydrateMs);
  });

  it("passes a well-formed hidden idempotency key through and rejects malformed ones (Gate 1: the key chain must be provable)", async () => {
    askWithLimitsMock.mockResolvedValue({ ...fullAnswer(), citedClaimIds: [], relatedClaimIds: [] });
    const fd = formWith("what happened in kherson");
    fd.set("idempotencyKey", "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    await askAction(null, fd);
    expect(askWithLimitsMock).toHaveBeenLastCalledWith("what happened in kherson", "user@example.com", {
      idempotencyKey: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    });

    const bad = formWith("what happened in kherson");
    bad.set("idempotencyKey", "short"); // under the 8-char floor
    await askAction(null, bad);
    expect(askWithLimitsMock).toHaveBeenLastCalledWith("what happened in kherson", "user@example.com", {
      idempotencyKey: undefined,
    });
    const evil = formWith("what happened in kherson");
    evil.set("idempotencyKey", "in valid; DROP TABLE ask_runs; --");
    await askAction(null, evil);
    expect(askWithLimitsMock).toHaveBeenLastCalledWith("what happened in kherson", "user@example.com", {
      idempotencyKey: undefined,
    });
  });

  it("skips the timing patch on a REPLAYED payload — the runId names the ORIGINAL run (Gate 1)", async () => {
    askWithLimitsMock.mockResolvedValue({
      ...fullAnswer(),
      citedClaimIds: [],
      relatedClaimIds: [],
      runId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      replayed: true,
    });
    await askAction(null, formWith("what happened in kherson"));
    expect(recordEntryTimingsMock).not.toHaveBeenCalled();
  });

  it("skips the patch entirely when the payload has no runId (limit/gate refusals wrote no row)", async () => {
    askWithLimitsMock.mockResolvedValue({
      ...fullAnswer(),
      state: "limit",
      provider: "limit",
      citedClaimIds: [],
      relatedClaimIds: [],
    });
    await askAction(null, formWith("what happened in kherson"));
    expect(recordEntryTimingsMock).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 4 (F11): cache-hit hydration resolves cited evidence from the run's
// frozen EvidenceSnapshot — live claim ids may have churned since the answer
// was cached. These tests pin the branch selection and the snapshot render.

const h = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock("@/db", () => ({ rawSql: { query: h.queryMock } }));
vi.mock("@/i18n/server", () => ({ getLocale: async () => "en" }));

const { hydrateResultClaims } = await import("./hydrate");
import type { AskAnswerV2 } from "./types";

const RUN_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function result(overrides: Partial<AskAnswerV2> = {}): AskAnswerV2 {
  return {
    answer: "A [c7].",
    citedClaimIds: [7],
    evidenceCount: 1,
    terms: [],
    provider: "openai:gpt-5",
    state: "answered",
    relatedClaimIds: [9],
    window: null,
    totalMatching: 1,
    sampled: false,
    retrievalMode: "v2",
    runId: RUN_ID,
    ...overrides,
  };
}

const SNAPSHOT = {
  version: 1,
  retrievalMode: "v2",
  window: null,
  totalMatching: 2,
  candidatesCount: 2,
  corpusCurrentThrough: "2026-07-18",
  candidates: [
    { claimId: 7, text: "Cited claim text from the snapshot.", hedging: "confirmed", claimDate: "2026-07-15", countryIso2: "ua", track: null, confidence: null, sourceDocIds: [501] },
    { claimId: 9, text: "Related claim from the snapshot.", hedging: "claimed", claimDate: null, countryIso2: "ru", track: null, confidence: null, sourceDocIds: [] },
  ],
  selectedClaimIds: [7],
};

beforeEach(() => {
  h.queryMock.mockReset();
});

describe("hydrateResultClaims — Phase 4 cache-hit branch (F11)", () => {
  it("resolves cited + related from the frozen snapshot; source docs by STABLE raw_documents ids; never queries live claims", async () => {
    h.queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes("evidence_snapshot")) return [{ evidence_snapshot: SNAPSHOT }];
      if (String(sql).includes("FROM raw_documents")) {
        return [
          { doc_id: 501, doc_url: "https://t.me/x/1", doc_title: "post", adapter: "telegram", source_id: 3, source_name: "Chan", source_key: null, source_domain: null, source_platform: "telegram", reliability: 0.6, published_at: "2026-07-15", fetched_at: "2026-07-15" },
        ];
      }
      throw new Error(`unexpected query: ${String(sql).slice(0, 60)}`);
    });
    const { cited, related } = await hydrateResultClaims(result({ cacheStatus: "exact" }));

    expect(cited).toHaveLength(1);
    expect(cited[0].text).toBe("Cited claim text from the snapshot."); // content, not a live row
    expect(cited[0].digestDate).toBeNull(); // no unstable digest anchor (F11 §7.4)
    expect(cited[0].copyPayload.claimUrl).toBeNull();
    expect(cited[0].copyPayload.docs[0]?.docId).toBe(501); // stable doc id resolved live
    expect(related).toHaveLength(1);
    expect(related[0].text).toBe("Related claim from the snapshot.");
    // the live-claims hydration query was never issued
    expect(h.queryMock.mock.calls.some((c) => String(c[0]).includes("FROM claims"))).toBe(false);
  });

  it("a cache-hit whose snapshot is missing falls back to live hydration (vanished ids drop — the pre-cache behavior)", async () => {
    h.queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes("evidence_snapshot")) return [{ evidence_snapshot: null }];
      if (String(sql).includes("FROM claims")) return []; // live ids churned away
      throw new Error("unexpected");
    });
    const { cited, related } = await hydrateResultClaims(result({ cacheStatus: "exact" }));
    expect(cited).toHaveLength(0);
    expect(related).toHaveLength(0);
  });

  it("non-cached results keep the historical live hydration path untouched", async () => {
    h.queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes("FROM claims")) return [];
      throw new Error(`unexpected query: ${String(sql).slice(0, 60)}`);
    });
    await hydrateResultClaims(result()); // no cacheStatus
    expect(h.queryMock.mock.calls.some((c) => String(c[0]).includes("evidence_snapshot"))).toBe(false);
  });
});

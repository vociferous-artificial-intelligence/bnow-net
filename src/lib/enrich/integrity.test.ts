import { describe, expect, it } from "vitest";
import { matchEntity, sanitizeForPersist, type OsResult } from "./opensanctions";
import { persistableLinks, type ResolvedLink } from "./ownership";

// Truth-in-UI invariant: stub enrichment data is for tests/demos only — it must
// never be persisted (and thus never rendered) as a factual sanctions/ownership
// assertion about a real person or company.

describe("stub enrichment can never persist as fact", () => {
  it("stub matches are flagged stub: true", async () => {
    const r = await matchEntity("Timur Ivanov", "person"); // seeded fixture name
    expect(r!.stub).toBe(true);
    const miss = await matchEntity("Ivan Nobody", "person");
    expect(miss!.stub).toBe(true);
  });

  it("sanitizeForPersist strips every fabricated field from a stub match", () => {
    const fabricated: OsResult = {
      matched: true, sanctioned: true, topics: ["sanction", "role.pep"],
      datasets: ["us_ofac_sdn"], osId: "NK-stub-someone", score: 0.97,
      caption: "Someone", checkedAt: "2026-07-06T00:00:00Z", stub: true,
    };
    const persisted = sanitizeForPersist(fabricated);
    expect(persisted.matched).toBe(false);
    expect(persisted.sanctioned).toBe(false);
    expect(persisted.topics).toEqual([]);
    expect(persisted.datasets).toEqual([]);
    expect(persisted.osId).toBeNull();
    expect(persisted.caption).toBeNull();
    expect(persisted.score).toBe(0);
    expect(persisted.stub).toBe(true); // provenance survives
    expect(persisted.checkedAt).toBe("2026-07-06T00:00:00Z"); // resumability survives
  });

  it("sanitizeForPersist passes live results through untouched", () => {
    const live: OsResult = {
      matched: true, sanctioned: true, topics: ["sanction"], datasets: ["eu_fsf"],
      osId: "Q12345", score: 0.9, caption: "Real Match", checkedAt: "2026-07-06T00:00:00Z",
    };
    expect(sanitizeForPersist(live)).toEqual(live);
  });

  it("persistableLinks drops stub ownership edges, keeps sourced ones", () => {
    const links: ResolvedLink[] = [
      { toName: "Stub Co", toKind: "company", relation: "owns", source: "stub", since: null },
      { toName: "Real Co", toKind: "company", relation: "director", source: "companies_house", since: "2020" },
    ];
    const kept = persistableLinks(links);
    expect(kept).toHaveLength(1);
    expect(kept[0].source).toBe("companies_house");
  });
});

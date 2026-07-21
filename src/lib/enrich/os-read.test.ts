import { describe, expect, it } from "vitest";
import { readOsMeta } from "./os-read";

// Fail-closed containment for already-persisted rows: production contains the
// pre-2026-07-21 bug shape (matched:false with sanctioned:true and rejected-
// candidate topics promoted to the top level). readOsMeta is the single read
// authority — such a row must NEVER surface as an accepted/sanctioned match.

// Verbatim contradictory stale shape from the task/production evidence.
const STALE_BAD_ROW = {
  opensanctions: {
    matched: false,
    sanctioned: true,
    topics: ["sanction"],
    datasets: ["us_ofac_sdn"],
    osId: "Q9999",
    score: 0.55,
    caption: "Wrong Person",
    checkedAt: "2026-07-10T00:00:00.000Z",
  },
};

describe("readOsMeta fail-closed containment", () => {
  it("stale matched:false + sanctioned:true row is REJECTED, never accepted/sanctioned", () => {
    const v = readOsMeta(STALE_BAD_ROW);
    expect(v.state).toBe("rejected");
    if (v.state !== "rejected") throw new Error("unreachable");
    // the promoted fields survive ONLY as non-assertive rejected diagnostics
    expect(v.rejected).toEqual({
      caption: "Wrong Person", score: 0.55, topics: ["sanction"], osId: "Q9999",
    });
    expect(v.checkedAt).toBe("2026-07-10T00:00:00.000Z");
  });

  it("sanctioned:true or a topic alone is never sufficient — matched === true is required", () => {
    expect(
      readOsMeta({ opensanctions: { sanctioned: true, topics: ["sanction"] } }).state,
    ).toBe("rejected");
    expect(readOsMeta({ opensanctions: { matched: "true", sanctioned: true } }).state).toBe(
      "rejected", // string "true" is not the boolean — fail closed
    );
  });

  it("stub rows and NK-stub ids render nothing, even with matched:true", () => {
    expect(
      readOsMeta({ opensanctions: { matched: true, sanctioned: true, stub: true } }).state,
    ).toBe("none");
    expect(
      readOsMeta({
        opensanctions: { matched: true, sanctioned: true, osId: "NK-stub-someone" },
      }).state,
    ).toBe("none");
  });

  it("missing/malformed metadata fails closed to none", () => {
    expect(readOsMeta(null).state).toBe("none");
    expect(readOsMeta({}).state).toBe("none");
    expect(readOsMeta({ opensanctions: null }).state).toBe("none");
    expect(readOsMeta({ opensanctions: "corrupt" }).state).toBe("none");
    expect(readOsMeta({ opensanctions: [1, 2] }).state).toBe("none");
  });

  it("accepted match: sanctioned derives from the exact 'sanction' topic, not the stored flag", () => {
    const withTopic = readOsMeta({
      opensanctions: {
        matched: true, sanctioned: false, topics: ["sanction", "role.pep"],
        datasets: ["eu_fsf"], osId: "Q1", score: 0.9, caption: "Listed",
        checkedAt: "2026-07-15T12:00:00Z",
      },
    });
    expect(withTopic.state).toBe("accepted");
    if (withTopic.state !== "accepted") throw new Error("unreachable");
    expect(withTopic.accepted.sanctioned).toBe(true); // topic governs
    expect(withTopic.accepted.topics).toEqual(["sanction", "role.pep"]);
    expect(withTopic.accepted.score).toBe(0.9);
    expect(withTopic.checkedAt).toBe("2026-07-15T12:00:00Z");

    // contradictory stored flag without the topic cannot widen the assertion
    const flagOnly = readOsMeta({
      opensanctions: { matched: true, sanctioned: true, topics: ["role.pep"] },
    });
    expect(flagOnly.state).toBe("accepted");
    if (flagOnly.state !== "accepted") throw new Error("unreachable");
    expect(flagOnly.accepted.sanctioned).toBe(false);
  });

  it("new-shape rejected rows expose the nested non-assertive diagnostics", () => {
    const v = readOsMeta({
      opensanctions: {
        matched: false, sanctioned: false, topics: [], datasets: [], osId: null,
        score: 0, caption: null, checkedAt: "2026-07-21T00:00:00Z",
        rejected: { caption: "Candidate X", score: 0.4, topics: ["sanction"], osId: "Q7" },
      },
    });
    expect(v.state).toBe("rejected");
    if (v.state !== "rejected") throw new Error("unreachable");
    expect(v.rejected).toEqual({
      caption: "Candidate X", score: 0.4, topics: ["sanction"], osId: "Q7",
    });
  });

  it("clean rejected rows (no candidate at all) carry null diagnostics", () => {
    const v = readOsMeta({
      opensanctions: {
        matched: false, sanctioned: false, topics: [], datasets: [], osId: null,
        score: 0, caption: null, checkedAt: "2026-07-21T00:00:00Z",
      },
    });
    expect(v.state).toBe("rejected");
    if (v.state !== "rejected") throw new Error("unreachable");
    expect(v.rejected).toBeNull();
  });
});

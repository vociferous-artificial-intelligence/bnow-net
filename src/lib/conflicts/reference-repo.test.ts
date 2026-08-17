import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  editionRecordFromFixtureReport,
  parseEditionRecord,
  type ReferenceEditionRecord,
} from "./editions";
import { ConflictDomainError } from "./errors";
import { InMemoryReferenceReportRepository, mergeEditionRecords } from "./reference-repo";

const crosscutting = JSON.parse(
  readFileSync(join(process.cwd(), "fixtures/conflicts/crosscutting-scenarios-v1.json"), "utf8"),
) as {
  scenarios: Array<{ id: string; reports?: unknown[]; gapDate?: string; expected: Record<string, unknown> }>;
};

const base = (over: Partial<Record<string, unknown>> = {}): ReferenceEditionRecord =>
  parseEditionRecord({
    identity: {
      series: "iran_update",
      editionKey: "iran_update:2026-08-05:special",
      reportDate: "2026-08-05",
      cutoffAt: null,
      publishedAt: null,
      scopeVersion: "iran-update-scope-v1",
      ...(over.identity as Record<string, unknown> | undefined),
    },
    provider: "isw",
    canonicalUrl:
      "https://understandingwar.org/research/middle-east/iran-update-special-report-august-5-2026/",
    normVersion: "isw-edition-norm-v1",
    designatedFinal: null,
    cutoffTreatment: "missing",
    publishedTreatment: "missing",
    parseStatus: "pending",
    citationAnchorId: null,
    ...Object.fromEntries(Object.entries(over).filter(([k]) => k !== "identity")),
  });

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof ConflictDomainError ? e.code : "not-a-domain-error";
  }
}

describe("mergeEditionRecords (the one write authority)", () => {
  it("replays repair: a later parse fills in anchors and upgrades parse status", () => {
    const richer = base({
      identity: { cutoffAt: "2026-08-05T18:00:00Z", publishedAt: "2026-08-05T23:00:00Z" },
      cutoffTreatment: "present",
      publishedTreatment: "present",
      parseStatus: "parsed",
    });
    const { merged, repairedFields, anchorChanged } = mergeEditionRecords(base(), richer);
    expect(merged.identity.cutoffAt).toBe("2026-08-05T18:00:00.000Z");
    expect(merged.parseStatus).toBe("parsed");
    expect(repairedFields).toEqual(["cutoff", "published", "parse_status"]);
    expect(anchorChanged).toBe(false); // filling a missing anchor is not a move
  });

  it("never downgrades: a degraded replay keeps every known value", () => {
    const richer = base({
      identity: { cutoffAt: "2026-08-05T18:00:00Z" },
      cutoffTreatment: "present",
      parseStatus: "parsed",
    });
    // replay the ORIGINAL poor observation over the repaired record
    const { merged, repairedFields } = mergeEditionRecords(richer, base());
    expect(merged.identity.cutoffAt).toBe("2026-08-05T18:00:00.000Z"); // kept
    expect(merged.parseStatus).toBe("parsed"); // failed/pending never wins
    expect(repairedFields).toEqual([]);
  });

  it("a failed parse never overwrites a good one, but does upgrade pending", () => {
    const failed = base({ parseStatus: "failed" });
    expect(mergeEditionRecords(base({ parseStatus: "parsed" }), failed).merged.parseStatus).toBe(
      "parsed",
    );
    const up = mergeEditionRecords(base(), failed);
    expect(up.merged.parseStatus).toBe("failed");
    expect(up.repairedFields).toEqual(["parse_status"]);
  });

  it("an anchor moving between two PRESENT values is a VISIBLE repair", () => {
    const v1 = base({ identity: { cutoffAt: "2026-08-05T18:00:00Z" }, cutoffTreatment: "present" });
    const v2 = base({ identity: { cutoffAt: "2026-08-05T19:00:00Z" }, cutoffTreatment: "present" });
    const r = mergeEditionRecords(v1, v2);
    expect(r.merged.identity.cutoffAt).toBe("2026-08-05T19:00:00.000Z");
    expect(r.anchorChanged).toBe(true);
    expect(r.repairedFields).toContain("cutoff");
  });

  it("is idempotent: replaying the merged inputs changes nothing", () => {
    const richer = base({
      identity: { publishedAt: "2026-08-05T23:00:00Z" },
      publishedTreatment: "present",
      designatedFinal: true,
      parseStatus: "parsed",
      citationAnchorId: 42,
    });
    const first = mergeEditionRecords(base(), richer);
    const again = mergeEditionRecords(first.merged, richer);
    expect(again.repairedFields).toEqual([]);
    expect(again.anchorChanged).toBe(false);
    expect(again.merged).toEqual(first.merged);
  });

  it("identity-grade conflicts are typed errors, never silent repairs", () => {
    const other = (over: Record<string, unknown>) => base(over);
    expect(
      codeOf(() =>
        mergeEditionRecords(
          base(),
          parseEditionRecord({
            ...base(),
            identity: { ...base().identity, editionKey: "iran_update:2026-08-05:plain" },
          }),
        ),
      ),
    ).toBe("edition_merge_conflict");
    expect(
      codeOf(() =>
        mergeEditionRecords(
          base(),
          other({
            canonicalUrl:
              "https://understandingwar.org/research/middle-east/iran-update-august-5-2026/",
          }),
        ),
      ),
    ).toBe("edition_merge_conflict");
    expect(
      codeOf(() => mergeEditionRecords(base({ citationAnchorId: 1 }), other({ citationAnchorId: 2 }))),
    ).toBe("edition_merge_conflict");
    expect(
      codeOf(() =>
        mergeEditionRecords(
          base(),
          parseEditionRecord({ ...base(), provider: "fixture", canonicalUrl: null, normVersion: null }),
        ),
      ),
    ).toBe("edition_merge_conflict");
  });

  it("designation flips are visible repairs; null never erases a designation", () => {
    const flip = mergeEditionRecords(base({ designatedFinal: true }), base({ designatedFinal: false }));
    expect(flip.merged.designatedFinal).toBe(false);
    expect(flip.repairedFields).toEqual(["designated_final"]);
    const keep = mergeEditionRecords(base({ designatedFinal: true }), base());
    expect(keep.merged.designatedFinal).toBe(true);
    expect(keep.repairedFields).toEqual([]);
  });
});

describe("InMemoryReferenceReportRepository", () => {
  it("upserts idempotently: replays repair and never duplicate", async () => {
    const repo = new InMemoryReferenceReportRepository();
    expect((await repo.upsertEdition(base())).action).toBe("inserted");
    expect((await repo.upsertEdition(base())).action).toBe("unchanged");
    const repaired = await repo.upsertEdition(
      base({
        identity: { cutoffAt: "2026-08-05T18:00:00Z" },
        cutoffTreatment: "present",
        parseStatus: "parsed",
      }),
    );
    expect(repaired.action).toBe("repaired");
    expect(repaired.repairedFields).toEqual(["cutoff", "parse_status"]);
    const day = await repo.editionsForDay("iran_update", "2026-08-05");
    expect(day).toHaveLength(1);
    expect(day[0].identity.cutoffAt).toBe("2026-08-05T18:00:00.000Z");
    // degraded replay: nothing lost
    expect((await repo.upsertEdition(base())).action).toBe("unchanged");
    expect((await repo.getEdition("iran_update:2026-08-05:special"))!.parseStatus).toBe("parsed");
  });

  it("returns same-date editions in the deterministic finality order, any insertion order", async () => {
    const scenario = crosscutting.scenarios.find((s) => s.id === "cc-editions-001")!;
    const records = scenario.reports!.map(editionRecordFromFixtureReport);
    const forward = new InMemoryReferenceReportRepository();
    await forward.loadFixtureReports(scenario.reports!);
    const backward = new InMemoryReferenceReportRepository();
    for (const r of [...records].reverse()) await backward.upsertEdition(r);
    const keysF = (await forward.editionsForDay("iran_update", "2026-08-05")).map(
      (e) => e.identity.editionKey,
    );
    const keysB = (await backward.editionsForDay("iran_update", "2026-08-05")).map(
      (e) => e.identity.editionKey,
    );
    expect(keysF).toEqual(keysB);
    expect(keysF[0]).toBe(scenario.expected.selectedEditionKey); // evening
    expect(await forward.dayStatus("iran_update", "2026-08-05")).toBe("published");
  });

  it("day statuses: unknown → probe_failed → confirmed gap; never fabricated", async () => {
    const repo = new InMemoryReferenceReportRepository();
    const scenario = crosscutting.scenarios.find((s) => s.id === "cc-publication-gap-002")!;
    const gapDate = scenario.gapDate!; // 2026-08-11 — a true gap, report: null
    expect(await repo.dayStatus("iran_update", gapDate)).toBe("unknown");
    expect(await repo.recordDayStatus("iran_update", gapDate, "probe_failed")).toEqual({
      status: "probe_failed",
      action: "set",
    });
    expect(await repo.dayStatus("iran_update", gapDate)).toBe("probe_failed");
    expect(await repo.recordDayStatus("iran_update", gapDate, "publication_gap")).toEqual({
      status: "publication_gap",
      action: "set",
    });
    // a later transient probe failure never un-confirms the gap
    expect(await repo.recordDayStatus("iran_update", gapDate, "probe_failed")).toEqual({
      status: "publication_gap",
      action: "kept_prior",
    });
  });

  it("an arriving edition clears a stale stored day status (repair, not duplicate)", async () => {
    const repo = new InMemoryReferenceReportRepository();
    await repo.recordDayStatus("iran_update", "2026-08-05", "probe_failed");
    const result = await repo.upsertEdition(base());
    expect(result.dayStatusCleared).toBe(true);
    expect(await repo.dayStatus("iran_update", "2026-08-05")).toBe("published");
    // and a gap can no longer be recorded over the edition
    expect(await repo.recordDayStatus("iran_update", "2026-08-05", "publication_gap")).toEqual({
      status: "published",
      action: "published_wins",
    });
  });

  it("getEdition returns null for the unknown, never a fabricated record", async () => {
    const repo = new InMemoryReferenceReportRepository();
    expect(await repo.getEdition("iran_update:2026-08-05:special")).toBeNull();
    expect(await repo.editionsForDay("iran_update", "2026-08-05")).toEqual([]);
  });
});

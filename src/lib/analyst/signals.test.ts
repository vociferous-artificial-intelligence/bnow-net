import { describe, expect, it } from "vitest";
import {
  detectDataDark, detectPurge, detectTradeDivergence, rankSignals,
  type PressureClaim, type Signal,
} from "./signals";

const NOW = "2026-07-06T12:00:00Z";

describe("detectPurge", () => {
  const mk = (id: number, name: string, role: string, date: string): PressureClaim => ({
    claimId: id, entityName: name, entityKind: "person", role, claimDate: date,
  });
  it("fires on >=3 distinct targets in window", () => {
    const claims = [
      mk(1, "Ivanov", "defendant", "2026-07-01"),
      mk(2, "Petrov", "dismissed", "2026-07-03"),
      mk(3, "Sidorov", "target", "2026-07-05"),
    ];
    const s = detectPurge(claims, { windowDays: 14, minCount: 3, theater: "ru", nowIso: NOW });
    expect(s).not.toBeNull();
    expect(s!.kind).toBe("purge");
    expect(s!.evidenceClaimIds).toEqual([1, 2, 3]);
  });
  it("does not fire below threshold or outside window", () => {
    const claims = [
      mk(1, "Ivanov", "defendant", "2026-07-01"),
      mk(2, "Petrov", "dismissed", "2026-05-01"), // outside 14d
    ];
    expect(detectPurge(claims, { windowDays: 14, minCount: 3, theater: "ru", nowIso: NOW })).toBeNull();
  });
  it("ignores non-pressure roles", () => {
    const claims = [
      mk(1, "A", "prosecutor", "2026-07-01"),
      mk(2, "B", "beneficiary", "2026-07-02"),
      mk(3, "C", "other", "2026-07-03"),
    ];
    expect(detectPurge(claims, { windowDays: 14, minCount: 3, theater: "ru", nowIso: NOW })).toBeNull();
  });
  it("escalates severity when doubled", () => {
    const claims = Array.from({ length: 6 }, (_, i) =>
      mk(i + 1, `P${i}`, "defendant", "2026-07-02"));
    const s = detectPurge(claims, { windowDays: 14, minCount: 3, theater: "ru", nowIso: NOW });
    expect(s!.severity).toBe("elevated");
  });
});

describe("detectDataDark", () => {
  it("fires on classified/gone series, escalates on recent change", () => {
    const s = detectDataDark(
      [
        { key: "a", label: "Demographics", status: "classified", changedRecently: true },
        { key: "b", label: "Oil output", status: "gone", changedRecently: false },
        { key: "c", label: "CBR rate", status: "ok", changedRecently: false },
      ],
      "ru", NOW,
    );
    expect(s).not.toBeNull();
    expect(s!.severity).toBe("elevated");
    expect(s!.evidenceRefs).toEqual(["a", "b"]);
  });
  it("silent when nothing dark", () => {
    expect(detectDataDark([{ key: "c", label: "x", status: "ok", changedRecently: false }], "ru", NOW)).toBeNull();
  });
});

describe("detectTradeDivergence", () => {
  it("fires on dual-use flags, ignores All goods", () => {
    const s = detectTradeDivergence(
      [
        { reporterName: "UAE", hsLabel: "Computers", reason: "12.9× baseline" },
        { reporterName: "China", hsLabel: "All goods", reason: "1.7×" },
      ],
      NOW,
    );
    expect(s).not.toBeNull();
    expect(s!.detail).toContain("UAE");
    expect(s!.detail).not.toContain("All goods");
  });
});

describe("rankSignals", () => {
  it("orders elevated before watch before info", () => {
    const sig = (sev: Signal["severity"], kind: string): Signal => ({
      key: kind, kind, theater: "ru", severity: sev, headline: "", detail: "",
      evidenceClaimIds: [], evidenceRefs: [], at: NOW,
    });
    const ranked = rankSignals([sig("info", "a"), sig("elevated", "b"), sig("watch", "c")]);
    expect(ranked.map((s) => s.severity)).toEqual(["elevated", "watch", "info"]);
  });
});

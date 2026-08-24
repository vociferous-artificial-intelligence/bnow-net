import { describe, expect, it } from "vitest";
import { ConflictDomainError } from "./errors";
import {
  parseReferenceReportIdentity,
  validateReferenceReportIdentity,
  type ReferenceReportIdentity,
} from "./reference-report";

// Fixture-shaped identity (synthetic dates; no real report is referenced).
const VALID: ReferenceReportIdentity = {
  series: "iran_update",
  editionKey: "iran_update:2026-08-08:final",
  reportDate: "2026-08-08",
  cutoffAt: "2026-08-08T16:00:00Z",
  publishedAt: "2026-08-08T21:30:00Z",
  scopeVersion: "iran-update-scope-v1",
};

describe("validateReferenceReportIdentity — valid shapes", () => {
  it("accepts the canonical shape", () => {
    expect(validateReferenceReportIdentity(VALID)).toEqual([]);
  });

  it("accepts null cutoffAt and null publishedAt (absent is explicit, never guessed)", () => {
    expect(
      validateReferenceReportIdentity({ ...VALID, cutoffAt: null, publishedAt: null }),
    ).toEqual([]);
  });

  it("accepts a roca identity and non-final edition labels", () => {
    expect(
      validateReferenceReportIdentity({
        series: "roca",
        editionKey: "roca:2026-08-01:evening-2",
        reportDate: "2026-08-01",
        cutoffAt: null,
        publishedAt: "2026-08-02T01:15:00Z",
        scopeVersion: "roca-scope-v1",
      }),
    ).toEqual([]);
  });

  it("accepts explicit-offset instants", () => {
    expect(
      validateReferenceReportIdentity({ ...VALID, cutoffAt: "2026-08-08T19:30:00+03:30" }),
    ).toEqual([]);
  });
});

describe("validateReferenceReportIdentity — rejections", () => {
  it("rejects a non-object", () => {
    expect(validateReferenceReportIdentity(null)).toHaveLength(1);
    expect(validateReferenceReportIdentity("iran_update:2026-08-08:final")).toHaveLength(1);
    expect(validateReferenceReportIdentity([VALID])).toHaveLength(1);
  });

  it("rejects an unknown series", () => {
    const errs = validateReferenceReportIdentity({ ...VALID, series: "isw_daily" });
    expect(errs.some((e) => e.startsWith("series:"))).toBe(true);
  });

  it("rejects a malformed or impossible reportDate", () => {
    for (const bad of ["2026-8-8", "2026-02-30", "08/08/2026", ""]) {
      const errs = validateReferenceReportIdentity({ ...VALID, reportDate: bad });
      expect(errs.some((e) => e.startsWith("reportDate:"))).toBe(true);
    }
  });

  it("rejects an empty or unstructured editionKey", () => {
    for (const bad of ["", "final", "iran_update-2026-08-08-final", "iran_update:2026-08-08", "a:b:c:d"]) {
      const errs = validateReferenceReportIdentity({ ...VALID, editionKey: bad });
      expect(errs.some((e) => e.startsWith("editionKey:"))).toBe(true);
    }
  });

  it("rejects an editionKey whose series segment disagrees with series — one identity can never claim two reports", () => {
    const errs = validateReferenceReportIdentity({
      ...VALID,
      editionKey: "roca:2026-08-08:final",
    });
    expect(errs.some((e) => e.includes("series segment"))).toBe(true);
  });

  it("rejects an editionKey whose date segment disagrees with reportDate", () => {
    const errs = validateReferenceReportIdentity({
      ...VALID,
      editionKey: "iran_update:2026-08-09:final",
    });
    expect(errs.some((e) => e.includes("date segment"))).toBe(true);
  });

  it("rejects malformed cutoffAt/publishedAt — a raw malformed anchor must be normalized through classifyTimeAnchor, never stored", () => {
    for (const field of ["cutoffAt", "publishedAt"] as const) {
      for (const bad of ["around 16:00", "2026-08-08T16:00:00", "2026-08-08", 1786204800000, undefined]) {
        const errs = validateReferenceReportIdentity({ ...VALID, [field]: bad });
        expect(errs.some((e) => e.startsWith(`${field}:`))).toBe(true);
      }
    }
  });

  it("rejects an empty scopeVersion", () => {
    for (const bad of ["", null, undefined]) {
      const errs = validateReferenceReportIdentity({ ...VALID, scopeVersion: bad });
      expect(errs.some((e) => e.startsWith("scopeVersion:"))).toBe(true);
    }
  });

  it("reports EVERY issue, not just the first", () => {
    const errs = validateReferenceReportIdentity({
      series: "nope",
      editionKey: "",
      reportDate: "2026-02-30",
      cutoffAt: "sometime",
      publishedAt: "later",
      scopeVersion: "",
    });
    expect(errs.length).toBeGreaterThanOrEqual(5);
  });
});

describe("parseReferenceReportIdentity", () => {
  it("returns the canonical identity and drops unknown extra keys", () => {
    const parsed = parseReferenceReportIdentity({ ...VALID, extra: "smuggled" });
    expect(parsed).toEqual(VALID);
    expect("extra" in parsed).toBe(false);
  });

  it("throws typed with the precise issues on invalid input", () => {
    expect(() => parseReferenceReportIdentity({ ...VALID, series: "nope" })).toThrowError(
      ConflictDomainError,
    );
    try {
      parseReferenceReportIdentity({ ...VALID, series: "nope" });
    } catch (e) {
      const err = e as ConflictDomainError;
      expect(err.code).toBe("invalid_reference_report");
      expect(err.issues.some((i) => i.startsWith("series:"))).toBe(true);
    }
  });
});

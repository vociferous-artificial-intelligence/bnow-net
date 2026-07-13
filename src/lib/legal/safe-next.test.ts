import { describe, expect, it } from "vitest";
import { safeInternalPath } from "./safe-next";

describe("safeInternalPath — open-redirect guard for the acceptance flow", () => {
  it("accepts rooted internal paths verbatim", () => {
    for (const p of ["/", "/ask", "/digests/ru/2026-07-12", "/account", "/search?q=kyiv"]) {
      expect(safeInternalPath(p)).toBe(p);
    }
  });

  it("rejects external / absolute URLs → '/'", () => {
    for (const p of ["https://evil.com", "http://evil.com/x", "ftp://x", "mailto:a@b.com"]) {
      expect(safeInternalPath(p)).toBe("/");
    }
  });

  it("rejects protocol-relative and backslash tricks → '/'", () => {
    for (const p of ["//evil.com", "/\\evil.com", "\\\\evil.com", "/%2f%2fevil.com"]) {
      expect(safeInternalPath(p)).toBe("/");
    }
  });

  it("rejects control characters and non-strings → '/'", () => {
    expect(safeInternalPath("/x\nSet-Cookie: y")).toBe("/");
    expect(safeInternalPath(null)).toBe("/");
    expect(safeInternalPath(undefined)).toBe("/");
    expect(safeInternalPath("relative/path")).toBe("/"); // not rooted
  });

  it("trims surrounding whitespace before validating", () => {
    expect(safeInternalPath("  /ask  ")).toBe("/ask");
  });
});

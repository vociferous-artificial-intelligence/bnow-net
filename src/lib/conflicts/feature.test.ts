// Phase 6 flag authority: fail-closed default-off semantics, one unambiguous
// ON spelling, and EPHEMERAL in-process injection only (each test restores the
// env it touched — nothing persists).

import { afterEach, describe, expect, it } from "vitest";
import { CONFLICTS_UI_ENV, conflictsUiEnabled, requireConflictsUi } from "./feature";

const original = process.env[CONFLICTS_UI_ENV];

afterEach(() => {
  if (original === undefined) delete process.env[CONFLICTS_UI_ENV];
  else process.env[CONFLICTS_UI_ENV] = original;
});

describe("conflictsUiEnabled", () => {
  it("is OFF when the env is absent (fail-closed default)", () => {
    delete process.env[CONFLICTS_UI_ENV];
    expect(conflictsUiEnabled()).toBe(false);
  });

  it("is ON only for the exact spelling '1'", () => {
    process.env[CONFLICTS_UI_ENV] = "1";
    expect(conflictsUiEnabled()).toBe(true);
  });

  it.each(["", "0", "true", "TRUE", "yes", "on", " 1", "1 "])(
    "stays OFF for %j — no alternate spelling enables",
    (value) => {
      process.env[CONFLICTS_UI_ENV] = value;
      expect(conflictsUiEnabled()).toBe(false);
    },
  );
});

describe("requireConflictsUi", () => {
  it("throws (notFound) when the flag is off", () => {
    delete process.env[CONFLICTS_UI_ENV];
    // next/navigation's notFound() throws its framework control error; the
    // page never proceeds to data access either way
    expect(() => requireConflictsUi()).toThrow();
  });

  it("passes silently when the flag is on", () => {
    process.env[CONFLICTS_UI_ENV] = "1";
    expect(() => requireConflictsUi()).not.toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { resolveCredentials, sessionFingerprint } from "./telegram-login";

// Importing this module must never launch a login: the direct-run guard at the
// bottom of telegram-login.ts is what keeps that true. If these tests ever hang,
// that guard broke.

const HASH = "0".repeat(32);

describe("resolveCredentials", () => {
  // Never the real api_id: Telegram bans app IDs it finds published (API_ID_PUBLISHED_FLOOD).
  it("reads the TELEGRAM_-prefixed names", () => {
    expect(resolveCredentials({ TELEGRAM_API_ID: "12345678", TELEGRAM_API_HASH: HASH })).toEqual({
      apiId: 12345678,
      apiHash: HASH,
    });
  });

  it("falls back to API_ID / API_HASH", () => {
    expect(resolveCredentials({ API_ID: "42", API_HASH: HASH })).toEqual({
      apiId: 42,
      apiHash: HASH,
    });
  });

  it("prefers the TELEGRAM_-prefixed names over the fallback", () => {
    const creds = resolveCredentials({
      TELEGRAM_API_ID: "1",
      TELEGRAM_API_HASH: HASH,
      API_ID: "2",
      API_HASH: "f".repeat(32),
    });
    expect(creds).toEqual({ apiId: 1, apiHash: HASH });
  });

  it("throws when either credential is absent", () => {
    expect(() => resolveCredentials({})).toThrow(/Missing TELEGRAM_API_ID/);
    expect(() => resolveCredentials({ TELEGRAM_API_ID: "1" })).toThrow(/Missing/);
    expect(() => resolveCredentials({ TELEGRAM_API_HASH: HASH })).toThrow(/Missing/);
  });

  it("rejects a non-numeric or non-positive api_id", () => {
    expect(() => resolveCredentials({ TELEGRAM_API_ID: "abc", TELEGRAM_API_HASH: HASH })).toThrow(
      /positive integer/,
    );
    expect(() => resolveCredentials({ TELEGRAM_API_ID: "0", TELEGRAM_API_HASH: HASH })).toThrow(
      /positive integer/,
    );
    expect(() => resolveCredentials({ TELEGRAM_API_ID: "1.5", TELEGRAM_API_HASH: HASH })).toThrow(
      /positive integer/,
    );
  });

  it("rejects an api_hash that is not 32 hex characters", () => {
    expect(() => resolveCredentials({ TELEGRAM_API_ID: "1", TELEGRAM_API_HASH: "nope" })).toThrow(
      /32 hex/,
    );
    // right length, wrong alphabet — 'z' is not hex
    expect(() =>
      resolveCredentials({ TELEGRAM_API_ID: "1", TELEGRAM_API_HASH: "z".repeat(32) }),
    ).toThrow(/32 hex/);
  });

  it("accepts an uppercase api_hash", () => {
    const upper = "A".repeat(32);
    expect(resolveCredentials({ TELEGRAM_API_ID: "1", TELEGRAM_API_HASH: upper }).apiHash).toBe(upper);
  });
});

describe("sessionFingerprint", () => {
  it("is a stable 12-char hex prefix that does not leak its input", () => {
    const fp = sessionFingerprint("supersecret-session");
    expect(fp).toMatch(/^[0-9a-f]{12}$/);
    expect(fp).toBe(sessionFingerprint("supersecret-session"));
    expect("supersecret-session").not.toContain(fp);
  });

  it("separates distinct sessions", () => {
    expect(sessionFingerprint("a")).not.toBe(sessionFingerprint("b"));
  });
});

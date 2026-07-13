// Pure validation for the /access beta-request form. No DB, no fetch — the
// LinkedIn URL is stored exactly as volunteered and NEVER fetched, scraped,
// previewed, or enriched (sprint rule; privacy posture depends on it).

export const EMAIL_MAX = 200;
export const LINKEDIN_MAX = 300;
export const USE_CASE_MAX = 1000;

/** Lowercased, trimmed email or null when it isn't a plausible address. */
export function normalizeAccessEmail(raw: unknown): string | null {
  const email = String(raw ?? "").trim().toLowerCase();
  if (!email || email.length > EMAIL_MAX) return null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
  return email;
}

/**
 * Accepts a voluntarily provided linkedin.com profile/company URL and nothing else.
 * Returns the normalized https:// URL, null for empty input, or "invalid".
 *
 * Rules: https only (a bare "linkedin.com/in/x" gets the scheme prepended as a
 * convenience; any explicit non-https scheme is rejected), no embedded
 * credentials, no port, and the host must be linkedin.com or a TRUE subdomain
 * (suffix ".linkedin.com" — "evil-linkedin.com" and "linkedin.com.evil.com"
 * both fail). Path is not constrained beyond the host check: /in/ and
 * /company/ URLs are the expected shapes, but the threat model is lookalike
 * hosts, not paths.
 */
export function validateLinkedinUrl(raw: unknown): string | null | "invalid" {
  const input = String(raw ?? "").trim();
  if (!input) return null;
  if (input.length > LINKEDIN_MAX) return "invalid";
  // An explicit scheme other than https (http:, javascript:, ftp:, …) is rejected
  // before the convenience prefix. The scheme charset includes dots, so a bare
  // "linkedin.com:8080/…" also lands here — ports are rejected either way.
  if (/^[a-z][a-z0-9+.-]*:/i.test(input) && !/^https:\/\//i.test(input)) return "invalid";
  const candidate = /^https:\/\//i.test(input) ? input : `https://${input}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return "invalid";
  }
  if (url.protocol !== "https:") return "invalid";
  if (url.username !== "" || url.password !== "") return "invalid";
  if (url.port !== "") return "invalid";
  const host = url.hostname.toLowerCase();
  if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return "invalid";
  return url.toString();
}

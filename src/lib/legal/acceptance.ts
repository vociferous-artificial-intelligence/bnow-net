// Server-only helpers for the append-only legal-acceptance record. The authoritative user
// reference is `users.id` (never email), resolved from the verified session email at the call
// site. Timestamps are ALWAYS database-generated (`accepted_at DEFAULT now()`) — the browser
// clock never touches an acceptance row.
//
// `@/db` requires DATABASE_URL at module load, so — exactly like src/lib/gate.ts — the client
// is imported lazily. That keeps this module importable in unit tests and client-adjacent
// graphs without a live database.
//
// Fail-closed posture: every read that decides "has this user accepted?" returns `false` on
// any error (missing table, transient DB blip). Enforcement then routes the user through the
// acceptance screen rather than silently granting subscriber access. The acceptance screen
// itself degrades to showing the form (not a redirect loop) when the same read fails.

import {
  ACCEPTANCE_METHOD,
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from "./policies";

// Lazy DB handle (mirrors gate.ts) so importing this module never requires DATABASE_URL.
async function rawSql() {
  return (await import("@/db")).rawSql;
}

/** Row shape for a user's current-version acceptance, as the account page renders it. */
export interface AcceptanceRecord {
  termsVersion: string;
  privacyVersion: string;
  acceptedAt: string;
  analyticsPreference: AnalyticsPreference;
}

export type AnalyticsPreference = "unset" | "granted" | "denied";
export type AnalyticsDecision = Exclude<AnalyticsPreference, "unset">;

export function isAnalyticsDecision(value: unknown): value is AnalyticsDecision {
  return value === "granted" || value === "denied";
}

/**
 * Has this user (by id) accepted the CURRENT Terms + Privacy version pair? Old version pairs
 * do NOT satisfy the check — a version bump forces re-acceptance (isCurrentVersions in the
 * SQL predicate). Fail-closed to `false`.
 */
export async function hasCurrentPolicyAcceptance(userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const sql = await rawSql();
    const rows = (await sql.query(
      `SELECT 1 FROM policy_acceptances
       WHERE user_id = $1 AND terms_version = $2 AND privacy_version = $3
       LIMIT 1`,
      [userId, CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION],
    )) as unknown[];
    return rows.length > 0;
  } catch {
    return false; // fail closed: unknown acceptance state → treat as not accepted
  }
}

/**
 * Same check, resolving the user by verified session email. Used by the gate and the pages that
 * only hold an email (home, signals, account). Fail-closed to `false`.
 */
export async function hasCurrentAcceptanceByEmail(email: string): Promise<boolean> {
  if (!email) return false;
  try {
    const sql = await rawSql();
    const rows = (await sql.query(
      `SELECT 1 FROM policy_acceptances pa
       JOIN users u ON u.id = pa.user_id
       WHERE u.email = $1 AND pa.terms_version = $2 AND pa.privacy_version = $3
       LIMIT 1`,
      [email, CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION],
    )) as unknown[];
    return rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * The user's CURRENT-version acceptance for display on the account page (versions + the
 * server-generated timestamp). Returns null if none exists or on error.
 */
export async function currentAcceptanceForEmail(
  email: string,
): Promise<AcceptanceRecord | null> {
  if (!email) return null;
  try {
    const sql = await rawSql();
    const rows = (await sql.query(
      `SELECT pa.terms_version, pa.privacy_version, pa.accepted_at::text AS accepted_at,
              u.analytics_preference
       FROM policy_acceptances pa
       JOIN users u ON u.id = pa.user_id
       WHERE u.email = $1 AND pa.terms_version = $2 AND pa.privacy_version = $3
       ORDER BY pa.accepted_at DESC
       LIMIT 1`,
      [email, CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION],
    )) as Array<{
      terms_version: string;
      privacy_version: string;
      accepted_at: string;
      analytics_preference: AnalyticsPreference;
    }>;
    const r = rows[0];
    return r
      ? {
          termsVersion: r.terms_version,
          privacyVersion: r.privacy_version,
          acceptedAt: r.accepted_at,
          analyticsPreference:
            r.analytics_preference === "granted" || r.analytics_preference === "denied"
              ? r.analytics_preference
              : "unset",
        }
      : null;
  } catch {
    return null;
  }
}

export interface RecordAcceptanceInput {
  /** Verified session email — the ONLY identity input; the user id is resolved server-side. */
  email: string;
  adultAttested: boolean;
  privacyAcknowledged: boolean;
  /** Active locale, if known; nullable by design. */
  locale?: string | null;
  /** Optional analytics is independent of legal acceptance. Missing means an explicit denial. */
  analyticsPreference?: AnalyticsDecision;
}

export type RecordAcceptanceResult =
  | { ok: true; acceptedAt: string }
  | { ok: false; error: "no_user" | "db_error" | "invalid_attestation" };

/**
 * Insert one append-only acceptance row for the CURRENT version pair. Idempotent: a repeat for
 * the same (user, terms_version, privacy_version) is a no-op via the unique constraint, and we
 * still return the originally stored timestamp. NEVER stores IP, user-agent, session/verification
 * tokens, question content, or a birth date. `accepted_at` is DB-generated (DEFAULT now()).
 */
export async function recordAcceptance(
  input: RecordAcceptanceInput,
): Promise<RecordAcceptanceResult> {
  const { email, adultAttested, privacyAcknowledged, locale } = input;
  const analyticsPreference: AnalyticsDecision =
    input.analyticsPreference === "granted" ? "granted" : "denied";
  // Record-integrity invariant: an acceptance row MUST attest both. The only caller
  // (acceptAction) already validates this, but assert here so no future caller can persist a
  // row with a false attestation — an acceptance record that doesn't attest isn't an acceptance.
  if (!adultAttested || !privacyAcknowledged) return { ok: false, error: "invalid_attestation" };
  try {
    const sql = await rawSql();
    // One statement makes the append-only acceptance and the optional preference decision
    // atomic. In particular, a prior grant cannot survive a successful Privacy re-acceptance
    // whose optional box is now unchecked. `accepted_at` remains DB-generated.
    const rows = (await sql.query(
      `WITH target AS (
         SELECT id FROM users WHERE email = $1 LIMIT 1
       ), accepted AS (
         INSERT INTO policy_acceptances
           (user_id, terms_version, privacy_version, adult_attested, privacy_acknowledged,
            acceptance_method, locale)
         SELECT id, $2, $3, $4, $5, $6, $7 FROM target
         ON CONFLICT (user_id, terms_version, privacy_version) DO NOTHING
         RETURNING accepted_at
       ), preference AS (
         UPDATE users
         SET analytics_preference = $8, analytics_preference_updated_at = now()
         WHERE id = (SELECT id FROM target)
         RETURNING id
       )
       SELECT target.id AS user_id,
              COALESCE(
                (SELECT accepted_at::text FROM accepted LIMIT 1),
                (SELECT pa.accepted_at::text
                 FROM policy_acceptances pa
                 WHERE pa.user_id = target.id
                   AND pa.terms_version = $2
                   AND pa.privacy_version = $3
                 LIMIT 1)
              ) AS accepted_at,
              (SELECT id FROM preference LIMIT 1) AS preference_user_id
       FROM target`,
      [
        email,
        CURRENT_TERMS_VERSION,
        CURRENT_PRIVACY_VERSION,
        adultAttested,
        privacyAcknowledged,
        ACCEPTANCE_METHOD,
        locale ?? null,
        analyticsPreference,
      ],
    )) as Array<{ user_id: string; accepted_at: string | null; preference_user_id: string | null }>;
    const stored = rows[0];
    if (!stored) return { ok: false, error: "no_user" };
    if (!stored.preference_user_id) return { ok: false, error: "db_error" };
    const acceptedAt = stored.accepted_at;
    if (!acceptedAt) return { ok: false, error: "db_error" };
    return { ok: true, acceptedAt };
  } catch {
    return { ok: false, error: "db_error" };
  }
}

export type UpdateAnalyticsPreferenceResult =
  | { ok: true; preference: AnalyticsDecision }
  | { ok: false; error: "invalid_preference" | "no_user" | "db_error" };

/** Authoritative Account-page preference update. The timestamp is always DB-generated. */
export async function updateAnalyticsPreferenceForEmail(
  email: string,
  preference: unknown,
): Promise<UpdateAnalyticsPreferenceResult> {
  if (!isAnalyticsDecision(preference)) {
    return { ok: false, error: "invalid_preference" };
  }
  if (!email) return { ok: false, error: "no_user" };
  try {
    const sql = await rawSql();
    const rows = (await sql.query(
      `UPDATE users
       SET analytics_preference = $2, analytics_preference_updated_at = now()
       WHERE email = $1
       RETURNING analytics_preference`,
      [email, preference],
    )) as Array<{ analytics_preference: AnalyticsDecision }>;
    return rows[0]
      ? { ok: true, preference: rows[0].analytics_preference }
      : { ok: false, error: "no_user" };
  } catch {
    return { ok: false, error: "db_error" };
  }
}

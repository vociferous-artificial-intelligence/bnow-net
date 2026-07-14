import { cache } from "react";
import { currentUserEmail } from "@/lib/session";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from "@/lib/legal/policies";
import type { AnalyticsRole } from "./events";

export interface AnalyticsIdentity {
  distinctId: string;
  role: AnalyticsRole;
  signupAt: string;
  betaCohort: "private_beta_2026_07";
}

export const currentAnalyticsIdentity = cache(async (): Promise<AnalyticsIdentity | null> => {
  const email = await currentUserEmail();
  if (!email) return null;
  try {
    const { rawSql } = await import("@/db");
    const rows = (await rawSql.query(
      `SELECT u.id, u.role, u.created_at::text AS created_at
       FROM users u
       JOIN policy_acceptances pa ON pa.user_id = u.id
       WHERE u.email = $1
         AND u.analytics_preference = 'granted'
         AND pa.terms_version = $2 AND pa.privacy_version = $3
       LIMIT 1`,
      [email, CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION],
    )) as Array<{ id: string; role: string; created_at: string }>;
    const row = rows[0];
    if (!row || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.id)) return null;
    const role: AnalyticsRole = row.role === "analyst" || row.role === "admin" ? row.role : "user";
    return { distinctId: row.id, role, signupAt: row.created_at, betaCohort: "private_beta_2026_07" };
  } catch {
    return null;
  }
});

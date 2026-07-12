import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// Core-content gate. Enabled with FEATURE_AUTH_GATE=true (production).
// Public surface stays open (marketing): landing, pricing, scoreboard, datadark,
// health. Gated (have a layout.tsx calling requireUser): digests, registry,
// entities. /admin additionally requires an allowlisted email (ADMIN_EMAILS).

export async function requireUser(): Promise<{ email: string } | null> {
  if (process.env.FEATURE_AUTH_GATE !== "true") return null; // gate off
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect("/signin");
  return { email };
}

export async function requireAdmin(): Promise<void> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  const allow = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (process.env.FEATURE_AUTH_GATE !== "true" && allow.length === 0) return;
  if (!email) redirect("/signin");
  if (allow.length > 0 && !allow.includes(email)) redirect("/");
}

// ---------- role gate (additive; users.role ships in migration 0014, NOT YET
// applied to the live DB as of this writing) ----------
//
// Hierarchy user < analyst < admin. Role is looked up by session email, never
// carried in the JWT (sessions are database-strategy). Until an operator runs
// the migration, `users.role` does not exist in prod: every DB read below is
// wrapped so it degrades to "user" rather than throwing.

export type Role = "user" | "analyst" | "admin";

const ROLE_RANK: Record<Role, number> = { user: 0, analyst: 1, admin: 2 };

export function roleAtLeast(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

function isRole(value: unknown): value is Role {
  return value === "user" || value === "analyst" || value === "admin";
}

// Same allowlist parsing as requireAdmin, kept as its own small copy rather
// than a shared extraction so requireAdmin's existing behavior is untouched.
function adminAllowlist(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// @/db requires DATABASE_URL at module load; import it lazily (matches
// src/lib/usage/spend-guard.ts) so gate.ts stays importable without a DB.
async function rawSql() {
  return (await import("@/db")).rawSql;
}

export async function currentRole(): Promise<Role | "anon"> {
  // Gate-off dev parity: with the gate off, requireUser() already lets everyone
  // into every gated page, so the open posture here (treat everyone as admin)
  // is consistent rather than introducing a second, narrower gate.
  if (process.env.FEATURE_AUTH_GATE !== "true") return "admin";
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return "anon";
  if (adminAllowlist().includes(email)) return "admin"; // bootstrap, works pre-migration
  try {
    const sql = await rawSql();
    const rows = (await sql.query("SELECT role FROM users WHERE email = $1", [email])) as Array<{
      role?: string | null;
    }>;
    const role = rows[0]?.role;
    return isRole(role) ? role : "user"; // unknown/null/missing-row -> reduced view
  } catch {
    return "user"; // e.g. the role column isn't migrated yet in this environment
  }
}

export async function requireRole(min: Role): Promise<void> {
  if (process.env.FEATURE_AUTH_GATE !== "true") return; // gate off
  const role = await currentRole();
  if (role === "anon") redirect("/signin");
  if (!roleAtLeast(role, min)) redirect("/");
}

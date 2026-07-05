import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// Core-content gate. Enabled with FEATURE_AUTH_GATE=true (production).
// Public surface stays open: landing, pricing, scoreboard (marketing needs it),
// health. Gated: digests, registry, entities. /admin additionally requires an
// allowlisted email (ADMIN_EMAILS, comma-separated).

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

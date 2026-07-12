import { requireAdminOr404 } from "@/lib/gate";

// R5: the source registry is admin-only. Non-admins (any lower role, or signed
// out) get a 404 — not a redirect to /signin — so the gate doesn't advertise
// what it's hiding.
export default async function GatedLayout({ children }: { children: React.ReactNode }) {
  await requireAdminOr404();
  return <>{children}</>;
}

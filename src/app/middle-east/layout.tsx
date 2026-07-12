import { requireAdminOr404 } from "@/lib/gate";

// R5: the Middle East source registry is admin-only, same gate and rationale
// as src/app/registry/layout.tsx.
export default async function GatedLayout({ children }: { children: React.ReactNode }) {
  await requireAdminOr404();
  return <>{children}</>;
}

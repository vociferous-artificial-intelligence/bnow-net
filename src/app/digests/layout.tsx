import { requireUser } from "@/lib/gate";

export default async function GatedLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <>{children}</>;
}

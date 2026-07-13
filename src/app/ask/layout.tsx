import { requireAcceptedUser } from "@/lib/gate";

export default async function GatedLayout({ children }: { children: React.ReactNode }) {
  await requireAcceptedUser();
  return <>{children}</>;
}

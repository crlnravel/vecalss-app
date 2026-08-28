import type { Metadata } from "next";
import { requireAdminSession } from "@/lib/auth/access";
import { AiProvidersPageModule } from "@/modules/admin/ai/AiProvidersPageModule";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Provider & Routing Vera AI | Vecalss Admin",
};

export default async function AdminAiProvidersPage() {
  const session = await requireAdminSession();
  return <AiProvidersPageModule session={session} />;
}

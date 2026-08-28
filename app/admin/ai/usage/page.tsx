import type { Metadata } from "next";
import { requireAdminSession } from "@/lib/auth/access";
import { AiUsagePageModule } from "@/modules/admin/ai/AiUsagePageModule";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vera AI Pemakaian | Vecalss Admin",
};

export default async function AdminAiUsagePage() {
  const session = await requireAdminSession();
  return <AiUsagePageModule session={session} />;
}

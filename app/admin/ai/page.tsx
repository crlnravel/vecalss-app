import type { Metadata } from "next";
import { requireAdminSession } from "@/lib/auth/access";
import { veraAiControlPlaneService } from "@/lib/admin/ai/service";
import { AiOverviewPageModule } from "@/modules/admin/ai/AiOverviewPageModule";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vera AI Overview | Vecalss Admin",
};

export default async function AdminAiOverviewPage() {
  const session = await requireAdminSession();
  const initialData = await veraAiControlPlaneService.getOverview().catch(() => null);

  return <AiOverviewPageModule session={session} initialData={initialData} />;
}

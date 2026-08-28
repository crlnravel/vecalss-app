import type { Metadata } from "next";
import { requireAdminSession } from "@/lib/auth/access";
import { AiReliabilityPageModule } from "@/modules/admin/ai/AiReliabilityPageModule";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Keandalan & Insiden Vera AI | Vecalss Admin",
};

export default async function AdminAiReliabilityPage() {
  const session = await requireAdminSession();
  return <AiReliabilityPageModule session={session} />;
}

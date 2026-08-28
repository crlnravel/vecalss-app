import type { Metadata } from "next";
import { requireAdminSession } from "@/lib/auth/access";
import { AiPoliciesPageModule } from "@/modules/admin/ai/AiPoliciesPageModule";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Policy Governance Vera AI | Vecalss Admin",
};

export default async function AdminAiPoliciesPage() {
  const session = await requireAdminSession();
  return <AiPoliciesPageModule session={session} />;
}

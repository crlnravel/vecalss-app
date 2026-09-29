import type { Metadata } from "next";

import { actorFromSession } from "@/lib/admin/ai-policy/http";
import { createAiPolicyCommandService } from "@/lib/admin/ai-policy/service";
import { requireAdminSession } from "@/lib/auth/access";
import { AiPolicyPageModule } from "@/modules/admin/AiPolicyPageModule";
import { PortalShell } from "@/modules/portal/components/portal-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kebijakan Vera AI | Vecalss Admin",
};

export default async function AdminAiPoliciesPage() {
  const session = await requireAdminSession();
  const policyMetadata = await createAiPolicyCommandService().getMetadata(actorFromSession(session));

  return (
    <PortalShell
      activeAdminSection="ai"
      audience="admin"
      description="Kelola kebijakan Vera AI, tinjau dampaknya, atur jadwal, dan lihat riwayat perubahannya."
      session={session}
      title="Kebijakan & Tata Kelola"
    >
      <AiPolicyPageModule metadata={policyMetadata} />
    </PortalShell>
  );
}

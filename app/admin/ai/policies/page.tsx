import type { Metadata } from "next";

import { actorFromSession } from "@/lib/admin/ai-policy/http";
import { createAiPolicyCommandService } from "@/lib/admin/ai-policy/service";
import { requireAdminSession } from "@/lib/auth/access";
import { AiPolicyPageModule } from "@/modules/admin/AiPolicyPageModule";
import { PortalShell } from "@/modules/portal/components/portal-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Policy Governance Vera AI | Vecalss Admin",
};

export default async function AdminAiPoliciesPage() {
  const session = await requireAdminSession();
  const policyMetadata = await createAiPolicyCommandService().getMetadata(actorFromSession(session));

  return (
    <PortalShell
      activeAdminSection="ai"
      audience="admin"
      description="Tata kelola kebijakan versi terbitan, preview dampak, persetujuan, penjadwalan, dan audit Vera AI."
      session={session}
      title="Kebijakan & Tata Kelola"
    >
      <AiPolicyPageModule metadata={policyMetadata} />
    </PortalShell>
  );
}

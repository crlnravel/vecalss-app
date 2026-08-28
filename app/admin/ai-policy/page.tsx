import type { Metadata } from "next";

import { requireAdminSession } from "@/lib/auth/access";
import { actorFromSession } from "@/lib/admin/ai-policy/http";
import { createAiPolicyCommandService } from "@/lib/admin/ai-policy/service";
import { AiPolicyPageModule } from "@/modules/admin/AiPolicyPageModule";
import { PortalShell } from "@/modules/portal/components/portal-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vera AI Policy | Vecalss LMS",
};

export default async function AiPolicyPage() {
  const session = await requireAdminSession();
  const policyMetadata = await createAiPolicyCommandService().getMetadata(actorFromSession(session));

  return (
    <PortalShell
      activeAdminSection="ai-policy"
      audience="admin"
      description="Versioned, restricted Vera AI policy console."
      session={session}
      title="Vera AI policy"
    >
      <AiPolicyPageModule metadata={policyMetadata} />
    </PortalShell>
  );
}


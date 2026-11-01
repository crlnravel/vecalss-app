import type { Metadata } from "next";

import { requireAdminSession } from "@/lib/auth/access";
import { PortalShell } from "@/modules/portal/components/portal-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pemakaian Vera AI | PTN Pro Admin",
};

export default async function AdminAiUsagePage() {
  const session = await requireAdminSession();

  return (
    <PortalShell activeAdminSection="ai-usage" audience="admin" description="Pemakaian Vera AI." session={session} title="Pemakaian">
      <p className="text-sm text-muted-foreground">Data pemakaian Vera AI sedang disiapkan.</p>
    </PortalShell>
  );
}

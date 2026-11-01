import type { Metadata } from "next";

import { requireAdminSession } from "@/lib/auth/access";
import { PortalShell } from "@/modules/portal/components/portal-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ringkasan Vera AI | PTN Pro Admin",
};

export default async function AdminAiOverviewPage() {
  const session = await requireAdminSession();

  return (
    <PortalShell activeAdminSection="ai" audience="admin" description="Ringkasan pemakaian Vera AI." session={session} title="Ringkasan">
      <p className="text-sm text-muted-foreground">Ringkasan Vera AI sedang disiapkan.</p>
    </PortalShell>
  );
}

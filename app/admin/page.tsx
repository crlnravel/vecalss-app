import type { Metadata } from "next";

import { requireAdminSession } from "@/lib/auth/access";
import { getAdminOperationsSnapshot } from "@/lib/admin/operations";
import { OperationsConsoleModule } from "@/modules/admin/OperationsConsoleModule";
import { PortalShell } from "@/modules/portal/components/portal-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard Admin | Vecalss LMS",
};

export default async function AdminHomePage() {
  const session = await requireAdminSession();
  const snapshot = await getAdminOperationsSnapshot();

  return (
    <PortalShell
      activeAdminSection="overview"
      audience="admin"
       description="Aktivitas terbaru dan ringkasan operasional."
      session={session}
      title="Dashboard"
    >
      <OperationsConsoleModule
        snapshot={snapshot}
      />
    </PortalShell>
  );
}

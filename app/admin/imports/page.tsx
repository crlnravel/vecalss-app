import type { Metadata } from "next";

import { requireAdminSession } from "@/lib/auth/access";
import { ImportsIntakeModule } from "@/modules/admin/imports/ImportsIntakeModule";
import { PortalShell } from "@/modules/portal/components/portal-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Imports | Vecalss LMS",
};

export default async function AdminImportsPage() {
  const session = await requireAdminSession();

  return (
    <PortalShell
      activeAdminSection="imports"
      audience="admin"
      description="Preview and process student or Kapten rosters."
      session={session}
      title="Imports"
    >
      <div className="space-y-6">
        <h1 className="sr-only">Imports</h1>
        <ImportsIntakeModule />
      </div>
    </PortalShell>
  );
}

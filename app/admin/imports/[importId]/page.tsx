import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EnrollmentImportPreviewError, getEnrollmentImportStatus } from "@/lib/admin/imports/service";
import { parseUuid } from "@/lib/admin/operations/validation";
import { requireAdminSession } from "@/lib/auth/access";
import { ImportDetailModule } from "@/modules/admin/imports/ImportDetailModule";
import { PortalShell } from "@/modules/portal/components/portal-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Import review | Vecalss LMS",
};

export default async function AdminImportDetailPage({
  params,
}: {
  params: Promise<{ importId: string }>;
}) {
  const { importId: rawImportId } = await params;
  const importId = parseUuid(rawImportId);
  if (!importId) notFound();
  const session = await requireAdminSession(
    `/admin/login?notice=signed-out&returnTo=${encodeURIComponent(`/admin/imports/${importId}`)}`,
  );

  let importStatus;
  try {
    importStatus = await getEnrollmentImportStatus({
      actorUserId: session.user.id,
      importId,
    });
  } catch (error) {
    if (error instanceof EnrollmentImportPreviewError && error.code === "import_not_found") {
      notFound();
    }
    throw error;
  }

  return (
    <PortalShell
      activeAdminSection="imports"
      audience="admin"
      description="Review rows and release the next handoff."
      session={session}
      title="Import review"
    >
      <ImportDetailModule initialImport={importStatus} />
    </PortalShell>
  );
}

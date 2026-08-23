import type { Metadata } from "next";

import { requireAdminSession } from "@/lib/auth/access";
import { getAdminAuditLogPage } from "@/lib/admin/operations";
import { parseAuditLogParams } from "@/lib/admin/operations/audit-query";
import { AuditLogsPageModule } from "@/modules/admin/AuditLogsPageModule";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Audit logs | Vecalss LMS",
};

export default async function AdminAuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requireAdminSession();
  const params = await searchParams;
  const auditQuery = parseAuditLogParams({
    direction: params.direction,
    page: params.page,
    q: params.q,
    sort: params.sort,
    targetType: params.targetType,
  });
  const auditLogPage = await getAdminAuditLogPage({
    direction: auditQuery.direction,
    page: auditQuery.page,
    query: auditQuery.query,
    sort: auditQuery.sort,
    targetType: auditQuery.targetType,
  });

  return <AuditLogsPageModule {...auditQuery} session={session} {...auditLogPage} />;
}

import type { Metadata } from "next";

import { requireAdminSession } from "@/lib/auth/access";
import { getAdminAuditLogPage } from "@/lib/admin/operations";
import { parseAuditLogParams } from "@/lib/admin/operations/audit-query";
import { AuditLogsPageModule } from "@/modules/admin/AuditLogsPageModule";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Riwayat audit | Vecalss LMS",
};

export default async function AdminAuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requireAdminSession();
  const params = await searchParams;
  const auditQuery = parseAuditLogParams({
    range: params.range,
    page: params.page,
    q: params.q,
    targetType: params.targetType,
  });
  const auditLogPage = await getAdminAuditLogPage({
    range: auditQuery.range,
    direction: auditQuery.direction,
    page: auditQuery.page,
    query: auditQuery.query,
    sort: auditQuery.sort,
    targetType: auditQuery.targetType,
  });

  return <AuditLogsPageModule {...auditQuery} now={new Date().toISOString()} session={session} {...auditLogPage} />;
}

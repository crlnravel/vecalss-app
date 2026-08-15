import type { Metadata } from "next";

import { requireAdminSession } from "@/lib/auth/access";
import { getAdminAuditLogPage } from "@/lib/admin/operations";
import { AuditLogsPageModule } from "@/modules/admin/AuditLogsPageModule";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Audit logs | Vecalss LMS",
};

function readPage(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  const page = Number.parseInt(candidate ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export default async function AdminAuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requireAdminSession();
  const params = await searchParams;
  const auditLogPage = await getAdminAuditLogPage({ page: readPage(params.page) });

  return <AuditLogsPageModule session={session} {...auditLogPage} />;
}

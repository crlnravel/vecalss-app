import type { Metadata } from "next";

import { requireAdminSession } from "@/lib/auth/access";
import { getAdminOperationsSnapshot } from "@/lib/admin/operations";
import { prisma } from "@/lib/prisma";
import { OperationsConsoleModule } from "@/modules/admin/OperationsConsoleModule";
import type { OperationKey } from "@/modules/admin/OperationsConsoleModule";
import { PortalShell } from "@/modules/portal/components/portal-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin Dashboard | Vecalss LMS",
};

const operationKeys: OperationKey[] = ["add-student", "add-kapten", "import-roster", "exceptions"];

function readOperation(value: string | string[] | undefined): OperationKey | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && operationKeys.includes(candidate as OperationKey)
    ? candidate as OperationKey
    : undefined;
}

export default async function AdminHomePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requireAdminSession();
  const params = await searchParams;
  const operation = readOperation(params.operation);
  const [snapshot, examEvents] = await Promise.all([
    getAdminOperationsSnapshot(),
    prisma.examEvent.findMany({
      orderBy: [{ examDate: "asc" }, { name: "asc" }],
      where: { isActive: true },
    }),
  ]);

  return (
    <PortalShell
      activeAdminSection="overview"
      audience="admin"
      description="Quick actions and recent activity."
      session={session}
      title="Dashboard"
    >
      <OperationsConsoleModule
        examEvents={examEvents}
        selectedOperation={operation}
        snapshot={snapshot}
      />
    </PortalShell>
  );
}

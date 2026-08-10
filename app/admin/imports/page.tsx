import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2, CircleAlert, FileClock } from "@/lib/icons";

import { EnrollmentImportRole, EnrollmentImportStatus } from "@/generated/prisma/client";
import { requireAdminSession } from "@/lib/auth/access";
import { parseUuid } from "@/lib/admin/operations/validation";
import { prisma } from "@/lib/prisma";
import { ImportsIntakeModule } from "@/modules/admin/imports/ImportsIntakeModule";
import { PortalShell } from "@/modules/portal/components/portal-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Imports | Vecalss LMS",
};

function importStatusLabel(status: EnrollmentImportStatus) {
  switch (status) {
    case EnrollmentImportStatus.draft:
      return "Draft needs review";
    case EnrollmentImportStatus.partial:
      return "Partially complete";
    case EnrollmentImportStatus.failed:
      return "Import failed";
    case EnrollmentImportStatus.queued:
      return "Queued";
    case EnrollmentImportStatus.processing:
      return "Processing";
    case EnrollmentImportStatus.completed:
      return "Completed";
    case EnrollmentImportStatus.cancelled:
      return "Cancelled";
    default:
      return status;
  }
}

function statusTone(status: EnrollmentImportStatus) {
  if (status === EnrollmentImportStatus.draft || status === EnrollmentImportStatus.partial || status === EnrollmentImportStatus.failed) {
    return "warning" as const;
  }
  if (status === EnrollmentImportStatus.completed) {
    return "success" as const;
  }
  return "neutral" as const;
}

function formatUpdatedAt(value: Date) {
  return value.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export default async function AdminImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requireAdminSession();
  const params = await searchParams;
  const focus = typeof params.focus === "string" ? parseUuid(params.focus) : null;
  const imports = await prisma.enrollmentImport.findMany({
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: {
      createdAt: true,
      id: true,
      role: true,
      rowCount: true,
      sourceFilename: true,
      status: true,
      templateVersion: true,
      updatedAt: true,
    },
    take: 50,
    where: { createdByUserId: session.user.id },
  });

  return (
    <PortalShell
      activeAdminSection="imports"
      audience="admin"
      description="Choose a role, preview every row, and keep the account handoff visible from upload through completion."
      title="Imports"
      userLabel={session.user.fullName}
    >
      <div className="space-y-6">
        <ImportsIntakeModule />

        <section aria-labelledby="imports-list-heading" className="rounded-[24px] border border-[#d6e5db] bg-white p-5 shadow-[0_20px_46px_-42px_rgba(1,76,56,0.6)] sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-bold tracking-[-0.03em] text-[#173c2d]" id="imports-list-heading">Your recent imports</h2>
              <p className="mt-1 text-sm leading-6 text-[#5f776a]">Open a draft to resolve rows, or return to a queued result without losing its context.</p>
            </div>
            <span className="inline-flex w-fit rounded-full bg-[#eef8f1] px-3 py-1.5 text-xs font-bold text-[#176b4d]">{imports.length} shown</span>
          </div>

          {imports.length === 0 ? (
            <div className="mt-5 rounded-[18px] border border-dashed border-[#c9dfd0] bg-[#f8fcf9] px-4 py-8 text-center">
              <FileClock aria-hidden="true" className="mx-auto text-[#2f8a5d]" size={22} />
              <p className="mt-2 text-sm font-bold text-[#173c2d]">No imports have been recorded.</p>
              <p className="mt-1 text-xs leading-5 text-[#5f776a]">Start a role-scoped preview above when a roster is ready.</p>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-[#d6e5db] text-xs font-bold text-[#5f776a]">
                  <tr>
                    <th className="px-3 py-3 font-bold">File</th>
                    <th className="px-3 py-3 font-bold">Role</th>
                    <th className="px-3 py-3 font-bold">Rows</th>
                    <th className="px-3 py-3 font-bold">Status</th>
                    <th className="px-3 py-3 font-bold">Updated</th>
                    <th className="px-3 py-3 text-right font-bold"><span className="sr-only">Action</span></th>
                  </tr>
                </thead>
                <tbody>
                  {imports.map((item) => {
                    const focused = focus === item.id;
                    const tone = statusTone(item.status);
                    const icon = tone === "warning"
                      ? <CircleAlert aria-hidden="true" size={14} />
                      : tone === "success"
                        ? <CheckCircle2 aria-hidden="true" size={14} />
                        : <FileClock aria-hidden="true" size={14} />;

                    return (
                      <tr className={`border-b border-[#e7f0ea] last:border-b-0 ${focused ? "bg-[#eef8f1]" : ""}`} id={`import-${item.id}`} key={item.id}>
                        <td className="max-w-[240px] truncate px-3 py-3 font-semibold text-[#173c2d]">
                          <Link className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73bc8a]" href={`/admin/imports/${item.id}`}>
                            {item.sourceFilename}
                          </Link>
                          <span className="mt-0.5 block text-xs font-normal text-[#8aa997]">{item.templateVersion}</span>
                        </td>
                        <td className="px-3 py-3 text-[#5f776a]">{item.role === EnrollmentImportRole.tutor ? "Kapten" : "Students"}</td>
                        <td className="px-3 py-3 text-[#5f776a]">{item.rowCount}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${tone === "warning" ? "bg-[#fff5cf] text-[#725400]" : tone === "success" ? "bg-[#eef8f1] text-[#176b4d]" : "bg-[#f1f5f2] text-[#506a5d]"}`}>
                            {icon}
                            {importStatusLabel(item.status)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs text-[#5f776a]">{formatUpdatedAt(item.updatedAt)}</td>
                        <td className="px-3 py-3 text-right">
                          <Link aria-label={`Review ${item.sourceFilename}`} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-bold text-[#014c38] hover:bg-[#eef8f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73bc8a]" href={`/admin/imports/${item.id}`}>
                            Review <ArrowUpRight aria-hidden="true" size={15} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </PortalShell>
  );
}

"use client";

import Link from "next/link";

import {
  ReferenceEmptyState,
  ReferencePageHeader,
  ReferenceSectionHeading,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import { REFERENCE_SURFACE_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
import {
  Activity,
  BarChart3,
  ChevronRight,
} from "@/lib/icons";

import { Button } from "@/components/ui/button";
import type { AdminOperationsSnapshot } from "@/lib/admin/operations";

const operationsDateFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function formatDate(value: string) {
  return operationsDateFormatter.format(new Date(value));
}

function ActivityPanel({
  audits,
}: {
  audits: AdminOperationsSnapshot["audits"];
}) {
  return (
    <ReferenceSurface as="section" className="overflow-hidden">
      <div className="px-5 pt-5 sm:px-6">
         <ReferenceSectionHeading title="Aktivitas terbaru" />
      </div>
      {audits.length === 0 ? (
        <ReferenceEmptyState
          className="min-h-40"
           description="Belum ada aktivitas audit yang tercatat."
          icon={Activity}
           title="Belum ada aktivitas terbaru"
        />
      ) : (
        <ol className="mt-4 space-y-3">
          {audits.slice(0, 10).map((audit) => (
            <li className="flex gap-3" key={audit.id}>
              <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-primary-600" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-secondary-900">{audit.action}</p>
                <p className="mt-0.5 text-xs leading-5 text-secondary-600">{audit.actorName} · {formatDate(audit.occurredAt)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-5 flex justify-center pb-5">
        <Button
          className="font-bold text-primary-700 hover:bg-transparent hover:text-primary-800"
          nativeButton={false}
          render={<Link href="/admin/audit-logs" />}
          size="default"
          variant="ghost"
        >
          Lihat selengkapnya
        </Button>
      </div>
    </ReferenceSurface>
  );
}

function OperationsConsoleModule({
  snapshot,
}: {
  snapshot: AdminOperationsSnapshot;
}) {
  return (
    <div className="space-y-8">
      <ReferencePageHeader
        description="Kelola akses akun admin dan pantau aktivitas operasional terbaru."
        title="Dashboard"
      />

      <ReferenceSurface as="section" className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-800">
            <BarChart3 aria-hidden="true" size={19} />
          </span>
          <div>
            <h2 className="text-base font-semibold text-secondary-900">Vera AI usage</h2>
            <p className="mt-1 max-w-[60ch] text-sm leading-6 text-secondary-600">Lihat volume dan incident dalam bentuk agregat dengan suppression cohort. Tidak ada identitas atau isi percakapan di report.</p>
          </div>
        </div>
        <Button
          className="shrink-0"
          nativeButton={false}
          render={<Link href="/admin/ai-usage" />}
          variant="outline"
        >
          Buka pemakaian AI
          <ChevronRight aria-hidden="true" size={16} />
        </Button>
      </ReferenceSurface>

      <ActivityPanel audits={snapshot.audits} />
    </div>
  );
}

export { OperationsConsoleModule };

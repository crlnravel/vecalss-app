"use client";

import Link from "next/link";

import {
  ReferenceEmptyState,
  ReferencePageHeader,
  ReferenceSectionHeading,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import { Activity } from "@/lib/icons";

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
        <ol className="mt-4 space-y-3 px-5 sm:px-6">
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
          variant="outline"
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
        title="Dashboard"
      />

      <ActivityPanel audits={snapshot.audits} />
    </div>
  );
}

export { OperationsConsoleModule };

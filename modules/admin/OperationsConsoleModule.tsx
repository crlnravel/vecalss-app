"use client";

import Link from "next/link";
import { useState } from "react";

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
  UserPlus,
  X,
} from "@/lib/icons";

import { Button } from "@/components/ui/button";
import type { ExamEvent } from "@/generated/prisma/client";
import type { AdminOperationsSnapshot } from "@/lib/admin/operations";

import { CreateKaptenForm } from "./components/create-kapten-form";
import { CreateStudentForm } from "./components/create-student-form";

type OperationKey = "add-student" | "add-kapten";

const operationLabels: Record<OperationKey, { detail: string; label: string }> = {
  "add-kapten": {
    detail: "Create a Kapten account",
    label: "Add Kapten",
  },
  "add-student": {
    detail: "Create a student account",
    label: "Add student",
  },
};

const operationsDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function formatDate(value: string) {
  return operationsDateFormatter.format(new Date(value));
}

function OperationControl({
  active,
  icon: Icon,
  onSelect,
  operation,
}: {
  active: boolean;
  icon: typeof UserPlus;
  onSelect: () => void;
  operation: OperationKey;
}) {
  const { detail, label } = operationLabels[operation];

  return (
    <button
      aria-pressed={active}
      className={`group flex min-h-[88px] items-center gap-3 px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300 ${REFERENCE_SURFACE_CLASS_NAMES.raised} ${REFERENCE_SURFACE_CLASS_NAMES.raisedInteractive} ${active ? "border-primary-300 bg-primary-50 shadow-[0_18px_34px_-30px_rgba(1,76,56,0.8)]" : "hover:border-primary-200 hover:bg-secondary-50"}`}
      onClick={onSelect}
      type="button"
    >
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${active ? "bg-primary-700 text-white" : "bg-primary-50 text-primary-800"}`}>
        <Icon size={18} strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-semibold text-secondary-900">
          {label}
        </span>
        <span className="mt-1 block text-xs leading-5 text-secondary-600">{detail}</span>
      </span>
      <ChevronRight aria-hidden="true" className="shrink-0 text-secondary-400 transition-transform group-hover:translate-x-0.5" size={17} />
    </button>
  );
}

function ActivityPanel({
  audits,
}: {
  audits: AdminOperationsSnapshot["audits"];
}) {
  return (
    <ReferenceSurface as="section" className="overflow-hidden">
      <div className="px-5 pt-5 sm:px-6">
        <ReferenceSectionHeading title="Recent activity" />
      </div>
      {audits.length === 0 ? (
        <ReferenceEmptyState
          className="min-h-40"
          description="No audit activity has been recorded yet."
          icon={Activity}
          title="No recent activity"
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
          See more
        </Button>
      </div>
    </ReferenceSurface>
  );
}

function OperationsConsoleModule({
  examEvents,
  selectedOperation: initialOperation,
  snapshot,
}: {
  examEvents: ExamEvent[];
  selectedOperation?: OperationKey;
  snapshot: AdminOperationsSnapshot;
}) {
  const [selectedOperation, setSelectedOperation] = useState<OperationKey | null>(initialOperation ?? null);

  function selectOperation(nextOperation: OperationKey | null) {
    setSelectedOperation(nextOperation);
    const params = new URLSearchParams(window.location.search);
    if (nextOperation === null) {
      params.delete("operation");
    } else {
      params.set("operation", nextOperation);
    }
    const query = params.toString();
    window.history.replaceState(null, "", query ? `/admin?${query}` : "/admin");
  }

  return (
    <div className="space-y-8">
      <ReferencePageHeader
        description="Kelola akses akun admin dan pantau aktivitas operasional terbaru."
        title="Dashboard"
      />

      <section>
        <ReferenceSectionHeading title="Quick actions" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <OperationControl active={selectedOperation === "add-student"} icon={UserPlus} onSelect={() => selectOperation("add-student")} operation="add-student" />
          <OperationControl active={selectedOperation === "add-kapten"} icon={UserPlus} onSelect={() => selectOperation("add-kapten")} operation="add-kapten" />
        </div>
      </section>

      {selectedOperation === "add-student" ? (
        <ReferenceSurface as="section" aria-labelledby="operation-student-heading" className="p-4 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-secondary-900" id="operation-student-heading">Add student</h2>
            </div>
            <Button aria-label="Close selected operation" onClick={() => selectOperation(null)} size="icon" variant="ghost"><X size={17} /></Button>
          </div>
          <CreateStudentForm examEvents={examEvents} />
        </ReferenceSurface>
      ) : null}

      {selectedOperation === "add-kapten" ? (
        <ReferenceSurface as="section" aria-labelledby="operation-kapten-heading" className="p-4 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-secondary-900" id="operation-kapten-heading">Add Kapten</h2>
            </div>
            <Button aria-label="Close selected operation" onClick={() => selectOperation(null)} size="icon" variant="ghost"><X size={17} /></Button>
          </div>
          <CreateKaptenForm />
        </ReferenceSurface>
      ) : null}

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
          Open AI usage
          <ChevronRight aria-hidden="true" size={16} />
        </Button>
      </ReferenceSurface>

      <ActivityPanel audits={snapshot.audits} />
    </div>
  );
}

export { OperationsConsoleModule };
export type { OperationKey };

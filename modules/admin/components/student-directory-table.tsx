"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { DataTable, type DataTableColumn, type DataTableFilter } from "@/components/ui/data-table";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { UserStatus } from "@/generated/prisma/client";
import { ArrowUpRight, CalendarDays, ChevronRight, Clock3, Plus, ShieldCheck, Target, UserRound, X } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { bulkUpdateStudentEnrollmentStatusAction } from "@/modules/admin/actions";
import { SubmitButton } from "@/modules/auth/components/submit-button";

type StudentPreviewHandoff = {
  expiresAt: string | null;
  method: string;
  status: string;
};

type StudentDirectoryItem = {
  createdAt: string;
  email: string;
  fullName: string;
  id: string;
  lastLoginAt: string | null;
  latestHandoff: StudentPreviewHandoff | null;
  mustChangePassword: boolean;
  onboardingStatus: string | null;
  status: UserStatus;
  targetExamDate: string | null;
  targetExamName: string | null;
  targetMajor: string | null;
  targetUniversity: string | null;
  tone: StudentStatusTone;
};

type StudentStatusTone = "attention" | "danger" | "neutral" | "success";

function formatStatus(status: string) {
  return status.replaceAll("_", " ");
}

function statusTextClassName(tone: StudentStatusTone) {
  if (tone === "danger") {
    return "text-student-status-danger-fg";
  }

  if (tone === "attention") {
    return "text-student-status-attention-fg";
  }

  if (tone === "success") {
    return "text-student-status-success-fg";
  }

  return "text-secondary-600";
}

function statusDotClassName(tone: StudentStatusTone) {
  if (tone === "danger") {
    return "bg-student-status-danger-fg";
  }

  if (tone === "attention") {
    return "bg-student-status-attention-fg";
  }

  if (tone === "success") {
    return "bg-student-status-success-fg";
  }

  return "bg-secondary-300";
}

function formatCreatedDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function directoryHref({ search, status }: { search: string; status: UserStatus | "all" }) {
  const params = new URLSearchParams();
  if (search) {
    params.set("q", search);
  }
  if (status !== "all") {
    params.set("status", status);
  }
  const query = params.toString();
  return query ? `/admin/enrollment?${query}` : "/admin/enrollment";
}

function formatPreviewDate(value: string | null) {
  if (!value) {
    return "Not recorded";
  }

  return new Date(value).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatPreviewDateTime(value: string | null) {
  if (!value) {
    return "Not recorded";
  }

  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getInitials(fullName: string) {
  const initials = fullName
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return initials || "S";
}

function handoffTone(status: string): StudentStatusTone {
  if (status === "released") {
    return "success";
  }

  if (status === "expired" || status === "revoked") {
    return "danger";
  }

  return "attention";
}

function StudentPreviewPanel({
  backQuery,
  student,
}: {
  backQuery: string;
  student: StudentDirectoryItem;
}) {
  const detailHref = backQuery
    ? `/admin/enrollment/${student.id}?from=${encodeURIComponent(backQuery)}`
    : `/admin/enrollment/${student.id}`;
  const latestHandoff = student.latestHandoff;

  return (
    <SheetContent className="w-[min(100%,34rem)] max-w-full p-0 sm:max-w-xl" side="right">
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="border-b border-primary-100 px-5 pb-5 pt-6 pr-16 sm:px-6 sm:pb-6 sm:pr-16">
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden="true"
              className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary-700 text-base font-bold text-white shadow-[0_12px_26px_-18px_rgba(1,76,56,0.75)]"
            >
              {getInitials(student.fullName)}
            </span>
            <div className="min-w-0">
              <SheetTitle className="text-xl font-semibold leading-tight tracking-[-0.03em] text-secondary-950 sm:text-2xl">
                {student.fullName}
              </SheetTitle>
              <SheetDescription className="mt-1 truncate text-sm text-secondary-600">
                {student.email}
              </SheetDescription>
              <span className={cn("mt-3 inline-flex items-center gap-2 font-semibold capitalize", statusTextClassName(student.tone))}>
                <span aria-hidden="true" className={cn("size-2 rounded-full", statusDotClassName(student.tone))} />
                {formatStatus(student.status)}
              </span>
            </div>
          </div>
          <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-primary-800">
            <ShieldCheck aria-hidden="true" size={16} />
            Admin access only
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-7 px-5 py-6 sm:px-6">
            <section aria-labelledby="student-preview-enrollment-heading">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-800">
                  <Target aria-hidden="true" size={18} />
                </span>
                <div>
                  <h2 className="text-base font-semibold tracking-[-0.02em] text-secondary-900" id="student-preview-enrollment-heading">
                    Enrollment snapshot
                  </h2>
                  <p className="mt-1 text-sm leading-5 text-secondary-600">The current learning context for this account.</p>
                </div>
              </div>
              <dl className="mt-4 divide-y divide-primary-100 border-y border-primary-100">
                <div className="grid gap-1 py-3.5 sm:grid-cols-[minmax(8rem,0.6fr)_minmax(0,1fr)] sm:gap-4">
                  <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-secondary-500">Target exam</dt>
                  <dd className="font-medium text-secondary-900">
                    {student.targetExamName ?? "Not set"}
                    {student.targetExamDate ? <time className="mt-0.5 block text-xs font-normal text-secondary-600" dateTime={student.targetExamDate}>{formatPreviewDate(student.targetExamDate)}</time> : null}
                  </dd>
                </div>
                <div className="grid gap-1 py-3.5 sm:grid-cols-[minmax(8rem,0.6fr)_minmax(0,1fr)] sm:gap-4">
                  <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-secondary-500">University</dt>
                  <dd className="font-medium text-secondary-900">{student.targetUniversity ?? "Not set"}</dd>
                </div>
                <div className="grid gap-1 py-3.5 sm:grid-cols-[minmax(8rem,0.6fr)_minmax(0,1fr)] sm:gap-4">
                  <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-secondary-500">Major</dt>
                  <dd className="font-medium text-secondary-900">{student.targetMajor ?? "Not set"}</dd>
                </div>
                <div className="grid gap-1 py-3.5 sm:grid-cols-[minmax(8rem,0.6fr)_minmax(0,1fr)] sm:gap-4">
                  <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-secondary-500">Onboarding</dt>
                  <dd className="font-medium capitalize text-secondary-900">{student.onboardingStatus ? formatStatus(student.onboardingStatus) : "Not started"}</dd>
                </div>
              </dl>
            </section>

            <section aria-labelledby="student-preview-account-heading">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-800">
                  <UserRound aria-hidden="true" size={18} />
                </span>
                <div>
                  <h2 className="text-base font-semibold tracking-[-0.02em] text-secondary-900" id="student-preview-account-heading">
                    Account health
                  </h2>
                  <p className="mt-1 text-sm leading-5 text-secondary-600">Access and sign-in details at a glance.</p>
                </div>
              </div>
              <dl className="mt-4 divide-y divide-primary-100 border-y border-primary-100">
                <div className="flex items-start justify-between gap-4 py-3.5 text-sm">
                  <dt className="text-secondary-600">Added</dt>
                  <dd className="text-right font-medium text-secondary-900"><time dateTime={student.createdAt}>{formatPreviewDate(student.createdAt)}</time></dd>
                </div>
                <div className="flex items-start justify-between gap-4 py-3.5 text-sm">
                  <dt className="text-secondary-600">Last sign-in</dt>
                  <dd className="text-right font-medium text-secondary-900">{formatPreviewDateTime(student.lastLoginAt)}</dd>
                </div>
                <div className="flex items-start justify-between gap-4 py-3.5 text-sm">
                  <dt className="text-secondary-600">Password</dt>
                  <dd className="text-right font-medium text-secondary-900">{student.mustChangePassword ? "Change required" : "Set"}</dd>
                </div>
              </dl>
            </section>

            <section aria-labelledby="student-preview-handoff-heading">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-800">
                  <Clock3 aria-hidden="true" size={18} />
                </span>
                <div>
                  <h2 className="text-base font-semibold tracking-[-0.02em] text-secondary-900" id="student-preview-handoff-heading">
                    Credential handoff
                  </h2>
                  <p className="mt-1 text-sm leading-5 text-secondary-600">The latest one-time access delivery.</p>
                </div>
              </div>
              {latestHandoff ? (
                <div className="mt-4 rounded-2xl border border-primary-100 bg-secondary-50/60 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className={cn("inline-flex items-center gap-2 text-sm font-semibold capitalize", statusTextClassName(handoffTone(latestHandoff.status)))}>
                      <span aria-hidden="true" className={cn("size-2 rounded-full", statusDotClassName(handoffTone(latestHandoff.status)))} />
                      {formatStatus(latestHandoff.status)}
                    </span>
                    <span className="text-xs font-medium text-secondary-500">{formatStatus(latestHandoff.method)}</span>
                  </div>
                  <div className="mt-3 flex items-center gap-2 border-t border-primary-100 pt-3 text-xs text-secondary-600">
                    <CalendarDays aria-hidden="true" size={15} />
                    {latestHandoff.expiresAt ? `Expires ${formatPreviewDate(latestHandoff.expiresAt)}` : "No expiry recorded"}
                  </div>
                </div>
              ) : (
                <p className="mt-4 border-y border-primary-100 py-4 text-sm leading-6 text-secondary-600">No credential handoff has been created for this account.</p>
              )}
            </section>
          </div>
        </div>

        <footer className="border-t border-primary-100 bg-white px-5 py-4 sm:px-6">
          <Link className={buttonVariants({ className: "w-full justify-between", size: "sm", variant: "brand" })} href={detailHref}>
            Open full details
            <ArrowUpRight aria-hidden="true" size={16} />
          </Link>
        </footer>
      </div>
    </SheetContent>
  );
}

type BulkStudentStatusAction = "deactivate" | "reactivate";

function BulkStudentActions({
  dataQuery,
  selectedStudents,
}: {
  dataQuery: string;
  selectedStudents: readonly StudentDirectoryItem[];
}) {
  const [pendingAction, setPendingAction] = useState<BulkStudentStatusAction | null>(null);
  const activeCount = selectedStudents.filter((student) => student.status === "active").length;
  const disabledCount = selectedStudents.filter((student) => student.status === "disabled").length;
  const isDeactivation = pendingAction === "deactivate";
  const eligibleCount = isDeactivation ? activeCount : disabledCount;
  const skippedCount = selectedStudents.length - eligibleCount;

  return (
    <>
      <DropdownMenuItem
        disabled={activeCount === 0}
        onClick={() => setPendingAction("deactivate")}
        variant="destructive"
      >
        Disable access{activeCount ? ` (${activeCount})` : ""}
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={disabledCount === 0}
        onClick={() => setPendingAction("reactivate")}
      >
        Reactivate access{disabledCount ? ` (${disabledCount})` : ""}
      </DropdownMenuItem>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setPendingAction(null);
          }
        }}
        open={pendingAction !== null}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isDeactivation ? "Disable selected students?" : "Reactivate selected students?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isDeactivation
                ? `This will disable access for ${eligibleCount} active ${eligibleCount === 1 ? "student" : "students"} and revoke their active sessions and open handoffs.`
                : `This will restore access for ${eligibleCount} disabled ${eligibleCount === 1 ? "student" : "students"}. Existing sessions and handoffs will not be restored.`}
              {skippedCount > 0
                ? ` ${skippedCount} selected ${skippedCount === 1 ? "account" : "accounts"} will be left unchanged.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <form action={bulkUpdateStudentEnrollmentStatusAction}>
            <input name="confirmation" type="hidden" value={isDeactivation ? "deactivate" : "reactivate"} />
            <input name="directoryQuery" type="hidden" value={dataQuery} />
            <input name="nextStatus" type="hidden" value={isDeactivation ? "disabled" : "active"} />
            {selectedStudents.map((student) => (
              <input key={student.id} name="studentIds" type="hidden" value={student.id} />
            ))}
            <AlertDialogFooter>
              <AlertDialogCancel size="sm" type="button">Cancel</AlertDialogCancel>
              <SubmitButton
                pendingLabel={isDeactivation ? "Disabling…" : "Reactivating…"}
                size="sm"
                type="submit"
                variant={isDeactivation ? "destructive" : "brand"}
              >
                {isDeactivation ? "Disable access" : "Reactivate access"}
              </SubmitButton>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function StudentFilterPanel({
  clearFiltersHref,
  clearStatusHref,
  search,
  statusFilter,
}: {
  clearFiltersHref: string;
  clearStatusHref: string;
  search: string;
  statusFilter: UserStatus | "all";
}) {
  const router = useRouter();
  const [statusPopoverOpen, setStatusPopoverOpen] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    const query = formData.get("q");
    const status = formData.get("status");

    if (typeof query === "string" && query) {
      params.set("q", query);
    }

    if (typeof status === "string" && status && status !== "all") {
      params.set("status", status);
    }

    const queryString = params.toString();
    router.replace(queryString ? `/admin/enrollment?${queryString}` : "/admin/enrollment", { scroll: false });
  };

  return (
    <div aria-label="Student filter fields" className="grid gap-1" role="list">
      <Popover onOpenChange={setStatusPopoverOpen} open={statusPopoverOpen}>
        <PopoverTrigger
          render={
            <Button
              aria-haspopup="dialog"
              className="group h-10 w-full justify-between rounded-xl px-3 text-left hover:bg-primary-50/60"
              onMouseEnter={() => setStatusPopoverOpen(true)}
              type="button"
              variant={statusFilter !== "all" ? "contextSelected" : "ghost"}
            />
          }
        >
          <span className="font-medium text-secondary-900">Status</span>
          <ChevronRight aria-hidden="true" className="text-secondary-400 transition-transform group-aria-expanded:translate-x-0.5" size={16} />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(22rem,calc(100vw-2rem))] gap-3 rounded-xl p-3"
          side="left"
          sideOffset={8}
        >
          <form action="/admin/enrollment" className="grid gap-3" method="get" onSubmit={handleSubmit}>
            <input name="q" type="hidden" value={search} />
            <div aria-label="Status" className="grid gap-1" role="radiogroup">
              {(["active", "disabled", "locked"] as UserStatus[]).map((status) => (
                <label className="flex h-10 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm font-medium capitalize text-secondary-800 transition-colors hover:bg-primary-50/60" key={status}>
                  <input className="peer sr-only" defaultChecked={statusFilter === status} name="status" type="radio" value={status} />
                  <span>{formatStatus(status)}</span>
                  <span aria-hidden="true" className="invisible ml-auto size-1.5 rounded-full bg-primary-700 peer-checked:visible" />
                </label>
              ))}
            </div>
            <div className="flex w-full items-center gap-2">
              {statusFilter !== "all" ? (
                <Link
                  aria-label="Clear status filter"
                  className={buttonVariants({ size: "icon-sm", variant: "ghost" })}
                  href={clearStatusHref}
                >
                  <X aria-hidden="true" size={16} />
                </Link>
              ) : null}
              <Link className={cn(buttonVariants({ size: "sm", variant: "ghost" }), "min-w-0 flex-1")} href={clearFiltersHref}>
                Clear
              </Link>
              <Button className="min-w-0 flex-[2]" size="sm" type="submit" variant="brand">Apply</Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function StudentDirectoryTable({
  backQuery,
  dataQuery,
  focus,
  isEmptyDirectory,
  search,
  statusFilter,
  students,
}: {
  backQuery: string;
  dataQuery: string;
  focus: string | null;
  isEmptyDirectory: boolean;
  search: string;
  statusFilter: UserStatus | "all";
  students: StudentDirectoryItem[];
}) {
  const [previewStudent, setPreviewStudent] = useState<StudentDirectoryItem | null>(null);
  const clearSearchHref = directoryHref({ search: "", status: statusFilter });
  const clearStatusHref = directoryHref({ search, status: "all" });
  const clearFiltersHref = directoryHref({ search: "", status: "all" });
  const filters: DataTableFilter[] = [];

  if (search) {
    filters.push({
      href: clearSearchHref,
      id: "search",
      label: "Search",
      value: `“${search}”`,
    });
  }

  if (statusFilter !== "all") {
    filters.push({
      href: clearStatusHref,
      id: "status",
      label: "Status",
      value: formatStatus(statusFilter),
    });
  }

  const columns: DataTableColumn<StudentDirectoryItem>[] = [
    {
      cell: (student) => (
        <span className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-50 text-[0.68rem] font-bold text-primary-800 ring-1 ring-inset ring-primary-100"
          >
            {getInitials(student.fullName)}
          </span>
          <span className="block max-w-[14rem] truncate font-semibold text-secondary-900" title={student.fullName}>
            {student.fullName}
          </span>
        </span>
      ),
      headerClassName: "w-[28%]",
      hideable: false,
      id: "student",
      label: "Student",
    },
    {
      cell: (student) => (
        <span className="block max-w-[20rem] truncate text-secondary-700" title={student.email}>
          {student.email}
        </span>
      ),
      headerClassName: "w-[28%]",
      id: "email",
      label: "Email",
    },
    {
      cell: (student) => <time dateTime={student.createdAt}>{formatCreatedDate(student.createdAt)}</time>,
      cellClassName: "text-secondary-700",
      headerClassName: "w-[17%]",
      id: "added",
      label: "Added",
    },
    {
      cell: (student) => (
        <span className={cn("inline-flex items-center gap-2 font-semibold capitalize", statusTextClassName(student.tone))}>
          <span aria-hidden="true" className={cn("size-2 rounded-full", statusDotClassName(student.tone))} />
          {formatStatus(student.status)}
        </span>
      ),
      headerClassName: "w-[17%]",
      id: "status",
      label: "Status",
    },
    {
      cell: (student) => {
        const detailHref = backQuery
          ? `/admin/enrollment/${student.id}?from=${encodeURIComponent(backQuery)}`
          : `/admin/enrollment/${student.id}`;

        return (
          <Link
            aria-label={`View details for ${student.fullName}`}
            className="font-semibold text-primary-700 underline-offset-4 transition-colors hover:text-primary-900 hover:underline"
            href={detailHref}
          >
            Open
          </Link>
        );
      },
      cellClassName: "text-right",
      headerClassName: "w-[10%] text-right",
      id: "action",
      label: "Action",
    },
  ];

  const filterPanel = (
    <StudentFilterPanel
      clearFiltersHref={clearFiltersHref}
      clearStatusHref={clearStatusHref}
      search={search}
      statusFilter={statusFilter}
    />
  );

  const emptyState = (
    <div className="px-5 py-8 text-left sm:px-8 sm:py-10">
      <div className="max-w-xl">
        <h3 className="text-lg font-semibold leading-tight tracking-[-0.03em] text-secondary-900 sm:text-xl">
          {isEmptyDirectory ? "No student accounts yet." : "No students match these filters."}
        </h3>
        <p className="mt-2 max-w-[58ch] text-sm leading-6 text-secondary-600">
          {isEmptyDirectory
            ? "Open the Add student page to create the first account and choose its handoff."
            : "Try another name, email, or status filter to find the account you need."}
        </p>
        {isEmptyDirectory ? (
          <div className="mt-5">
            <Link className={buttonVariants({ className: "min-h-10", size: "sm", variant: "brand" })} href="/admin/enrollment/new">
              <Plus aria-hidden="true" size={17} />
              Create first student
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <>
      <DataTable
        caption="Student directory"
        clearFiltersHref={clearFiltersHref}
        columns={columns}
        emptyState={emptyState}
        filterPanel={filterPanel}
        filters={filters}
        getRowId={(student) => student.id}
        onRowClick={setPreviewStudent}
        rowClassName={(student) => cn(
          focus === student.id && "bg-primary-50/70 shadow-[inset_0_0_0_2px_rgba(26,107,60,0.18)]",
        )}
        rowProps={(student) => ({
          "data-directory-query": dataQuery,
          "data-directory-row": "true",
          id: `student-${student.id}`,
          tabIndex: -1,
        })}
        rows={students}
        search={{
          action: "/admin/enrollment",
          clearHref: clearSearchHref,
          hiddenFields: statusFilter === "all" ? undefined : { status: statusFilter },
          label: "Global student search",
          placeholder: "Search students by name or email…",
          value: search,
        }}
        selection
        selectionActions={({ rows }) => (
          <BulkStudentActions dataQuery={dataQuery} selectedStudents={rows} />
        )}
        tableClassName="min-w-[760px]"
      />
      <Sheet onOpenChange={(open) => { if (!open) setPreviewStudent(null); }} open={Boolean(previewStudent)}>
        {previewStudent ? <StudentPreviewPanel backQuery={backQuery} student={previewStudent} /> : null}
      </Sheet>
    </>
  );
}

export { StudentDirectoryTable };

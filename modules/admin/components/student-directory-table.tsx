"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import type { DateRange } from "react-day-picker";

import { ReferenceEmptyState } from "@/components/dashboard/reference-dashboard-primitives";
import { REFERENCE_CONTROL_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
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
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, type DataTableColumn, type DataTableFilter } from "@/components/ui/data-table";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { UserStatus } from "@/generated/prisma/client";
import { ChevronRight, UserRound, XIcon } from "@/lib/icons";
import { DEFAULT_DIRECTORY_PAGE_SIZE, type DirectoryPageSize } from "@/lib/admin/operations/directory-page-constants";
import { buildDirectoryQuery, type DirectorySortDirection, type DirectorySortKey } from "@/lib/admin/operations/directory-query";
import { cn } from "@/lib/utils";
import { bulkUpdateStudentEnrollmentStatusAction } from "@/modules/admin/actions";
import { SubmitButton } from "@/modules/auth/components/submit-button";

import { CopyValueButton } from "./copy-value-button";
import { StudentAccountActions } from "./student-account-actions";

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

const studentDirectoryDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatStatus(status: string) {
  return status.replaceAll("_", " ");
}

function highlightSearchMatches(text: string, query: string): ReactNode {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return text;
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = normalizedQuery.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  let matchIndex = lowerText.indexOf(lowerQuery);
  let matchNumber = 0;

  while (matchIndex !== -1) {
    if (matchIndex > cursor) {
      parts.push(text.slice(cursor, matchIndex));
    }

    parts.push(
      <mark className="rounded-sm bg-student-status-attention-bg text-inherit" key={`search-match-${matchNumber}`}>
        {text.slice(matchIndex, matchIndex + normalizedQuery.length)}
      </mark>,
    );
    cursor = matchIndex + normalizedQuery.length;
    matchNumber += 1;
    matchIndex = lowerText.indexOf(lowerQuery, cursor);
  }

  if (!matchNumber) {
    return text;
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return parts;
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

function parseDateInput(value: string | null): Date | undefined {
  if (!value) {
    return undefined;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toDateInput(value: Date | undefined): string {
  if (!value) {
    return "";
  }

  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
}

function dateRangeFromQuery(addedFrom: string | null, addedTo: string | null): DateRange | undefined {
  const from = parseDateInput(addedFrom);
  const to = parseDateInput(addedTo);
  if (from) {
    return { from, to };
  }

  return to ? { from: to, to } : undefined;
}

function formatDateFilter(addedFrom: string | null, addedTo: string | null) {
  const from = parseDateInput(addedFrom);
  const to = parseDateInput(addedTo);

  if (!from && !to) {
    return "";
  }

  if (!to || !from || to.getTime() === from.getTime()) {
    return studentDirectoryDateFormatter.format(from ?? to);
  }

  return `${studentDirectoryDateFormatter.format(from)} – ${studentDirectoryDateFormatter.format(to)}`;
}

function directoryHref({
  addedFrom,
  addedTo,
  direction,
  demo,
  pageSize,
  search,
  sort,
  statuses,
}: {
  addedFrom: string | null;
  addedTo: string | null;
  direction: DirectorySortDirection;
  demo: boolean;
  pageSize: DirectoryPageSize;
  search: string;
  sort: DirectorySortKey | null;
  statuses: readonly UserStatus[];
}) {
  const params = new URLSearchParams();
  if (search) {
    params.set("q", search);
  }
  statuses.forEach((status) => params.append("status", status));
  if (addedFrom) {
    params.set("addedFrom", addedFrom);
  }
  if (addedTo) {
    params.set("addedTo", addedTo);
  }
  if (sort) {
    params.set("sort", sort);
    if (direction === "desc") {
      params.set("direction", direction);
    }
  }
  if (demo) {
    params.set("demo", "1");
  }
  if (pageSize !== DEFAULT_DIRECTORY_PAGE_SIZE) {
    params.set("pageSize", String(pageSize));
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  return query ? `/admin/enrollment${query}` : "/admin/enrollment";
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

function displayStudentId(id: string) {
  if (id.length <= 22) {
    return id;
  }

  return `${id.slice(0, 10)}…${id.slice(-8)}`;
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

  return (
    <SheetContent
      className="w-[min(100%,34rem)] max-w-full p-0 sm:max-w-xl"
      side="right"
      showCloseButton={false}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="px-5 pb-6 pt-6 sm:px-6 sm:pb-7">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <span
              aria-hidden="true"
              className="grid size-20 shrink-0 place-items-center rounded-2xl bg-primary-50 text-xl font-bold text-primary-800 ring-1 ring-inset ring-primary-100"
            >
              {getInitials(student.fullName)}
            </span>
            <SheetClose
              render={
                <Button
                  className="cursor-pointer border-0 bg-transparent text-secondary-900 hover:border-0 hover:bg-transparent hover:text-primary-700 focus-visible:border-transparent focus-visible:ring-primary-300/40"
                  size="icon"
                  type="button"
                  variant="brandOutline"
                />
              }
            >
              <XIcon />
              <span className="sr-only">Tutup</span>
            </SheetClose>
          </div>
          <div className="mt-3 flex min-w-0 items-center gap-1.5">
            <code className="min-w-0 truncate text-xs font-medium text-secondary-600" title={student.id}>
              {displayStudentId(student.id)}
            </code>
            <CopyValueButton ariaLabel="Copy account ID" iconOnly value={student.id} />
          </div>
          <SheetTitle className="mt-2 text-xl font-semibold leading-tight tracking-[-0.03em] text-secondary-950 sm:text-2xl">
            {student.fullName}
          </SheetTitle>
          <SheetDescription className="mt-1 truncate text-sm text-secondary-600">
            {student.email}
          </SheetDescription>
          <Link className={buttonVariants({ className: "mt-5 w-full", size: "sm", variant: "brand" })} href={detailHref}>
            Open
          </Link>
          <StudentAccountActions
            compact
            directoryQuery={backQuery}
            returnPath=""
            showPasswordAction={false}
            status={student.status}
            studentId={student.id}
          />
        </header>
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
        <AlertDialogContent size="sm" variant={isDeactivation ? "warning" : "info"}>
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
  addedFrom,
  addedTo,
  clearFiltersHref,
  direction,
  demo,
  pageSize,
  statusFilters,
  search,
  sort,
}: {
  addedFrom: string | null;
  addedTo: string | null;
  clearFiltersHref: string;
  direction: DirectorySortDirection;
  demo: boolean;
  pageSize: DirectoryPageSize;
  search: string;
  sort: DirectorySortKey | null;
  statusFilters: readonly UserStatus[];
}) {
  const router = useRouter();
  const [statusPopoverOpen, setStatusPopoverOpen] = useState(false);
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [draftStatuses, setDraftStatuses] = useState<UserStatus[]>(() => [...statusFilters]);
  const [draftDateRange, setDraftDateRange] = useState<DateRange | undefined>(() => dateRangeFromQuery(addedFrom, addedTo));

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    const query = formData.get("q");
    const statuses = formData.getAll("status").filter((value): value is string => typeof value === "string" && value !== "all");
    const addedFromValue = formData.get("addedFrom");
    const addedToValue = formData.get("addedTo");

    if (typeof query === "string" && query) {
      params.set("q", query);
    }

    statuses.forEach((status) => {
      params.append("status", status);
    });

    if (typeof addedFromValue === "string" && addedFromValue) {
      params.set("addedFrom", addedFromValue);
      params.set("addedTo", typeof addedToValue === "string" && addedToValue ? addedToValue : addedFromValue);
    } else if (typeof addedToValue === "string" && addedToValue) {
      params.set("addedTo", addedToValue);
    }

    if (sort) {
      params.set("sort", sort);
      if (direction === "desc") {
        params.set("direction", direction);
      }
    }

    if (pageSize !== DEFAULT_DIRECTORY_PAGE_SIZE) {
      params.set("pageSize", String(pageSize));
    }
    if (demo) {
      params.set("demo", "1");
    }

    const queryString = params.toString();
    router.replace(queryString ? `/admin/enrollment?${queryString}` : "/admin/enrollment", { scroll: false });
  };

  return (
    <fieldset className="grid gap-1">
      <legend className="sr-only">Student filter fields</legend>
      <Popover
        onOpenChange={(open) => {
          setStatusPopoverOpen(open);
          if (open) {
            setDraftStatuses([...statusFilters]);
          }
        }}
        open={statusPopoverOpen}
      >
        <PopoverTrigger
          render={
            <Button
              aria-haspopup="dialog"
              className={cn(
                REFERENCE_CONTROL_CLASS_NAMES.select,
                "group h-11 w-full px-3 text-left text-xs",
                statusFilters.length && "border-primary-500 bg-primary-50",
              )}
              onMouseEnter={() => setStatusPopoverOpen(true)}
              type="button"
              variant="ghost"
            />
          }
        >
          <span className="font-medium text-secondary-900">Status</span>
          <ChevronRight aria-hidden="true" className="text-secondary-400 transition-transform group-aria-expanded:translate-x-0.5" size={16} />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(18rem,calc(100vw-2rem))] gap-3 rounded-3xl border-primary-100 bg-white p-3 shadow-[0_20px_52px_-30px_rgba(1,76,56,0.42)]"
          side="left"
          sideOffset={6}
        >
          <form action="/admin/enrollment" className="grid gap-2" method="get" onSubmit={handleSubmit}>
            <input name="q" type="hidden" value={search} />
            {sort ? <input name="sort" type="hidden" value={sort} /> : null}
            {sort && direction === "desc" ? <input name="direction" type="hidden" value={direction} /> : null}
            {addedFrom ? <input name="addedFrom" type="hidden" value={addedFrom} /> : null}
            {addedTo ? <input name="addedTo" type="hidden" value={addedTo} /> : null}
            <div aria-label="Status" className="grid gap-0.5" role="group">
              {(["active", "disabled", "locked"] as UserStatus[]).map((status) => (
                <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl px-3 text-xs font-medium capitalize text-secondary-800 transition-colors hover:bg-primary-50/60" key={status}>
                  <Checkbox
                    checked={draftStatuses.includes(status)}
                    className="size-4 rounded-[4px]"
                    onCheckedChange={(checked) => {
                      setDraftStatuses((current) => checked === true
                        ? current.includes(status) ? current : [...current, status]
                        : current.filter((selectedStatus) => selectedStatus !== status));
                    }}
                  />
                  <span>{formatStatus(status)}</span>
                  {draftStatuses.includes(status) ? <input name="status" type="hidden" value={status} /> : null}
                </label>
              ))}
            </div>
            <div className="flex w-full items-center gap-1.5 pt-1">
              <Link className={cn(buttonVariants({ size: "sm", variant: "ghost" }), "min-w-0 flex-1")} href={clearFiltersHref}>
                Clear
              </Link>
              <Button className="min-w-0 flex-[2]" size="sm" type="submit" variant="brand">Apply</Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>

      <Popover
        onOpenChange={(open) => {
          setDatePopoverOpen(open);
          if (open) {
            setDraftDateRange(dateRangeFromQuery(addedFrom, addedTo));
          }
        }}
        open={datePopoverOpen}
      >
        <PopoverTrigger
          render={
            <Button
              aria-haspopup="dialog"
              className={cn(
                REFERENCE_CONTROL_CLASS_NAMES.select,
                "group h-11 w-full px-3 text-left text-xs",
                (addedFrom || addedTo) && "border-primary-500 bg-primary-50",
              )}
              onMouseEnter={() => setDatePopoverOpen(true)}
              type="button"
              variant="ghost"
            />
          }
        >
          <span className="font-medium text-secondary-900">Added</span>
          <ChevronRight aria-hidden="true" className="text-secondary-400 transition-transform group-aria-expanded:translate-x-0.5" size={16} />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(20rem,calc(100vw-2rem))] gap-3 rounded-3xl border-primary-100 bg-white p-3 shadow-[0_20px_52px_-30px_rgba(1,76,56,0.42)]"
          side="left"
          sideOffset={6}
        >
          <form action="/admin/enrollment" className="grid gap-2" method="get" onSubmit={handleSubmit}>
            <input name="q" type="hidden" value={search} />
            {sort ? <input name="sort" type="hidden" value={sort} /> : null}
            {sort && direction === "desc" ? <input name="direction" type="hidden" value={direction} /> : null}
            {statusFilters.map((status) => <input key={status} name="status" type="hidden" value={status} />)}
            <input name="addedFrom" type="hidden" value={toDateInput(draftDateRange?.from)} />
            <input name="addedTo" type="hidden" value={toDateInput(draftDateRange?.to)} />
            <Calendar
              aria-label="Added date"
              defaultMonth={draftDateRange?.from}
              mode="range"
              onSelect={setDraftDateRange}
              selected={draftDateRange}
            />
            <div className="flex w-full items-center gap-1.5 pt-1">
              <Link className={cn(buttonVariants({ size: "sm", variant: "ghost" }), "min-w-0 flex-1")} href={clearFiltersHref}>
                Clear
              </Link>
              <Button className="min-w-0 flex-[2]" size="sm" type="submit" variant="brand">Apply</Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>
    </fieldset>
  );
}

function StudentDirectoryTable({
  addedFrom,
  addedTo,
  backQuery,
  dataQuery,
  direction,
  demo,
  focus,
  isEmptyDirectory,
  pageSize,
  search,
  sort,
  statusFilters,
  students,
}: {
  addedFrom: string | null;
  addedTo: string | null;
  backQuery: string;
  dataQuery: string;
  direction: DirectorySortDirection;
  demo: boolean;
  focus: string | null;
  isEmptyDirectory: boolean;
  pageSize: DirectoryPageSize;
  search: string;
  sort: DirectorySortKey | null;
  statusFilters: UserStatus[];
  students: StudentDirectoryItem[];
}) {
  const [previewStudent, setPreviewStudent] = useState<StudentDirectoryItem | null>(null);
  const clearSearchHref = directoryHref({ addedFrom, addedTo, direction, demo, pageSize, search: "", sort, statuses: statusFilters });
  const clearStatusHref = directoryHref({ addedFrom, addedTo, direction, demo, pageSize, search, sort, statuses: [] });
  const clearDateHref = directoryHref({ addedFrom: null, addedTo: null, direction, demo, pageSize, search, sort, statuses: statusFilters });
  const clearFiltersHref = directoryHref({ addedFrom: null, addedTo: null, direction, demo, pageSize, search: "", sort, statuses: [] });
  const filters: DataTableFilter[] = [];

  if (statusFilters.length) {
    filters.push({
      href: clearStatusHref,
      id: "status",
      label: "Status",
      value: statusFilters.map(formatStatus).join(" or "),
    });
  }

  if (addedFrom || addedTo) {
    filters.push({
      href: clearDateHref,
      id: "added",
      label: "Added",
      value: formatDateFilter(addedFrom, addedTo),
    });
  }

  const columns: DataTableColumn<StudentDirectoryItem>[] = [
    {
      cell: (student) => (
        <span className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-50 text-xs font-bold text-primary-800 ring-1 ring-inset ring-primary-100"
          >
            {getInitials(student.fullName)}
          </span>
          <span className="block max-w-[14rem] truncate font-semibold text-secondary-900" title={student.fullName}>
            {highlightSearchMatches(student.fullName, search)}
          </span>
        </span>
      ),
      headerClassName: "w-[28%]",
      hideable: false,
      id: "student",
      label: "Student",
      sortKey: "student",
      width: 28,
    },
    {
      cell: (student) => (
        <span className="block max-w-[20rem] truncate text-secondary-700" title={student.email}>
          {highlightSearchMatches(student.email, search)}
        </span>
      ),
      headerClassName: "w-[28%]",
      id: "email",
      label: "Email",
      sortKey: "email",
      width: 28,
    },
    {
      cell: (student) => <time dateTime={student.createdAt}>{formatCreatedDate(student.createdAt)}</time>,
      cellClassName: "text-secondary-700",
      headerClassName: "w-[17%]",
      id: "added",
      label: "Added",
      sortKey: "added",
      width: 17,
    },
    {
      cell: (student) => (
        <span className={cn("inline-flex items-center gap-2 font-semibold capitalize", statusTextClassName(student.tone))}>
          {student.tone !== "success" ? <span aria-hidden="true" className={cn("size-2 rounded-full", statusDotClassName(student.tone))} /> : null}
          {formatStatus(student.status)}
        </span>
      ),
      headerClassName: "w-[17%]",
      id: "status",
      label: "Status",
      sortKey: "status",
      width: 17,
    },
    {
      cell: (student) => {
        if (demo) {
          return <span className="font-medium text-secondary-400">Demo</span>;
        }

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
      width: 10,
    },
  ];

  const filterPanel = (
    <StudentFilterPanel
      addedFrom={addedFrom}
      addedTo={addedTo}
      clearFiltersHref={clearFiltersHref}
      direction={direction}
      demo={demo}
      pageSize={pageSize}
      search={search}
      sort={sort}
      statusFilters={statusFilters}
    />
  );

  const emptyState = (
    <ReferenceEmptyState
      className="min-h-56"
      description={isEmptyDirectory
        ? "Use Add student above to create the first account and choose its handoff."
        : "Try another name, email, or status filter to find the account you need."}
      icon={UserRound}
      title={isEmptyDirectory ? "No student accounts yet." : "No students match these filters."}
    />
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
        onRowClick={demo ? undefined : setPreviewStudent}
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
          hiddenFields: {
            ...(statusFilters.length ? { status: statusFilters } : {}),
            ...(addedFrom ? { addedFrom } : {}),
            ...(addedTo ? { addedTo } : {}),
            ...(demo ? { demo: "1" } : {}),
            ...(pageSize !== DEFAULT_DIRECTORY_PAGE_SIZE ? { pageSize: String(pageSize) } : {}),
            ...(sort ? { sort } : {}),
            ...(sort && direction === "desc" ? { direction } : {}),
          },
          label: "Global student search",
          placeholder: "Search students by name or email…",
          value: search,
        }}
        sort={{
          direction,
          href: (nextSortKey, nextDirection) => {
            const query = buildDirectoryQuery({
              addedFrom,
              addedTo,
              direction: nextDirection,
              focus: null,
              page: 1,
              pageSize,
              search,
              sort: nextSortKey as DirectorySortKey | null,
              status: statusFilters[0] ?? "all",
              statuses: statusFilters,
            });
            const demoQuery = demo ? `${query}${query ? "&" : "?"}demo=1` : query;
            return demoQuery ? `/admin/enrollment${demoQuery}` : "/admin/enrollment";
          },
          key: sort,
        }}
        selection={!demo}
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

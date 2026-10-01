"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { UserStatus } from "@/generated/prisma/client";
import { XIcon } from "@/lib/icons";
import { DEFAULT_DIRECTORY_PAGE_SIZE, type DirectoryPageSize } from "@/lib/admin/operations/directory-page-constants";
import { buildDirectoryQuery, type DirectorySortDirection, type DirectorySortKey } from "@/lib/admin/operations/directory-query";
import { ReuiDirectoryGrid, ReuiDirectoryMember, ReuiDirectoryFilters, type ReuiDirectoryColumn, type ReuiDirectoryFilter } from "./reui-directory-grid";
import styles from "./reui-directory-grid.module.css";
import { CopyValueButton } from "./copy-value-button";
import { StudentAccountActions } from "./student-account-actions";
import { formatStudentStatus, type StudentStatusTone } from "../student-status";

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

const studentDirectoryDateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatCreatedDate(value: string) {
   return new Date(value).toLocaleDateString("id-ID", {
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
                  variant="outline"
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
             <CopyValueButton ariaLabel="Salin ID akun" iconOnly value={student.id} />
          </div>
          <SheetTitle className="mt-2 text-xl font-semibold leading-tight tracking-[-0.03em] text-secondary-950 sm:text-2xl">
            {student.fullName}
          </SheetTitle>
          <SheetDescription className="mt-1 truncate text-sm text-secondary-600">
            {student.email}
          </SheetDescription>
          <Link className={buttonVariants({ className: "mt-5 w-full", size: "sm", variant: "default" })} href={detailHref}>
             Buka detail
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

function buildStudentDirectoryFilters({
  addedFrom,
  addedTo,
  clearDateHref,
  clearStatusHref,
  statusFilters,
}: {
  addedFrom: string | null;
  addedTo: string | null;
  clearDateHref: string;
  clearStatusHref: string;
  statusFilters: UserStatus[];
}) {
  const filters: ReuiDirectoryFilter[] = [];
  if (statusFilters.length) {
    filters.push({ href: clearStatusHref, id: "status", label: "Status", value: statusFilters.map(formatStudentStatus).join(", ") });
  }
  if (addedFrom || addedTo) {
    filters.push({ href: clearDateHref, id: "added", label: "Ditambahkan", value: formatDateFilter(addedFrom, addedTo) });
  }
  return filters;
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
  total,
  actions,
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
  total: number;
  actions: ReactNode;
}) {
  const [previewStudent, setPreviewStudent] = useState<StudentDirectoryItem | null>(null);
  const clearSearchHref = directoryHref({ addedFrom, addedTo, direction, demo, pageSize, search: "", sort, statuses: statusFilters });
  const clearStatusHref = directoryHref({ addedFrom, addedTo, direction, demo, pageSize, search, sort, statuses: [] });
  const clearDateHref = directoryHref({ addedFrom: null, addedTo: null, direction, demo, pageSize, search, sort, statuses: statusFilters });
  const clearFiltersHref = directoryHref({ addedFrom: null, addedTo: null, direction, demo, pageSize, search: "", sort, statuses: [] });
  const filters = buildStudentDirectoryFilters({ addedFrom, addedTo, clearDateHref, clearStatusHref, statusFilters });

  const columns: ReuiDirectoryColumn<StudentDirectoryItem>[] = [
    {
      id: "student", label: "Siswa", sortKey: "student", width: 36,
      cell: (student) => <ReuiDirectoryMember name={student.fullName} email={student.email}
        onView={demo ? undefined : () => setPreviewStudent(student)}
        editHref={demo ? undefined : backQuery ? `/admin/enrollment/${student.id}?from=${encodeURIComponent(backQuery)}` : `/admin/enrollment/${student.id}`} />,
    },
    { id: "email", label: "Email", sortKey: "email", width: 30, cell: student => <a className={styles.email} href={`mailto:${student.email}`}>{student.email}</a> },
    { id: "status", label: "Status akun", sortKey: "status", width: 17, cell: student => <span className={styles.status} data-status={student.status}>{formatStudentStatus(student.status)}</span> },
    { id: "added", label: "Ditambahkan", sortKey: "added", width: 17, cell: student => <time className={styles.muted} dateTime={student.createdAt}>{formatCreatedDate(student.createdAt)}</time> },
  ];
  const filterPanel = <ReuiDirectoryFilters basePath="/admin/enrollment" query={dataQuery} statuses={statusFilters} multiple dateRange={{ from: addedFrom, to: addedTo }} clearHref={clearFiltersHref} />;
  const emptyState = <><strong>{isEmptyDirectory ? "Belum ada akun siswa" : "Tidak ada siswa yang cocok"}</strong>{isEmptyDirectory ? "Tambahkan siswa untuk membuat akun pertama." : "Coba nama, email, atau filter lain."}</>;

  return (
    <>
      <ReuiDirectoryGrid
         caption="Direktori siswa"
        title="Siswa" total={total} actions={actions}
        clearFiltersHref={clearFiltersHref}
        columns={columns}
        emptyState={emptyState}
        filterPanel={filterPanel}
        filters={filters}
        getRowId={(student) => student.id}
        onRowClick={demo ? undefined : setPreviewStudent}
        rowProps={(student) => ({
          "data-directory-query": dataQuery,
          "data-directory-row": "true",
          id: `student-${student.id}`,
          tabIndex: -1,
          "data-focused": focus === student.id ? "true" : undefined,
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
           label: "Pencarian siswa global",
           placeholder: "Cari…",
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
      />
      <Sheet onOpenChange={(open) => { if (!open) setPreviewStudent(null); }} open={Boolean(previewStudent)}>
        {previewStudent ? <StudentPreviewPanel backQuery={backQuery} student={previewStudent} /> : null}
      </Sheet>
    </>
  );
}

export { StudentDirectoryTable };

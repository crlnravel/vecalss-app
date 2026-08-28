import Link from "next/link";

import { ChevronLeft, ChevronRight, MoreHorizontal } from "@/lib/icons";
import { buttonVariants } from "@/components/ui/button-variants";
import { ReferencePageHeader, ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import type { EnrollmentHandoff, ExamEvent, Major, StudentProfile, University, User, UserStatus } from "@/generated/prisma/client";
import {
  buildDirectoryQuery,
  type DirectoryPageSize,
  type DirectorySortDirection,
  type DirectorySortKey,
} from "@/lib/admin/operations/validation";
import type { SessionContext } from "@/lib/auth/types";
import { FormNotice } from "@/modules/auth/components/form-notice";
import { PortalShell } from "@/modules/portal/components/portal-shell";

import { AddStudentDialog } from "./components/add-student-dialog";
import { FocusRestorer } from "./components/focus-restorer";
import { StudentPageSizeSelect } from "./components/student-page-size-select";
import { StudentDirectoryTable } from "./components/student-directory-table";

export type EnrolledStudent = Pick<User, "createdAt" | "email" | "fullName" | "id" | "lastLoginAt" | "mustChangePassword" | "status"> & {
  enrollmentHandoffs: Pick<EnrollmentHandoff, "expiresAt" | "method" | "status">[];
  studentProfile: (Pick<StudentProfile, "onboardingStatus"> & {
    targetExamEvent: Pick<ExamEvent, "examDate" | "name"> | null;
    targetMajor: (Pick<Major, "name"> & {
      university: Pick<University, "name" | "shortName">;
    }) | null;
    targetUniversity: Pick<University, "name" | "shortName"> | null;
  }) | null;
  temporary?: boolean;
};
type StudentStatusTone = "attention" | "danger" | "neutral" | "success";

function statusTone(status: UserStatus): StudentStatusTone {
  if (status === "active") {
    return "success";
  }

  if (status === "disabled" || status === "soft_deleted") {
    return "danger";
  }

  if (status === "locked") {
    return "attention";
  }

  return "neutral";
}

const noticeMessages: Record<string, string> = {
  "student-deactivated": "Student access has been disabled and active sessions were revoked.",
  "student-deleted": "Student account deleted.",
  "student-reactivated": "Student access has been restored.",
  "students-disabled": "Selected student access has been disabled and active sessions were revoked.",
  "students-reactivated": "Selected student access has been restored.",
  "student-updated": "Student enrollment details were updated.",
};

const errorMessages: Record<string, string> = {
  "duplicate-email": "That email is already being used by another student account.",
  "bulk-status-confirmation": "Confirm the bulk status change before continuing.",
  "bulk-status-failed": "We couldn't update the selected student accounts. Refresh the directory and try again.",
  "bulk-status-no-change": "None of the selected accounts can be changed in that direction. Refresh the directory and try again.",
  "delete-confirmation": "Confirm that you want to delete this student account.",
  "delete-failed": "We're sorry, we couldn't delete that student account. Please try again.",
  "invalid-directory-query": "That directory filter is invalid or too broad. The safe directory view has been restored.",
  "invalid-user": "That account identifier is invalid. Reload the directory and try again.",
  "missing-fields": "Please add the student's name and email before updating.",
  "missing-user": "We couldn't find that student account.",
  "update-failed": "We're sorry, we couldn't update that student account. Please try again.",
};

type PaginationItem = number | "ellipsis-before" | "ellipsis-after";

function getPaginationItems(page: number, pageCount: number): PaginationItem[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const visiblePages = new Set([1, pageCount, page - 1, page, page + 1]);
  const sortedPages = [...visiblePages]
    .filter((pageNumber) => pageNumber >= 1 && pageNumber <= pageCount)
    .sort((left, right) => left - right);
  const items: PaginationItem[] = [];

  sortedPages.forEach((pageNumber, index) => {
    if (index > 0 && pageNumber - sortedPages[index - 1] > 1) {
      items.push(pageNumber > page ? "ellipsis-after" : "ellipsis-before");
    }
    items.push(pageNumber);
  });

  return items;
}

function withDemoQuery(query: string, demo: boolean) {
  if (!demo) {
    return query;
  }

  return `${query}${query ? "&" : "?"}demo=1`;
}

function EnrollmentPageModule({
  examEvents,
  error,
  focus,
  notice,
  page,
  pageCount,
  pageSize,
  demo,
  session,
  search,
  sort,
  direction,
  addedFrom,
  addedTo,
  statusFilters,
  students,
  total,
}: {
  addedFrom: string | null;
  addedTo: string | null;
  examEvents: Array<Pick<ExamEvent, "id" | "name">>;
  error?: string | null;
  focus?: string | null;
  notice?: string | null;
  page: number;
  pageCount: number;
  pageSize: DirectoryPageSize;
  demo: boolean;
  session: SessionContext;
  search: string;
  sort: DirectorySortKey | null;
  direction: DirectorySortDirection;
  statusFilters: UserStatus[];
  students: EnrolledStudent[];
  total: number;
}) {
  const pageHref = (nextPage: number) => {
    const query = withDemoQuery(buildDirectoryQuery({ addedFrom, addedTo, direction, focus: null, page: nextPage, pageSize, search, sort, status: statusFilters[0] ?? "all", statuses: statusFilters }), demo);
    return query ? `/admin/enrollment${query}` : "/admin/enrollment";
  };
  const directoryQuery = withDemoQuery(buildDirectoryQuery({ addedFrom, addedTo, direction, focus: focus ?? null, page, pageSize, search, sort, status: statusFilters[0] ?? "all", statuses: statusFilters }), demo);
  const backQuery = withDemoQuery(buildDirectoryQuery({ addedFrom, addedTo, direction, focus: null, page, pageSize, search, sort, status: statusFilters[0] ?? "all", statuses: statusFilters }), demo);
  const isEmptyDirectory = total === 0 && !search && !statusFilters.length && !addedFrom && !addedTo;
  const visibleStart = students.length ? (page - 1) * pageSize + 1 : 0;
  const visibleEnd = Math.min(page * pageSize, (page - 1) * pageSize + students.length);
  const paginationItems = getPaginationItems(page, pageCount);

  return (
    <PortalShell
      activeAdminSection="students"
      audience="admin"
      description="Browse student accounts and open one to manage access or enrollment handoffs."
      session={session}
      title="Students"
    >
      <div className="space-y-8">
        <FocusRestorer
          announcementId="student-directory-announcement"
          fallbackId="students-heading"
          noticeId="student-directory-notice"
          targetId={focus ? `student-${focus}` : null}
        />

        <ReferencePageHeader
          actions={<AddStudentDialog examEvents={examEvents} />}
          id="students-heading"
          tabIndex={-1}
          title="Students"
        />

        <p aria-live="polite" className="sr-only" id="student-directory-announcement">
          {focus ? "Returned to the selected student directory row." : ""}
        </p>
        {notice ? (
          <div id="student-directory-notice" tabIndex={-1}>
            <FormNotice tone="success">{noticeMessages[notice] ?? notice}</FormNotice>
          </div>
        ) : null}
        {demo ? (
          <FormNotice compact tone="neutral">
            Temporary demo data is active. Remove <code className="font-semibold">demo=1</code> from the URL to return to live students.
          </FormNotice>
        ) : null}
        {error ? <FormNotice tone="danger">{errorMessages[error] ?? error}</FormNotice> : null}

        <ReferenceSurface as="section" aria-label="Student directory" className="overflow-hidden">
          <StudentDirectoryTable
            backQuery={backQuery}
            dataQuery={directoryQuery}
            focus={focus ?? null}
            isEmptyDirectory={isEmptyDirectory}
            key={directoryQuery}
            search={search}
            sort={sort}
            direction={direction}
            addedFrom={addedFrom}
            addedTo={addedTo}
            demo={demo}
            pageSize={pageSize}
            statusFilters={statusFilters}
            students={students.map((student) => {
              const latestHandoff = student.enrollmentHandoffs[0] ?? null;
              const profile = student.studentProfile;

              return {
                createdAt: student.createdAt.toISOString(),
                email: student.email,
                fullName: student.fullName,
                id: student.id,
                lastLoginAt: student.lastLoginAt?.toISOString() ?? null,
                latestHandoff: latestHandoff
                  ? {
                      expiresAt: latestHandoff.expiresAt?.toISOString() ?? null,
                      method: latestHandoff.method,
                      status: latestHandoff.status,
                    }
                  : null,
                mustChangePassword: student.mustChangePassword,
                onboardingStatus: profile?.onboardingStatus ?? null,
                targetExamDate: profile?.targetExamEvent?.examDate?.toISOString() ?? null,
                targetExamName: profile?.targetExamEvent?.name ?? null,
                targetMajor: profile?.targetMajor?.name ?? null,
                targetUniversity: profile?.targetUniversity?.shortName
                  ?? profile?.targetUniversity?.name
                  ?? profile?.targetMajor?.university.shortName
                  ?? profile?.targetMajor?.university.name
                  ?? null,
                status: student.status,
                tone: statusTone(student.status),
              };
            })}
          />

          <div className="flex flex-col gap-3 border-t border-primary-100/80 px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="text-xs tabular-nums text-secondary-600">
                <span className="sr-only">Showing </span>{visibleStart}–{visibleEnd} of {total}
              </p>
              <StudentPageSizeSelect pageSize={pageSize} query={backQuery} />
            </div>
            {pageCount > 1 ? (
              <nav aria-label="Student directory pages" className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-xs font-semibold tabular-nums text-secondary-600">{page} of {pageCount}</span>
                <div className="flex min-w-0 items-center gap-0.5">
                  {page > 1 ? (
                    <Link aria-label="Previous student directory page" className={buttonVariants({ className: "size-9 rounded-lg p-0", size: "icon-sm", variant: "ghost" })} href={pageHref(page - 1)}>
                      <ChevronLeft aria-hidden="true" size={16} />
                    </Link>
                  ) : null}
                  <ol className="flex items-center gap-0.5">
                    {paginationItems.map((item) => item === "ellipsis-before" || item === "ellipsis-after" ? (
                      <li key={item}>
                        <span aria-hidden="true" className="grid size-9 place-items-center text-secondary-400">
                          <MoreHorizontal size={16} />
                        </span>
                        <span className="sr-only">More pages</span>
                      </li>
                    ) : (
                      <li key={item}>
                        <Link
                          aria-current={item === page ? "page" : undefined}
                          aria-label={`Go to page ${item}`}
                          className={buttonVariants({
                            className: item === page
                              ? "size-9 rounded-lg bg-primary-700 p-0 text-white hover:bg-primary-800"
                              : "size-9 rounded-lg p-0 text-secondary-700 hover:bg-primary-50 hover:text-primary-800",
                            size: "icon-sm",
                            variant: item === page ? "brand" : "ghost",
                          })}
                          href={pageHref(item)}
                        >
                          {item}
                        </Link>
                      </li>
                    ))}
                  </ol>
                  {page < pageCount ? (
                    <Link aria-label="Next student directory page" className={buttonVariants({ className: "size-9 rounded-lg p-0", size: "icon-sm", variant: "ghost" })} href={pageHref(page + 1)}>
                      <ChevronRight aria-hidden="true" size={16} />
                    </Link>
                  ) : null}
                </div>
              </nav>
            ) : null}
          </div>
        </ReferenceSurface>
      </div>
    </PortalShell>
  );
}

export { EnrollmentPageModule };

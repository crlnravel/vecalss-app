import Link from "next/link";

import { ChevronLeft, ChevronRight, Plus } from "@/lib/icons";
import { buttonVariants } from "@/components/ui/button-variants";
import type { EnrollmentHandoff, ExamEvent, Major, StudentProfile, University, User, UserStatus } from "@/generated/prisma/client";
import { buildDirectoryQuery } from "@/lib/admin/operations/validation";
import type { SessionContext } from "@/lib/auth/types";
import { FormNotice } from "@/modules/auth/components/form-notice";
import { PortalShell } from "@/modules/portal/components/portal-shell";

import { FocusRestorer } from "./components/focus-restorer";
import { StudentDirectoryTable } from "./components/student-directory-table";

type EnrolledStudent = Pick<User, "createdAt" | "email" | "fullName" | "id" | "lastLoginAt" | "mustChangePassword" | "status"> & {
  enrollmentHandoffs: Pick<EnrollmentHandoff, "expiresAt" | "method" | "status">[];
  studentProfile: (Pick<StudentProfile, "onboardingStatus"> & {
    targetExamEvent: Pick<ExamEvent, "examDate" | "name"> | null;
    targetMajor: (Pick<Major, "name"> & {
      university: Pick<University, "name" | "shortName">;
    }) | null;
    targetUniversity: Pick<University, "name" | "shortName"> | null;
  }) | null;
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
  "invalid-directory-query": "That directory filter is invalid or too broad. The safe directory view has been restored.",
  "invalid-user": "That account identifier is invalid. Reload the directory and try again.",
  "missing-fields": "Please add the student's name and email before updating.",
  "missing-user": "We couldn't find that student account.",
  "update-failed": "We're sorry, we couldn't update that student account. Please try again.",
};

function EnrollmentPageModule({
  error,
  focus,
  notice,
  page,
  pageCount,
  session,
  search,
  statusFilter,
  students,
  total,
}: {
  error?: string | null;
  focus?: string | null;
  notice?: string | null;
  page: number;
  pageCount: number;
  session: SessionContext;
  search: string;
  statusFilter: UserStatus | "all";
  students: EnrolledStudent[];
  total: number;
}) {
  const pageHref = (nextPage: number) => {
    const query = buildDirectoryQuery({ focus: null, page: nextPage, search, status: statusFilter });
    return query ? `/admin/enrollment${query}` : "/admin/enrollment";
  };
  const directoryQuery = buildDirectoryQuery({ focus: focus ?? null, page, search, status: statusFilter });
  const backQuery = buildDirectoryQuery({ focus: null, page, search, status: statusFilter });
  const isEmptyDirectory = total === 0 && !search && statusFilter === "all";
  const visibleStart = students.length ? (page - 1) * 20 + 1 : 0;
  const visibleEnd = Math.min(page * 20, (page - 1) * 20 + students.length);

  return (
    <PortalShell
      activeAdminSection="students"
      audience="admin"
      description="Browse student accounts and open one to manage access or enrollment handoffs."
      session={session}
      title="Students"
    >
      <div className="space-y-7">
        <FocusRestorer
          announcementId="student-directory-announcement"
          fallbackId="students-heading"
          noticeId="student-directory-notice"
          targetId={focus ? `student-${focus}` : null}
        />

        <header className="flex items-start justify-between gap-5">
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-secondary-950 sm:text-4xl" id="students-heading">
            Students
          </h1>
          <Link
            aria-label="Add student"
            className={buttonVariants({ className: "lg:mt-1", size: "icon", variant: "brand" })}
            href="/admin/enrollment/new"
            title="Add student"
          >
            <Plus aria-hidden="true" size={18} />
          </Link>
        </header>

        <p aria-live="polite" className="sr-only" id="student-directory-announcement">
          {focus ? "Returned to the selected student directory row." : ""}
        </p>
        {notice ? (
          <div id="student-directory-notice" tabIndex={-1}>
            <FormNotice tone="success">{noticeMessages[notice] ?? notice}</FormNotice>
          </div>
        ) : null}
        {error ? <FormNotice tone="danger">{errorMessages[error] ?? error}</FormNotice> : null}

        <section aria-label="Student directory" className="overflow-hidden rounded-2xl bg-white">
          <StudentDirectoryTable
            backQuery={backQuery}
            dataQuery={directoryQuery}
            focus={focus ?? null}
            isEmptyDirectory={isEmptyDirectory}
            key={directoryQuery}
            search={search}
            statusFilter={statusFilter}
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

          <div className="flex flex-col gap-3 border-t border-primary-100 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-xs tabular-nums text-secondary-600">
              <span className="sr-only">Showing </span>{visibleStart}–{visibleEnd} of {total}
            </p>
            {pageCount > 1 ? (
              <nav aria-label="Student directory pages" className="flex items-center gap-3">
                <span aria-current="page" className="text-xs font-semibold tabular-nums text-secondary-600">{page} of {pageCount}</span>
                <span className="flex items-center gap-1">
                  {page > 1 ? (
                    <Link aria-label="Previous student directory page" className={buttonVariants({ className: "size-8 rounded-lg p-0", size: "icon-sm", variant: "ghost" })} href={pageHref(page - 1)}>
                      <ChevronLeft aria-hidden="true" size={16} />
                    </Link>
                  ) : null}
                  {page < pageCount ? (
                    <Link aria-label="Next student directory page" className={buttonVariants({ className: "size-8 rounded-lg p-0", size: "icon-sm", variant: "ghost" })} href={pageHref(page + 1)}>
                      <ChevronRight aria-hidden="true" size={16} />
                    </Link>
                  ) : null}
                </span>
              </nav>
            ) : null}
          </div>
        </section>
      </div>
    </PortalShell>
  );
}

export { EnrollmentPageModule };

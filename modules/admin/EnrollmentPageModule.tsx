import Link from "next/link";

import { ArrowUpRight, Plus, Users } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { fieldControlClassName } from "@/components/ui/field-constants";
import type { EnrollmentHandoff, ExamEvent, StudentProfile, User, UserStatus } from "@/generated/prisma/client";
import { buildDirectoryQuery } from "@/lib/admin/operations/validation";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { FormNotice } from "@/modules/auth/components/form-notice";
import { ActionButtonLink } from "@/modules/home/components/home-primitives";
import { StudentBadge } from "@/components/ui/student-badge";
import { PortalShell } from "@/modules/portal/components/portal-shell";

import { CreateStudentForm } from "./components/create-student-form";
import { FocusRestorer } from "./components/focus-restorer";
import { ADMIN_CARD_CLASS_NAME } from "./admin-ui-contract";

type EnrolledStudent = Pick<User, "createdAt" | "email" | "fullName" | "id" | "status"> & {
  enrollmentHandoffs: Pick<EnrollmentHandoff, "expiresAt" | "id" | "method" | "sourceImportRowId" | "status">[];
  studentProfile: (Pick<StudentProfile, "onboardingStatus" | "targetExamEventId"> & {
    targetExamEvent: Pick<ExamEvent, "name"> | null;
  }) | null;
};

type StudentStatusTone = "attention" | "danger" | "neutral" | "success";

const noticeMessages: Record<string, string> = {
  "student-deactivated": "Student access has been disabled and active sessions were revoked.",
  "student-reactivated": "Student access has been restored.",
  "student-updated": "Student enrollment details were updated.",
};

const errorMessages: Record<string, string> = {
  "duplicate-email": "That email is already being used by another student account.",
  "invalid-directory-query": "That directory filter is invalid or too broad. The safe directory view has been restored.",
  "invalid-user": "That account identifier is invalid. Reload the directory and try again.",
  "missing-fields": "Please add the student's name and email before updating.",
  "missing-user": "We couldn't find that student account.",
  "update-failed": "We're sorry, we couldn't update that student account. Please try again.",
};

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

function formatStatus(status: UserStatus) {
  return status.replaceAll("_", " ");
}

function formatCreatedDate(value: Date) {
  return value.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function StudentDirectoryRow({
  backQuery,
  dataQuery,
  focus,
  student,
}: {
  backQuery: string;
  dataQuery: string;
  focus: string | null;
  student: EnrolledStudent;
}) {
  const detailHref = backQuery
    ? `/admin/enrollment/${student.id}?from=${encodeURIComponent(backQuery)}`
    : `/admin/enrollment/${student.id}`;
  const targetExam = student.studentProfile?.targetExamEvent?.name ?? "Not set";
  const onboardingStatus = student.studentProfile?.onboardingStatus.replaceAll("_", " ") ?? "not started";

  return (
    <article
      className={cn(
        "group px-5 py-5 transition-colors hover:bg-primary-50/35 sm:px-6",
        focus === student.id && "bg-primary-50/70 shadow-[inset_0_0_0_2px_rgba(26,107,60,0.18)]",
      )}
      data-directory-query={dataQuery}
      data-directory-row="true"
      id={`student-${student.id}`}
      key={student.id}
      tabIndex={-1}
    >
      <div className="flex min-w-0 flex-col gap-5 xl:flex-row xl:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            aria-hidden="true"
            className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary-50 text-sm font-bold text-primary-800 ring-1 ring-inset ring-primary-100"
          >
            {getInitials(student.fullName)}
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold tracking-[-0.02em] text-secondary-900">
                {student.fullName}
              </h3>
              <StudentBadge size="sm" tone={statusTone(student.status)}>
                {formatStatus(student.status)}
              </StudentBadge>
            </div>
            <p className="mt-1 truncate text-sm text-secondary-600">{student.email}</p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3 xl:w-[min(50%,33rem)] xl:shrink-0">
          <div className="min-w-0">
            <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-secondary-500">Exam goal</dt>
            <dd className="mt-1 truncate font-medium text-secondary-800" title={targetExam}>{targetExam}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-secondary-500">Onboarding</dt>
            <dd className="mt-1 truncate font-medium capitalize text-secondary-800">{onboardingStatus}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-secondary-500">Added</dt>
            <dd className="mt-1 truncate font-medium text-secondary-800">{formatCreatedDate(student.createdAt)}</dd>
          </div>
        </dl>

        <Link
          aria-label={`View details for ${student.fullName}`}
          className={buttonVariants({
            className: "min-h-11 w-full xl:w-auto",
            size: "sm",
            variant: "brandOutline",
          })}
          href={detailHref}
        >
          View details
          <ArrowUpRight aria-hidden="true" size={16} />
        </Link>
      </div>
    </article>
  );
}

function EnrollmentPageModule({
  error,
  examEvents,
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
  examEvents: ExamEvent[];
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

  return (
    <PortalShell
      activeAdminSection="students"
      audience="admin"
      description="Manage student access and enrollment handoffs."
      session={session}
      title="Students"
    >
      <div className="space-y-7">
        <h1 className="sr-only">Students</h1>
        <FocusRestorer
          announcementId="student-directory-announcement"
          fallbackId="student-directory-heading"
          noticeId="student-directory-notice"
          targetId={focus ? `student-${focus}` : null}
        />

        <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="max-w-[62ch]">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary-800">
              <Users aria-hidden="true" size={17} />
              <span>{total.toLocaleString("en-US")} student accounts</span>
            </div>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-secondary-950 sm:text-4xl">
              Keep every student account easy to find.
            </h2>
            <p className="mt-3 text-sm leading-7 text-secondary-600 sm:text-base">
              Scan access, enrollment goals, and onboarding at a glance. Open a student to edit their account or resolve a handoff.
            </p>
          </div>
          <Link
            className={buttonVariants({ className: "min-h-11", variant: "brand" })}
            href="#create-student-account"
          >
            <Plus aria-hidden="true" size={17} />
            Add student
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

        <section aria-labelledby="student-directory-heading" className={`${ADMIN_CARD_CLASS_NAME} overflow-hidden`}>
          <div className="p-5 sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.03em] text-secondary-900" id="student-directory-heading" tabIndex={-1}>
                  Student directory
                </h2>
                <p className="mt-1 text-sm leading-6 text-secondary-600">
                  Choose a student to view and manage their account details.
                </p>
              </div>
              <span className="inline-flex w-fit items-center rounded-full bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-800">
                {students.length ? `${(page - 1) * 20 + 1}–${(page - 1) * 20 + students.length} shown` : "0 shown"}
              </span>
            </div>

            <form className="mt-5 grid gap-3 rounded-3xl border border-primary-100 bg-primary-50/60 p-4 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-end" method="get">
              <label className="space-y-2 text-sm">
                <span className="font-medium text-secondary-900">Search students</span>
                <input className={fieldControlClassName} defaultValue={search} name="q" placeholder="Name or email" type="search" />
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-medium text-secondary-900">Status</span>
                <select className={`${fieldControlClassName} pr-12`} defaultValue={statusFilter} name="status">
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                  <option value="locked">Locked</option>
                </select>
              </label>
              <Button className="min-h-11" type="submit" variant="brand">Apply filters</Button>
            </form>
          </div>

          {students.length === 0 ? (
            <div className="border-t border-primary-100 px-5 py-8 sm:px-6 sm:py-10">
              <div className="rounded-3xl border border-dashed border-primary-200 bg-secondary-50 px-6 py-8 md:px-8 md:py-10">
                <h3 className="max-w-[18ch] text-2xl font-semibold leading-tight tracking-[-0.03em] text-secondary-900 md:text-3xl">
                  {total === 0 ? "No student accounts match this view." : "No students match these filters."}
                </h3>
                <p className="mt-4 max-w-[58ch] text-sm leading-7 text-secondary-600 md:text-base">
                  {total === 0
                    ? "Use the form below to add the first account and choose its handoff."
                    : "Try another name, email, or status filter to find the account you need."}
                </p>
                <div className="mt-6">
                  <ActionButtonLink href="#create-student-account">Go to the create form</ActionButtonLink>
                </div>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-primary-100 border-t border-primary-100">
              {students.map((student) => (
                <StudentDirectoryRow
                  backQuery={backQuery}
                  dataQuery={directoryQuery}
                  focus={focus ?? null}
                  key={student.id}
                  student={student}
                />
              ))}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-primary-100 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-xs text-secondary-600">
              Showing {students.length ? (page - 1) * 20 + 1 : 0}–{Math.min(page * 20, (page - 1) * 20 + students.length)} of {total} students
            </p>
            {pageCount > 1 ? (
              <nav aria-label="Student directory pages" className="flex items-center gap-2">
                {page > 1 ? <Link className={buttonVariants({ className: "min-h-11", size: "sm", variant: "brandOutline" })} href={pageHref(page - 1)}>Previous</Link> : null}
                <span aria-current="page" className="rounded-xl bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-800">Page {page} of {pageCount}</span>
                {page < pageCount ? <Link className={buttonVariants({ className: "min-h-11", size: "sm", variant: "brandOutline" })} href={pageHref(page + 1)}>Next</Link> : null}
              </nav>
            ) : null}
          </div>
        </section>

        <CreateStudentForm examEvents={examEvents} />
      </div>
    </PortalShell>
  );
}

export { EnrollmentPageModule };

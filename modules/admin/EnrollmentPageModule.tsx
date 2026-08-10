import Link from "next/link";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { fieldControlClassName } from "@/components/ui/field-constants";
import type { EnrollmentHandoff, ExamEvent, StudentProfile, User, UserStatus } from "@/generated/prisma/client";
import { buildDirectoryQuery } from "@/lib/admin/operations/validation";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { FormNotice } from "@/modules/auth/components/form-notice";
import { ActionButtonLink } from "@/modules/home/components/home-primitives";
import { PortalShell } from "@/modules/portal/components/portal-shell";

import {
  deactivateStudentEnrollmentAction,
  reactivateStudentEnrollmentAction,
  updateStudentEnrollmentAction,
} from "./actions";
import { CreateStudentForm } from "./components/create-student-form";
import { FocusRestorer } from "./components/focus-restorer";
import { HandoffControls } from "./components/handoff-controls";

type EnrolledStudent = Pick<User, "createdAt" | "email" | "fullName" | "id" | "mustChangePassword" | "status"> & {
  enrollmentHandoffs: Pick<EnrollmentHandoff, "expiresAt" | "id" | "method" | "sourceImportRowId" | "status">[];
  studentProfile: Pick<StudentProfile, "onboardingStatus" | "targetExamEventId"> | null;
};

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

  return (
    <PortalShell
      audience="admin"
      activeAdminSection="students"
      description="Admins can provision approved students, hand off a temporary password, and manage account status without leaving the main app."
      title="Student enrollment"
      userLabel={session.user.fullName}
    >
      <div className="space-y-6">
        <FocusRestorer announcementId="student-directory-announcement" fallbackId="student-directory-heading" noticeId="student-directory-notice" targetId={focus ? `student-${focus}` : null} />
        <CreateStudentForm examEvents={examEvents} />

        <p aria-live="polite" className="sr-only" id="student-directory-announcement">{focus ? "Returned to the selected student directory row." : ""}</p>
        {notice ? <div id="student-directory-notice" tabIndex={-1}><FormNotice tone="success">{noticeMessages[notice] ?? notice}</FormNotice></div> : null}
        {error ? <FormNotice tone="danger">{errorMessages[error] ?? error}</FormNotice> : null}

        <section className="overflow-hidden rounded-5xl border border-primary-100 bg-white p-6 shadow-[0_18px_60px_-40px_rgba(17,37,26,0.45)]">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs tracking-[0.16em] text-primary-700 uppercase">
                Current students
              </p>
              <h2 className="mt-2 text-2xl font-medium" id="student-directory-heading" tabIndex={-1}>Manage existing enrollments</h2>
            </div>
            <p className="text-sm leading-6 text-secondary-600">
              Updating a student keeps the same account and audit trail. Deactivation revokes
              active sessions immediately.
            </p>
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
            <Button type="submit" variant="brand">Apply filters</Button>
          </form>

          <div className="mt-6 space-y-4">
            {students.length === 0 ? (
              <div className="parchment-panel rounded-5xl px-6 py-8 md:px-8 md:py-10">
                <p className="text-xs tracking-[0.16em] text-primary-700 uppercase">
                  Empty roster
                </p>
                <h3 className="mt-3 max-w-[16ch] text-2xl leading-tight font-medium text-secondary-900 md:text-3xl">
                  {total === 0 ? "No student accounts match this view." : "No students match these filters."}
                </h3>
                <p className="mt-4 max-w-[58ch] text-sm leading-7 text-secondary-600 md:text-base">
                  {total === 0
                    ? "Use the create-student form above to set the first account, issue a temporary password, and start the active roster with a clean handoff."
                    : "Try another name, email, or status filter to find the account you need."}
                </p>
                <div className="mt-6">
                  <ActionButtonLink href="#create-student-account">Return to the create form</ActionButtonLink>
                </div>
              </div>
            ) : (
              students.map((student) => (
                <article
                  className={cn(
                    "overflow-hidden rounded-4xl border border-primary-100 p-5 transition-shadow",
                    focus === student.id && "shadow-[0_0_0_2px_rgba(26,107,60,0.18)]",
                  )}
                  data-directory-row="true"
                  id={`student-${student.id}`}
                  key={student.id}
                  tabIndex={-1}
                >
                  <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(280px,0.9fr)]">
                    <div className="xl:col-span-3">
                      <form action={updateStudentEnrollmentAction} className="grid min-w-0 gap-5 xl:grid-cols-3">
                        <input name="userId" type="hidden" value={student.id} />
                        <input name="directoryQuery" type="hidden" value={directoryQuery} />

                        <label className="min-w-0 space-y-2 text-sm">
                          <span className="font-medium text-secondary-900">Student name</span>
                          <input
                            className={fieldControlClassName}
                            defaultValue={student.fullName}
                            name="fullName"
                            required
                            type="text"
                          />
                        </label>

                        <label className="min-w-0 space-y-2 text-sm">
                          <span className="font-medium text-secondary-900">Student email</span>
                          <input
                            className={fieldControlClassName}
                            defaultValue={student.email}
                            name="email"
                            required
                            type="email"
                          />
                        </label>

                        <label className="min-w-0 space-y-2 text-sm">
                          <span className="font-medium text-secondary-900">Target exam</span>
                          <select
                            className={`${fieldControlClassName} pr-12`}
                            defaultValue={student.studentProfile?.targetExamEventId ?? ""}
                            name="targetExamEventId"
                          >
                            <option value="">Set later</option>
                            {examEvents.map((examEvent) => (
                              <option key={examEvent.id} value={examEvent.id}>
                                {examEvent.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <div className="xl:col-span-3 flex justify-start md:justify-end">
                          <Button type="submit" variant="brand">
                            Save changes
                          </Button>
                        </div>
                      </form>
                    </div>

                    <div className="min-w-0 flex flex-col gap-3">
                      <div className="rounded-2xl bg-primary-50 px-4 py-3 text-sm leading-6 text-secondary-700">
                        <p className="font-medium text-secondary-900">Account state</p>
                        <p className="mt-1 capitalize">{student.status.replaceAll("_", " ")}</p>
                        <p className="mt-1 capitalize">
                          Onboarding: {student.studentProfile?.onboardingStatus.replaceAll("_", " ") ?? "not started"}
                        </p>
                        <p className="mt-1">
                          {student.mustChangePassword
                            ? "Must change password on next login"
                            : "Password already updated"}
                        </p>
                      </div>
                      {student.status === "active" ? (
                        <form action={deactivateStudentEnrollmentAction} className="space-y-3">
                          <input name="userId" type="hidden" value={student.id} />
                          <input name="directoryQuery" type="hidden" value={directoryQuery} />
                          <label className="flex items-start gap-2 text-xs leading-5 text-secondary-600">
                            <input className="mt-1" name="confirmation" required type="checkbox" value="deactivate" />
                            <span>I understand this disables the account, revokes active sessions, and invalidates open handoffs.</span>
                          </label>
                          <Button className="w-full" type="submit" variant="destructive">
                            Deactivate
                          </Button>
                        </form>
                      ) : student.status === "disabled" ? (
                        <form action={reactivateStudentEnrollmentAction} className="space-y-3">
                          <input name="userId" type="hidden" value={student.id} />
                          <input name="directoryQuery" type="hidden" value={directoryQuery} />
                          <label className="flex items-start gap-2 text-xs leading-5 text-secondary-600">
                            <input className="mt-1" name="confirmation" required type="checkbox" value="reactivate" />
                            <span>I understand reactivation does not restore old sessions or handoffs.</span>
                          </label>
                          <button
                            className={buttonVariants({ className: "w-full", variant: "brandOutline" })}
                            type="submit"
                          >
                            Reactivate
                          </button>
                        </form>
                      ) : (
                        <p className="rounded-2xl border border-secondary-200 bg-secondary-50 px-4 py-3 text-xs leading-5 text-secondary-600">
                          This account needs manual recovery before enrollment status can be changed.
                        </p>
                      )}
                      {student.enrollmentHandoffs[0] ? (
                        <HandoffControls
                          expiresAt={student.enrollmentHandoffs[0].expiresAt}
                          handoffId={student.enrollmentHandoffs[0].id}
                          method={student.enrollmentHandoffs[0].method}
                          sourceImportRowId={student.enrollmentHandoffs[0].sourceImportRowId ?? null}
                          status={student.enrollmentHandoffs[0].status}
                        />
                      ) : null}
                    </div>
                  </div>

                  <p className="mt-4 text-xs leading-6 text-secondary-500">
                    Created on {student.createdAt.toLocaleDateString("en-US", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </article>
              ))
            )}
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-primary-100 pt-4 text-sm md:flex-row md:items-center md:justify-between">
            <p className="text-xs text-secondary-600">Showing {students.length ? (page - 1) * 20 + 1 : 0}–{Math.min(page * 20, (page - 1) * 20 + students.length)} of {total} students</p>
            {pageCount > 1 ? (
              <nav aria-label="Student directory pages" className="flex items-center gap-2">
                {page > 1 ? <Link className={buttonVariants({ className: "min-h-11", size: "sm", variant: "brandOutline" })} href={pageHref(page - 1)}>Previous</Link> : null}
                <span aria-current="page" className="rounded-xl bg-primary-50 px-3 py-2 text-xs font-bold text-primary-800">Page {page} of {pageCount}</span>
                {page < pageCount ? <Link className={buttonVariants({ className: "min-h-11", size: "sm", variant: "brandOutline" })} href={pageHref(page + 1)}>Next</Link> : null}
              </nav>
            ) : null}
          </div>
        </section>
      </div>
    </PortalShell>
  );
}

export { EnrollmentPageModule };

import { Button, buttonVariants } from "@/components/ui/button";
import { fieldControlClassName } from "@/components/ui/field";
import type { ExamEvent, StudentProfile, User } from "@/generated/prisma/client";
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

type EnrolledStudent = Pick<User, "createdAt" | "email" | "fullName" | "id" | "mustChangePassword" | "status"> & {
  studentProfile: Pick<StudentProfile, "onboardingStatus" | "targetExamEventId"> | null;
};

const noticeMessages: Record<string, string> = {
  "student-deactivated": "Student access has been disabled and active sessions were revoked.",
  "student-reactivated": "Student access has been restored.",
  "student-updated": "Student enrollment details were updated.",
};

const errorMessages: Record<string, string> = {
  "duplicate-email": "That email is already being used by another student account.",
  "missing-fields": "Please add the student's name and email before updating.",
  "missing-user": "We couldn't find that student account.",
  "update-failed": "We're sorry, we couldn't update that student account. Please try again.",
};

function EnrollmentPageModule({
  error,
  examEvents,
  focus,
  notice,
  session,
  students,
}: {
  error?: string | null;
  examEvents: ExamEvent[];
  focus?: string | null;
  notice?: string | null;
  session: SessionContext;
  students: EnrolledStudent[];
}) {
  return (
    <PortalShell
      audience="admin"
      description="Admins can provision approved students, hand off a temporary password, and manage account status without leaving the main app."
      title="Student enrollment"
      userLabel={session.user.fullName}
    >
      <div className="space-y-6">
        <CreateStudentForm examEvents={examEvents} />

        {notice ? <FormNotice tone="success">{noticeMessages[notice] ?? notice}</FormNotice> : null}
        {error ? <FormNotice tone="danger">{errorMessages[error] ?? error}</FormNotice> : null}

        <section className="overflow-hidden rounded-[28px] border border-primary-100 bg-white p-6 shadow-[0_18px_60px_-40px_rgba(17,37,26,0.45)]">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs tracking-[0.16em] text-primary-700 uppercase">
                Current students
              </p>
              <h2 className="mt-2 text-2xl font-medium">Manage existing enrollments</h2>
            </div>
            <p className="text-sm leading-6 text-secondary-600">
              Updating a student keeps the same account and audit trail. Deactivation revokes
              active sessions immediately.
            </p>
          </div>

          <div className="mt-6 space-y-4">
            {students.length === 0 ? (
              <div className="parchment-panel rounded-[28px] px-6 py-8 md:px-8 md:py-10">
                <p className="text-xs tracking-[0.16em] text-primary-700 uppercase">
                  Empty roster
                </p>
                <h3 className="mt-3 max-w-[16ch] text-2xl leading-tight font-medium text-secondary-900 md:text-3xl">
                  No student accounts have been provisioned yet.
                </h3>
                <p className="mt-4 max-w-[58ch] text-sm leading-7 text-secondary-600 md:text-base">
                  Use the create-student form above to set the first account, issue a
                  temporary password, and start the active roster with a clean handoff.
                </p>
                <div className="mt-6">
                  <ActionButtonLink href="#create-student-account">Return to the create form</ActionButtonLink>
                </div>
              </div>
            ) : (
              students.map((student) => (
                <article
                  className={cn(
                    "overflow-hidden rounded-[24px] border border-primary-100 p-5 transition-shadow",
                    focus === student.id && "shadow-[0_0_0_2px_rgba(26,107,60,0.18)]",
                  )}
                  id={`student-${student.id}`}
                  key={student.id}
                >
                  <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(280px,0.9fr)]">
                    <div className="xl:col-span-3">
                      <form action={updateStudentEnrollmentAction} className="grid min-w-0 gap-5 xl:grid-cols-3">
                        <input name="userId" type="hidden" value={student.id} />

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
                        <form action={deactivateStudentEnrollmentAction}>
                          <input name="userId" type="hidden" value={student.id} />
                          <Button className="w-full" type="submit" variant="destructive">
                            Deactivate
                          </Button>
                        </form>
                      ) : (
                        <form action={reactivateStudentEnrollmentAction}>
                          <input name="userId" type="hidden" value={student.id} />
                          <button
                            className={buttonVariants({ className: "w-full", variant: "brandOutline" })}
                            type="submit"
                          >
                            Reactivate
                          </button>
                        </form>
                      )}
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
        </section>
      </div>
    </PortalShell>
  );
}

export { EnrollmentPageModule };

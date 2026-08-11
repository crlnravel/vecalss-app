import Link from "next/link";

import { ArrowLeft, CheckCircle2, Clock3, ShieldCheck, UserRound } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { fieldControlClassName } from "@/components/ui/field-constants";
import type {
  EnrollmentHandoff,
  ExamEvent,
  Major,
  StudentProfile,
  University,
  User,
  UserStatus,
} from "@/generated/prisma/client";
import type { SessionContext } from "@/lib/auth/types";
import { FormNotice } from "@/modules/auth/components/form-notice";
import { StudentBadge } from "@/components/ui/student-badge";
import { PortalShell } from "@/modules/portal/components/portal-shell";

import {
  deactivateStudentEnrollmentAction,
  reactivateStudentEnrollmentAction,
  updateStudentEnrollmentAction,
} from "./actions";
import { HandoffControls } from "./components/handoff-controls";
import { ADMIN_CARD_CLASS_NAME } from "./admin-ui-contract";

type StudentDetail = Pick<
  User,
  "createdAt" | "email" | "failedLoginCount" | "fullName" | "id" | "lastLoginAt" | "lockedUntil" | "mustChangePassword" | "status"
> & {
  enrollmentHandoffs: Pick<EnrollmentHandoff, "expiresAt" | "id" | "method" | "sourceImportRowId" | "status">[];
  studentProfile: (Pick<
    StudentProfile,
    "currentStreak" | "longestStreak" | "onboardingStatus" | "targetExamEventId" | "timezone"
  > & {
    targetExamEvent: Pick<ExamEvent, "examDate" | "name"> | null;
    targetMajor: (Pick<Major, "faculty" | "name"> & {
      university: Pick<University, "name" | "shortName">;
    }) | null;
    targetUniversity: Pick<University, "name" | "shortName"> | null;
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
  "missing-fields": "Please add the student's name and email before updating.",
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

function formatDate(value: Date | null) {
  if (!value) {
    return "Not recorded";
  }

  return value.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: Date | null) {
  if (!value) {
    return "Not recorded";
  }

  return value.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function StudentStatusAction({
  returnPath,
  student,
}: {
  returnPath: string;
  student: StudentDetail;
}) {
  if (student.status === "active") {
    return (
      <form action={deactivateStudentEnrollmentAction} className="mt-5 space-y-3">
        <input name="userId" type="hidden" value={student.id} />
        <input name="returnPath" type="hidden" value={returnPath} />
        <label className="flex items-start gap-2 text-xs leading-5 text-secondary-600">
          <input className="mt-1" name="confirmation" required type="checkbox" value="deactivate" />
          <span>I understand this disables the account, revokes active sessions, and invalidates open handoffs.</span>
        </label>
        <Button className="w-full" type="submit" variant="destructive">Deactivate access</Button>
      </form>
    );
  }

  if (student.status === "disabled") {
    return (
      <form action={reactivateStudentEnrollmentAction} className="mt-5 space-y-3">
        <input name="userId" type="hidden" value={student.id} />
        <input name="returnPath" type="hidden" value={returnPath} />
        <label className="flex items-start gap-2 text-xs leading-5 text-secondary-600">
          <input className="mt-1" name="confirmation" required type="checkbox" value="reactivate" />
          <span>I understand reactivation does not restore old sessions or handoffs.</span>
        </label>
        <Button className="w-full" type="submit" variant="brandOutline">Reactivate access</Button>
      </form>
    );
  }

  return (
    <p className="mt-5 rounded-2xl border border-secondary-200 bg-secondary-50 px-4 py-3 text-xs leading-5 text-secondary-600">
      This account needs manual recovery before enrollment status can be changed.
    </p>
  );
}

function StudentDetailPageModule({
  backHref,
  error,
  examEvents,
  notice,
  returnPath,
  session,
  student,
}: {
  backHref: string;
  error?: string | null;
  examEvents: ExamEvent[];
  notice?: string | null;
  returnPath: string;
  session: SessionContext;
  student: StudentDetail;
}) {
  const profile = student.studentProfile;
  const targetExam = profile?.targetExamEvent?.name ?? "Not set";
  const targetUniversity = profile?.targetUniversity?.shortName || profile?.targetUniversity?.name || "Not set";
  const targetMajor = profile?.targetMajor?.name ?? "Not set";
  const latestHandoff = student.enrollmentHandoffs[0] ?? null;

  return (
    <PortalShell
      activeAdminSection="students"
      audience="admin"
      description={`Manage the student account for ${student.fullName}.`}
      session={session}
      title="Student details"
    >
      <div className="space-y-7">
        <Link
          className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl px-2 text-sm font-semibold text-secondary-700 transition-colors hover:bg-primary-50 hover:text-primary-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
          href={backHref}
        >
          <ArrowLeft aria-hidden="true" size={17} />
          Back to Students
        </Link>

        <header className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span
              aria-hidden="true"
              className="grid size-14 shrink-0 place-items-center rounded-3xl bg-primary-700 text-lg font-bold text-white shadow-[0_12px_26px_-18px_rgba(1,76,56,0.75)]"
            >
              {getInitials(student.fullName)}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-3xl font-semibold tracking-[-0.04em] text-secondary-950 sm:text-4xl">
                  {student.fullName}
                </h1>
                <StudentBadge size="sm" tone={statusTone(student.status)}>
                  {formatStatus(student.status)}
                </StudentBadge>
              </div>
              <p className="mt-2 break-all text-sm text-secondary-600">{student.email}</p>
              <p className="mt-2 text-xs text-secondary-500">Student account · Added {formatDate(student.createdAt)}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-2xl border border-primary-100 bg-primary-50/70 px-3 py-2 text-xs font-semibold text-primary-800">
            <ShieldCheck aria-hidden="true" size={16} />
            Admin access only
          </div>
        </header>

        {notice ? <FormNotice tone="success">{noticeMessages[notice] ?? notice}</FormNotice> : null}
        {error ? <FormNotice tone="danger">{errorMessages[error] ?? error}</FormNotice> : null}

        <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <div className="min-w-0 space-y-6">
            <section aria-labelledby="account-details-heading" className={`${ADMIN_CARD_CLASS_NAME} p-5 sm:p-6`}>
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.03em] text-secondary-900" id="account-details-heading">
                  Account details
                </h2>
                <p className="mt-1 text-sm leading-6 text-secondary-600">
                  Update the account identity and the exam goal used during enrollment.
                </p>
              </div>

              <form action={updateStudentEnrollmentAction} className="mt-6 grid gap-5 md:grid-cols-2">
                <input name="userId" type="hidden" value={student.id} />
                <input name="returnPath" type="hidden" value={returnPath} />
                <label className="min-w-0 space-y-2 text-sm">
                  <span className="font-medium text-secondary-900">Student name</span>
                  <input className={fieldControlClassName} defaultValue={student.fullName} name="fullName" required type="text" />
                </label>
                <label className="min-w-0 space-y-2 text-sm">
                  <span className="font-medium text-secondary-900">Student email</span>
                  <input className={fieldControlClassName} defaultValue={student.email} name="email" required type="email" />
                </label>
                <label className="min-w-0 space-y-2 text-sm md:col-span-2">
                  <span className="font-medium text-secondary-900">Target exam</span>
                  <select
                    className={`${fieldControlClassName} pr-12`}
                    defaultValue={profile?.targetExamEventId ?? ""}
                    name="targetExamEventId"
                  >
                    <option value="">Set later</option>
                    {examEvents.map((examEvent) => (
                      <option key={examEvent.id} value={examEvent.id}>{examEvent.name}</option>
                    ))}
                  </select>
                </label>
                <div className="flex justify-start md:col-span-2 md:justify-end">
                  <Button className="min-h-11" type="submit" variant="brand">Save changes</Button>
                </div>
              </form>
            </section>

            <section aria-labelledby="learning-profile-heading" className={`${ADMIN_CARD_CLASS_NAME} p-5 sm:p-6`}>
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.03em] text-secondary-900" id="learning-profile-heading">
                  Learning profile
                </h2>
                <p className="mt-1 text-sm leading-6 text-secondary-600">
                  Read-only context from the student workspace.
                </p>
              </div>

              <dl className="mt-6 divide-y divide-primary-100 rounded-3xl border border-primary-100 bg-primary-50/45">
                <div className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(10rem,0.7fr)_minmax(0,1fr)] sm:gap-5">
                  <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-secondary-500">Onboarding</dt>
                  <dd className="font-medium capitalize text-secondary-800">{profile?.onboardingStatus.replaceAll("_", " ") ?? "not started"}</dd>
                </div>
                <div className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(10rem,0.7fr)_minmax(0,1fr)] sm:gap-5">
                  <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-secondary-500">Exam goal</dt>
                  <dd className="font-medium text-secondary-800">{targetExam}</dd>
                </div>
                <div className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(10rem,0.7fr)_minmax(0,1fr)] sm:gap-5">
                  <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-secondary-500">University</dt>
                  <dd className="font-medium text-secondary-800">{targetUniversity}</dd>
                </div>
                <div className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(10rem,0.7fr)_minmax(0,1fr)] sm:gap-5">
                  <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-secondary-500">Major</dt>
                  <dd className="font-medium text-secondary-800">{targetMajor}</dd>
                </div>
                <div className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(10rem,0.7fr)_minmax(0,1fr)] sm:gap-5">
                  <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-secondary-500">Current streak</dt>
                  <dd className="font-medium text-secondary-800">{profile?.currentStreak ?? 0} days <span className="font-normal text-secondary-500">· longest {profile?.longestStreak ?? 0} days</span></dd>
                </div>
              </dl>
            </section>
          </div>

          <aside className="min-w-0 space-y-6">
            <section aria-labelledby="account-state-heading" className={`${ADMIN_CARD_CLASS_NAME} p-5 sm:p-6`}>
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary-50 text-primary-800">
                  <UserRound aria-hidden="true" size={20} />
                </span>
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.03em] text-secondary-900" id="account-state-heading">Account state</h2>
                  <p className="mt-1 text-sm leading-6 text-secondary-600">Access controls and sign-in health.</p>
                </div>
              </div>

              <div className="mt-5 rounded-3xl bg-primary-50/70 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-secondary-900">Current status</span>
                  <StudentBadge size="sm" tone={statusTone(student.status)}>{formatStatus(student.status)}</StudentBadge>
                </div>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-4 border-t border-primary-100 pt-3">
                    <dt className="text-secondary-600">Last sign-in</dt>
                    <dd className="text-right font-medium text-secondary-800">{formatDateTime(student.lastLoginAt)}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-4 border-t border-primary-100 pt-3">
                    <dt className="text-secondary-600">Password</dt>
                    <dd className="text-right font-medium text-secondary-800">{student.mustChangePassword ? "Change required" : "Set"}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-4 border-t border-primary-100 pt-3">
                    <dt className="text-secondary-600">Failed attempts</dt>
                    <dd className="font-medium tabular-nums text-secondary-800">{student.failedLoginCount}</dd>
                  </div>
                  {student.lockedUntil ? (
                    <div className="flex items-start justify-between gap-4 border-t border-primary-100 pt-3">
                      <dt className="text-secondary-600">Lock expires</dt>
                      <dd className="text-right font-medium text-secondary-800">{formatDateTime(student.lockedUntil)}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>

              <StudentStatusAction returnPath={returnPath} student={student} />
            </section>

            <section aria-labelledby="handoff-heading" className={`${ADMIN_CARD_CLASS_NAME} p-5 sm:p-6`}>
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary-50 text-primary-800">
                  <Clock3 aria-hidden="true" size={20} />
                </span>
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.03em] text-secondary-900" id="handoff-heading">Credential handoff</h2>
                  <p className="mt-1 text-sm leading-6 text-secondary-600">Review the latest one-time access delivery.</p>
                </div>
              </div>

              {latestHandoff ? (
                <div className="mt-5">
                  <HandoffControls
                    expiresAt={latestHandoff.expiresAt}
                    handoffId={latestHandoff.id}
                    method={latestHandoff.method}
                    sourceImportRowId={latestHandoff.sourceImportRowId ?? null}
                    status={latestHandoff.status}
                  />
                </div>
              ) : (
                <div className="mt-5 rounded-3xl border border-dashed border-primary-200 bg-primary-50/60 px-4 py-6 text-center">
                  <CheckCircle2 aria-hidden="true" className="mx-auto text-primary-700" size={21} />
                  <p className="mt-2 text-sm font-semibold text-secondary-900">No open handoff</p>
                  <p className="mt-1 text-xs leading-5 text-secondary-600">Create a replacement handoff from the enrollment workflow when access needs to be delivered again.</p>
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>
    </PortalShell>
  );
}

export { StudentDetailPageModule };
export type { StudentDetail };

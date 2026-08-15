import Link from "next/link";

import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Pencil,
  ShieldCheck,
  Target,
  UserRound,
} from "@/lib/icons";
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
import { ADMIN_CARD_CLASS_NAME, ADMIN_INSET_CLASS_NAME } from "./admin-ui-contract";

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

function formatExamDate(value: Date | null) {
  if (!value) {
    return null;
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
      <form action={deactivateStudentEnrollmentAction} className="mt-6 space-y-3 border-t border-primary-100 pt-5">
        <input name="userId" type="hidden" value={student.id} />
        <input name="returnPath" type="hidden" value={returnPath} />
        <label className="flex items-start gap-3 text-xs leading-5 text-secondary-600">
          <input className="mt-1 size-4 shrink-0 accent-primary-700" name="confirmation" required type="checkbox" value="deactivate" />
          <span>I understand this disables the account, revokes active sessions, and invalidates open handoffs.</span>
        </label>
        <Button className="w-full" type="submit" variant="destructive">Deactivate access</Button>
      </form>
    );
  }

  if (student.status === "disabled") {
    return (
      <form action={reactivateStudentEnrollmentAction} className="mt-6 space-y-3 border-t border-primary-100 pt-5">
        <input name="userId" type="hidden" value={student.id} />
        <input name="returnPath" type="hidden" value={returnPath} />
        <label className="flex items-start gap-3 text-xs leading-5 text-secondary-600">
          <input className="mt-1 size-4 shrink-0 accent-primary-700" name="confirmation" required type="checkbox" value="reactivate" />
          <span>I understand reactivation does not restore old sessions or handoffs.</span>
        </label>
        <Button className="w-full" type="submit" variant="brandOutline">Reactivate access</Button>
      </form>
    );
  }

  return (
    <p className="mt-6 border-t border-primary-100 pt-5 text-xs leading-5 text-secondary-600">
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
  const targetExamDate = formatExamDate(profile?.targetExamEvent?.examDate ?? null);
  const targetUniversity =
    profile?.targetUniversity?.shortName ||
    profile?.targetUniversity?.name ||
    profile?.targetMajor?.university.shortName ||
    profile?.targetMajor?.university.name ||
    "Not set";
  const targetMajor = profile?.targetMajor?.name ?? "Not set";
  const onboardingStatus = profile?.onboardingStatus.replaceAll("_", " ") ?? "not started";
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
        <nav aria-label="Student navigation">
          <Link
            className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl px-2 text-sm font-semibold text-secondary-700 transition-colors hover:bg-primary-50 hover:text-primary-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
            href={backHref}
          >
            <ArrowLeft aria-hidden="true" size={17} />
            Back to Students
          </Link>
        </nav>

        <header className="overflow-hidden rounded-4xl border border-primary-100 bg-white shadow-[0_24px_60px_-46px_rgba(1,76,56,0.5)]">
          <div className="bg-primary-50/55 px-5 py-6 sm:px-7 sm:py-7">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <span
                  aria-hidden="true"
                  className="grid size-16 shrink-0 place-items-center rounded-3xl bg-primary-700 text-lg font-bold text-white shadow-[0_12px_26px_-18px_rgba(1,76,56,0.75)]"
                >
                  {getInitials(student.fullName)}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="max-w-full truncate text-3xl font-semibold tracking-[-0.04em] text-secondary-950 sm:text-4xl">
                      {student.fullName}
                    </h1>
                    <StudentBadge size="sm" tone={statusTone(student.status)}>
                      {formatStatus(student.status)}
                    </StudentBadge>
                  </div>
                  <p className="mt-2 break-all text-sm text-secondary-700">{student.email}</p>
                  <p className="mt-2 text-xs text-secondary-500">Student account · Added {formatDate(student.createdAt)}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs font-semibold text-primary-800">
                <ShieldCheck aria-hidden="true" size={17} />
                Admin access only
              </div>
            </div>

            <dl className="mt-6 grid gap-4 border-t border-primary-200/70 pt-5 sm:grid-cols-2 sm:gap-0 sm:divide-x sm:divide-primary-200/70">
              <div className="min-w-0 sm:px-5 sm:first:pl-0">
                <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-secondary-500">Onboarding</dt>
                <dd className="mt-1.5 truncate text-sm font-semibold capitalize text-secondary-900">{onboardingStatus}</dd>
              </div>
              <div className="min-w-0 sm:px-5">
                <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-secondary-500">Target exam</dt>
                <dd className="mt-1.5 truncate text-sm font-semibold text-secondary-900">{targetExam}</dd>
                {targetExamDate ? <time className="mt-0.5 block text-xs text-secondary-600" dateTime={profile?.targetExamEvent?.examDate?.toISOString()}>{targetExamDate}</time> : null}
              </div>
            </dl>
          </div>
        </header>

        {notice ? <FormNotice tone="success">{noticeMessages[notice] ?? notice}</FormNotice> : null}
        {error ? <FormNotice tone="danger">{errorMessages[error] ?? error}</FormNotice> : null}

        <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.75fr)]">
          <section aria-labelledby="learning-profile-heading" className={`${ADMIN_CARD_CLASS_NAME} min-w-0 p-5 sm:p-6 xl:col-start-1 xl:row-start-1`}>
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary-50 text-primary-800">
                <Target aria-hidden="true" size={20} />
              </span>
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.03em] text-secondary-900" id="learning-profile-heading">
                  Enrollment snapshot
                </h2>
                <p className="mt-1 text-sm leading-6 text-secondary-600">
                  The learning goal and context most useful for enrollment support.
                </p>
              </div>
            </div>

            <dl className="mt-6 divide-y divide-primary-100 border-y border-primary-100">
              <div className="grid gap-1 py-4 sm:grid-cols-[minmax(9rem,0.65fr)_minmax(0,1fr)] sm:gap-5 sm:py-4">
                <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-secondary-500">Target exam</dt>
                <dd className="font-medium text-secondary-900">
                  {targetExam}
                  {targetExamDate ? <time className="mt-0.5 block text-sm font-normal text-secondary-600" dateTime={profile?.targetExamEvent?.examDate?.toISOString()}>Exam date · {targetExamDate}</time> : null}
                </dd>
              </div>
              <div className="grid gap-1 py-4 sm:grid-cols-[minmax(9rem,0.65fr)_minmax(0,1fr)] sm:gap-5 sm:py-4">
                <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-secondary-500">University</dt>
                <dd className="font-medium text-secondary-900">{targetUniversity}</dd>
              </div>
              <div className="grid gap-1 py-4 sm:grid-cols-[minmax(9rem,0.65fr)_minmax(0,1fr)] sm:gap-5 sm:py-4">
                <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-secondary-500">Major</dt>
                <dd className="font-medium text-secondary-900">{targetMajor}</dd>
              </div>
              <div className="grid gap-1 py-4 sm:grid-cols-[minmax(9rem,0.65fr)_minmax(0,1fr)] sm:gap-5 sm:py-4">
                <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-secondary-500">Onboarding</dt>
                <dd className="font-medium capitalize text-secondary-900">{onboardingStatus}</dd>
              </div>
              <div className="grid gap-1 py-4 sm:grid-cols-[minmax(9rem,0.65fr)_minmax(0,1fr)] sm:gap-5 sm:py-4">
                <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-secondary-500">Learning rhythm</dt>
                <dd className="font-medium text-secondary-900">
                  {profile?.currentStreak ?? 0} days current
                  <span className="font-normal text-secondary-600"> · {profile?.longestStreak ?? 0} days longest</span>
                </dd>
              </div>
            </dl>
          </section>

          <aside className="min-w-0 space-y-6 xl:col-start-2 xl:row-span-2 xl:row-start-1">
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

              <div className={`${ADMIN_INSET_CLASS_NAME} mt-5 px-4 py-4`}>
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
                  {student.failedLoginCount > 0 ? (
                    <div className="flex items-start justify-between gap-4 border-t border-primary-100 pt-3">
                      <dt className="text-secondary-600">Failed attempts</dt>
                      <dd className="font-medium tabular-nums text-secondary-800">{student.failedLoginCount}</dd>
                    </div>
                  ) : null}
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
                <div className="mt-5 border-t border-primary-100 pt-5">
                  <CheckCircle2 aria-hidden="true" className="mx-auto text-primary-700" size={21} />
                  <p className="mt-2 text-sm font-semibold text-secondary-900">No open handoff</p>
                  <p className="mx-auto mt-1 max-w-[28ch] text-center text-xs leading-5 text-secondary-600">Create a replacement from the enrollment workflow if access needs to be delivered again.</p>
                </div>
              )}
            </section>
          </aside>

          <details className={`${ADMIN_CARD_CLASS_NAME} group min-w-0 xl:col-start-1 xl:row-start-2`} open={Boolean(error)}>
            <h2 className="sr-only" id="account-details-heading">Edit account details</h2>
            <summary
              aria-controls="account-details-panel"
              className="flex min-h-20 cursor-pointer list-none items-center justify-between gap-4 rounded-4xl px-5 py-5 outline-none transition-colors hover:bg-primary-50/35 focus-visible:ring-4 focus-visible:ring-primary-700/12 [&::-webkit-details-marker]:hidden sm:px-6"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary-50 text-primary-800">
                  <Pencil aria-hidden="true" size={19} />
                </span>
                <span className="min-w-0">
                  <span className="block text-lg font-semibold tracking-[-0.03em] text-secondary-900">Edit account details</span>
                  <span className="mt-0.5 block truncate text-sm text-secondary-600">Update identity or the target exam.</span>
                </span>
              </span>
              <ChevronDown aria-hidden="true" className="shrink-0 text-secondary-500 transition-transform group-open:rotate-180" size={20} />
            </summary>

            <div className="border-t border-primary-100 px-5 pb-5 pt-5 sm:px-6 sm:pb-6" id="account-details-panel">
              <form action={updateStudentEnrollmentAction} className="grid gap-5 md:grid-cols-2">
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
            </div>
          </details>
        </div>
      </div>
    </PortalShell>
  );
}

export { StudentDetailPageModule };
export type { StudentDetail };

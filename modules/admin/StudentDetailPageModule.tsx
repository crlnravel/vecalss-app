import Link from "next/link";

import {
  Buildings,
  CalendarDays,
  ChevronLeft,
  Target,
} from "@/lib/icons";
import { StudentDetailTargetExamSelect } from "./components/student-detail-target-exam-select";
import { ReferencePageHeader, ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { REFERENCE_CONTROL_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
import type {
  ExamEvent,
  Major,
  StudentProfile,
  University,
  User,
  UserStatus,
} from "@/generated/prisma/client";
import type { SessionContext } from "@/lib/auth/types";
import { FormNotice } from "@/modules/auth/components/form-notice";
import { PortalShell } from "@/modules/portal/components/portal-shell";

import { CopyValueButton } from "./components/copy-value-button";
import { StudentAccountActions } from "./components/student-account-actions";
import { StudentDetailForm } from "./components/student-detail-form";

type StudentDetail = Pick<
  User,
  "createdAt" | "email" | "fullName" | "id" | "phone" | "status"
> & {
  studentProfile: (Pick<
    StudentProfile,
    "targetExamEventId"
  > & {
    targetExamEvent: Pick<ExamEvent, "examDate" | "name"> | null;
    targetMajor: (Pick<Major, "name"> & {
      university: Pick<University, "name" | "shortName">;
    }) | null;
    targetUniversity: Pick<University, "name" | "shortName"> | null;
  }) | null;
};

const noticeMessages: Record<string, string> = {
  "student-deactivated": "Akses siswa dinonaktifkan dan sesi aktif telah dicabut.",
  "student-deleted": "Akun siswa dihapus.",
  "student-password-updated": "Password siswa diperbarui.",
  "student-reactivated": "Akses siswa dipulihkan.",
  "student-updated": "Detail siswa diperbarui.",
};

const errorMessages: Record<string, string> = {
  "duplicate-email": "Email tersebut sudah digunakan oleh akun siswa lain.",
  "delete-confirmation": "Konfirmasi bahwa Anda ingin menghapus akun siswa ini.",
  "delete-failed": "Akun siswa tidak dapat dihapus. Silakan coba lagi.",
  "missing-fields": "Tambahkan nama depan dan email siswa sebelum memperbarui.",
  "update-failed": "Akun siswa tidak dapat diperbarui. Silakan coba lagi.",
};

const detailFieldClassName = REFERENCE_CONTROL_CLASS_NAMES.input;
const maskedPassword = "••••••••••••";

function splitStudentName(fullName: string) {
  const [firstName = "", ...lastNameParts] = fullName.trim().split(/\s+/u).filter(Boolean);

  return {
    firstName,
    lastName: lastNameParts.join(" "),
  };
}

function formatStatus(status: UserStatus) {
  return {
    active: "Aktif",
    disabled: "Dinonaktifkan",
    locked: "Terkunci",
    soft_deleted: "Dihapus sementara",
  }[status] ?? status.replaceAll("_", " ");
}

function statusTextClassName(status: UserStatus) {
  if (status === "active") {
    return "text-student-status-success-fg";
  }

  if (status === "disabled" || status === "soft_deleted") {
    return "text-student-status-danger-fg";
  }

  if (status === "locked") {
    return "text-student-status-attention-fg";
  }

  return "text-secondary-700";
}

function formatDate(value: Date | null) {
  if (!value) {
    return "Belum tercatat";
  }

   return value.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatExamDate(value: Date | null) {
  if (!value) {
    return null;
  }

   return value.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function displayId(id: string) {
  if (id.length <= 22) {
    return id;
  }

  return `${id.slice(0, 10)}…${id.slice(-8)}`;
}

function DetailSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <ReferenceSurface
      as="section"
      aria-labelledby={`${title.toLowerCase().replaceAll(" ", "-")}-heading`}
      className="min-w-0 p-5 sm:p-7"
    >
      <h2 className="font-heading text-xl leading-tight font-semibold tracking-[-0.025em] text-secondary-900 md:text-2xl" id={`${title.toLowerCase().replaceAll(" ", "-")}-heading`}>
        {title}
      </h2>
      <div className="mt-6">{children}</div>
    </ReferenceSurface>
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
  const { firstName, lastName } = splitStudentName(student.fullName);
  const persistedTargetExamId = profile?.targetExamEventId ?? "";
  const targetExam = profile?.targetExamEvent?.name ?? "Belum diatur";
  const targetExamDate = formatExamDate(profile?.targetExamEvent?.examDate ?? null);
  const targetExamIsInactive = Boolean(
    persistedTargetExamId &&
      !examEvents.some((examEvent) => examEvent.id === persistedTargetExamId),
  );
  const inactiveTargetExamLabel = targetExam !== "Belum diatur"
    ? targetExam
    : "Target tersimpan";
  const targetUniversity =
    profile?.targetUniversity?.shortName ||
    profile?.targetUniversity?.name ||
    profile?.targetMajor?.university.shortName ||
    profile?.targetMajor?.university.name ||
    "Belum diatur";
  const targetMajor = profile?.targetMajor?.name ?? "Belum diatur";

  return (
    <PortalShell
      activeAdminSection="students"
      audience="admin"
      description={`Kelola akun ${student.fullName}.`}
      session={session}
      title="Detail siswa"
    >
      <div className="space-y-8">
        <div className="flex min-w-0 items-start gap-3">
          <nav aria-label="Navigasi siswa" className="shrink-0">
            <Button
              aria-label="Kembali ke siswa"
              className="mt-1 shrink-0 rounded-xl text-secondary-500 hover:bg-primary-50 hover:text-secondary-900"
              nativeButton={false}
              render={<Link href={backHref} />}
              size="icon"
              title="Kembali ke siswa"
              variant="ghost"
            >
              <ChevronLeft aria-hidden="true" size={22} />
              <span className="sr-only">Kembali ke siswa</span>
            </Button>
          </nav>
          <ReferencePageHeader
            actions={(
              <div className="w-full min-w-0 sm:w-48">
                <StudentAccountActions
                  compact
                  returnPath={returnPath}
                  status={student.status}
                  studentId={student.id}
                />
              </div>
            )}
            className="min-w-0 flex-1"
            description={<span className="block break-all">{student.email}</span>}
            title={student.fullName}
          />
        </div>

        {notice ? <FormNotice tone="success">{noticeMessages[notice] ?? notice}</FormNotice> : null}
        {error ? <FormNotice tone="danger">{errorMessages[error] ?? error}</FormNotice> : null}

        <div className="min-w-0 max-w-5xl space-y-6">
          <DetailSection title="Informasi akun">
            <div className="grid gap-5 md:grid-cols-2">
              <div className="min-w-0 space-y-2 text-sm">
                <span className="font-medium text-secondary-900">ID</span>
                <div className={`${detailFieldClassName} flex min-h-[52px] items-center justify-between gap-3`}>
                  <code className="min-w-0 truncate font-mono text-xs text-secondary-700">{displayId(student.id)}</code>
                   <CopyValueButton ariaLabel="Salin ID siswa" iconOnly value={student.id} />
                </div>
              </div>
              <div className="min-w-0 space-y-2 text-sm">
                <span className="font-medium text-secondary-900">Ditambahkan</span>
                <div className={`${detailFieldClassName} flex min-h-[52px] items-center text-secondary-800`}>
                  {formatDate(student.createdAt)}
                </div>
              </div>
              <div className="min-w-0 space-y-2 text-sm">
                <span className="font-medium text-secondary-900">Password</span>
                <div className={`${detailFieldClassName} flex min-h-[52px] items-center justify-between gap-3`}>
                  <span aria-label="Hidden password" className="tracking-[0.2em] text-secondary-800">{maskedPassword}</span>
                   <CopyValueButton ariaLabel="Password tersamarkan, tidak dapat disalin" iconOnly value={maskedPassword} />
                </div>
              </div>
              <div className="min-w-0 space-y-2 text-sm">
                <span className="font-medium text-secondary-900">Status</span>
                <div className="flex min-h-[52px] items-center">
                  <span className={`text-base font-bold ${statusTextClassName(student.status)}`}>
                    {formatStatus(student.status)}
                  </span>
                </div>
              </div>
            </div>
          </DetailSection>

          <StudentDetailForm
            blockedField={targetExamIsInactive
              ? {
                  name: "targetExamEventId",
                  value: persistedTargetExamId,
                }
              : undefined}
          >
            <input name="userId" type="hidden" value={student.id} />
            <input name="returnPath" type="hidden" value={returnPath} />

            <DetailSection title="Informasi pribadi">
              <div className="grid gap-5 md:grid-cols-2">
                <label className="min-w-0 space-y-2 text-sm">
                  <span className="font-medium text-secondary-900">Nama depan</span>
                  <input className={detailFieldClassName} defaultValue={firstName} name="firstName" required type="text" />
                </label>
                <label className="min-w-0 space-y-2 text-sm">
                  <span className="font-medium text-secondary-900">Nama belakang</span>
                  <input className={detailFieldClassName} defaultValue={lastName} name="lastName" type="text" />
                </label>
                <label className="min-w-0 space-y-2 text-sm md:col-span-2">
                  <span className="font-medium text-secondary-900">Alamat email</span>
                  <input className={detailFieldClassName} defaultValue={student.email} name="email" required type="email" />
                </label>
                <label className="min-w-0 space-y-2 text-sm md:col-span-2">
                  <span className="font-medium text-secondary-900">Nomor telepon</span>
                  <input
                    aria-readonly="true"
                    className={`${detailFieldClassName} text-secondary-700`}
                    defaultValue={student.phone ?? "Not provided"}
                    readOnly
                    type="text"
                  />
                </label>
              </div>
            </DetailSection>

            <DetailSection title="Profil enrollment">
              <div className="grid gap-5 md:grid-cols-2">
                <Field className="min-w-0 gap-2 text-sm md:col-span-2">
                  <FieldLabel className="text-sm font-medium leading-5 text-secondary-900" htmlFor="student-target-exam">Target ujian</FieldLabel>
                  <StudentDetailTargetExamSelect
                    initialValue={persistedTargetExamId}
                    options={[
                      { label: "Atur nanti", value: "" },
                      ...(targetExamIsInactive
                        ? [{
                            disabled: true,
                            label: `${inactiveTargetExamLabel} (sudah tidak aktif)`,
                            value: persistedTargetExamId,
                          }]
                        : []),
                      ...examEvents.map((examEvent) => ({ label: examEvent.name, value: examEvent.id })),
                    ]}
                  />
                  {targetExamIsInactive ? (
                    <p className="text-xs leading-5 text-student-status-attention-fg" role="alert">
                      Target ujian tersimpan sudah tidak aktif. Pilih target baru atau Atur nanti sebelum menyimpan.
                    </p>
                  ) : null}
                  {targetExam !== "Belum diatur" ? (
                    <span className="flex items-center gap-1.5 text-xs text-secondary-600">
                      <CalendarDays aria-hidden="true" size={14} />
                      {targetExamDate ? `Tanggal ujian · ${targetExamDate}` : "Tanggal ujian belum diatur"}
                    </span>
                  ) : null}
                </Field>

                <div className="min-w-0 space-y-2 text-sm">
                   <span className="font-medium text-secondary-900">Universitas</span>
                  <div className={`${detailFieldClassName} flex min-h-[52px] items-center gap-2 text-secondary-800`}>
                    <Buildings aria-hidden="true" className="shrink-0 text-primary-700" size={17} />
                    <span className="truncate">{targetUniversity}</span>
                  </div>
                </div>
                <div className="min-w-0 space-y-2 text-sm">
                   <span className="font-medium text-secondary-900">Jurusan</span>
                  <div className={`${detailFieldClassName} flex min-h-[52px] items-center gap-2 text-secondary-800`}>
                    <Target aria-hidden="true" className="shrink-0 text-primary-700" size={17} />
                    <span className="truncate">{targetMajor}</span>
                  </div>
                </div>
              </div>
            </DetailSection>

            <div className="flex justify-end">
              <Button className="min-w-32" type="submit" variant="brand">Simpan perubahan</Button>
            </div>
          </StudentDetailForm>
        </div>
      </div>
    </PortalShell>
  );
}

export { StudentDetailPageModule };
export type { StudentDetail };

import Link from "next/link";

import {
  Buildings,
  CalendarDays,
  ChevronLeft,
  Target,
} from "@/lib/icons";
import { StudentDetailTargetExamSelect } from "./components/student-detail-target-exam-select";
import { formatStudentStatus, studentStatusTone } from "./student-status";
import { ReferencePageHeader, ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldRequiredMark } from "@/components/ui/field";
import { REFERENCE_CONTROL_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
import { Badge } from "@/components/ui/badge";
import type {
  ExamEvent,
  Major,
  StudentProfile,
  University,
  User,
} from "@/generated/prisma/client";
import type { SessionContext } from "@/lib/auth/types";
import { ToastOnMount } from "@/components/ui/toast-on-mount";
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
  "student-deactivated": "Akses siswa dinonaktifkan. Semua sesi aktif dicabut.",
  "student-deleted": "Akun siswa berhasil dihapus.",
  "student-password-updated": "Kata sandi siswa berhasil diperbarui.",
  "student-reactivated": "Akses siswa dipulihkan. Sesi sebelumnya tetap dicabut.",
  "student-updated": "Perubahan pada akun siswa berhasil disimpan.",
};

const errorMessages: Record<string, string> = {
  "invalid-user": "Akun siswa tidak tersedia. Kembali ke daftar siswa lalu pilih akun lagi.",
  "duplicate-email": "Alamat email ini sudah digunakan oleh akun siswa lain.",
  "delete-confirmation": "Konfirmasi penghapusan akun siswa ini.",
  "delete-failed": "Akun siswa belum berhasil dihapus. Segarkan halaman lalu coba lagi.",
  "missing-fields": "Isi nama depan dan alamat email siswa sebelum menyimpan.",
  "update-failed": "Perubahan pada akun siswa belum berhasil disimpan. Segarkan halaman lalu coba lagi.",
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

function StudentAccountSummary({ student }: { student: StudentDetail }) {
  return (
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
          <div className={`${detailFieldClassName} flex min-h-[52px] items-center text-secondary-800`}>{formatDate(student.createdAt)}</div>
        </div>
        <div className="min-w-0 space-y-2 text-sm">
          <span className="font-medium text-secondary-900">Kata sandi</span>
          <div className={`${detailFieldClassName} flex min-h-[52px] items-center justify-between gap-3`}>
            <span aria-label="Kata sandi disamarkan" className="tracking-[0.2em] text-secondary-800">{maskedPassword}</span>
            <CopyValueButton ariaLabel="Kata sandi disamarkan, tidak dapat disalin" iconOnly value={maskedPassword} />
          </div>
        </div>
        <div className="min-w-0 space-y-2 text-sm">
          <span className="font-medium text-secondary-900">Status</span>
          <div className="flex min-h-[52px] items-center"><Badge depth="sunken" size="md" tone={studentStatusTone(student.status)}>{formatStudentStatus(student.status)}</Badge></div>
        </div>
      </div>
    </DetailSection>
  );
}

function StudentPersonalFields({ firstName, lastName, student }: { firstName: string; lastName: string; student: StudentDetail }) {
  return (
    <DetailSection title="Informasi pribadi">
      <div className="grid gap-5 md:grid-cols-2">
        <label className="min-w-0 space-y-2 text-sm"><span className="font-medium text-secondary-900">Nama depan<FieldRequiredMark /></span><input className={detailFieldClassName} defaultValue={firstName} name="firstName" required type="text" /></label>
        <label className="min-w-0 space-y-2 text-sm"><span className="font-medium text-secondary-900">Nama belakang</span><input className={detailFieldClassName} defaultValue={lastName} name="lastName" type="text" /></label>
        <label className="min-w-0 space-y-2 text-sm md:col-span-2"><span className="font-medium text-secondary-900">Alamat email<FieldRequiredMark /></span><input className={detailFieldClassName} defaultValue={student.email} name="email" required type="email" /></label>
        <label className="min-w-0 space-y-2 text-sm md:col-span-2"><span className="font-medium text-secondary-900">Nomor telepon</span><input aria-readonly="true" className={`${detailFieldClassName} text-secondary-700`} defaultValue={student.phone ?? "Belum diisi"} readOnly type="text" /></label>
      </div>
    </DetailSection>
  );
}

function StudentEnrollmentProfile({
  examEvents,
  inactiveTargetExamLabel,
  persistedTargetExamId,
  targetExam,
  targetExamDate,
  targetExamIsInactive,
  targetMajor,
  targetUniversity,
}: {
  examEvents: ExamEvent[];
  inactiveTargetExamLabel: string;
  persistedTargetExamId: string;
  targetExam: string;
  targetExamDate: string | null;
  targetExamIsInactive: boolean;
  targetMajor: string;
  targetUniversity: string;
}) {
  return (
    <DetailSection title="Profil pendaftaran">
      <div className="grid gap-5 md:grid-cols-2">
        <Field className="min-w-0 gap-2 text-sm md:col-span-2">
          <FieldLabel className="text-sm font-medium leading-5 text-secondary-900" htmlFor="student-target-exam">Target ujian</FieldLabel>
          <StudentDetailTargetExamSelect
            initialValue={persistedTargetExamId}
            options={[
              { label: "Atur nanti", value: "" },
              ...(targetExamIsInactive ? [{ disabled: true, label: `${inactiveTargetExamLabel} (sudah tidak aktif)`, value: persistedTargetExamId }] : []),
              ...examEvents.map((examEvent) => ({ label: examEvent.name, value: examEvent.id })),
            ]}
          />
          {targetExamIsInactive ? <p className="text-xs leading-5 text-student-status-attention-fg" role="alert">Target ujian tersimpan sudah tidak aktif. Pilih target baru atau Atur nanti sebelum menyimpan.</p> : null}
          {targetExam !== "Belum diatur" ? <span className="flex items-center gap-1.5 text-xs text-secondary-600"><CalendarDays aria-hidden="true" size={14} />{targetExamDate ? `Tanggal ujian · ${targetExamDate}` : "Tanggal ujian belum diatur"}</span> : null}
        </Field>
        <div className="min-w-0 space-y-2 text-sm"><span className="font-medium text-secondary-900">Universitas</span><div className={`${detailFieldClassName} flex min-h-[52px] items-center gap-2 text-secondary-800`}><Buildings aria-hidden="true" className="shrink-0 text-primary-700" size={17} /><span className="truncate">{targetUniversity}</span></div></div>
        <div className="min-w-0 space-y-2 text-sm"><span className="font-medium text-secondary-900">Jurusan</span><div className={`${detailFieldClassName} flex min-h-[52px] items-center gap-2 text-secondary-800`}><Target aria-hidden="true" className="shrink-0 text-primary-700" size={17} /><span className="truncate">{targetMajor}</span></div></div>
      </div>
    </DetailSection>
  );
}

function StudentDetailNotices({ error, notice }: { error?: string | null; notice?: string | null }) {
  const shouldToastError = error === "delete-failed" || error === "update-failed";

  return (
    <>
      {notice ? <ToastOnMount message={noticeMessages[notice] ?? "Informasi akun siswa berhasil diperbarui."} variant="success" /> : null}
      {error && shouldToastError ? (
        <ToastOnMount message={errorMessages[error]} variant="error" />
      ) : null}
      {error && !shouldToastError ? <FormNotice tone="danger">{errorMessages[error] ?? "Perubahan pada akun siswa belum berhasil. Segarkan halaman lalu coba lagi."}</FormNotice> : null}
    </>
  );
}

function StudentDetailFormBody({
  examEvents,
  firstName,
  inactiveTargetExamLabel,
  lastName,
  persistedTargetExamId,
  returnPath,
  student,
  targetExam,
  targetExamDate,
  targetExamIsInactive,
  targetMajor,
  targetUniversity,
}: {
  examEvents: ExamEvent[];
  firstName: string;
  inactiveTargetExamLabel: string;
  lastName: string;
  persistedTargetExamId: string;
  returnPath: string;
  student: StudentDetail;
  targetExam: string;
  targetExamDate: string | null;
  targetExamIsInactive: boolean;
  targetMajor: string;
  targetUniversity: string;
}) {
  return (
    <StudentDetailForm
      blockedField={targetExamIsInactive ? { name: "targetExamEventId", value: persistedTargetExamId } : undefined}
    >
      <input name="userId" type="hidden" value={student.id} />
      <input name="returnPath" type="hidden" value={returnPath} />

      <StudentPersonalFields firstName={firstName} lastName={lastName} student={student} />

      <StudentEnrollmentProfile
        examEvents={examEvents}
        inactiveTargetExamLabel={inactiveTargetExamLabel}
        persistedTargetExamId={persistedTargetExamId}
        targetExam={targetExam}
        targetExamDate={targetExamDate}
        targetExamIsInactive={targetExamIsInactive}
        targetMajor={targetMajor}
        targetUniversity={targetUniversity}
      />

      <div className="flex justify-end">
        <Button className="min-w-32" type="submit" variant="default">Simpan perubahan</Button>
      </div>
    </StudentDetailForm>
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
              className="mt-1 shrink-0"
              nativeButton={false}
              render={<Link href={backHref} />}
              size="icon"
              title="Kembali ke siswa"
              variant="outline"
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
            title={student.fullName}
          />
        </div>

        <StudentDetailNotices error={error} notice={notice} />

        <div className="min-w-0 max-w-5xl space-y-6">
          <StudentAccountSummary student={student} />

          <StudentDetailFormBody
            examEvents={examEvents}
            firstName={firstName}
            inactiveTargetExamLabel={inactiveTargetExamLabel}
            lastName={lastName}
            persistedTargetExamId={persistedTargetExamId}
            returnPath={returnPath}
            student={student}
            targetExam={targetExam}
            targetExamDate={targetExamDate}
            targetExamIsInactive={targetExamIsInactive}
            targetMajor={targetMajor}
            targetUniversity={targetUniversity}
          />
        </div>
      </div>
    </PortalShell>
  );
}

export { StudentDetailPageModule };
export type { StudentDetail };

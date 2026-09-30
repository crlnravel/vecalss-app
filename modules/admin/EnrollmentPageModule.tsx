
import type { EnrollmentHandoff, ExamEvent, Major, StudentProfile, University, User, UserStatus } from "@/generated/prisma/client";
import {
  buildDirectoryQuery,
  type DirectoryPageSize,
  type DirectorySortDirection,
  type DirectorySortKey,
} from "@/lib/admin/operations/validation";
import type { SessionContext } from "@/lib/auth/types";
import { ToastOnMount } from "@/components/ui/toast-on-mount";
import { FormNotice } from "@/modules/auth/components/form-notice";
import { PortalShell } from "@/modules/portal/components/portal-shell";

import { AddStudentDialog } from "./components/add-student-dialog";
import { FocusRestorer } from "./components/focus-restorer";
import { ReuiDirectoryFooter } from "./components/reui-directory-grid";
import styles from "./components/reui-directory-grid.module.css";
import { StudentDirectoryTable } from "./components/student-directory-table";
import { studentStatusTone } from "./student-status";

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
const noticeMessages: Record<string, string> = {
  "student-deactivated": "Akses siswa dinonaktifkan dan sesi aktif telah dicabut.",
  "student-deleted": "Akun siswa dihapus.",
  "student-reactivated": "Akses siswa dipulihkan.",
  "students-disabled": "Akses siswa yang dipilih dinonaktifkan dan sesi aktif telah dicabut.",
  "students-reactivated": "Akses siswa yang dipilih dipulihkan.",
  "student-updated": "Detail enrollment siswa diperbarui.",
};

const errorMessages: Record<string, string> = {
  "duplicate-email": "Email tersebut sudah digunakan oleh akun siswa lain.",
  "bulk-status-confirmation": "Konfirmasi perubahan status massal sebelum melanjutkan.",
  "bulk-status-failed": "Akun siswa yang dipilih tidak dapat diperbarui. Segarkan direktori lalu coba lagi.",
  "bulk-status-no-change": "Tidak ada akun yang dapat diubah ke arah tersebut. Segarkan direktori lalu coba lagi.",
  "delete-confirmation": "Konfirmasi bahwa Anda ingin menghapus akun siswa ini.",
  "delete-failed": "Akun siswa tidak dapat dihapus. Silakan coba lagi.",
  "invalid-directory-query": "Filter direktori tidak valid atau terlalu luas. Tampilan direktori aman telah dipulihkan.",
  "invalid-user": "ID akun tidak valid. Muat ulang direktori lalu coba lagi.",
  "missing-fields": "Tambahkan nama dan email siswa sebelum memperbarui.",
  "missing-user": "Akun siswa tersebut tidak ditemukan.",
  "update-failed": "Akun siswa tidak dapat diperbarui. Silakan coba lagi.",
};

function withDemoQuery(query: string, demo: boolean) {
  if (!demo) {
    return query;
  }

  return `${query}${query ? "&" : "?"}demo=1`;
}

function toStudentDirectoryRow(student: EnrolledStudent) {
  const latestHandoff = student.enrollmentHandoffs[0] ?? null;
  const profile = student.studentProfile;
  return {
    createdAt: student.createdAt.toISOString(),
    email: student.email,
    fullName: student.fullName,
    id: student.id,
    lastLoginAt: student.lastLoginAt?.toISOString() ?? null,
    latestHandoff: latestHandoff
      ? { expiresAt: latestHandoff.expiresAt?.toISOString() ?? null, method: latestHandoff.method, status: latestHandoff.status }
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
    tone: studentStatusTone(student.status),
  };
}

function EnrollmentNotices({
  demo,
  error,
  notice,
}: {
  demo: boolean;
  error?: string | null;
  notice?: string | null;
}) {
  const toastableErrors = new Set([
    "bulk-status-failed",
    "bulk-status-no-change",
    "delete-failed",
    "update-failed",
  ]);

  return (
    <>
      {notice ? <ToastOnMount message={noticeMessages[notice] ?? notice} variant="success" /> : null}
      {demo ? (
        <FormNotice compact tone="neutral">
          Data demo sementara sedang aktif. Hapus <code className="font-semibold">demo=1</code> dari URL untuk kembali ke data siswa aktif.
        </FormNotice>
      ) : null}
      {error && toastableErrors.has(error) ? (
        <ToastOnMount message={errorMessages[error] ?? error} variant="error" />
      ) : null}
      {error && !toastableErrors.has(error) ? (
        <FormNotice label={error === "invalid-directory-query" ? "Perlu perhatian" : undefined} tone="danger">
          {errorMessages[error] ?? error}
        </FormNotice>
      ) : null}
    </>
  );
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
  const directoryQuery = withDemoQuery(buildDirectoryQuery({ addedFrom, addedTo, direction, focus: focus ?? null, page, pageSize, search, sort, status: statusFilters[0] ?? "all", statuses: statusFilters }), demo);
  const backQuery = withDemoQuery(buildDirectoryQuery({ addedFrom, addedTo, direction, focus: null, page, pageSize, search, sort, status: statusFilters[0] ?? "all", statuses: statusFilters }), demo);
  const isEmptyDirectory = total === 0 && !search && !statusFilters.length && !addedFrom && !addedTo;

  return (
    <PortalShell
      activeAdminSection="students"
      audience="admin"
       description="Telusuri akun siswa dan buka salah satunya untuk mengelola akses atau serah-terima pendaftaran."
      session={session}
       title="Siswa"
    >
      <div className="space-y-8">
        <FocusRestorer
          announcementId="student-directory-announcement"
          fallbackId="students-heading"
          targetId={focus ? `student-${focus}` : null}
        />

        <p aria-live="polite" className="sr-only" id="student-directory-announcement">
           {focus ? "Kembali ke baris siswa yang dipilih di direktori." : ""}
        </p>
        <EnrollmentNotices demo={demo} error={error} notice={notice} />

        <section aria-label="Direktori siswa" className={styles.root} id="students-heading" tabIndex={-1}>
          <StudentDirectoryTable addedFrom={addedFrom} addedTo={addedTo} backQuery={backQuery} dataQuery={directoryQuery}
            demo={demo} direction={direction} focus={focus ?? null} isEmptyDirectory={isEmptyDirectory} key={directoryQuery}
            pageSize={pageSize} search={search} sort={sort} statusFilters={statusFilters} students={students.map(toStudentDirectoryRow)} total={total}
            actions={<><AddStudentDialog examEvents={examEvents} initialMode="bulk" /><AddStudentDialog examEvents={examEvents} /></>} />
          <ReuiDirectoryFooter basePath="/admin/enrollment" query={backQuery} page={page} pageCount={pageCount} pageSize={pageSize} total={total} visibleCount={students.length} />
        </section>
      </div>
    </PortalShell>
  );
}

export { EnrollmentPageModule };

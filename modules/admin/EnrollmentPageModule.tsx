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
       description="Telusuri akun siswa dan buka salah satunya untuk mengelola akses atau serah-terima pendaftaran."
      session={session}
       title="Siswa"
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
           title="Siswa"
        />

        <p aria-live="polite" className="sr-only" id="student-directory-announcement">
           {focus ? "Kembali ke baris siswa yang dipilih di direktori." : ""}
        </p>
        {notice ? (
          <div id="student-directory-notice" tabIndex={-1}>
            <FormNotice tone="success">{noticeMessages[notice] ?? notice}</FormNotice>
          </div>
        ) : null}
        {demo ? (
          <FormNotice compact tone="neutral">
             Data demo sementara sedang aktif. Hapus <code className="font-semibold">demo=1</code> dari URL untuk kembali ke data siswa aktif.
          </FormNotice>
        ) : null}
        {error ? (
          <FormNotice label={error === "invalid-directory-query" ? "Perlu perhatian" : undefined} tone="danger">
            {errorMessages[error] ?? error}
          </FormNotice>
        ) : null}

           <ReferenceSurface as="section" aria-label="Direktori siswa" className="overflow-hidden">
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
                tone: studentStatusTone(student.status),
              };
            })}
          />

          <div className="flex flex-col gap-3 border-t border-primary-100/80 px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="text-xs tabular-nums text-secondary-600">
                <span className="sr-only">Menampilkan </span>{visibleStart}–{visibleEnd} dari {total}
              </p>
              <StudentPageSizeSelect pageSize={pageSize} query={backQuery} />
            </div>
            {pageCount > 1 ? (
              <nav aria-label="Halaman direktori siswa" className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-xs font-semibold tabular-nums text-secondary-600">{page} dari {pageCount}</span>
                <div className="flex min-w-0 items-center gap-0.5">
                  {page > 1 ? (
                    <Link aria-label="Halaman direktori siswa sebelumnya" className={buttonVariants({ className: "size-9 rounded-lg p-0", size: "icon-sm", variant: "ghost" })} href={pageHref(page - 1)}>
                      <ChevronLeft aria-hidden="true" size={16} />
                    </Link>
                  ) : null}
                  <ol className="flex items-center gap-0.5">
                    {paginationItems.map((item) => item === "ellipsis-before" || item === "ellipsis-after" ? (
                      <li key={item}>
                        <span aria-hidden="true" className="grid size-9 place-items-center text-secondary-400">
                          <MoreHorizontal size={16} />
                        </span>
                        <span className="sr-only">Halaman lainnya</span>
                      </li>
                    ) : (
                      <li key={item}>
                        <Link
                          aria-current={item === page ? "page" : undefined}
                          aria-label={`Buka halaman ${item}`}
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
                    <Link aria-label="Halaman direktori siswa berikutnya" className={buttonVariants({ className: "size-9 rounded-lg p-0", size: "icon-sm", variant: "ghost" })} href={pageHref(page + 1)}>
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

import Link from "next/link";

import {
  ReferencePageHeader,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "@/lib/icons";
import { buttonVariants } from "@/components/ui/button-variants";
import type { EnrollmentHandoff, TutorProfile, User, UserStatus } from "@/generated/prisma/client";
import { buildDirectoryQuery, type DirectoryPageSize, type DirectorySortDirection, type DirectorySortKey } from "@/lib/admin/operations/validation";
import type { SessionContext } from "@/lib/auth/types";
import { FormNotice } from "@/modules/auth/components/form-notice";
import { PortalShell } from "@/modules/portal/components/portal-shell";

import { AddKaptenDialog } from "./components/add-kapten-dialog";
import { FocusRestorer } from "./components/focus-restorer";
import { KaptenDirectoryTable, type KaptenDirectoryItem } from "./components/kapten-directory-table";
import { StudentPageSizeSelect } from "./components/student-page-size-select";

type EnrolledKapten = Pick<User, "createdAt" | "email" | "fullName" | "id" | "phone" | "status"> & {
  enrollmentHandoffs: Pick<EnrollmentHandoff, "expiresAt" | "id" | "method" | "sourceImportRowId" | "status">[];
  tutorProfile: Pick<TutorProfile, "bio" | "headline"> | null;
};

const noticeMessages: Record<string, string> = {
  "kapten-deactivated": "Akses Kapten dinonaktifkan dan sesi aktif telah dicabut.",
  "kapten-reactivated": "Akses Kapten dipulihkan tanpa memulihkan sesi atau handoff lama.",
  "kapten-updated": "Detail profil Kapten diperbarui.",
};

const errorMessages: Record<string, string> = {
  "duplicate-email": "Email tersebut sudah digunakan oleh akun lain.",
  "invalid-directory-query": "Filter direktori tidak valid atau terlalu luas. Tampilan direktori aman telah dipulihkan.",
  "invalid-user": "ID akun tidak valid. Muat ulang direktori lalu coba lagi.",
  "missing-fields": "Tambahkan nama dan email Kapten sebelum memperbarui.",
  "missing-user": "Akun Kapten tersebut tidak ditemukan.",
  "update-failed": "Akun Kapten tidak dapat diperbarui. Silakan coba lagi.",
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

function KaptenPageModule({
  error,
  focus,
  kapten,
  notice,
  page,
  pageCount,
  pageSize,
  session,
  search,
  sort,
  direction,
  statusFilter,
  total,
}: {
  error?: string | null;
  focus?: string | null;
  kapten: EnrolledKapten[];
  notice?: string | null;
  page: number;
  pageCount: number;
  pageSize: DirectoryPageSize;
  session: SessionContext;
  search: string;
  sort: DirectorySortKey | null;
  direction: DirectorySortDirection;
  statusFilter: UserStatus | "all";
  total: number;
}) {
  const pageHref = (nextPage: number) => {
    const query = buildDirectoryQuery({ direction, focus: null, page: nextPage, pageSize, search, sort, status: statusFilter });
    return query ? `/admin/kapten${query}` : "/admin/kapten";
  };
  const directoryQuery = buildDirectoryQuery({ direction, focus: focus ?? null, page, pageSize, search, sort, status: statusFilter });
  const visibleStart = kapten.length ? (page - 1) * pageSize + 1 : 0;
  const visibleEnd = Math.min(page * pageSize, (page - 1) * pageSize + kapten.length);
  const paginationItems = getPaginationItems(page, pageCount);

  const rows: KaptenDirectoryItem[] = kapten.map((person) => ({
    bio: person.tutorProfile?.bio ?? null,
    createdAt: person.createdAt.toISOString(),
    email: person.email,
    fullName: person.fullName,
    headline: person.tutorProfile?.headline ?? null,
    id: person.id,
    latestHandoff: person.enrollmentHandoffs[0]
      ? {
          expiresAt: person.enrollmentHandoffs[0].expiresAt?.toISOString() ?? null,
          id: person.enrollmentHandoffs[0].id,
          method: person.enrollmentHandoffs[0].method,
          sourceImportRowId: person.enrollmentHandoffs[0].sourceImportRowId ?? null,
          status: person.enrollmentHandoffs[0].status,
        }
      : null,
    phone: person.phone,
    status: person.status,
  }));

  return (
    <PortalShell
      activeAdminSection="kapten"
      audience="admin"
       description="Kelola akun Kapten dan handoff enrollment."
      session={session}
      title="Kapten"
    >
      <div className="space-y-8">
        <FocusRestorer announcementId="kapten-directory-announcement" fallbackId="kapten-heading" noticeId="kapten-directory-notice" targetId={focus ? `kapten-${focus}` : null} />

        <ReferencePageHeader
          actions={<AddKaptenDialog />}
           description="Kelola akun Kapten dan handoff enrollment."
          id="kapten-heading"
          title="Kapten"
        />

        <p aria-live="polite" className="sr-only" id="kapten-directory-announcement">{focus ? "Kembali ke baris Kapten yang dipilih di direktori." : ""}</p>
        {notice ? <div id="kapten-directory-notice" tabIndex={-1}><FormNotice tone="success">{noticeMessages[notice] ?? notice}</FormNotice></div> : null}
        {error ? <FormNotice tone="danger">{errorMessages[error] ?? error}</FormNotice> : null}

        <ReferenceSurface as="section" aria-label="Direktori Kapten" className="min-w-0 overflow-hidden">
          <KaptenDirectoryTable
            direction={direction}
            focus={focus ?? null}
            kapten={rows}
            page={page}
            pageSize={pageSize}
            search={search}
            sort={sort}
            status={statusFilter}
          />

          <div className="flex flex-col gap-3 border-t border-primary-100/80 bg-white/70 px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="text-xs tabular-nums text-secondary-600"><span className="sr-only">Menampilkan </span>{visibleStart}–{visibleEnd} dari {total}</p>
              <StudentPageSizeSelect basePath="/admin/kapten" pageSize={pageSize} query={directoryQuery} />
            </div>
            {pageCount > 1 ? (
              <nav aria-label="Halaman direktori Kapten" className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-xs font-semibold tabular-nums text-secondary-600">{page} of {pageCount}</span>
                <div className="flex min-w-0 items-center gap-0.5">
                  {page > 1 ? <Link aria-label="Halaman direktori Kapten sebelumnya" className={buttonVariants({ className: "size-10 rounded-2xl p-0", size: "icon-sm", variant: "reference" })} href={pageHref(page - 1)}><ChevronLeft aria-hidden="true" size={16} /></Link> : null}
                  <ol className="flex items-center gap-0.5">
                    {paginationItems.map((item) => item === "ellipsis-before" || item === "ellipsis-after" ? (
                      <li key={item}><span aria-hidden="true" className="grid size-10 place-items-center text-secondary-400"><MoreHorizontal size={16} /></span><span className="sr-only">Halaman lainnya</span></li>
                    ) : (
                      <li key={item}><Link aria-current={item === page ? "page" : undefined} aria-label={`Buka halaman ${item}`} className={buttonVariants({ className: item === page ? "size-10 rounded-2xl p-0" : "size-10 rounded-2xl p-0 text-secondary-700", size: "icon-sm", variant: item === page ? "brand" : "reference" })} href={pageHref(item)}>{item}</Link></li>
                    ))}
                  </ol>
                  {page < pageCount ? <Link aria-label="Halaman direktori Kapten berikutnya" className={buttonVariants({ className: "size-10 rounded-2xl p-0", size: "icon-sm", variant: "reference" })} href={pageHref(page + 1)}><ChevronRight aria-hidden="true" size={16} /></Link> : null}
                </div>
              </nav>
            ) : null}
          </div>
        </ReferenceSurface>
      </div>
    </PortalShell>
  );
}

export { KaptenPageModule };
export type { EnrolledKapten };

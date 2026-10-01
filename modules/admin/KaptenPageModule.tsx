import type { EnrollmentHandoff, TutorProfile, User, UserStatus } from "@/generated/prisma/client";
import { buildDirectoryQuery, type DirectoryPageSize, type DirectorySortDirection, type DirectorySortKey } from "@/lib/admin/operations/validation";
import type { SessionContext } from "@/lib/auth/types";
import { ToastOnMount } from "@/components/ui/toast-on-mount";
import { FormNotice } from "@/modules/auth/components/form-notice";
import { PortalShell } from "@/modules/portal/components/portal-shell";

import { AddKaptenDialog } from "./components/add-kapten-dialog";
import { FocusRestorer } from "./components/focus-restorer";
import { KaptenDirectoryTable, type KaptenDirectoryItem } from "./components/kapten-directory-table";
import { ReuiDirectoryFooter } from "./components/reui-directory-grid";
import styles from "./components/reui-directory-grid.module.css";

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
  const directoryQuery = buildDirectoryQuery({ direction, focus: focus ?? null, page, pageSize, search, sort, status: statusFilter });
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
        <FocusRestorer announcementId="kapten-directory-announcement" fallbackId="kapten-heading" targetId={focus ? `kapten-${focus}` : null} />

        <p aria-live="polite" className="sr-only" id="kapten-directory-announcement">{focus ? "Kembali ke baris Kapten yang dipilih di direktori." : ""}</p>
        {notice ? <ToastOnMount message={noticeMessages[notice] ?? notice} variant="success" /> : null}
        {error === "update-failed" ? (
          <ToastOnMount message={errorMessages[error]} variant="error" />
        ) : error ? (
          <FormNotice tone="danger">{errorMessages[error] ?? error}</FormNotice>
        ) : null}

        <section aria-label="Direktori Kapten" className={`${styles.root} ${styles.surface}`} id="kapten-heading" tabIndex={-1}>
          <KaptenDirectoryTable
            total={total} actions={<><AddKaptenDialog initialMode="bulk" /><AddKaptenDialog /></>} key={directoryQuery}
            direction={direction}
            focus={focus ?? null}
            kapten={rows}
            page={page}
            pageSize={pageSize}
            search={search}
            sort={sort}
            status={statusFilter}
          />

          <ReuiDirectoryFooter basePath="/admin/kapten" query={directoryQuery} page={page} pageCount={pageCount} pageSize={pageSize} total={total} visibleCount={kapten.length} />
        </section>
      </div>
    </PortalShell>
  );
}

export { KaptenPageModule };
export type { EnrolledKapten };

import Link from "next/link";

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
  "kapten-deactivated": "Kapten access has been disabled and active sessions were revoked.",
  "kapten-reactivated": "Kapten access has been restored without restoring old sessions or handoffs.",
  "kapten-updated": "Kapten profile details were updated.",
};

const errorMessages: Record<string, string> = {
  "duplicate-email": "That email is already being used by another account.",
  "invalid-directory-query": "That directory filter is invalid or too broad. The safe directory view has been restored.",
  "invalid-user": "That account identifier is invalid. Reload the directory and try again.",
  "missing-fields": "Please add the Kapten's name and email before updating.",
  "missing-user": "We couldn't find that Kapten account.",
  "update-failed": "We're sorry, we couldn't update that Kapten account. Please try again.",
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
      description="Manage Kapten accounts and enrollment handoffs."
      session={session}
      title="Kapten"
    >
      <div className="space-y-7">
        <FocusRestorer announcementId="kapten-directory-announcement" fallbackId="kapten-heading" noticeId="kapten-directory-notice" targetId={focus ? `kapten-${focus}` : null} />

        <header className="flex items-start justify-between gap-5">
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-secondary-950 sm:text-4xl" id="kapten-heading">Kapten</h1>
          <AddKaptenDialog />
        </header>

        <p aria-live="polite" className="sr-only" id="kapten-directory-announcement">{focus ? "Returned to the selected Kapten directory row." : ""}</p>
        {notice ? <div id="kapten-directory-notice" tabIndex={-1}><FormNotice tone="success">{noticeMessages[notice] ?? notice}</FormNotice></div> : null}
        {error ? <FormNotice tone="danger">{errorMessages[error] ?? error}</FormNotice> : null}

        <section aria-label="Kapten directory" className="overflow-hidden rounded-2xl bg-white">
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

          <div className="flex flex-col gap-3 border-t border-primary-100 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="text-xs tabular-nums text-secondary-600"><span className="sr-only">Showing </span>{visibleStart}–{visibleEnd} of {total}</p>
              <StudentPageSizeSelect basePath="/admin/kapten" pageSize={pageSize} query={directoryQuery} />
            </div>
            {pageCount > 1 ? (
              <nav aria-label="Kapten directory pages" className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-xs font-semibold tabular-nums text-secondary-600">{page} of {pageCount}</span>
                <div className="flex min-w-0 items-center gap-0.5">
                  {page > 1 ? <Link aria-label="Previous Kapten directory page" className={buttonVariants({ className: "size-9 rounded-lg p-0", size: "icon-sm", variant: "ghost" })} href={pageHref(page - 1)}><ChevronLeft aria-hidden="true" size={16} /></Link> : null}
                  <ol className="flex items-center gap-0.5">
                    {paginationItems.map((item) => item === "ellipsis-before" || item === "ellipsis-after" ? (
                      <li key={item}><span aria-hidden="true" className="grid size-9 place-items-center text-secondary-400"><MoreHorizontal size={16} /></span><span className="sr-only">More pages</span></li>
                    ) : (
                      <li key={item}><Link aria-current={item === page ? "page" : undefined} aria-label={`Go to page ${item}`} className={buttonVariants({ className: item === page ? "size-9 rounded-lg bg-primary-700 p-0 text-white hover:bg-primary-800" : "size-9 rounded-lg p-0 text-secondary-700 hover:bg-primary-50 hover:text-primary-800", size: "icon-sm", variant: item === page ? "brand" : "ghost" })} href={pageHref(item)}>{item}</Link></li>
                    ))}
                  </ol>
                  {page < pageCount ? <Link aria-label="Next Kapten directory page" className={buttonVariants({ className: "size-9 rounded-lg p-0", size: "icon-sm", variant: "ghost" })} href={pageHref(page + 1)}><ChevronRight aria-hidden="true" size={16} /></Link> : null}
                </div>
              </nav>
            ) : null}
          </div>
        </section>
      </div>
    </PortalShell>
  );
}

export { KaptenPageModule };
export type { EnrolledKapten };

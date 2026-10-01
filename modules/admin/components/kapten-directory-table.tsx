"use client";

import { useState, type ReactNode } from "react";

import {
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
} from "@/components/dashboard/reference-dashboard-tokens";
import { Button } from "@/components/ui/button";
import { ReuiDirectoryGrid, ReuiDirectoryMember, ReuiDirectoryFilters, type ReuiDirectoryColumn, type ReuiDirectoryFilter } from "./reui-directory-grid";
import styles from "./reui-directory-grid.module.css";
import { FieldRequiredMark } from "@/components/ui/field";
import { fieldLabelClassName } from "@/components/ui/field-constants";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { EnrollmentHandoffMethod, EnrollmentHandoffStatus, UserStatus } from "@/generated/prisma/client";
import { XIcon } from "@/lib/icons";
import { DEFAULT_DIRECTORY_PAGE_SIZE, type DirectoryPageSize } from "@/lib/admin/operations/directory-page-constants";
import { buildDirectoryQuery, type DirectorySortDirection, type DirectorySortKey } from "@/lib/admin/operations/directory-query";

import {
  deactivateKaptenEnrollmentAction,
  reactivateKaptenEnrollmentAction,
  updateKaptenEnrollmentAction,
} from "../actions";
import { HandoffControls } from "./handoff-controls";

type KaptenDirectoryItem = {
  bio: string | null;
  createdAt: string;
  email: string;
  fullName: string;
  headline: string | null;
  id: string;
  latestHandoff: {
    expiresAt: string | null;
    id: string;
    method: EnrollmentHandoffMethod;
    sourceImportRowId: string | null;
    status: EnrollmentHandoffStatus;
  } | null;
  phone: string | null;
  status: UserStatus;
};

function formatStatus(status: string) {
  return {
    active: "Aktif",
    disabled: "Dinonaktifkan",
    locked: "Terkunci",
    soft_deleted: "Dihapus sementara",
  }[status] ?? status.replaceAll("_", " ");
}

function getInitials(fullName: string) {
  const initials = fullName
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return initials || "K";
}

function formatCreatedDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function directoryHref({
  direction,
  pageSize,
  search,
  sort,
  status,
}: {
  direction: DirectorySortDirection;
  pageSize: DirectoryPageSize;
  search: string;
  sort: DirectorySortKey | null;
  status: UserStatus | "all";
}) {
  const query = buildDirectoryQuery({
    direction,
    focus: null,
    page: 1,
    pageSize,
    search,
    sort,
    status,
  });
  return query ? `/admin/kapten${query}` : "/admin/kapten";
}

function KaptenDetailPanel({
  directoryQuery,
  kapten,
}: {
  directoryQuery: string;
  kapten: KaptenDirectoryItem;
}) {
  return (
    <SheetContent className="w-[min(100%,38rem)] max-w-full bg-voyage-canvas p-0 sm:max-w-xl" side="right" showCloseButton={false}>
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="border-b border-primary-100 px-5 pb-6 pt-6 sm:px-6 sm:pb-7">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <span aria-hidden="true" className="grid size-16 shrink-0 place-items-center rounded-2xl bg-primary-50 text-lg font-bold text-primary-800 ring-1 ring-inset ring-primary-100">
              {getInitials(kapten.fullName)}
            </span>
            <SheetClose
              render={<Button className="text-secondary-900 hover:text-primary-700" size="icon" type="button" variant="outline" />}
            >
              <XIcon />
               <span className="sr-only">Tutup</span>
            </SheetClose>
          </div>
          <SheetTitle className="mt-4 text-xl font-semibold leading-tight tracking-[-0.03em] text-secondary-950 sm:text-2xl">
            {kapten.fullName}
          </SheetTitle>
          <SheetDescription className="mt-1 truncate text-sm text-secondary-600">{kapten.email}</SheetDescription>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6 sm:py-7">
          <form action={updateKaptenEnrollmentAction} className="grid gap-5">
            <input name="userId" type="hidden" value={kapten.id} />
            <input name="directoryQuery" type="hidden" value={directoryQuery} />
            <div className="grid gap-5 sm:grid-cols-2">
               <label className="min-w-0 space-y-2"><span className={fieldLabelClassName}>Nama Kapten<FieldRequiredMark /></span><input className={REFERENCE_CONTROL_CLASS_NAMES.input} defaultValue={kapten.fullName} name="fullName" required /></label>
               <label className="min-w-0 space-y-2"><span className={fieldLabelClassName}>Email Kapten<FieldRequiredMark /></span><input className={REFERENCE_CONTROL_CLASS_NAMES.input} defaultValue={kapten.email} name="email" required type="email" /></label>
               <label className="min-w-0 space-y-2"><span className={fieldLabelClassName}>Nomor telepon</span><input className={REFERENCE_CONTROL_CLASS_NAMES.input} defaultValue={kapten.phone ?? ""} name="phone" type="tel" /></label>
               <label className="min-w-0 space-y-2"><span className={fieldLabelClassName}>Headline</span><input className={REFERENCE_CONTROL_CLASS_NAMES.input} defaultValue={kapten.headline ?? ""} name="headline" /></label>
            </div>
            <label className="min-w-0 space-y-2"><span className={fieldLabelClassName}>Bio</span><textarea className={`${REFERENCE_CONTROL_CLASS_NAMES.input} min-h-28 py-3`} defaultValue={kapten.bio ?? ""} name="bio" /></label>
           <div className="flex justify-end"><Button type="submit" variant="default">Simpan perubahan</Button></div>
          </form>

          <ReferenceSurface as="section" aria-labelledby={`kapten-state-${kapten.id}`} className="mt-7 p-4 sm:p-5" variant="inset">
             <h2 className="text-sm font-semibold text-secondary-900" id={`kapten-state-${kapten.id}`}>Status akun</h2>
             <p className="mt-1 text-sm capitalize text-secondary-600">{formatStatus(kapten.status)} · Peran aktif: Kapten</p>
            <div className="mt-4">
              {kapten.status === "active" ? (
                <form action={deactivateKaptenEnrollmentAction} className="space-y-3">
                  <input name="userId" type="hidden" value={kapten.id} />
                  <input name="directoryQuery" type="hidden" value={directoryQuery} />
                  <label className="flex items-start gap-2 text-xs leading-5 text-secondary-600">
                    <input className="mt-1 size-4 shrink-0 accent-primary-700" name="confirmation" required type="checkbox" value="deactivate" />
                    <span>Saya memahami bahwa tindakan ini menonaktifkan akun, mencabut sesi aktif, dan membatalkan handoff terbuka.<FieldRequiredMark /></span>
                  </label>
                   <Button type="submit" variant="destructive">Nonaktifkan</Button>
                </form>
              ) : kapten.status === "disabled" ? (
                <form action={reactivateKaptenEnrollmentAction} className="space-y-3">
                  <input name="userId" type="hidden" value={kapten.id} />
                  <input name="directoryQuery" type="hidden" value={directoryQuery} />
                  <label className="flex items-start gap-2 text-xs leading-5 text-secondary-600">
                    <input className="mt-1 size-4 shrink-0 accent-primary-700" name="confirmation" required type="checkbox" value="reactivate" />
                    <span>Saya memahami bahwa pemulihan tidak mengembalikan sesi atau handoff lama.<FieldRequiredMark /></span>
                  </label>
                  <Button size="sm" type="submit" variant="outline">Pulihkan</Button>
                </form>
              ) : (
                 <p className="max-w-xs rounded-2xl border border-secondary-200 bg-secondary-50 px-4 py-3 text-xs leading-5 text-secondary-600">Akun ini memerlukan pemulihan manual sebelum status enrollment dapat diubah.</p>
              )}
            </div>
          </ReferenceSurface>

          {kapten.latestHandoff ? (
            <ReferenceSurface as="section" aria-labelledby={`kapten-handoff-${kapten.id}`} className="mt-5 p-4 sm:p-5" variant="inset">
               <h2 className="mb-4 text-sm font-semibold text-secondary-900" id={`kapten-handoff-${kapten.id}`}>Handoff enrollment</h2>
              <HandoffControls
                expiresAt={kapten.latestHandoff.expiresAt ? new Date(kapten.latestHandoff.expiresAt) : null}
                handoffId={kapten.latestHandoff.id}
                method={kapten.latestHandoff.method}
                sourceImportRowId={kapten.latestHandoff.sourceImportRowId}
                status={kapten.latestHandoff.status}
              />
            </ReferenceSurface>
          ) : null}

           <p className="mt-6 text-xs leading-6 text-secondary-500">Dibuat pada {formatCreatedDate(kapten.createdAt)}</p>
        </div>
      </div>
    </SheetContent>
  );
}

function KaptenDirectoryTable({
  direction,
  focus,
  kapten,
  page,
  pageSize,
  search,
  sort,
  status,
  total,
  actions,
}: {
  direction: DirectorySortDirection;
  focus: string | null;
  kapten: KaptenDirectoryItem[];
  page: number;
  pageSize: DirectoryPageSize;
  search: string;
  sort: DirectorySortKey | null;
  status: UserStatus | "all";
  total: number;
  actions: ReactNode;
}) {
  const [selectedKapten, setSelectedKapten] = useState<KaptenDirectoryItem | null>(null);
  const clearSearchHref = directoryHref({ direction, pageSize, search: "", sort, status });
  const clearStatusHref = directoryHref({ direction, pageSize, search, sort, status: "all" });
  const clearFiltersHref = directoryHref({ direction, pageSize, search: "", sort: null, status: "all" });
  const directoryQuery = buildDirectoryQuery({ direction, focus: focus ?? null, page, pageSize, search, sort, status });
  const filters: ReuiDirectoryFilter[] = status !== "all"
    ? [{ href: clearStatusHref, id: "status", label: "Status", value: formatStatus(status) }]
    : [];

  const columns: ReuiDirectoryColumn<KaptenDirectoryItem>[] = [
    { id: "kapten", label: "Kapten", sortKey: "student", width: 36, cell: person => <ReuiDirectoryMember name={person.fullName} email={person.email} onView={() => setSelectedKapten(person)} /> },
    { id: "email", label: "Email", sortKey: "email", width: 30, cell: person => <a className={styles.email} href={`mailto:${person.email}`}>{person.email}</a> },
    { id: "status", label: "Status akun", sortKey: "status", width: 17, cell: person => <span className={styles.status} data-status={person.status}>{formatStatus(person.status)}</span> },
    { id: "added", label: "Ditambahkan", sortKey: "added", width: 17, cell: person => <time className={styles.muted} dateTime={person.createdAt}>{formatCreatedDate(person.createdAt)}</time> },
  ];

  return (
    <>
       <ReuiDirectoryGrid
         caption="Direktori Kapten"
        title="Kapten" total={total} actions={actions}
        clearFiltersHref={clearFiltersHref}
        columns={columns}
        emptyState={<><strong>{status === "all" && !search ? "Belum ada akun Kapten" : "Tidak ada Kapten yang cocok"}</strong>{status === "all" && !search ? "Tambahkan Kapten untuk membuat akun pertama." : "Coba nama, email, atau filter lain."}</>}
        filterPanel={<ReuiDirectoryFilters basePath="/admin/kapten" query={directoryQuery} statuses={status === "all" ? [] : [status]} clearHref={clearStatusHref} />}
        filters={filters}
        getRowId={(person) => person.id}
        onRowClick={setSelectedKapten}
        rowProps={(person) => ({ "data-directory-row": "true", id: `kapten-${person.id}`, tabIndex: -1, "data-focused": focus === person.id ? "true" : undefined })}
        rows={kapten}
        search={{
          action: "/admin/kapten",
          clearHref: clearSearchHref,
          hiddenFields: {
            ...(pageSize !== DEFAULT_DIRECTORY_PAGE_SIZE ? { pageSize: String(pageSize) } : {}),
            ...(sort ? { sort } : {}),
            ...(sort && direction === "desc" ? { direction } : {}),
            ...(status !== "all" ? { status } : {}),
          },
           label: "Pencarian Kapten global",
           placeholder: "Cari…",
          value: search,
        }}
        sort={{
          direction,
          href: (nextSortKey, nextDirection) => {
            const query = buildDirectoryQuery({ direction: nextDirection, focus: null, page: 1, pageSize, search, sort: nextSortKey as DirectorySortKey | null, status });
            return query ? `/admin/kapten${query}` : "/admin/kapten";
          },
          key: sort,
        }}
      />
      <Sheet onOpenChange={(open) => { if (!open) setSelectedKapten(null); }} open={Boolean(selectedKapten)}>
        {selectedKapten ? <KaptenDetailPanel directoryQuery={directoryQuery} kapten={selectedKapten} /> : null}
      </Sheet>
    </>
  );
}

export { KaptenDirectoryTable };
export type { KaptenDirectoryItem };

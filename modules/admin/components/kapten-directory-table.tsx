"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

import {
  ReferenceEmptyState,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_SURFACE_CLASS_NAMES,
} from "@/components/dashboard/reference-dashboard-tokens";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { DataTable, type DataTableColumn, type DataTableFilter } from "@/components/ui/data-table";
import { FieldRequiredMark } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { EnrollmentHandoffMethod, EnrollmentHandoffStatus, UserStatus } from "@/generated/prisma/client";
import { ChevronRight, Users, XIcon } from "@/lib/icons";
import { DEFAULT_DIRECTORY_PAGE_SIZE, type DirectoryPageSize } from "@/lib/admin/operations/directory-page-constants";
import { buildDirectoryQuery, type DirectorySortDirection, type DirectorySortKey } from "@/lib/admin/operations/directory-query";
import { cn } from "@/lib/utils";

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

function statusTone(status: UserStatus) {
  if (status === "active") return "success" as const;
  if (status === "disabled" || status === "soft_deleted") return "danger" as const;
  if (status === "locked") return "attention" as const;
  return "neutral" as const;
}

function statusTextClassName(status: UserStatus) {
  const tone = statusTone(status);
  if (tone === "danger") return "text-student-status-danger-fg";
  if (tone === "attention") return "text-student-status-attention-fg";
  if (tone === "success") return "text-student-status-success-fg";
  return "text-secondary-600";
}

function statusDotClassName(status: UserStatus) {
  const tone = statusTone(status);
  if (tone === "danger") return "bg-student-status-danger-fg";
  if (tone === "attention") return "bg-student-status-attention-fg";
  if (tone === "success") return "bg-student-status-success-fg";
  return "bg-secondary-300";
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

function highlightSearchMatches(text: string, query: string): ReactNode {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = normalizedQuery.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  let matchIndex = lowerText.indexOf(lowerQuery);
  let matchNumber = 0;

  while (matchIndex !== -1) {
    if (matchIndex > cursor) parts.push(text.slice(cursor, matchIndex));
    parts.push(
      <mark className="rounded-sm bg-student-status-attention-bg text-inherit" key={`search-match-${matchNumber}`}>
        {text.slice(matchIndex, matchIndex + normalizedQuery.length)}
      </mark>,
    );
    cursor = matchIndex + normalizedQuery.length;
    matchNumber += 1;
    matchIndex = lowerText.indexOf(lowerQuery, cursor);
  }

  if (!matchNumber) return text;
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

const createdDateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

function formatCreatedDate(value: string) {
  return createdDateFormatter.format(new Date(value));
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

function KaptenFilterPanel({
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<UserStatus | "all">(status);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const query = buildDirectoryQuery({
      direction,
      focus: null,
      page: 1,
      pageSize,
      search: String(formData.get("q") ?? ""),
      sort,
      status: draftStatus,
    });
    router.replace(query ? `/admin/kapten${query}` : "/admin/kapten", { scroll: false });
    setOpen(false);
  };

  return (
    <Popover onOpenChange={(nextOpen) => { setOpen(nextOpen); if (nextOpen) setDraftStatus(status); }} open={open}>
      <PopoverTrigger
        render={
          <Button
            aria-haspopup="dialog"
            className="group min-h-11 w-full justify-between rounded-2xl px-3 text-left text-sm hover:bg-primary-50/60"
            type="button"
            variant={status !== "all" ? "contextSelected" : "reference"}
          />
        }
      >
        <span className="font-medium text-secondary-900">Status</span>
        <ChevronRight aria-hidden="true" className="text-secondary-400 transition-transform group-aria-expanded:translate-x-0.5" size={16} />
      </PopoverTrigger>
      <PopoverContent align="start" className={cn(REFERENCE_SURFACE_CLASS_NAMES.raised, "w-[min(18rem,calc(100vw-2rem))] gap-2 p-2")} side="left" sideOffset={6}>
        <form action="/admin/kapten" className="grid gap-2" method="get" onSubmit={handleSubmit}>
          <input name="q" type="hidden" value={search} />
          {sort ? <input name="sort" type="hidden" value={sort} /> : null}
          {sort && direction === "desc" ? <input name="direction" type="hidden" value={direction} /> : null}
          <div aria-label="Status" className="grid gap-0.5" role="group">
            {(["all", "active", "disabled", "locked"] as const).map((option) => (
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl px-3 text-sm font-medium capitalize text-secondary-800 transition-colors hover:bg-primary-50/60" key={option}>
                <input
                  checked={draftStatus === option}
                  className="size-4 accent-primary-700"
                  name="status"
                  onChange={() => setDraftStatus(option)}
                  type="radio"
                  value={option}
                />
                 <span>{option === "all" ? "Semua status" : formatStatus(option)}</span>
              </label>
            ))}
          </div>
          <div className="flex w-full items-center gap-2 pt-1">
            <a className={cn(buttonVariants({ size: "sm", variant: "reference" }), "min-w-0 flex-1")} href={directoryHref({ direction, pageSize, search, sort, status: "all" })}>
             Hapus filter
            </a>
           <Button className="min-w-0 flex-[2]" size="sm" type="submit" variant="brand">Terapkan</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
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
              render={<Button className="text-secondary-900 hover:text-primary-700" size="icon" type="button" variant="reference" />}
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
               <label className="min-w-0 space-y-2 text-sm"><span className="font-semibold text-secondary-900">Nama Kapten<FieldRequiredMark /></span><input className={REFERENCE_CONTROL_CLASS_NAMES.input} defaultValue={kapten.fullName} name="fullName" required /></label>
               <label className="min-w-0 space-y-2 text-sm"><span className="font-semibold text-secondary-900">Email Kapten<FieldRequiredMark /></span><input className={REFERENCE_CONTROL_CLASS_NAMES.input} defaultValue={kapten.email} name="email" required type="email" /></label>
               <label className="min-w-0 space-y-2 text-sm"><span className="font-semibold text-secondary-900">Nomor telepon</span><input className={REFERENCE_CONTROL_CLASS_NAMES.input} defaultValue={kapten.phone ?? ""} name="phone" type="tel" /></label>
               <label className="min-w-0 space-y-2 text-sm"><span className="font-semibold text-secondary-900">Headline</span><input className={REFERENCE_CONTROL_CLASS_NAMES.input} defaultValue={kapten.headline ?? ""} name="headline" /></label>
            </div>
            <label className="min-w-0 space-y-2 text-sm"><span className="font-semibold text-secondary-900">Bio</span><textarea className={`${REFERENCE_CONTROL_CLASS_NAMES.input} min-h-28 py-3`} defaultValue={kapten.bio ?? ""} name="bio" /></label>
           <div className="flex justify-end"><Button type="submit" variant="brand">Simpan perubahan</Button></div>
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
                   <button className={buttonVariants({ variant: "brandOutline" })} type="submit">Pulihkan</button>
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
}: {
  direction: DirectorySortDirection;
  focus: string | null;
  kapten: KaptenDirectoryItem[];
  page: number;
  pageSize: DirectoryPageSize;
  search: string;
  sort: DirectorySortKey | null;
  status: UserStatus | "all";
}) {
  const [selectedKapten, setSelectedKapten] = useState<KaptenDirectoryItem | null>(null);
  const clearSearchHref = directoryHref({ direction, pageSize, search: "", sort, status });
  const clearStatusHref = directoryHref({ direction, pageSize, search, sort, status: "all" });
  const clearFiltersHref = directoryHref({ direction, pageSize, search: "", sort: null, status: "all" });
  const directoryQuery = buildDirectoryQuery({ direction, focus: focus ?? null, page, pageSize, search, sort, status });
  const filters: DataTableFilter[] = status !== "all"
    ? [{ href: clearStatusHref, id: "status", label: "Status", value: formatStatus(status) }]
    : [];

  const columns: DataTableColumn<KaptenDirectoryItem>[] = [
    {
      cell: (person) => (
        <span className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-50 text-xs font-bold text-primary-800 ring-1 ring-inset ring-primary-100">{getInitials(person.fullName)}</span>
          <span className="block max-w-[14rem] truncate font-semibold text-secondary-900" title={person.fullName}>{highlightSearchMatches(person.fullName, search)}</span>
        </span>
      ),
      headerClassName: "w-[28%]",
      id: "kapten",
      label: "Kapten",
      sortKey: "student",
      width: 28,
    },
    {
      cell: (person) => <span className="block max-w-[20rem] truncate text-secondary-700" title={person.email}>{highlightSearchMatches(person.email, search)}</span>,
      headerClassName: "w-[28%]",
      id: "email",
      label: "Email",
      sortKey: "email",
      width: 28,
    },
    {
      cell: (person) => <time dateTime={person.createdAt}>{formatCreatedDate(person.createdAt)}</time>,
      cellClassName: "text-secondary-700",
      headerClassName: "w-[17%]",
      id: "added",
       label: "Ditambahkan",
      sortKey: "added",
      width: 17,
    },
    {
      cell: (person) => <span className={cn("inline-flex items-center gap-2 font-semibold capitalize", statusTextClassName(person.status))}>{person.status !== "active" ? <span aria-hidden="true" className={cn("size-2 rounded-full", statusDotClassName(person.status))} /> : null}{formatStatus(person.status)}</span>,
      headerClassName: "w-[17%]",
      id: "status",
      label: "Status",
      sortKey: "status",
      width: 17,
    },
    {
      cell: (person) => <button aria-label={`View details for ${person.fullName}`} className="font-semibold text-primary-700 underline-offset-4 transition-colors hover:text-primary-900 hover:underline" onClick={() => setSelectedKapten(person)} type="button">Open</button>,
      cellClassName: "text-right",
      headerClassName: "w-[10%] text-right",
      id: "action",
       label: "Aksi",
      width: 10,
    },
  ];

  return (
    <>
       <DataTable
         caption="Direktori Kapten"
        clearFiltersHref={clearFiltersHref}
        columns={columns}
         emptyState={<ReferenceEmptyState className="min-h-56" description={status === "all" && !search ? "Gunakan tombol tambah Kapten di atas untuk membuat akun pertama dan memilih handoff." : "Coba nama, email, atau filter status lain untuk menemukan akun yang dibutuhkan."} icon={Users} title={status === "all" && !search ? "Belum ada akun Kapten." : "Tidak ada Kapten yang cocok dengan filter ini."} />}
        filterPanel={<KaptenFilterPanel direction={direction} pageSize={pageSize} search={search} sort={sort} status={status} />}
        filters={filters}
        getRowId={(person) => person.id}
        onRowClick={setSelectedKapten}
        rowClassName={(person) => focus === person.id ? "bg-primary-50/70 shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--voyage-leaf)_18%,transparent)]" : undefined}
        rowProps={(person) => ({ "data-directory-row": "true", id: `kapten-${person.id}`, tabIndex: -1 })}
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
           placeholder: "Cari Kapten berdasarkan nama atau email…",
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
        tableClassName="min-w-[760px]"
      />
      <Sheet onOpenChange={(open) => { if (!open) setSelectedKapten(null); }} open={Boolean(selectedKapten)}>
        {selectedKapten ? <KaptenDetailPanel directoryQuery={directoryQuery} kapten={selectedKapten} /> : null}
      </Sheet>
    </>
  );
}

export { KaptenDirectoryTable };
export type { KaptenDirectoryItem };

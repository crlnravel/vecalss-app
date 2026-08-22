"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { DataTable, type DataTableColumn, type DataTableFilter } from "@/components/ui/data-table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { fieldControlClassName } from "@/components/ui/field-constants";
import type { EnrollmentHandoffMethod, EnrollmentHandoffStatus, UserStatus } from "@/generated/prisma/client";
import { ChevronRight, XIcon } from "@/lib/icons";
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
  return status.replaceAll("_", " ");
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

function formatCreatedDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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
            className="group h-9 w-full justify-between rounded-lg px-2.5 text-left text-xs hover:bg-primary-50/60"
            type="button"
            variant={status !== "all" ? "contextSelected" : "ghost"}
          />
        }
      >
        <span className="font-medium text-secondary-900">Status</span>
        <ChevronRight aria-hidden="true" className="text-secondary-400 transition-transform group-aria-expanded:translate-x-0.5" size={16} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(18rem,calc(100vw-2rem))] gap-2 rounded-lg p-2" side="left" sideOffset={6}>
        <form action="/admin/kapten" className="grid gap-2" method="get" onSubmit={handleSubmit}>
          <input name="q" type="hidden" value={search} />
          {sort ? <input name="sort" type="hidden" value={sort} /> : null}
          {sort && direction === "desc" ? <input name="direction" type="hidden" value={direction} /> : null}
          <div aria-label="Status" className="grid gap-0.5" role="group">
            {(["all", "active", "disabled", "locked"] as const).map((option) => (
              <label className="flex h-9 cursor-pointer items-center gap-2 rounded-lg px-2 text-xs font-medium capitalize text-secondary-800 transition-colors hover:bg-primary-50/60" key={option}>
                <input
                  checked={draftStatus === option}
                  className="size-4 accent-primary-700"
                  name="status"
                  onChange={() => setDraftStatus(option)}
                  type="radio"
                  value={option}
                />
                <span>{option === "all" ? "All statuses" : formatStatus(option)}</span>
              </label>
            ))}
          </div>
          <div className="flex w-full items-center gap-1.5 pt-1">
            <a className={cn(buttonVariants({ size: "xs", variant: "ghost" }), "min-w-0 flex-1")} href={directoryHref({ direction, pageSize, search, sort, status: "all" })}>
              Clear
            </a>
            <Button className="min-w-0 flex-[2]" size="xs" type="submit" variant="brand">Apply</Button>
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
    <SheetContent className="w-[min(100%,38rem)] max-w-full p-0 sm:max-w-xl" side="right" showCloseButton={false}>
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="border-b border-primary-100 px-5 pb-6 pt-6 sm:px-6 sm:pb-7">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <span aria-hidden="true" className="grid size-16 shrink-0 place-items-center rounded-2xl bg-primary-50 text-lg font-bold text-primary-800 ring-1 ring-inset ring-primary-100">
              {getInitials(kapten.fullName)}
            </span>
            <SheetClose
              render={<Button className="border-0 bg-transparent text-secondary-900 hover:border-0 hover:bg-transparent hover:text-primary-700 focus-visible:border-transparent focus-visible:ring-primary-300/40" size="icon" type="button" variant="brandOutline" />}
            >
              <XIcon />
              <span className="sr-only">Close</span>
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
              <label className="min-w-0 space-y-2 text-sm"><span className="font-medium text-secondary-900">Kapten name</span><input className={fieldControlClassName} defaultValue={kapten.fullName} name="fullName" required /></label>
              <label className="min-w-0 space-y-2 text-sm"><span className="font-medium text-secondary-900">Kapten email</span><input className={fieldControlClassName} defaultValue={kapten.email} name="email" required type="email" /></label>
              <label className="min-w-0 space-y-2 text-sm"><span className="font-medium text-secondary-900">Phone</span><input className={fieldControlClassName} defaultValue={kapten.phone ?? ""} name="phone" type="tel" /></label>
              <label className="min-w-0 space-y-2 text-sm"><span className="font-medium text-secondary-900">Headline</span><input className={fieldControlClassName} defaultValue={kapten.headline ?? ""} name="headline" /></label>
            </div>
            <label className="min-w-0 space-y-2 text-sm"><span className="font-medium text-secondary-900">Bio</span><textarea className={`${fieldControlClassName} min-h-28 py-3`} defaultValue={kapten.bio ?? ""} name="bio" /></label>
            <div className="flex justify-end"><Button type="submit" variant="brand">Save changes</Button></div>
          </form>

          <section aria-labelledby={`kapten-state-${kapten.id}`} className="mt-8 border-t border-primary-100 pt-6">
            <h2 className="text-sm font-semibold text-secondary-900" id={`kapten-state-${kapten.id}`}>Account state</h2>
            <p className="mt-1 text-sm capitalize text-secondary-600">{formatStatus(kapten.status)} · Active role: Kapten</p>
            <div className="mt-4">
              {kapten.status === "active" ? (
                <form action={deactivateKaptenEnrollmentAction} className="space-y-3">
                  <input name="userId" type="hidden" value={kapten.id} />
                  <input name="directoryQuery" type="hidden" value={directoryQuery} />
                  <label className="flex items-start gap-2 text-xs leading-5 text-secondary-600">
                    <input className="mt-1 size-4 shrink-0 accent-primary-700" name="confirmation" required type="checkbox" value="deactivate" />
                    <span>I understand this disables the account, revokes active sessions, and invalidates open handoffs.</span>
                  </label>
                  <Button type="submit" variant="destructive">Deactivate</Button>
                </form>
              ) : kapten.status === "disabled" ? (
                <form action={reactivateKaptenEnrollmentAction} className="space-y-3">
                  <input name="userId" type="hidden" value={kapten.id} />
                  <input name="directoryQuery" type="hidden" value={directoryQuery} />
                  <label className="flex items-start gap-2 text-xs leading-5 text-secondary-600">
                    <input className="mt-1 size-4 shrink-0 accent-primary-700" name="confirmation" required type="checkbox" value="reactivate" />
                    <span>I understand reactivation does not restore old sessions or handoffs.</span>
                  </label>
                  <button className={buttonVariants({ variant: "brandOutline" })} type="submit">Reactivate</button>
                </form>
              ) : (
                <p className="max-w-xs rounded-2xl border border-secondary-200 bg-secondary-50 px-4 py-3 text-xs leading-5 text-secondary-600">This account needs manual recovery before enrollment status can be changed.</p>
              )}
            </div>
          </section>

          {kapten.latestHandoff ? (
            <section aria-labelledby={`kapten-handoff-${kapten.id}`} className="mt-8 border-t border-primary-100 pt-6">
              <h2 className="mb-4 text-sm font-semibold text-secondary-900" id={`kapten-handoff-${kapten.id}`}>Enrollment handoff</h2>
              <HandoffControls
                expiresAt={kapten.latestHandoff.expiresAt ? new Date(kapten.latestHandoff.expiresAt) : null}
                handoffId={kapten.latestHandoff.id}
                method={kapten.latestHandoff.method}
                sourceImportRowId={kapten.latestHandoff.sourceImportRowId}
                status={kapten.latestHandoff.status}
              />
            </section>
          ) : null}

          <p className="mt-8 border-t border-primary-100 pt-4 text-xs leading-6 text-secondary-500">Created on {formatCreatedDate(kapten.createdAt)}</p>
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
      hideable: false,
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
      label: "Added",
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
      label: "Action",
      width: 10,
    },
  ];

  return (
    <>
      <DataTable
        caption="Kapten directory"
        clearFiltersHref={clearFiltersHref}
        columns={columns}
        emptyState={<div className="px-5 py-8 text-left sm:px-8 sm:py-10"><div className="max-w-xl"><h3 className="text-lg font-semibold leading-tight tracking-[-0.03em] text-secondary-900 sm:text-xl">{status === "all" && !search ? "No Kapten accounts yet." : "No Kapten match these filters."}</h3><p className="mt-2 max-w-[58ch] text-sm leading-6 text-secondary-600">{status === "all" && !search ? "Use the Add Kapten button above to create the first account and choose its handoff." : "Try another name, email, or status filter to find the account you need."}</p></div></div>}
        filterPanel={<KaptenFilterPanel direction={direction} pageSize={pageSize} search={search} sort={sort} status={status} />}
        filters={filters}
        getRowId={(person) => person.id}
        onRowClick={setSelectedKapten}
        rowClassName={(person) => focus === person.id ? "bg-primary-50/70 shadow-[inset_0_0_0_2px_rgba(26,107,60,0.18)]" : undefined}
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
          label: "Global Kapten search",
          placeholder: "Search Kapten by name or email…",
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

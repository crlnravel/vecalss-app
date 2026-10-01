"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import {
  ReferencePageHeader,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { DataTable, type DataTableColumn, type DataTableFilter } from "@/components/ui/data-table";
import { DataTableFilterMenu, type DataTableFilterMenuItem } from "@/components/ui/data-table-filter-menu";
import type { SessionContext } from "@/lib/auth/types";
import {
  AUDIT_LOG_TARGET_TYPES,
  buildAuditLogQuery,
  DEFAULT_AUDIT_LOG_DIRECTION,
  DEFAULT_AUDIT_LOG_SORT,
  type AuditLogSortDirection,
  type AuditLogSortKey,
  type AuditLogTargetType,
} from "@/lib/admin/operations/audit-query";
import type { AdminAuditLogEntry } from "@/lib/admin/operations/service";
import { cn } from "@/lib/utils";
import { PortalShell } from "@/modules/portal/components/portal-shell";

import { CopyValueButton } from "./components/copy-value-button";

const auditDateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

const auditTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

const auditTargetTypeLabels: Record<AuditLogTargetType, string> = {
  cohort: "Cohort",
  enrollment_handoff: "Handoff enrollment",
  enrollment_import: "Import enrollment",
  enrollment_import_row: "Baris import enrollment",
  system_config: "Konfigurasi sistem",
  user: "Pengguna",
};

const AUDIT_LOGS_EMPTY_STATE = (
  <div className="px-5 py-8 text-left sm:px-8 sm:py-10">
    <div className="max-w-xl">
       <h3 className="text-lg font-semibold leading-tight tracking-[-0.03em] text-secondary-900 sm:text-xl">Tidak ada event audit yang cocok dengan filter ini.</h3>
       <p className="mt-2 max-w-[58ch] text-sm leading-6 text-secondary-600">Coba pencarian atau filter target lain untuk menemukan event yang tercatat.</p>
    </div>
  </div>
);

function humanizeAuditValue(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll(".", " · ")
    .replace(/\b[a-z]/g, (character) => character.toUpperCase());
}

function formatAuditDate(value: string) {
  return auditDateFormatter.format(new Date(value));
}

function formatAuditTime(value: string) {
  return auditTimeFormatter.format(new Date(value));
}

function formatAuditTimestamp(value: string) {
  return `${formatAuditDate(value)} · ${formatAuditTime(value)}`;
}

function formatTargetType(value: string | null) {
  if (!value) {
     return "Target belum tercatat";
  }

  return auditTargetTypeLabels[value as AuditLogTargetType] ?? humanizeAuditValue(value);
}

function displayId(value: string) {
  if (value.length <= 24) {
    return value;
  }

  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function auditLogHref({
  direction,
  page,
  query,
  sort,
  targetType,
}: {
  direction: AuditLogSortDirection;
  page: number;
  query: string;
  sort: AuditLogSortKey | null;
  targetType: AuditLogTargetType | null;
}) {
  const queryString = buildAuditLogQuery({ direction, page, query, sort, targetType });
  return queryString ? `/admin/audit-logs${queryString}` : "/admin/audit-logs";
}

function auditSearchHiddenFields({
  direction,
  sort,
  targetType,
}: {
  direction: AuditLogSortDirection;
  sort: AuditLogSortKey;
  targetType: AuditLogTargetType | null;
}) {
  return {
    ...(targetType ? { targetType } : {}),
    ...(sort !== DEFAULT_AUDIT_LOG_SORT || direction !== DEFAULT_AUDIT_LOG_DIRECTION
      ? {
          direction,
          sort,
        }
      : {}),
  };
}

function AuditFilterPanel({
  direction,
  query,
  sort,
  targetType,
}: {
  direction: AuditLogSortDirection;
  query: string;
  sort: AuditLogSortKey;
  targetType: AuditLogTargetType | null;
}) {
  const router = useRouter();
  // The parent remounts this draft when its URL filter state changes.
  // react-doctor-disable-next-line no-derived-useState -- key at the caller resets the draft for each filter context.
  const [draftTargetType, setDraftTargetType] = useState<AuditLogTargetType | null>(targetType);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextHref = auditLogHref({
      direction,
      page: 1,
      query,
      sort,
      targetType: draftTargetType,
    });

    router.replace(nextHref, { scroll: false });
  }

  return (
    <form onSubmit={handleSubmit}>
      <DataTableFilterMenu
        filters={[
          {
            content: (
              <fieldset className="grid gap-0">
                <legend className="sr-only">Target</legend>
                <label className="flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg px-1.5 text-sm font-medium text-secondary-800 transition-colors hover:bg-primary-50/60 focus-within:bg-primary-50/60">
                  <input
                    className="size-3.5 accent-primary-700"
                    checked={draftTargetType === null}
                    name="targetType"
                    onChange={() => setDraftTargetType(null)}
                    type="radio"
                    value="all"
                  />
                  <span>Semua target</span>
                </label>
                {AUDIT_LOG_TARGET_TYPES.map((value) => (
                  <label
                    className="flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg px-1.5 text-sm font-medium text-secondary-800 transition-colors hover:bg-primary-50/60 focus-within:bg-primary-50/60"
                    key={value}
                  >
                    <input
                      className="size-3.5 accent-primary-700"
                      checked={draftTargetType === value}
                      name="targetType"
                      onChange={() => setDraftTargetType(value)}
                      type="radio"
                      value={value}
                    />
                    <span>{auditTargetTypeLabels[value]}</span>
                  </label>
                ))}
              </fieldset>
            ),
            id: "target-type",
            label: "Target",
            summary: draftTargetType
              ? auditTargetTypeLabels[draftTargetType]
              : "Semua target",
          } satisfies DataTableFilterMenuItem,
        ]}
      >
        <div className="flex w-full items-center gap-1.5 pt-4 pb-1">
          <Link
            className={cn(
              buttonVariants({ size: "sm", variant: "outline" }),
              "min-w-0 flex-1",
            )}
            href={auditLogHref({ direction, page: 1, query, sort, targetType: null })}
          >
            Hapus filter
          </Link>
          <Button className="min-w-28 flex-none" size="sm" type="submit" variant="default">
            Terapkan
          </Button>
        </div>
      </DataTableFilterMenu>
    </form>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold tracking-[0.08em] text-secondary-500 uppercase">{label}</dt>
      <dd className="mt-1 break-words text-sm leading-6 text-secondary-800">{value}</dd>
    </div>
  );
}

function AuditLogDetailDialog({
  audit,
  onClose,
}: {
  audit: AdminAuditLogEntry | null;
  onClose: () => void;
}) {
  const targetId = audit?.targetType === "user" ? null : audit?.targetId ?? null;

  return (
    <Dialog onOpenChange={(open) => { if (!open) onClose(); }} open={Boolean(audit)}>
      <DialogContent className="max-h-[min(720px,calc(100svh-2rem))] max-w-lg overflow-x-hidden overflow-y-auto p-0" variant="default">
        {audit ? (
          <>
            <DialogHeader className="min-w-0 border-b border-primary-100 px-5 py-5 pr-14 sm:px-6">
              {targetId ? (
                <div className="min-w-0">
                 <p className="text-xs font-semibold tracking-[0.08em] text-secondary-500 uppercase">ID target</p>
                  <div className="mt-1 flex min-w-0 items-center gap-2">
                    <code className="min-w-0 flex-1 break-all font-mono text-xs leading-5 text-secondary-700" title={targetId}>{displayId(targetId)}</code>
                 <CopyValueButton ariaLabel="Salin ID target" iconOnly value={targetId} />
                  </div>
                </div>
              ) : null}
              <DialogTitle className="break-words text-xl tracking-[-0.03em]">{humanizeAuditValue(audit.action)}</DialogTitle>
              <DialogDescription className="break-words">
                 Tercatat pada {formatAuditTimestamp(audit.occurredAt)}.
              </DialogDescription>
            </DialogHeader>

            <div className="min-w-0 px-5 py-6 sm:px-6">
              <dl className="grid min-w-0 gap-5">
                 <DetailField label="Waktu" value={formatAuditTimestamp(audit.occurredAt)} />
                 <DetailField label="Pengguna" value={audit.actorEmail ? `${audit.actorName} · ${audit.actorEmail}` : audit.actorName} />
                <DetailField label="Target" value={formatTargetType(audit.targetType)} />
                 <DetailField label="Alamat IP" value={audit.ipAddress ?? "Belum tercatat"} />
              </dl>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AuditUserDetailDialog({
  onClose,
  user,
}: {
  onClose: () => void;
  user: Pick<AdminAuditLogEntry, "actorEmail" | "actorId" | "actorName"> | null;
}) {
  return (
    <Dialog onOpenChange={(open) => { if (!open) onClose(); }} open={Boolean(user)}>
      <DialogContent className="max-h-[min(640px,calc(100svh-2rem))] max-w-md overflow-x-hidden overflow-y-auto p-0" variant="default">
        {user ? (
          <>
            <DialogHeader className="min-w-0 border-b border-primary-100 px-5 py-5 pr-14 sm:px-6">
              <DialogTitle className="break-words text-xl tracking-[-0.03em]">{user.actorName}</DialogTitle>
               <DialogDescription>Pengguna yang tercatat dalam riwayat audit ini.</DialogDescription>
            </DialogHeader>
            <div className="min-w-0 px-5 py-6 sm:px-6">
              <dl className="grid min-w-0 gap-5">
                 <DetailField label="Nama" value={user.actorName} />
                 <DetailField label="Email" value={user.actorEmail ?? "Email belum tercatat"} />
                {user.actorId ? (
                  <div className="min-w-0">
                     <dt className="text-xs font-semibold tracking-[0.08em] text-secondary-500 uppercase">ID pengguna</dt>
                    <dd className="mt-1 flex min-w-0 items-center gap-2">
                      <code className="min-w-0 flex-1 break-all font-mono text-xs leading-5 text-secondary-700" title={user.actorId}>{displayId(user.actorId)}</code>
                       <CopyValueButton ariaLabel="Salin ID pengguna" iconOnly value={user.actorId} />
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AuditLogsPageModule({
  direction,
  entries,
  page,
  pageCount,
  pageSize,
  query,
  session,
  sort,
  targetType,
  total,
}: {
  direction: AuditLogSortDirection;
  entries: AdminAuditLogEntry[];
  page: number;
  pageCount: number;
  pageSize: number;
  query: string;
  session: SessionContext;
  sort: AuditLogSortKey;
  targetType: AuditLogTargetType | null;
  total: number;
}) {
  const [selectedAudit, setSelectedAudit] = useState<AdminAuditLogEntry | null>(null);
  const [selectedUser, setSelectedUser] = useState<Pick<AdminAuditLogEntry, "actorEmail" | "actorId" | "actorName"> | null>(null);
  const visibleStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const visibleEnd = Math.min(total, page * pageSize);
  const clearSearchHref = auditLogHref({ direction, page: 1, query: "", sort, targetType });
  const clearTargetHref = auditLogHref({ direction, page: 1, query, sort, targetType: null });
  const clearFiltersHref = auditLogHref({ direction, page: 1, query: "", sort, targetType: null });
  const filters: DataTableFilter[] = targetType
    ? [{ href: clearTargetHref, id: "targetType", label: "Target", value: auditTargetTypeLabels[targetType] }]
    : [];

  const columns: DataTableColumn<AdminAuditLogEntry>[] = [
    {
      cell: (entry) => (
        <span className="block min-w-0 truncate font-semibold text-secondary-900" title={humanizeAuditValue(entry.action)}>
          {humanizeAuditValue(entry.action)}
        </span>
      ),
      headerClassName: "w-[45%] rounded-l-xl",
      id: "event",
      label: "Event",
      sortKey: "event",
      width: 45,
    },
    {
      cell: (entry) => (
        <time className="block min-w-0 truncate text-secondary-700" dateTime={entry.occurredAt} title={formatAuditTimestamp(entry.occurredAt)}>
          {formatAuditTimestamp(entry.occurredAt)}
        </time>
      ),
      cellClassName: "text-secondary-700",
      headerClassName: "w-[30%]",
      id: "time",
       label: "Waktu",
      sortKey: "time",
      width: 30,
    },
    {
      cell: (entry) => entry.actorId ? (
        <Button
          aria-label={`View user details for ${entry.actorName}`}
          className="min-w-0 max-w-full justify-start overflow-hidden px-0 text-left font-semibold text-primary-700 hover:bg-transparent hover:text-primary-900 hover:underline"
          onClick={() => setSelectedUser(entry)}
          type="button"
          variant="outline"
        >
          <span className="block min-w-0 truncate">{entry.actorName}</span>
        </Button>
      ) : (
        <span className="block min-w-0 truncate text-secondary-600" title="Automated event">System</span>
      ),
      cellClassName: "min-w-0",
      headerClassName: "w-[25%] rounded-r-xl",
      id: "user",
       label: "Pengguna",
      sortKey: "user",
      width: 25,
    },
  ];

  return (
    <PortalShell
      activeAdminSection="audit-logs"
      audience="admin"
       description="Cari aktivitas yang tercatat, periksa event, atau buka detail penggunanya."
      session={session}
       title="Riwayat audit"
    >
      <div className="space-y-8">
        <ReferencePageHeader
           title="Riwayat audit"
        />

        <ReferenceSurface as="section" aria-label="Riwayat audit" className="overflow-hidden">
          <DataTable
             caption="Event administrasi yang tercatat"
            clearFiltersHref={clearFiltersHref}
            columns={columns}
            emptyState={AUDIT_LOGS_EMPTY_STATE}
            filterPanel={
              <AuditFilterPanel
                direction={direction}
                key={`${targetType ?? "all"}:${query}:${sort}:${direction}`}
                query={query}
                sort={sort}
                targetType={targetType}
              />
            }
            filters={filters}
            getRowId={(entry) => entry.id}
            onRowClick={setSelectedAudit}
            rowProps={(entry) => ({
               "aria-label": `Buka detail ${humanizeAuditValue(entry.action)}`,
              "data-audit-row": "true",
              tabIndex: -1,
            })}
            rows={entries}
            search={{
              action: "/admin/audit-logs",
              clearHref: clearSearchHref,
              hiddenFields: auditSearchHiddenFields({ direction, sort, targetType }),
               label: "Cari riwayat audit",
               placeholder: "Cari event, pengguna, atau ID…",
              value: query,
            }}
            sort={{
              direction,
              href: (nextSortKey, nextDirection) => auditLogHref({
                direction: nextDirection,
                page: 1,
                query,
                sort: nextSortKey as AuditLogSortKey | null,
                targetType,
              }),
              key: sort,
            }}
            tableClassName="w-full min-w-0"
          />

          {pageCount > 1 ? (
            <footer className="flex flex-col gap-3 border-t border-primary-100 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-xs text-secondary-600">Menampilkan {visibleStart}–{visibleEnd} dari {total.toLocaleString("id-ID")}</p>
              <nav aria-label="Halaman riwayat audit" className="flex items-center gap-2">
                 {page > 1 ? <Link className={buttonVariants({ className: "min-h-11", size: "sm", variant: "outline" })} href={auditLogHref({ direction, page: page - 1, query, sort, targetType })}>Sebelumnya</Link> : null}
                 <span aria-current="page" className="inline-flex min-h-11 items-center rounded-xl bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-800">Halaman {page} dari {pageCount}</span>
                 {page < pageCount ? <Link className={cn(buttonVariants({ className: "min-h-11", size: "sm", variant: "outline" }))} href={auditLogHref({ direction, page: page + 1, query, sort, targetType })}>Berikutnya</Link> : null}
              </nav>
            </footer>
          ) : null}
        </ReferenceSurface>
      </div>

      <AuditLogDetailDialog audit={selectedAudit} onClose={() => setSelectedAudit(null)} />
      <AuditUserDetailDialog onClose={() => setSelectedUser(null)} user={selectedUser} />
    </PortalShell>
  );
}

export { AuditLogsPageModule };

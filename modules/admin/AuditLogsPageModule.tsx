"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_text,
  tableFeatures,
  type SortingState,
  useTable,
} from "@tanstack/react-table";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { ArrowDown, ArrowUp, Eye } from "@/lib/icons";
import type { Prisma } from "@/generated/prisma/client";
import type { SessionContext } from "@/lib/auth/types";
import type { AdminAuditLogEntry } from "@/lib/admin/operations";
import { cn } from "@/lib/utils";
import { PortalShell } from "@/modules/portal/components/portal-shell";

import { ADMIN_CARD_CLASS_NAME } from "./admin-ui-contract";

const auditDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

const auditTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

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

function pageHref(nextPage: number) {
  return nextPage === 1 ? "/admin/audit-logs" : `/admin/audit-logs?page=${nextPage}`;
}

type AuditLogTableRow = {
  actorLabel: string;
  entry: AdminAuditLogEntry;
  eventLabel: string;
  occurredAtTimestamp: number;
  targetLabel: string;
};

const auditLogTableFeatures = tableFeatures({
  rowSortingFeature,
  sortFns: { text: sortFn_text },
  sortedRowModel: createSortedRowModel(),
});

const auditColumnHelper = createColumnHelper<typeof auditLogTableFeatures, AuditLogTableRow>();

type SortableAuditColumn = {
  getIsSorted: () => false | "asc" | "desc";
  getNextSortingOrder: () => false | "asc" | "desc";
  getToggleSortingHandler: () => ((event: unknown) => void) | undefined;
};

const auditSortLabels: Record<string, string> = {
  actor: "Who",
  event: "Event",
  when: "When",
};

function AuditSortHeader({
  column,
  compact = false,
  label,
}: {
  column: SortableAuditColumn;
  compact?: boolean;
  label: string;
}) {
  const sorted = column.getIsSorted();
  const nextSortingOrder = column.getNextSortingOrder();
  const nextAction = nextSortingOrder === false
    ? "clear sorting"
    : `sort ${nextSortingOrder === "desc" ? "descending" : "ascending"}`;
  const toggleSorting = column.getToggleSortingHandler();

  return (
    <button
      aria-label={`Sort by ${label}; activate to ${nextAction}`}
      aria-pressed={Boolean(sorted)}
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-lg text-left text-xs font-medium tracking-[0.02em] text-secondary-500 transition-colors hover:text-primary-800 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-700/20",
        compact
          ? "min-h-10 border border-primary-100 bg-white px-3 py-2 hover:bg-primary-50"
          : "min-h-11 px-2 py-1 hover:bg-primary-50/60",
        sorted && "border-primary-200 bg-primary-50 text-primary-800",
      )}
      onClick={(event) => toggleSorting?.(event)}
      type="button"
    >
      <span>{label}</span>
      {sorted ? (
        <span aria-hidden="true" className="inline-flex items-center text-primary-700">
          {sorted === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
        </span>
      ) : null}
    </button>
  );
}

function auditColumnHeaderClassName(columnId: string) {
  return cn(
    "h-11 px-4 py-2.5 text-xs font-medium tracking-[0.02em] text-secondary-500 sm:px-5",
    columnId === "event" && "w-[36%] rounded-l-xl",
    columnId === "when" && "w-[23%]",
    columnId === "actor" && "w-[27%]",
    columnId === "details" && "w-[14%] rounded-r-xl text-right",
  );
}

function auditColumnCellClassName(columnId: string) {
  return cn(
    "px-4 py-3.5 sm:px-5",
    columnId === "event" && "max-w-[360px]",
    columnId === "actor" && "max-w-[220px]",
    columnId === "details" && "text-right",
  );
}

function AuditLogMobileRow({
  row,
  onSelect,
}: {
  onSelect: (entry: AdminAuditLogEntry) => void;
  row: AuditLogTableRow;
}) {
  const { entry } = row;

  return (
    <article className="border-b border-primary-100/55 px-5 py-4 last:border-b-0" role="listitem">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-secondary-900">{row.eventLabel}</p>
          <p className="mt-1 text-xs text-secondary-500">{row.targetLabel}</p>
        </div>
        <Button
          aria-label={`View details for ${humanizeAuditValue(entry.action)}`}
          className="min-h-11 shrink-0 gap-2 px-3.5 text-secondary-700 hover:text-primary-800"
          onClick={() => onSelect(entry)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Eye aria-hidden="true" size={16} />
          <span>View details</span>
        </Button>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-4">
        <div className="min-w-0">
          <dt className="text-xs font-medium tracking-[0.02em] text-secondary-500">When</dt>
          <dd className="mt-1 min-w-0 text-sm text-secondary-800">
            <time dateTime={entry.occurredAt} title={`${formatAuditDate(entry.occurredAt)} ${formatAuditTime(entry.occurredAt)}`}>
              <span className="block">{formatAuditDate(entry.occurredAt)}</span>
              <span className="mt-0.5 block text-xs text-secondary-500">{formatAuditTime(entry.occurredAt)}</span>
            </time>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-medium tracking-[0.02em] text-secondary-500">Who</dt>
          <dd className="mt-1 min-w-0 text-sm text-secondary-800">
            <p className="truncate" title={entry.actorName}>{entry.actorName}</p>
            <p className="mt-0.5 break-all text-xs text-secondary-500" title={entry.actorEmail ?? undefined}>
              {entry.actorEmail ?? "Automated event"}
            </p>
          </dd>
        </div>
      </dl>
    </article>
  );
}

function formatMetadata(value: Prisma.JsonValue | null) {
  if (value === null) {
    return "No metadata recorded.";
  }

  return JSON.stringify(value, null, 2);
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
  return (
    <Dialog onOpenChange={(open) => { if (!open) onClose(); }} open={Boolean(audit)}>
      <DialogContent className="max-h-[min(720px,calc(100svh-2rem))] max-w-2xl overflow-y-auto p-0" variant="default">
        {audit ? (
          <>
            <DialogHeader className="border-b border-primary-100 px-6 py-5 pr-14">
              <DialogTitle className="text-xl tracking-[-0.03em]">{humanizeAuditValue(audit.action)}</DialogTitle>
              <DialogDescription>
                Recorded {formatAuditDate(audit.occurredAt)} by {audit.actorName}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 px-6 py-6">
              <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                <DetailField label="When" value={`${formatAuditDate(audit.occurredAt)} · ${formatAuditTime(audit.occurredAt)}`} />
                <DetailField label="Who" value={audit.actorEmail ? `${audit.actorName} · ${audit.actorEmail}` : audit.actorName} />
                <DetailField label="Target type" value={audit.targetType ? humanizeAuditValue(audit.targetType) : "No target recorded"} />
                <DetailField label="Target ID" value={audit.targetId ?? "No target recorded"} />
                <DetailField label="IP address" value={audit.ipAddress ?? "Not recorded"} />
                <DetailField label="User agent" value={audit.userAgent ?? "Not recorded"} />
              </dl>

              <section aria-labelledby="audit-metadata-heading">
                <h3 className="text-sm font-semibold text-secondary-900" id="audit-metadata-heading">Metadata</h3>
                <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-primary-100 bg-secondary-50 px-4 py-3 font-sans text-xs leading-5 text-secondary-700">
                  {formatMetadata(audit.metadata)}
                </pre>
              </section>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AuditLogsPageModule({
  entries,
  page,
  pageCount,
  pageSize,
  session,
  total,
}: {
  entries: AdminAuditLogEntry[];
  page: number;
  pageCount: number;
  pageSize: number;
  session: SessionContext;
  total: number;
}) {
  const [selectedAudit, setSelectedAudit] = useState<AdminAuditLogEntry | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const tableData = useMemo<AuditLogTableRow[]>(
    () => entries.map((entry) => ({
      actorLabel: entry.actorName,
      entry,
      eventLabel: humanizeAuditValue(entry.action),
      occurredAtTimestamp: new Date(entry.occurredAt).getTime(),
      targetLabel: entry.targetType ? humanizeAuditValue(entry.targetType) : "System event",
    })),
    [entries],
  );
  const columns = useMemo(
    () => auditColumnHelper.columns([
      auditColumnHelper.accessor("eventLabel", {
        id: "event",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-secondary-900" title={row.original.eventLabel}>{row.original.eventLabel}</p>
            <p className="mt-0.5 truncate text-xs text-secondary-500">{row.original.targetLabel}</p>
          </div>
        ),
        header: ({ column }) => <AuditSortHeader column={column} label="Event" />,
      }),
      auditColumnHelper.accessor("occurredAtTimestamp", {
        id: "when",
        cell: ({ row }) => {
          const { entry } = row.original;

          return (
            <time className="block min-w-0 sm:min-w-[8.5rem]" dateTime={entry.occurredAt} title={`${formatAuditDate(entry.occurredAt)} ${formatAuditTime(entry.occurredAt)}`}>
              <span className="block text-sm text-secondary-800">{formatAuditDate(entry.occurredAt)}</span>
              <span className="mt-0.5 block text-xs text-secondary-500">{formatAuditTime(entry.occurredAt)}</span>
            </time>
          );
        },
        header: ({ column }) => <AuditSortHeader column={column} label="When" />,
        sortDescFirst: true,
      }),
      auditColumnHelper.accessor("actorLabel", {
        id: "actor",
        cell: ({ row }) => {
          const { entry } = row.original;

          return (
            <>
              <p className="truncate text-sm font-medium text-secondary-800" title={entry.actorName}>{entry.actorName}</p>
              <p className="mt-0.5 hidden truncate text-xs text-secondary-500 sm:block" title={entry.actorEmail ?? undefined}>{entry.actorEmail ?? "Automated event"}</p>
            </>
          );
        },
        header: ({ column }) => <AuditSortHeader column={column} label="Who" />,
      }),
      auditColumnHelper.display({
        id: "details",
        enableSorting: false,
        cell: ({ row }) => {
          const { entry } = row.original;

          return (
            <Button
              aria-label={`View details for ${humanizeAuditValue(entry.action)}`}
              className="h-11 min-h-11 min-w-11 w-11 gap-2 px-2 text-secondary-700 hover:text-primary-800 sm:min-w-0 sm:w-auto sm:px-3.5"
              onClick={() => setSelectedAudit(entry)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Eye aria-hidden="true" size={16} />
              <span className="hidden sm:inline">View details</span>
            </Button>
          );
        },
        header: () => "Details",
      }),
    ]),
    [setSelectedAudit],
  );
  const table = useTable({
    columns,
    data: tableData,
    enableMultiSort: false,
    features: auditLogTableFeatures,
    getRowId: (row) => row.entry.id,
    onSortingChange: setSorting,
    state: { sorting },
  });
  const visibleStart = entries.length ? (page - 1) * pageSize + 1 : 0;
  const visibleEnd = entries.length ? visibleStart + entries.length - 1 : 0;
  const activeSort = sorting[0];
  const activeSortLabel = activeSort?.id === "event" ? "Event" : activeSort?.id === "when" ? "When" : activeSort?.id === "actor" ? "Who" : null;
  const sortingStatus = activeSortLabel
    ? `Sorted by ${activeSortLabel} ${activeSort.desc ? "descending" : "ascending"}.`
    : "Audit log rows are in newest-first server order.";
  const sortableHeaders = table.getHeaderGroups()[0]?.headers.filter((header) => header.column.getCanSort()) ?? [];

  return (
    <PortalShell
      activeAdminSection="audit-logs"
      audience="admin"
      description="Review recorded administrative activity and inspect event details."
      session={session}
      title="Audit logs"
    >
      <div className="space-y-5">
        <header className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-secondary-950 sm:text-4xl">Audit logs</h1>
            <p className="mt-1 text-sm text-secondary-600">{total.toLocaleString("en-US")} {total === 1 ? "event" : "events"} recorded</p>
          </div>
        </header>

        <section aria-labelledby="audit-log-table-heading" className={`${ADMIN_CARD_CLASS_NAME} overflow-hidden`}>
          <div className="flex flex-col gap-3 border-b border-primary-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="text-base font-semibold tracking-[-0.02em] text-secondary-900" id="audit-log-table-heading">Recorded events</h2>
              <p className="mt-1 text-sm text-secondary-600">Newest first. Sort by event, time, or person.</p>
              <p aria-live="polite" className="sr-only">{sortingStatus}</p>
            </div>
            {sorting.length ? (
              <Button className="min-h-11 self-start sm:self-auto" onClick={() => table.resetSorting(true)} size="sm" type="button" variant="ghost">
                Clear sort
              </Button>
            ) : null}
          </div>

          {entries.length === 0 ? (
            <div className="m-5 rounded-2xl border border-dashed border-primary-200 bg-secondary-50 px-5 py-8 text-center sm:m-6">
              <h3 className="text-lg font-semibold tracking-[-0.02em] text-secondary-900">No recorded events</h3>
              <p className="mt-2 text-sm leading-6 text-secondary-600">New administrative activity will appear here.</p>
            </div>
          ) : (
            <>
              <div aria-label="Sort recorded events" className="flex flex-wrap items-center gap-2 border-b border-primary-100 px-5 py-3 sm:hidden" role="toolbar">
                <span className="mr-1 shrink-0 text-xs font-medium text-secondary-500">Sort</span>
                {sortableHeaders.map((header) => (
                  <AuditSortHeader
                    column={header.column}
                    compact
                    key={header.id}
                    label={auditSortLabels[header.column.id] ?? header.column.id}
                  />
                ))}
              </div>

              <div className="sm:hidden" role="list" aria-label="Recorded administrative events">
                {table.getRowModel().rows.map((row) => (
                  <AuditLogMobileRow key={row.id} onSelect={setSelectedAudit} row={row.original} />
                ))}
              </div>

              <Table className="hidden min-w-[760px] table-fixed border-separate border-spacing-y-0 sm:table">
                <caption className="sr-only">Recorded administrative events</caption>
                <TableHeader>
                  <TableRow className="border-0 bg-secondary-50/80 hover:bg-secondary-50/80">
                    {table.getHeaderGroups()[0]?.headers.map((header) => (
                      <TableHead
                        aria-sort={header.column.getCanSort() ? header.column.getIsSorted() === "asc" ? "ascending" : header.column.getIsSorted() === "desc" ? "descending" : "none" : undefined}
                        className={auditColumnHeaderClassName(header.column.id)}
                        key={header.id}
                      >
                        {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.map((row) => (
                    <TableRow className="border-primary-100/55 transition-colors hover:bg-secondary-50/70" key={row.id}>
                      {row.getAllCells().map((cell) => (
                        <TableCell className={auditColumnCellClassName(cell.column.id)} key={cell.id}>
                          <table.FlexRender cell={cell} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}

          {pageCount > 1 ? (
            <footer className="flex flex-col gap-3 border-t border-primary-100 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-xs text-secondary-600">Showing {visibleStart}–{visibleEnd} of {total.toLocaleString("en-US")}</p>
              <nav aria-label="Audit log pages" className="flex items-center gap-2">
                {page > 1 ? <Link className={buttonVariants({ className: "min-h-11", size: "sm", variant: "brandOutline" })} href={pageHref(page - 1)}>Previous</Link> : null}
                <span aria-current="page" className="inline-flex min-h-11 items-center rounded-xl bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-800">Page {page} of {pageCount}</span>
                {page < pageCount ? <Link className={cn(buttonVariants({ className: "min-h-11", size: "sm", variant: "brandOutline" }))} href={pageHref(page + 1)}>Next</Link> : null}
              </nav>
            </footer>
          ) : null}
        </section>
      </div>

      <AuditLogDetailDialog audit={selectedAudit} onClose={() => setSelectedAudit(null)} />
    </PortalShell>
  );
}

export { AuditLogsPageModule };

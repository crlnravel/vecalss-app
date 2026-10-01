"use client";

import { Collapsible } from "@base-ui/react/collapsible";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { AUDIT_LOG_RANGES, buildAuditLogQuery, type AuditLogRange, type AuditLogTargetType } from "@/lib/admin/operations/audit-query";
import type { AdminAuditLogEntry } from "@/lib/admin/operations/service";
import type { SessionContext } from "@/lib/auth/types";
import { CalendarDays, ChevronDown, ChevronRight, Download, FileText, History, Settings, ShieldAlert, Upload, Users } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { PortalShell } from "@/modules/portal/components/portal-shell";

import { auditActionLabel, auditEventStatus, auditPageCsv, auditRangeLabels, auditReferenceLabel, auditTargetLabel, auditTargetLabels, formatAuditTime, groupAuditEntries } from "./audit-log-presentation";
import { CopyValueButton } from "./components/copy-value-button";

const categoryTabs: { label: string; value: AuditLogTargetType | null }[] = [
  { label: "Semua", value: null },
  { label: "Pengguna", value: "user" },
  { label: "Cohort", value: "cohort" },
  { label: "Undangan", value: "enrollment_handoff" },
  { label: "Impor", value: "enrollment_import" },
  { label: "Hasil impor", value: "enrollment_import_row" },
  { label: "Sistem", value: "system_config" },
];

function auditHref({ page = 1, query = "", range, targetType }: { page?: number; query?: string; range: AuditLogRange; targetType: AuditLogTargetType | null }) {
  return `/admin/audit-logs${buildAuditLogQuery({ page, query, range, targetType })}`;
}

function AuditField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-xs text-secondary-600">{label}</dt>
      <dd className="break-words text-sm font-medium leading-5 text-secondary-900 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function EventIcon({ entry }: { entry: AdminAuditLogEntry }) {
  const Icon = auditEventStatus(entry.action).tone === "danger" ? ShieldAlert
    : entry.targetType === "user" || entry.targetType === "cohort" ? Users
    : entry.targetType === "system_config" ? Settings
    : entry.targetType?.startsWith("enrollment_import") ? Upload : FileText;
  return <Icon aria-hidden="true" className="size-3.5" />;
}

function AuditTimelineEvent({ entry, defaultOpen }: { entry: AdminAuditLogEntry; defaultOpen: boolean }) {
  const title = auditActionLabel(entry.action);
  const status = auditEventStatus(entry.action);
  const actorName = entry.actorId ? entry.actorName : "Sistem";
  const initials = actorName.trim().split(/\s+/u).slice(0, 2).map(word => word[0]).join("").toUpperCase();

  return (
    <li className="group/event relative min-w-0 pb-6 pl-10 last:pb-0" data-audit-event={entry.id}>
      <span aria-hidden="true" className="absolute bottom-1.5 left-3 top-7 w-px bg-primary-100 group-last/event:hidden" />
      <span aria-hidden="true" className="absolute left-0 top-0 flex size-6 items-center justify-center rounded-full border border-primary-100 bg-white text-secondary-600">
        <EventIcon entry={entry} />
      </span>
      <div className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="text-sm font-semibold leading-5 text-secondary-900">{title}</h3>
        <Badge className="gap-1.5" size="xs" tone={status.tone}>
          <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
          {status.label}
        </Badge>
        <time className="text-xs tabular-nums text-secondary-600" dateTime={entry.occurredAt}>{formatAuditTime(entry.occurredAt)}</time>
      </div>
      <Collapsible.Root className="group/disclosure mt-2 overflow-hidden rounded-xl border border-primary-100 bg-secondary-50/60" defaultOpen={defaultOpen}>
        <Collapsible.Trigger aria-label={`Buka atau tutup detail ${title}`} className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-primary-50/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-primary-700/30 motion-reduce:transition-none">
          <span className="flex min-w-0 items-center gap-2">
            <Avatar className="size-[20px]" aria-hidden="true">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 truncate text-sm font-medium text-secondary-700" title={`${actorName}, ${auditTargetLabel(entry.targetType)}`}>
              {actorName}, {auditTargetLabel(entry.targetType)}
            </span>
          </span>
          <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-secondary-600 transition-transform duration-200 group-data-open/disclosure:rotate-90 motion-reduce:transition-none" />
        </Collapsible.Trigger>
        <Collapsible.Panel>
          <div className="space-y-3 rounded-xl border-t border-primary-100 bg-white px-3 py-3.5">
            <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <AuditField label="Target">{auditTargetLabel(entry.targetType)}</AuditField>
              <AuditField label="Pelaku">{entry.actorEmail ?? actorName}</AuditField>
              <AuditField label="Alamat IP">{entry.ipAddress ?? "Belum tercatat"}</AuditField>
              <AuditField label="Referensi target">
                {entry.targetId ? <span className="font-mono text-xs">{auditReferenceLabel(entry.targetId)}</span> : "Belum tercatat"}
              </AuditField>
            </dl>
            <p className="text-xs leading-5 text-secondary-600">Aktivitas {auditTargetLabels[entry.targetType as AuditLogTargetType]?.toLowerCase() ?? "ini"} dicatat atas nama {actorName}.</p>
            <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-primary-100 pt-2.5">
              <span className="min-w-0 max-w-full truncate rounded-md border border-primary-100 px-1.5 py-0.5 font-mono text-xs text-secondary-600">{auditReferenceLabel(entry.id)}</span>
              <CopyValueButton ariaLabel="Salin referensi aktivitas" label="Salin referensi" value={entry.id} />
            </div>
          </div>
        </Collapsible.Panel>
      </Collapsible.Root>
    </li>
  );
}

type AuditLogsPageProps = {
  entries: AdminAuditLogEntry[];
  now: string;
  page: number;
  pageCount: number;
  pageSize: number;
  query: string;
  range: AuditLogRange;
  session: SessionContext;
  targetType: AuditLogTargetType | null;
  total: number;
};

function AuditLogsPageModule({ entries, now, page, pageCount, pageSize, query, range, session, targetType, total }: AuditLogsPageProps) {
  const router = useRouter();
  const groups = groupAuditEntries(entries, now);
  const visibleStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const visibleEnd = Math.min(total, page * pageSize);

  function exportPage() {
    const url = URL.createObjectURL(new Blob([auditPageCsv(entries)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `riwayat-audit-halaman-${page}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <PortalShell activeAdminSection="audit-logs" audience="admin" description="Periksa aktivitas yang tercatat di Vecalss." session={session} title="Riwayat audit">
      <section aria-labelledby="audit-log-title" className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex flex-col gap-4">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <h1 className="font-heading text-xl font-semibold tracking-tight text-secondary-900" id="audit-log-title">Riwayat audit</h1>
              <p className="text-sm leading-5 text-secondary-600">{total.toLocaleString("id-ID")} aktivitas tercatat di Vecalss</p>
            </div>
            <div className="flex max-w-full flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" />} aria-label={`Rentang waktu: ${auditRangeLabels[range]}`}>
                  <CalendarDays aria-hidden="true" className="size-4" />
                  {auditRangeLabels[range]}
                  <ChevronDown aria-hidden="true" className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuRadioGroup value={range} onValueChange={value => router.push(auditHref({ query, range: value as AuditLogRange, targetType }), { scroll: false })}>
                    {AUDIT_LOG_RANGES.map(value => <DropdownMenuRadioItem closeOnClick key={value} value={value}>{auditRangeLabels[value]}</DropdownMenuRadioItem>)}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button disabled={!entries.length} onClick={exportPage} title={`Unduh ${entries.length} aktivitas di halaman ini`} type="button" variant="default">
                <Download aria-hidden="true" className="size-4" />
                Ekspor halaman
              </Button>
            </div>
          </header>
          <div className="min-w-0 overflow-x-auto [scrollbar-width:thin]">
            <nav aria-label="Filter jenis aktivitas" className="flex min-w-full w-max items-center gap-6 border-b border-primary-100">
              {categoryTabs.map(tab => (
                <Link
                  aria-current={targetType === tab.value ? "page" : undefined}
                  className={cn("inline-flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-1 text-sm font-medium whitespace-nowrap text-secondary-600 transition-colors hover:text-primary-800 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-primary-700/30 motion-reduce:transition-none", targetType === tab.value && "border-primary-800 text-primary-900")}
                  href={auditHref({ query, range, targetType: tab.value })}
                  key={tab.value ?? "all"}
                  prefetch={false}
                  scroll={false}
                >{tab.label}</Link>
              ))}
            </nav>
          </div>
        </div>

        {query ? (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2 text-sm text-secondary-600">
            <p className="min-w-0 break-words">Hasil pencarian: <span className="font-medium text-secondary-900">{query}</span></p>
            <Link className={buttonVariants({ variant: "outline" })} href={auditHref({ range, targetType })}>Hapus pencarian</Link>
          </div>
        ) : null}

        {groups.length ? (
          <div className="space-y-6">
            {groups.map(group => (
              <section aria-labelledby={`audit-date-${group.key}`} className="space-y-4" key={group.key}>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-secondary-600" id={`audit-date-${group.key}`}>{group.label}</h2>
                <ol aria-label={`Aktivitas ${group.label}`}>
                  {group.entries.map(entry => <AuditTimelineEvent defaultOpen={entries.indexOf(entry) < 2} entry={entry} key={entry.id} />)}
                </ol>
              </section>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center py-12 text-center" role="status">
            <History aria-hidden="true" className="size-7 text-primary-700" />
            <h2 className="mt-4 text-base font-semibold text-secondary-900">Belum ada aktivitas{range !== "all" || targetType || query ? " yang cocok" : " tercatat"}.</h2>
            <p className="mt-1 max-w-sm text-sm leading-6 text-secondary-600">{range !== "all" || targetType || query ? "Coba rentang waktu atau jenis aktivitas lain." : "Aktivitas akan muncul di sini setelah tercatat."}</p>
            {range !== "all" || targetType || query ? <Link className={buttonVariants({ className: "mt-4", variant: "outline" })} href="/admin/audit-logs">Lihat semua aktivitas</Link> : null}
          </div>
        )}

        {total > 0 ? (
          <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-primary-100 pt-4">
            <p className="text-xs text-secondary-600">Menampilkan {visibleStart}–{visibleEnd} dari {total.toLocaleString("id-ID")}</p>
            {pageCount > 1 ? (
              <nav aria-label="Halaman riwayat audit" className="flex flex-wrap items-center gap-2">
                {page > 1 ? <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={auditHref({ page: page - 1, query, range, targetType })}>Sebelumnya</Link> : null}
                <span className="text-xs text-secondary-600">{page} / {pageCount}</span>
                {page < pageCount ? <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={auditHref({ page: page + 1, query, range, targetType })}>Berikutnya</Link> : null}
              </nav>
            ) : null}
          </footer>
        ) : null}
      </section>
    </PortalShell>
  );
}

export { AuditLogsPageModule };

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { showToast } from "@/components/ui/toast";
import { buildMentorTryoutHref, type MentorTryoutContext } from "@/lib/navigation/canonical-context";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { queryTryoutParticipants } from "@/lib/tryout/participant-list";
import { PARTICIPANT_STATUSES, participantStatus, participantStatusLabels, participantStatusTones } from "@/lib/tryout/participant-status";
import { TryoutOperationsLayout } from "@/modules/mentor/TryoutOperationsNavigation";
import { refreshTryoutRegistrationListAction } from "@/modules/mentor/tryout-operations-actions";
import { withTryoutRequestDeadline } from "@/modules/mentor/tryout-request-recovery";
import { KaptenTryoutInvitationPicker } from "@/modules/mentor/KaptenTryoutInvitationPicker";

type List = ReturnType<typeof queryTryoutParticipants>;
type Row = TryoutOperationsView["participants"][number];
const statusOptions: Array<[string, string]> = [["all", "Semua"], ...PARTICIPANT_STATUSES.map((status): [string, string] => [status, participantStatusLabels[status]])];

function KaptenTryoutRegistrationListPageModule({ initial, initialList, context }: {
  initial: TryoutOperationsView;
  initialList: List;
  context: Partial<MentorTryoutContext>;
}) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [list, setList] = useState(initialList);
  const [busy, setBusy] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [inviting, setInviting] = useState(false);
  const canonical = { ...context, workspace: "operations" as const, delivery: "participants" as const, status: list.status, page: list.page };
  const href = (updates: Partial<MentorTryoutContext> = {}) => buildMentorTryoutHref(view.id, { ...canonical, ...updates });
  const participantHref = (admissionId: string) => `/mentor/tryout/${encodeURIComponent(view.id)}/operations/participants/${encodeURIComponent(admissionId)}?${new URL(href(), "https://vecalss.invalid").searchParams}`;
  const detailHref = (row: Row) => participantHref(row.admissionId);
  const columns: DataTableColumn<Row>[] = [
    { id: "name", label: "Peserta", cell: (row) => <Link className="font-semibold text-secondary-900 hover:text-primary-800" href={detailHref(row)}>{row.participant.displayName}</Link> },
    { id: "email", label: "Email", cell: (row) => <span title={row.participant.email}>{row.participant.email}</span> },
    { id: "status", label: "Status", cell: (row) => { const status = participantStatus(row); return <Badge tone={participantStatusTones[status]}>{participantStatusLabels[status]}</Badge>; } },
  ];
  async function refresh() {
    setBusy(true);
    try {
      const result = await withTryoutRequestDeadline(refreshTryoutRegistrationListAction(view.id, new URL(href(), "https://vecalss.invalid").searchParams.toString()));
      if (!result.ok) throw new Error(result.message);
      setView(result.result);
      setList(result.list);
      setRefreshFailed(false);
      showToast("Daftar peserta diperbarui.", { variant: "success" });
    } catch {
      setRefreshFailed(true);
      showToast("Daftar belum dapat diperbarui. Coba muat ulang.", { variant: "error" });
    } finally { setBusy(false); }
  }
  const filters = [
    { id: "status", label: "Status", value: list.status, summary: list.status === "all" ? "Semua" : participantStatusLabels[list.status], options: statusOptions },
  ];
  return <TryoutOperationsLayout initial={view} active="participants" parentId={context.parent} pendingCount={list.pendingCount}><section className="grid min-w-0 gap-5" aria-labelledby="tryout-registration-title">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold text-secondary-900" id="tryout-registration-title">Peserta</h2>
      <div className="flex flex-wrap gap-3">{view.status === "published" ? <Button aria-expanded={inviting} aria-controls="tryout-invitation-panel" onClick={() => setInviting(!inviting)}>{inviting ? "Tutup undangan" : "Undang peserta"}</Button> : null}<Button variant="outline" disabled={busy} onClick={() => void refresh()}>{busy ? "Memuat…" : refreshFailed ? "Coba muat ulang" : "Muat ulang"}</Button></div>
    </div>
    {inviting && view.status === "published" ? <div id="tryout-invitation-panel"><KaptenTryoutInvitationPicker tryoutId={view.id} session={view.session} participantHref={participantHref} onRefresh={(refreshed) => {
      const updated = { ...view, ...refreshed };
      setView(updated); setList(queryTryoutParticipants(updated, canonical)); setRefreshFailed(false);
    }} /></div> : null}
    {view.status === "archived" ? <p className="text-sm text-secondary-600">Tryout sudah diarsipkan. Pendaftaran peserta hanya dapat dilihat sebagai riwayat.</p> : null}
    <ReferenceSurface className="overflow-hidden">
      <DataTable caption="Pendaftaran peserta Tryout" columns={columns} rows={list.rows} getRowId={(row) => row.admissionId} onRowClick={(row) => router.push(detailHref(row))}
        filterPanel={<div className="grid gap-2">{filters.map((filter) => <DropdownMenu key={filter.id}>
          <DropdownMenuTrigger render={<Button variant="outline" className="w-full justify-between" aria-label={`Filter ${filter.label}: ${filter.summary}`} />}>{filter.label}: {filter.summary}</DropdownMenuTrigger>
          <DropdownMenuContent><DropdownMenuRadioGroup value={filter.value} onValueChange={(value) => router.push(href({ status: value, page: 1 }))}>
            {filter.options.map(([value, label]) => <DropdownMenuRadioItem key={value} value={value}>{label}</DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup></DropdownMenuContent>
        </DropdownMenu>)}</div>} clearFiltersHref={href({ q: "", status: "all", page: 1 })}
        filters={list.status === "all" ? [] : filters.map((filter) => ({ id: filter.id, label: filter.label, value: filter.summary }))}
        search={{ action: `/mentor/tryout/${view.id}`, label: "Cari nama atau email peserta", placeholder: "Cari nama atau email…", value: context.q ?? "", hiddenFields: { workspace: "operations", delivery: "participants", status: list.status, ...(context.parent ? { parent: context.parent } : {}) } }}
        tableClassName="min-w-[760px]" emptyState={<div className="mx-auto max-w-[calc(100vw-2rem)] px-5 py-8 text-center"><p className="font-semibold text-secondary-900">{view.participants.length ? "Tidak ada peserta yang sesuai" : "Belum ada pendaftaran"}</p><p className="mt-2 text-sm text-secondary-600">{view.participants.length ? "Coba nama, email, atau filter lain." : "Peserta akan muncul di sini setelah mendaftar."}</p>{view.participants.length ? <Link className="mt-3 inline-block text-sm font-semibold text-primary-800" href={href({ q: "", status: "all", page: 1 })}>Lihat semua peserta</Link> : null}</div>} />
    </ReferenceSurface>
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p>{list.total} peserta · Halaman {list.page} dari {list.pages}</p>
      <Pagination aria-label="Halaman peserta" className="mx-0 w-auto"><PaginationContent>
        <PaginationItem><PaginationPrevious disabled={list.page <= 1} onClick={() => router.push(href({ page: list.page - 1 }))} /></PaginationItem>
        <PaginationItem><PaginationNext disabled={list.page >= list.pages} onClick={() => router.push(href({ page: list.page + 1 }))} /></PaginationItem>
      </PaginationContent></Pagination>
    </div>
  </section></TryoutOperationsLayout>;
}
export { KaptenTryoutRegistrationListPageModule };

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { showToast } from "@/components/ui/toast";
import { buildMentorTryoutHref, type MentorTryoutContext } from "@/lib/navigation/canonical-context";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { participantAccess, type queryTryoutParticipants } from "@/lib/tryout/participant-list";
import { selectMainTryoutSession } from "@/lib/tryout/main-session";
import { admissionStatusLabels, participantAttemptStateLabels } from "@/modules/mentor/KaptenTryoutOperationsData";
import { TryoutOperationsNavigation } from "@/modules/mentor/TryoutOperationsNavigation";
import { refreshTryoutRegistrationListAction } from "@/modules/mentor/tryout-operations-actions";
import { withTryoutRequestDeadline } from "@/modules/mentor/tryout-request-recovery";

type List = ReturnType<typeof queryTryoutParticipants>;
type Row = TryoutOperationsView["participants"][number];
const accessLabels = { all: "Semua", active: "Akses aktif", revoked: "Akses dicabut", missing: "Belum ditugaskan" };

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
  const canonical = { ...context, workspace: "operations" as const, delivery: "participants" as const, status: list.status, access: list.access, page: list.page };
  const href = (updates: Partial<MentorTryoutContext> = {}) => buildMentorTryoutHref(view.id, { ...canonical, ...updates });
  const detailHref = (row: Row) => `/mentor/tryout/${encodeURIComponent(view.id)}/operations/participants/${encodeURIComponent(row.admissionId)}?${new URL(href(), "https://vecalss.invalid").searchParams}`;
  const main = selectMainTryoutSession(view.sessions);
  const columns: DataTableColumn<Row>[] = [
    { id: "name", label: "Peserta", cell: (row) => <Link className="font-semibold text-secondary-900 hover:text-primary-800" href={detailHref(row)}>{row.participant.displayName}</Link> },
    { id: "email", label: "Email", cell: (row) => <span title={row.participant.email}>{row.participant.email}</span> },
    { id: "registration", label: "Pendaftaran", cell: (row) => admissionStatusLabels[row.admission.status] },
    { id: "access", label: "Akses sesi", cell: (row) => accessLabels[participantAccess(row, main?.id)] },
    { id: "session", label: "Sesi", cell: (row) => row.sessions.find((session) => session.id === main?.id)?.name ?? "Belum ditugaskan" },
    { id: "attempt", label: "Pengerjaan", cell: (row) => row.attempt ? participantAttemptStateLabels[row.attempt.attemptState] : "Belum mulai" },
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
    { id: "status", label: "Pendaftaran", value: list.status, summary: list.status === "all" ? "Semua" : admissionStatusLabels[list.status], options: [["all", "Semua"], ...Object.entries(admissionStatusLabels)] },
    { id: "access", label: "Akses sesi", value: list.access, summary: accessLabels[list.access as keyof typeof accessLabels], options: Object.entries(accessLabels) },
  ];
  return <section className="grid min-w-0 gap-5" aria-labelledby="tryout-registration-title">
    <TryoutOperationsNavigation initial={view} active="participants" parentId={context.parent} pendingCount={list.pendingCount} />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold text-secondary-900" id="tryout-registration-title">Peserta</h2>
      <Button variant="outline" disabled={busy} onClick={() => void refresh()}>{busy ? "Memuat…" : refreshFailed ? "Coba muat ulang" : "Muat ulang"}</Button>
    </div>
    {view.status === "archived" ? <p className="text-sm text-secondary-600">Tryout sudah diarsipkan. Pendaftaran peserta hanya dapat dilihat sebagai riwayat.</p> : null}
    <ReferenceSurface className="overflow-hidden">
      <DataTable caption="Pendaftaran peserta Tryout" columns={columns} rows={list.rows} getRowId={(row) => row.admissionId} onRowClick={(row) => router.push(detailHref(row))}
        filterPanel={<div className="grid gap-2">{filters.map((filter) => <DropdownMenu key={filter.id}>
          <DropdownMenuTrigger render={<Button variant="outline" className="w-full justify-between" aria-label={`Filter ${filter.label}: ${filter.summary}`} />}>{filter.label}: {filter.summary}</DropdownMenuTrigger>
          <DropdownMenuContent><DropdownMenuRadioGroup value={filter.value} onValueChange={(value) => router.push(href(filter.id === "access" ? { access: value, status: "all", page: 1 } : { status: value, page: 1 }))}>
            {filter.options.map(([value, label]) => <DropdownMenuRadioItem key={value} value={value}>{label}</DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup></DropdownMenuContent>
        </DropdownMenu>)}</div>} clearFiltersHref={href({ q: "", status: "all", access: "all", page: 1 })}
        filters={filters.filter((filter) => (filter.id === "status" ? list.status : list.access) !== "all").map((filter) => ({ id: filter.id, label: filter.label, value: filter.summary }))}
        search={{ action: `/mentor/tryout/${view.id}`, label: "Cari nama atau email peserta", placeholder: "Cari nama atau email…", value: context.q ?? "", hiddenFields: { workspace: "operations", delivery: "participants", status: list.status, access: list.access, ...(context.parent ? { parent: context.parent } : {}) } }}
        tableClassName="min-w-[760px]" emptyState={<div className="mx-auto max-w-[calc(100vw-2rem)] px-5 py-8 text-center"><p className="font-semibold text-secondary-900">{view.participants.length ? "Tidak ada peserta yang sesuai" : "Belum ada pendaftaran"}</p><p className="mt-2 text-sm text-secondary-600">{view.participants.length ? "Coba nama, email, atau filter lain." : "Peserta akan muncul di sini setelah mendaftar."}</p>{view.participants.length ? <Link className="mt-3 inline-block text-sm font-semibold text-primary-800" href={href({ q: "", status: "all", access: "all", page: 1 })}>Lihat semua peserta</Link> : null}</div>} />
    </ReferenceSurface>
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p>{list.total} peserta · Halaman {list.page} dari {list.pages}</p>
      <Pagination aria-label="Halaman peserta" className="mx-0 w-auto"><PaginationContent>
        <PaginationItem><PaginationPrevious disabled={list.page <= 1} onClick={() => router.push(href({ page: list.page - 1 }))} /></PaginationItem>
        <PaginationItem><PaginationNext disabled={list.page >= list.pages} onClick={() => router.push(href({ page: list.page + 1 }))} /></PaginationItem>
      </PaginationContent></Pagination>
    </div>
  </section>;
}
export { KaptenTryoutRegistrationListPageModule };

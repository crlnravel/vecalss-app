"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getCoreRowModel, useReactTable, type ColumnDef, type RowSelectionState } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Check, X } from "@/lib/icons";
import { showToast } from "@/components/ui/toast";
import { buildMentorTryoutHref, type MentorTryoutContext } from "@/lib/navigation/canonical-context";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { queryTryoutParticipants } from "@/lib/tryout/participant-list";
import { decideTryoutAdmissionAction } from "@/modules/mentor/tryout-actions";
import { PARTICIPANT_STATUSES, participantStatus, participantStatusLabels, participantStatusTones } from "@/lib/tryout/participant-status";
import { TryoutOperationsLayout } from "@/modules/mentor/TryoutOperationsNavigation";
import { refreshTryoutRegistrationListAction } from "@/modules/mentor/tryout-operations-actions";
import { withTryoutRequestDeadline } from "@/modules/mentor/tryout-request-recovery";
import { KaptenTryoutInvitationPicker } from "@/modules/mentor/KaptenTryoutInvitationPicker";
import {
  MentorAssessmentFeedback,
  MentorAssessmentGrid,
  MentorBulkMenu,
  MentorAssessmentPagination,
  MentorAssessmentPanel,
  MentorAssessmentSearch,
  MentorAssessmentToolbar,
  MentorFilterChips,
  MentorStatusFilterMenu,
  mentorSelectionColumn,
} from "@/modules/mentor/components/mentor-assessment-table";

type List = ReturnType<typeof queryTryoutParticipants>;
type Row = TryoutOperationsView["participants"][number];
const statusOptions: Array<[string, string]> = [["all", "Semua"], ...PARTICIPANT_STATUSES.map((status): [string, string] => [status, participantStatusLabels[status]])];
const columnLabels = { title: "Peserta", email: "Email", status: "Status", actions: "Aksi" };
/** Deciding from the list is audited with a fixed reason; the detail page still asks for one. */
const DECISION_REASONS = { approve: "Menyetujui pendaftaran dari daftar peserta", reject: "Menolak pendaftaran dari daftar peserta" } as const;
type Decision = keyof typeof DECISION_REASONS;
const dangerOutlineClassName = "size-8 border-student-status-danger-border text-student-status-danger-fg [--button-tactile-edge:var(--student-status-danger-border)] hover:border-student-status-danger-solid-bg hover:bg-student-status-danger-bg";

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
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [feedback, setFeedback] = useState<string[] | null>(null);
  const [rejectTargets, setRejectTargets] = useState<Row[] | null>(null);
  const canonical = { ...context, workspace: "operations" as const, delivery: "participants" as const, status: list.status, page: list.page };
  const href = (updates: Partial<MentorTryoutContext> = {}) => buildMentorTryoutHref(view.id, { ...canonical, ...updates });
  const participantHref = (admissionId: string) => `/mentor/tryout/${encodeURIComponent(view.id)}/operations/participants/${encodeURIComponent(admissionId)}?${new URL(href(), "https://vecalss.invalid").searchParams}`;
  const detailHref = (row: Row) => participantHref(row.admissionId);
  const columns: ColumnDef<Row>[] = [
    mentorSelectionColumn<Row>({ allLabel: "Pilih semua peserta di halaman ini", disabled: busy || approvingId !== null, hasRows: list.rows.length > 0, rowLabel: (row) => `Pilih ${row.participant.displayName}` }),
    { id: "title", header: "Peserta", size: 240, cell: ({ row }) => <Link className="font-semibold text-secondary-900 hover:text-primary-800" href={detailHref(row.original)}>{row.original.participant.displayName}</Link> },
    { id: "email", header: "Email", size: 280, cell: ({ row }) => <span title={row.original.participant.email}>{row.original.participant.email}</span> },
    { id: "status", header: "Status", size: 240, cell: ({ row }) => { const status = participantStatus(row.original); return <Badge tone={participantStatusTones[status]}>{participantStatusLabels[status]}</Badge>; } },
    { id: "actions", header: "Aksi", size: 120, cell: ({ row }) => {
      if (view.status !== "published" || participantStatus(row.original) !== "pending") return null;
      const name = row.original.participant.displayName;
      const disabled = busy || approvingId !== null;
      return <div className="flex items-center gap-2">
        <Button size="icon-sm" className="size-8" aria-label={`Terima pendaftaran ${name}`} title="Terima" disabled={disabled} onClick={() => void decide(row.original, "approve")}><Check aria-hidden="true" /></Button>
        <Button size="icon-sm" variant="outline" className={dangerOutlineClassName} aria-label={`Tolak pendaftaran ${name}`} title="Tolak" disabled={disabled} onClick={() => setRejectTargets([row.original])}><X aria-hidden="true" /></Button>
      </div>;
    } },
  ];
  // TanStack's mutable table API intentionally opts out of React Compiler memoization.
  // eslint-disable-next-line react-hooks/incompatible-library -- The compiler skips this supported TanStack integration.
  const table = useReactTable({
    data: list.rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.admissionId,
    manualPagination: true,
    enableRowSelection: true,
    enableSorting: false,
    onRowSelectionChange: setSelection,
    pageCount: list.pages,
    state: { pagination: { pageIndex: list.page - 1, pageSize: list.pageSize }, rowSelection: selection },
  });
  /** Returns an error message, or null when the decision was saved. */
  async function decideOne(row: Row, decision: Decision): Promise<string | null> {
    try {
      const result = await withTryoutRequestDeadline(decideTryoutAdmissionAction(row.admissionId, decision, DECISION_REASONS[decision]));
      return result.ok ? null : result.message ?? (decision === "approve" ? "Pendaftaran belum dapat diterima." : "Pendaftaran belum dapat ditolak.");
    } catch {
      return "Hasil belum dapat dipastikan. Muat ulang daftar sebelum mencoba lagi.";
    }
  }
  async function decide(row: Row, decision: Decision) {
    if (approvingId) return;
    setApprovingId(row.admissionId);
    const failure = await decideOne(row, decision);
    setApprovingId(null);
    if (failure) showToast(failure, { variant: "error" });
    else showToast(`${row.participant.displayName} ${decision === "approve" ? "diterima" : "ditolak"}.`, { variant: "success" });
    await refresh(false);
  }
  const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original);
  const selectedPending = selectedRows.filter((row) => participantStatus(row) === "pending");
  async function decideMany(rows: Row[], decision: Decision) {
    if (approvingId || !rows.length) return;
    setApprovingId("bulk");
    const failures: string[] = [];
    for (const row of rows) {
      // Sequential on purpose: each decision takes the same participant and session locks.
      const failure = await decideOne(row, decision);
      if (failure) failures.push(`${row.participant.displayName}: ${failure}`);
    }
    setApprovingId(null);
    setSelection({});
    const saved = rows.length - failures.length;
    setFeedback(failures.length ? failures : null);
    if (saved) showToast(`${saved} peserta ${decision === "approve" ? "diterima" : "ditolak"}.`, { variant: "success" });
    await refresh(false);
  }
  async function confirmReject() {
    const targets = rejectTargets;
    if (!targets?.length) return;
    setRejectTargets(null);
    if (targets.length === 1) await decide(targets[0], "reject");
    else await decideMany(targets, "reject");
  }
  async function refresh(notify = true) {
    setBusy(true);
    try {
      const result = await withTryoutRequestDeadline(refreshTryoutRegistrationListAction(view.id, new URL(href(), "https://vecalss.invalid").searchParams.toString()));
      if (!result.ok) throw new Error(result.message);
      setView(result.result);
      setList(result.list);
      setSelection({});
      setRefreshFailed(false);
      if (notify) showToast("Daftar peserta diperbarui.", { variant: "success" });
    } catch {
      setRefreshFailed(true);
      showToast("Daftar belum dapat diperbarui. Coba muat ulang.", { variant: "error" });
    } finally { setBusy(false); }
  }
  const statusActive = list.status !== "all";
  const clearFilters = () => router.push(href({ q: "", status: "all", page: 1 }));
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
    <MentorAssessmentPanel label="Daftar peserta Tryout" busy={busy}>
      <MentorAssessmentToolbar
        hasSelection={selectedRows.length > 0}
        bulk={selectedRows.length > 0 && view.status === "published" ? <MentorBulkMenu disabled={busy || approvingId !== null} label={`Tindakan ${selectedRows.length} peserta terpilih`}><DropdownMenuItem size="sm" disabled={!selectedPending.length} onClick={() => void decideMany(selectedPending, "approve")}>Terima pendaftaran{selectedPending.length ? ` (${selectedPending.length})` : ""}</DropdownMenuItem><DropdownMenuItem size="sm" variant="destructive" disabled={!selectedPending.length} onClick={() => setRejectTargets(selectedPending)}>Tolak pendaftaran{selectedPending.length ? ` (${selectedPending.length})` : ""}</DropdownMenuItem></MentorBulkMenu> : null}
        search={<MentorAssessmentSearch disabled={busy} label="Cari nama atau email peserta" onSearch={(q) => router.push(href({ q, page: 1 }))} placeholder="Cari nama atau email…" value={context.q ?? ""} />}
        filters={<MentorStatusFilterMenu
          activeCount={statusActive ? 1 : 0}
          options={statusOptions.map(([value, label]) => ({ key: value, label, active: list.status === value, onSelect: () => router.push(href({ status: value as MentorTryoutContext["status"], page: 1 })) }))}
        />}
      />
      <MentorFilterChips
        chips={statusActive ? [{ key: "status", label: participantStatusLabels[list.status as keyof typeof participantStatusLabels], onRemove: () => router.push(href({ status: "all", page: 1 })) }] : []}
        onClearAll={() => router.push(href({ status: "all", page: 1 }))}
      />
      {feedback ? <MentorAssessmentFeedback heading="Pendaftaran berikut belum berhasil diproses:" items={feedback} onClose={() => setFeedback(null)} /> : null}
      <MentorAssessmentGrid
        tallRows
        caption="Pendaftaran peserta Tryout beserta email dan statusnya."
        columnLabels={columnLabels}
        emptyState={view.participants.length ? <><strong>Tidak ada peserta yang sesuai</strong>Coba kata kunci lain atau tampilkan semua status.<div><Button onClick={clearFilters} size="default" type="button" variant="outline">Hapus pencarian dan filter</Button></div></> : <><strong>Belum ada pendaftaran</strong>Peserta yang mendaftar atau kamu undang akan muncul di sini.</>}
        label="Tabel peserta Tryout, geser untuk melihat semua kolom"
        onRowOpen={(row) => router.push(detailHref(row))}
        table={table}
      />
      <MentorAssessmentPagination
        disabled={busy}
        label="Halaman peserta"
        onPageChange={(nextPage) => { setSelection({}); router.push(href({ page: nextPage })); }}
        onPageSizeChange={(size) => router.push(href({ pageSize: size, page: 1 }))}
        page={list.page}
        pageCount={list.pages}
        pageSize={list.pageSize}
        total={list.total}
      />
    </MentorAssessmentPanel>
    <AlertDialog open={rejectTargets !== null} onOpenChange={(open) => { if (!open && approvingId === null) setRejectTargets(null); }}>
      <AlertDialogContent pending={approvingId !== null} variant="danger">
        <AlertDialogHeader>
          <AlertDialogMedia variant="danger"><X /></AlertDialogMedia>
          <AlertDialogTitle>{rejectTargets && rejectTargets.length > 1 ? `Tolak ${rejectTargets.length} pendaftaran?` : "Tolak pendaftaran?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {rejectTargets && rejectTargets.length > 1
              ? `${rejectTargets.length} peserta yang dipilih tidak akan mendapat akses ke ${view.title}. Kamu masih bisa memberi akses lagi dari halaman detail peserta.`
              : `${rejectTargets?.[0]?.participant.displayName ?? "Peserta ini"} tidak akan mendapat akses ke ${view.title}. Kamu masih bisa memberi akses lagi dari halaman detail peserta.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={approvingId !== null}>Batal</AlertDialogCancel>
          <AlertDialogAction disabled={approvingId !== null} onClick={(event) => { event.preventDefault(); void confirmReject(); }} variant="destructive">Tolak</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section></TryoutOperationsLayout>;
}
export { KaptenTryoutRegistrationListPageModule };

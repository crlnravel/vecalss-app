"use client";

import Link from "next/link";
import { useRef, useState, type ReactElement } from "react";
import { Funnel } from "@phosphor-icons/react";
import { getCoreRowModel, useReactTable, type ColumnDef, type RowSelectionState } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { showToast } from "@/components/ui/toast";
import { Archive, Check, ChevronDown, Folder, LibraryBig, MoreHorizontal, Pencil, Search, Trash2, Upload, X } from "@/lib/icons";
import type { QuestionBankCatalogueRow, QuestionBankCatalogueState, QuestionBankHrefOptions } from "../KaptenQuestionBankCataloguePageModules";
import { kaptenSubjects } from "../mock-data";
import { updateQuestionBankLifecycleAction } from "../question-bank-actions";
import { MentorAssessmentGrid, MentorAssessmentPagination, MentorGridMenu } from "./mentor-assessment-table";
import styles from "../quiz-dashboard.module.css";

const numberFormatter = new Intl.NumberFormat("id-ID");

export function QuestionBankAssessmentTable({
  initialSearch, initialTotal, state,
}: {
  initialPurpose: "quiz" | "tryout";
  initialSearch: string;
  initialSort: "updated" | "name" | "questions";
  initialTotal: number;
  state: QuestionBankCatalogueState;
}) {
  "use no memo"; // TanStack's mutable table API cannot be memoized by the React Compiler.
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [feedback, setFeedback] = useState<string[]>([]);
  const mutationInFlight = useRef(false);
  const busy = state.isCataloguePending || state.isApplying;
  function navigate(patch: QuestionBankHrefOptions) {
    if (busy) return;
    setSelection({});
    state.navigateCatalogue({ page: 1, ...patch });
  }
  const columns: ColumnDef<QuestionBankCatalogueRow>[] = [
    {
      id: "select", size: 40,
      header: ({ table }) => <Checkbox aria-label="Pilih semua bank di halaman ini" checked={table.getIsAllPageRowsSelected()} indeterminate={table.getIsSomePageRowsSelected()} onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked)} disabled={busy || !state.catalogueRows.some((row) => row.kind === "bank")} />,
      cell: ({ row }) => row.original.kind === "bank" ? <Checkbox aria-label={`Pilih ${row.original.bank.title}`} checked={row.getIsSelected()} onCheckedChange={(checked) => row.toggleSelected(checked)} disabled={busy} /> : null,
    },
    {
      id: "title", header: "Nama", size: 350, enableHiding: false,
      cell: ({ row }) => row.original.kind === "bank" ? (
        <Link className={styles.quizTitle} href={row.original.bank.href} title={row.original.bank.title}>{row.original.bank.title}</Link>
      ) : (
        <div>
          <button className={`${styles.quizTitle} flex items-center gap-2 max-w-full`} type="button" onClick={() => state.openCatalogueRow(row.original)} disabled={busy}>
            <Folder aria-hidden="true" size={16} className="shrink-0" /><span className="truncate">{row.original.folder.name}</span>
          </button>
          <span className={styles.secondary}>{row.original.folder.bankCount} bank{row.original.folder.children?.length ? ` · ${row.original.folder.children.length} subfolder` : ""}</span>
        </div>
      ),
    },
    {
      id: "subject", header: "Subtes", size: 100,
      cell: ({ row }) => row.original.kind === "bank" ? <strong className="block truncate font-bold text-xs" title={row.original.bank.subjectCoverage.join(" · ")}>{row.original.bank.subjectCoverage.join(", ") || "—"}</strong> : "—",
    },
    {
      id: "materi", header: "Materi", size: 200,
      cell: ({ row }) => row.original.kind === "bank" ? <span className="block truncate" title={(row.original.bank.materiCoverage ?? []).join(" · ")}>{(row.original.bank.materiCoverage ?? []).join(", ") || "—"}</span> : "—",
    },
    {
      id: "questionCount", header: "Soal", size: 115,
      cell: ({ row }) => row.original.kind === "bank" ? numberFormatter.format(row.original.bank.questionCount) : "—",
    },
    {
      id: "status", header: "Status", size: 140,
      cell: ({ row }) => row.original.kind === "bank" ? <Badge size="sm" tone={row.original.bank.status === "published" ? "success" : row.original.bank.status === "archived" ? "neutral" : "attention"}>{row.original.bank.status === "published" ? "Terbit" : row.original.bank.status === "archived" ? "Arsip" : "Draf"}</Badge> : "—",
    },
    {
      id: "actions", size: 60, enableHiding: false, enableSorting: false,
      header: () => <span className={styles.srOnly}>Tindakan</span>,
      cell: ({ row }) => (
        <MentorGridMenu className={styles.iconButton} label={`Tindakan untuk ${row.original.kind === "bank" ? row.original.bank.title : row.original.folder.name}`} trigger={<MoreHorizontal size={16} />} disabled={busy}>
          {row.original.kind === "bank" ? (
            <>
              <DropdownMenuItem size="sm" onClick={() => state.openCatalogueRow(row.original)}><Pencil />Edit bank soal</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem size="sm" variant={row.original.bank.status === "archived" ? undefined : "destructive"} onClick={() => {
                if (row.original.kind === "bank") state.setPendingLifecycle({ bank: row.original.bank, action: row.original.bank.status === "archived" ? "restore" : "archive" });
              }}>{row.original.bank.status === "archived" ? <Upload /> : <Archive />}{row.original.bank.status === "archived" ? "Pulihkan" : "Arsipkan"}</DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem size="sm" onClick={() => { if (row.original.kind === "folder") state.openFolderManage(row.original.folder, "rename"); }}><Pencil />Ubah nama</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem size="sm" variant="destructive" onClick={() => { if (row.original.kind === "folder") state.openFolderManage(row.original.folder, "remove"); }}><Trash2 />Hapus folder</DropdownMenuItem>
            </>
          )}
        </MentorGridMenu>
      ),
    },
  ];
  // eslint-disable-next-line react-hooks/incompatible-library -- This component opts out of React Compiler memoization for TanStack.
  const table = useReactTable({
    data: state.catalogueRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.kind === "bank" ? `bank-${row.bank.id}` : `folder-${row.folder.id ?? row.folder.name}`,
    state: { rowSelection: selection, pagination: { pageIndex: state.visiblePage - 1, pageSize: state.initialPageSize } },
    enableRowSelection: (row) => row.original.kind === "bank",
    onRowSelectionChange: setSelection,
    manualPagination: true,
    manualFiltering: true,
    enableSorting: false,
    pageCount: state.totalPages,
    autoResetPageIndex: false,
  });
  const selectedBanks = table.getSelectedRowModel().rows.flatMap((row) => row.original.kind === "bank" ? [row.original.bank] : []);
  async function applyBulkLifecycle(action: "archive" | "restore") {
    if (mutationInFlight.current || busy) return;
    mutationInFlight.current = true;
    state.setIsApplying(true);
    const failures: string[] = [];
    const succeeded = new Set<string>();
    try {
      for (const bank of selectedBanks) {
        try {
          const result = await updateQuestionBankLifecycleAction(bank.id, action, { expectedRevision: bank.revision ?? 1 });
          if (!result.ok) { failures.push(`${bank.title}: ${result.message}`); continue; }
          succeeded.add(`bank-${bank.id}`);
          state.setEntries((entries) => entries.map((entry) => entry.bank.id === bank.id ? { ...entry, bank: { ...entry.bank, revision: result.result.revision, status: result.result.status } } : entry));
        } catch {
          failures.push(`${bank.title}: Belum berhasil diproses. Coba lagi.`);
        }
      }
      setSelection((previous) => Object.fromEntries(Object.entries(previous).filter(([id]) => !succeeded.has(id))));
      setFeedback(failures);
      state.setPendingConfirmation(null);
      if (succeeded.size) showToast(`${succeeded.size} bank berhasil ${action === "archive" ? "diarsipkan" : "dipulihkan"}.`, { variant: failures.length ? "warning" : "success" });
      else if (failures.length) showToast("Bank belum berhasil diproses. Lihat rincian dan coba lagi.", { variant: "error" });
      if (succeeded.size) state.refreshFromServer();
    } finally {
      mutationInFlight.current = false;
      state.setIsApplying(false);
    }
  }
  function confirmBulkLifecycle(action: "archive" | "restore") {
    state.setPendingConfirmation({
      title: `${action === "archive" ? "Arsipkan" : "Pulihkan"} ${selectedBanks.length} bank?`,
      description: action === "archive" ? "Bank yang dipilih disembunyikan dari sumber baru tanpa menghapus soal." : "Bank yang dipilih kembali tersedia untuk digunakan.",
      label: action === "archive" ? "Arsipkan" : "Pulihkan",
      onConfirm: () => void applyBulkLifecycle(action),
    });
  }
  return (
    <div className="space-y-4">
      {state.folderBreadcrumb}
      <section className={styles.panel} aria-label="Daftar folder dan bank soal" aria-busy={busy} data-bank-assessment-table>
        <div className={styles.toolbar} data-selected={selectedBanks.length > 0}>
          <form className={styles.search} onSubmit={(event) => { event.preventDefault(); navigate({ query: String(new FormData(event.currentTarget).get("q") ?? "") }); }}>
            <Search aria-hidden="true" />
            <Input className="pl-9" name="q" key={initialSearch} defaultValue={initialSearch} placeholder="Cari bank soal…" aria-label="Cari bank soal" type="search" disabled={busy} />
          </form>
          <div className={styles.filters}>
            <MentorGridMenu className={styles.subject} label="Filter subtes" disabled={busy} trigger={<>{state.selectedSubjects.length ? state.selectedSubjects.join(", ") : "Semua subtes"}<ChevronDown /></>}>
              <DropdownMenuItem size="sm" onClick={() => { state.setSelectedSubjects([]); navigate({ subjects: [] }); }}>Semua subtes</DropdownMenuItem>
              {kaptenSubjects.map((subject) => <DropdownMenuItem size="sm" key={subject.code} onClick={() => {
                const next = state.selectedSubjects.includes(subject.code) ? state.selectedSubjects.filter((code) => code !== subject.code) : [...state.selectedSubjects, subject.code];
                state.setSelectedSubjects(next); navigate({ subjects: next });
              }}>{subject.code} — {subject.name}{state.selectedSubjects.includes(subject.code) && <Check />}</DropdownMenuItem>)}
            </MentorGridMenu>
            <MentorGridMenu label="Filter status" disabled={busy} trigger={<><Funnel />Status{state.statusFilter && <Badge size="xs" tone="neutral">1</Badge>}</>}>
              {[["", "Semua"], ["published", "Terbit"], ["archived", "Arsip"]].map(([value, label]) => <DropdownMenuItem size="sm" key={value} onClick={() => { state.setStatusFilter(value); navigate({ status: value }); }}>{label}{state.statusFilter === value && <Check />}</DropdownMenuItem>)}
            </MentorGridMenu>
          </div>
          {selectedBanks.length > 0 && <div className={styles.bulkTools}>
            <MentorGridMenu className={styles.iconButton} disabled={busy} label={`Tindakan ${selectedBanks.length} bank terpilih`} trigger={<MoreHorizontal size={16} />}>
              <DropdownMenuItem size="sm" disabled={selectedBanks.some((bank) => bank.status === "archived")} onClick={() => confirmBulkLifecycle("archive")}><Archive />Arsipkan</DropdownMenuItem>
              <DropdownMenuItem size="sm" disabled={selectedBanks.some((bank) => bank.status !== "archived")} onClick={() => confirmBulkLifecycle("restore")}><Upload />Pulihkan</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem size="sm" onClick={() => setSelection({})}>Hapus pilihan</DropdownMenuItem>
            </MentorGridMenu>
          </div>}
        </div>
        {state.activeFilters.length > 0 && <div className={styles.chips} role="group" aria-label="Filter aktif">
          {state.activeFilters.map((filter) => <Button key={filter.id} type="button" size="sm" variant="quiet" className="px-0" aria-label={`Hapus filter ${filter.label}`} onClick={() => {
            if (filter.id === "subjects") { state.setSelectedSubjects([]); navigate({ subjects: [] }); }
            else { state.setStatusFilter(""); navigate({ status: "" }); }
          }}><Badge size="sm" tone="category">{filter.value}<X className="size-3" aria-hidden="true" /></Badge></Button>)}
          <Button size="sm" variant="quiet" type="button" onClick={() => { state.setSelectedSubjects([]); state.setStatusFilter(""); navigate({ subjects: [], status: "" }); }}>Hapus semua</Button>
        </div>}
        {feedback.length > 0 && <div className={styles.feedback} role="status"><div><p>Bank berikut belum berhasil diproses:</p><ul>{feedback.map((failure, index) => <li key={index}>{failure}</li>)}</ul></div><Button type="button" size="icon-sm" variant="quiet" aria-label="Tutup pemberitahuan" onClick={() => setFeedback([])}><X size={16} /></Button></div>}
        <MentorAssessmentGrid table={table} caption="Daftar folder dan bank soal" label="Tabel bank soal, geser untuk melihat semua kolom" numericColumns={["questionCount"]} onRowOpen={busy ? undefined : state.openCatalogueRow}
          wrapRow={(row, element) => <ContextMenu key={row.kind === "bank" ? row.bank.id : row.folder.id ?? row.folder.name}><ContextMenuTrigger render={element as ReactElement} />{state.catalogueRowContextMenu(row)}</ContextMenu>}
          loadingState={state.isCataloguePending ? <span role="status" aria-live="polite">Memuat bank soal…</span> : undefined}
          emptyState={<div className="mx-auto flex w-full min-w-0 max-w-[calc(100vw-2rem)] flex-col items-center whitespace-normal text-center"><LibraryBig className="size-7 text-primary-300" /><h2 className="mt-3 font-semibold text-secondary-900">{state.isGlobalSearch ? "Tidak ada hasil pencarian" : "Belum ada item di lokasi ini"}</h2><p className="mt-1 text-sm font-normal leading-6 text-secondary-600">Buat bank soal atau folder baru untuk mulai mengisi ruang ini.</p></div>}
        />
        <MentorAssessmentPagination page={state.visiblePage} pageSize={state.initialPageSize} pageCount={state.totalPages} total={initialTotal} disabled={busy} label="Halaman bank soal" onPageChange={(page) => navigate({ page })} onPageSizeChange={(pageSize) => navigate({ pageSize })} />
      </section>
    </div>
  );
}

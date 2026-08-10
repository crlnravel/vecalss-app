"use client";

import Link from "next/link";
import { Archive, Ellipsis, FilePenLine, LibraryBig, Pencil, Plus, Trash2, Upload } from "@/lib/icons";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { SessionContext } from "@/lib/auth/types";
import { CatalogueFilter, CatalogueSearchInput, PageIntro, PaginationControls, StatusPill } from "@/modules/mentor/components/kapten-ui";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { kaptenSubjects, type BankQuestion, type KaptenQuestionBank } from "@/modules/mentor/mock-data";
import { deleteQuestionBankAction, updateQuestionBankLifecycleAction } from "@/modules/mentor/question-bank-actions";

type BankEntry = { bank: KaptenQuestionBank; questions: BankQuestion[] };
const BANKS_PER_PAGE = 8;

function coverage(entries: BankEntry[], bankId: string) {
  const entry = entries.find(({ bank }) => bank.id === bankId);
  return [...new Set(entry?.questions.map((question) => question.subjectCode) ?? [])];
}

function subjectTags(entries: BankEntry[], bank: KaptenQuestionBank) {
  const tags = (bank.tags ?? []).filter((tag) => kaptenSubjects.some((subject) => subject.code === tag));
  return bank.tags === undefined ? coverage(entries, bank.id) : tags;
}

function KaptenQuestionBankPageModule({ initialEntries, session }: { initialEntries: BankEntry[]; session: SessionContext }) {
  const [entries, setEntries] = useState(initialEntries);
  const [query, setQuery] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<{ bank: KaptenQuestionBank; action: "publish" | "unpublish" | "archive" | "restore" | "delete" } | null>(null);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const banks = entries.map(({ bank }) => bank);
  const filtered = banks.filter((bank) => {
    const covered = coverage(entries, bank.id);
    const needle = query.trim().toLowerCase();
    return (!needle || [bank.title, bank.description, ...subjectTags(entries, bank), ...covered].join(" ").toLowerCase().includes(needle))
      && (!subjectCode || covered.includes(subjectCode))
      && (!statusFilter || bank.status === statusFilter);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / BANKS_PER_PAGE));
  const visiblePage = Math.min(page, totalPages);
  const paginatedBanks = filtered.slice(
    (visiblePage - 1) * BANKS_PER_PAGE,
    visiblePage * BANKS_PER_PAGE,
  );
  function updateQuery(value: string) {
    setQuery(value);
    setPage(1);
  }

  function updateSubject(value: string) {
    setSubjectCode(value);
    setPage(1);
  }

  async function apply() {
    if (!pending) return;
    const { action, bank } = pending;
    if (action === "delete") {
      const result = await deleteQuestionBankAction(bank.id);
      if (!result.ok) { setLifecycleError(result.message); return; }
      setEntries((current) => current.filter((entry) => entry.bank.id !== bank.id));
      setLifecycleError(null); setPending(null);
      return;
    }
    const result = await updateQuestionBankLifecycleAction(bank.id, action);
    if (!result.ok) { setLifecycleError(result.message); return; }
    setEntries((current) => current.map((entry) => entry.bank.id === bank.id ? { ...entry, bank: { ...entry.bank, status: result.result.status } } : entry));
    setLifecycleError(null); setPending(null);
  }

  const actionCopy = pending?.action === "delete" ? ["Hapus Bank Soal?", "Bank dan semua soalnya akan dihapus secara permanen. Tindakan ini tidak dapat dibatalkan.", "Hapus permanen"]
    : pending?.action === "publish" ? ["Terbitkan bank?", "Bank yang lengkap akan muncul sebagai sumber Quiz dan Tryout.", "Terbitkan"]
    : pending?.action === "unpublish" ? ["Kembalikan ke draf?", "Bank tidak lagi muncul sebagai sumber baru.", "Batalkan terbit"]
      : pending?.action === "archive" ? ["Arsipkan bank?", "Bank hilang dari pencarian sumber, tanpa menghapus soalnya.", "Arsipkan"]
        : ["Pulihkan bank?", "Bank kembali sebagai draf dan perlu diterbitkan lagi.", "Pulihkan"];

  return <MentorWorkspaceShell activeLabel="Bank Soal" breadcrumbLabel="Bank Soal" searchPlaceholder="Cari bank soal..." session={session}>
    <div className="space-y-3">
    <PageIntro action={<Button aria-label="Buat bank soal baru" render={<Link href="/mentor/quiz/question-bank/create" />} size="icon-sm" title="Buat bank soal baru" variant="brand"><Plus /></Button>} title="Bank Soal" />
    <div className="space-y-3">
      <CatalogueSearchInput onChange={updateQuery} placeholder="Cari judul atau tag..." value={query} />
      <div className="flex flex-wrap items-center gap-2">
        <CatalogueFilter
          label="Filter subject"
          onValueChange={updateSubject}
          options={[
            { label: "Semua subject", value: "" },
            ...kaptenSubjects.map((subject) => ({ label: `${subject.code} · ${subject.name}`, value: subject.code })),
          ]}
          value={subjectCode}
        />
        <CatalogueFilter
          label="Filter status"
          onValueChange={(value) => { setStatusFilter(value); setPage(1); }}
          options={[
            { label: "Semua status", value: "" },
            { label: "Draf", value: "draft" },
            { label: "Diterbitkan", value: "published" },
            { label: "Diarsipkan", value: "archived" },
            { label: "Terjadwal", value: "scheduled" },
          ]}
          value={statusFilter}
        />
      </div>
    </div>
    <section className="grid gap-3">
      {filtered.length ? paginatedBanks.map((bank) => <article className="flex flex-col gap-4 rounded-3xl border border-primary-100 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between" key={bank.id}>
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><LibraryBig className="size-4 text-primary-800" /><h2 className="font-semibold text-secondary-900">{bank.title}</h2><StatusPill status={bank.status} /></div><p className="mt-1 text-sm text-secondary-500">{bank.questionCount} soal</p><div className="mt-2 flex flex-wrap gap-2">{subjectTags(entries, bank).map((item) => <span className="rounded-full bg-primary-50 px-2 py-1 text-xs text-primary-800" key={item}>#{item}</span>)}</div></div>
        <div className="flex items-center gap-2"><Button aria-label="Edit bank soal" render={<Link href={`/mentor/quiz/question-bank/${bank.id}`} />} size="icon-sm" title="Edit bank soal" variant="brand"><Pencil /></Button><DropdownMenu><DropdownMenuTrigger render={<Button aria-label={`Aksi untuk ${bank.title}`} size="icon-sm" type="button" variant="ghost" />}><Ellipsis /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-52"><DropdownMenuGroup>{bank.status === "draft" && <DropdownMenuItem onClick={() => { setLifecycleError(null); setPending({ bank, action: "publish" }); }}><Upload />Terbitkan</DropdownMenuItem>}{bank.status === "published" && <DropdownMenuItem onClick={() => { setLifecycleError(null); setPending({ bank, action: "unpublish" }); }}><FilePenLine />Pindahkan ke draf</DropdownMenuItem>}{bank.status !== "archived" ? <DropdownMenuItem onClick={() => { setLifecycleError(null); setPending({ bank, action: "archive" }); }}><Archive />Arsipkan</DropdownMenuItem> : <DropdownMenuItem onClick={() => { setLifecycleError(null); setPending({ bank, action: "restore" }); }}>Pulihkan</DropdownMenuItem>}<DropdownMenuItem onClick={() => { setLifecycleError(null); setPending({ bank, action: "delete" }); }} variant="destructive"><Trash2 />Hapus</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu></div>
      </article>) : <div className="rounded-3xl border border-dashed border-primary-200 px-5 py-12 text-center text-sm text-secondary-500">Tidak ada bank sesuai filter. Buat bank bersama pertama untuk memulai.</div>}
    </section>
    {filtered.length > 0 ? <PaginationControls onPageChange={setPage} page={visiblePage} pageCount={totalPages} /> : null}
    </div>
    <Dialog onOpenChange={(open) => { if (!open) { setLifecycleError(null); setPending(null); } }} open={Boolean(pending)}><DialogContent><DialogHeader><DialogTitle>{actionCopy[0]}</DialogTitle><DialogDescription>{actionCopy[1]}</DialogDescription></DialogHeader>{lifecycleError ? <p aria-live="assertive" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{lifecycleError}</p> : null}<DialogFooter><Button onClick={() => { setLifecycleError(null); setPending(null); }} type="button" variant="brandOutline">Batal</Button><Button onClick={apply} type="button" variant="brand">{actionCopy[2]}</Button></DialogFooter></DialogContent></Dialog>
  </MentorWorkspaceShell>;
}

export { KaptenQuestionBankPageModule };

"use client";

import Link from "next/link";
import { Archive, Ellipsis, LibraryBig, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { SessionContext } from "@/lib/auth/types";
import { PageIntro } from "@/modules/mentor/components/kapten-ui";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { kaptenSubjects, type BankQuestion, type KaptenQuestionBank } from "@/modules/mentor/mock-data";
import { deleteQuestionBankAction, updateQuestionBankLifecycleAction } from "@/modules/mentor/question-bank-actions";

type BankEntry = { bank: KaptenQuestionBank; questions: BankQuestion[] };

function coverage(entries: BankEntry[], bankId: string) {
  const entry = entries.find(({ bank }) => bank.id === bankId);
  return [...new Set(entry?.questions.map((question) => question.subjectCode) ?? [])];
}

function subjectTags(entries: BankEntry[], bank: KaptenQuestionBank) {
  const tags = (bank.tags ?? []).filter((tag) => kaptenSubjects.some((subject) => subject.code === tag));
  return bank.tags === undefined ? coverage(entries, bank.id) : tags;
}

function KaptenQuestionBankPageModule({ initialEntries, initialSubtest = "", session }: { initialEntries: BankEntry[]; initialSubtest?: string; session: SessionContext }) {
  const [entries, setEntries] = useState(initialEntries);
  const [query, setQuery] = useState("");
  const [subtest, setSubtest] = useState(initialSubtest);
  const [tag, setTag] = useState("");
  const [pending, setPending] = useState<{ bank: KaptenQuestionBank; action: "publish" | "unpublish" | "archive" | "restore" | "delete" } | null>(null);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const banks = entries.map(({ bank }) => bank);
  const tags = useMemo(() => kaptenSubjects.filter((subject) => banks.some((bank) => subjectTags(entries, bank).includes(subject.code))), [banks, entries]);
  const filtered = banks.filter((bank) => {
    const covered = coverage(entries, bank.id);
    const needle = query.trim().toLowerCase();
    return (!needle || [bank.title, bank.description, ...subjectTags(entries, bank), ...covered].join(" ").toLowerCase().includes(needle))
      && (!subtest || covered.includes(subtest)) && (!tag || subjectTags(entries, bank).includes(tag));
  });

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

  return <MentorWorkspaceShell activeLabel="Bank Soal" breadcrumbLabel="Question Bank" searchPlaceholder="Cari bank soal..." session={session}>
    <PageIntro action={<Button render={<Link href="/mentor/quiz/question-bank/create" />} variant="brand"><Plus />Buat Bank Soal</Button>} title="Question Bank" />
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
      <label className="relative"><Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-secondary-400" /><input className="h-11 w-full rounded-xl border border-primary-100 bg-white pl-10 text-sm outline-none focus:border-primary-500" onChange={(event) => setQuery(event.target.value)} placeholder="Cari judul atau tag..." value={query} /></label>
      <select aria-label="Filter Subtest" className="h-11 rounded-xl border border-primary-100 bg-white px-3 text-sm" onChange={(event) => setSubtest(event.target.value)} value={subtest}><option value="">Semua Subtest</option>{kaptenSubjects.map((subject) => <option key={subject.code} value={subject.code}>{subject.code}</option>)}</select>
      <select aria-label="Filter tag bank" className="h-11 rounded-xl border border-primary-100 bg-white px-3 text-sm" onChange={(event) => setTag(event.target.value)} value={tag}><option value="">Semua tag subject</option>{tags.map((subject) => <option key={subject.code} value={subject.code}>{subject.code} · {subject.name}</option>)}</select>
    </div>
    <section className="mt-5 grid gap-3">
      {filtered.length ? filtered.map((bank) => <article className="flex flex-col gap-4 rounded-3xl border border-primary-100 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between" key={bank.id}>
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><LibraryBig className="size-4 text-primary-800" /><h2 className="font-semibold text-secondary-900">{bank.title}</h2><span className="text-xs font-semibold text-primary-800">{bank.status === "published" ? "Diterbitkan" : bank.status === "archived" ? "Diarsipkan" : "Draf"}</span></div><p className="mt-1 text-sm text-secondary-500">{bank.questionCount} soal</p><div className="mt-2 flex flex-wrap gap-2">{subjectTags(entries, bank).map((item) => <span className="rounded-full bg-primary-50 px-2 py-1 text-xs text-primary-800" key={item}>#{item}</span>)}</div></div>
        <div className="flex items-center gap-2"><Button render={<Link href={`/mentor/quiz/question-bank/${bank.id}`} />} size="sm" variant="brand"><Pencil />Buka</Button><DropdownMenu><DropdownMenuTrigger render={<Button aria-label={`Aksi untuk ${bank.title}`} size="icon-sm" type="button" variant="ghost" />}><Ellipsis /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-52"><DropdownMenuGroup>{bank.status === "draft" && <DropdownMenuItem onClick={() => { setLifecycleError(null); setPending({ bank, action: "publish" }); }}>Terbitkan</DropdownMenuItem>}{bank.status === "published" && <DropdownMenuItem onClick={() => { setLifecycleError(null); setPending({ bank, action: "unpublish" }); }}>Jadikan draf</DropdownMenuItem>}{bank.status !== "archived" ? <DropdownMenuItem onClick={() => { setLifecycleError(null); setPending({ bank, action: "archive" }); }}><Archive />Arsipkan</DropdownMenuItem> : <DropdownMenuItem onClick={() => { setLifecycleError(null); setPending({ bank, action: "restore" }); }}>Pulihkan</DropdownMenuItem>}<DropdownMenuSeparator /><DropdownMenuItem onClick={() => { setLifecycleError(null); setPending({ bank, action: "delete" }); }} variant="destructive"><Trash2 />Hapus</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu></div>
      </article>) : <div className="rounded-3xl border border-dashed border-primary-200 px-5 py-12 text-center text-sm text-secondary-500">Tidak ada bank sesuai filter. Buat bank bersama pertama untuk memulai.</div>}
    </section>
    <Dialog onOpenChange={(open) => { if (!open) { setLifecycleError(null); setPending(null); } }} open={Boolean(pending)}><DialogContent><DialogHeader><DialogTitle>{actionCopy[0]}</DialogTitle><DialogDescription>{actionCopy[1]}</DialogDescription></DialogHeader>{lifecycleError ? <p aria-live="assertive" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{lifecycleError}</p> : null}<DialogFooter><Button onClick={() => { setLifecycleError(null); setPending(null); }} type="button" variant="brandOutline">Batal</Button><Button onClick={apply} type="button" variant="brand">{actionCopy[2]}</Button></DialogFooter></DialogContent></Dialog>
  </MentorWorkspaceShell>;
}

export { KaptenQuestionBankPageModule };

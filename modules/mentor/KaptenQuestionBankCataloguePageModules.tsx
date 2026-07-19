"use client";

import Link from "next/link";
import { Archive, LibraryBig, Pencil, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SessionContext } from "@/lib/auth/types";
import { PageIntro } from "@/modules/mentor/components/kapten-ui";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { kaptenSubjects, type KaptenQuestionBank } from "@/modules/mentor/mock-data";
import { getQuestionBankCatalog, saveQuestionBankDraft, updateQuestionBankLifecycle } from "@/modules/mentor/question-bank-draft-storage";

function coverage(bankId: string) {
  const entry = getQuestionBankCatalog().find(({ bank }) => bank.id === bankId);
  return [...new Set(entry?.questions.map((question) => question.subjectCode) ?? [])];
}

function KaptenQuestionBankPageModule({ initialSubtest = "", session }: { initialSubtest?: string; session: SessionContext }) {
  const [banks, setBanks] = useState(() => getQuestionBankCatalog().map(({ bank }) => bank));
  const [query, setQuery] = useState("");
  const [subtest, setSubtest] = useState(initialSubtest);
  const [tag, setTag] = useState("");
  const [pending, setPending] = useState<{ bank: KaptenQuestionBank; action: "publish" | "unpublish" | "archive" | "restore" } | null>(null);

  function refresh() { setBanks(getQuestionBankCatalog().map(({ bank }) => bank)); }
  useEffect(() => {
    window.addEventListener("storage", refresh);
    window.addEventListener("vecalss-question-bank-drafts-change", refresh);
    return () => { window.removeEventListener("storage", refresh); window.removeEventListener("vecalss-question-bank-drafts-change", refresh); };
  }, []);

  const tags = useMemo(() => [...new Set(banks.flatMap((bank) => bank.tags ?? []))].sort(), [banks]);
  const filtered = banks.filter((bank) => {
    const covered = coverage(bank.id);
    const needle = query.trim().toLowerCase();
    return (!needle || [bank.title, bank.description, ...(bank.tags ?? []), ...covered].join(" ").toLowerCase().includes(needle))
      && (!subtest || covered.includes(subtest)) && (!tag || bank.tags?.includes(tag));
  });

  function apply() {
    if (!pending) return;
    const { action, bank } = pending;
    if (action === "publish" || action === "unpublish") updateQuestionBankLifecycle([bank.id], action);
    else {
      const entry = getQuestionBankCatalog().find((item) => item.bank.id === bank.id);
      if (!entry) return;
      const next = { ...entry.bank, status: action === "archive" ? "archived" as const : "draft" as const, updatedAt: "Diedit baru saja" };
      // archive/restore are intentionally browser-local representations for this validation slice.
      saveQuestionBankDraft({ bank: next, questions: entry.questions });
    }
    setPending(null); refresh();
  }

  const actionCopy = pending?.action === "publish" ? ["Terbitkan bank?", "Bank yang lengkap akan muncul sebagai sumber mock.", "Terbitkan"]
    : pending?.action === "unpublish" ? ["Kembalikan ke draf?", "Bank tidak lagi muncul sebagai sumber baru.", "Batalkan terbit"]
      : pending?.action === "archive" ? ["Arsipkan bank?", "Bank hilang dari pencarian sumber, tanpa menghapus soalnya.", "Arsipkan"]
        : ["Pulihkan bank?", "Bank kembali sebagai draf dan perlu diterbitkan lagi.", "Pulihkan"];

  return <MentorWorkspaceShell activeLabel="Bank Soal" breadcrumbLabel="Question Bank" searchPlaceholder="Cari bank soal..." session={session}>
    <PageIntro action={<Button render={<Link href="/mentor/quiz/question-bank/create" />} variant="brand"><Plus />Buat Bank Soal</Button>} title="Question Bank" />
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
      <label className="relative"><Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-secondary-400" /><input className="h-11 w-full rounded-xl border border-primary-100 bg-white pl-10 text-sm outline-none focus:border-primary-500" onChange={(event) => setQuery(event.target.value)} placeholder="Cari judul atau tag..." value={query} /></label>
      <select aria-label="Filter Subtest" className="h-11 rounded-xl border border-primary-100 bg-white px-3 text-sm" onChange={(event) => setSubtest(event.target.value)} value={subtest}><option value="">Semua Subtest</option>{kaptenSubjects.map((subject) => <option key={subject.code} value={subject.code}>{subject.code}</option>)}</select>
      <select aria-label="Filter tag bank" className="h-11 rounded-xl border border-primary-100 bg-white px-3 text-sm" onChange={(event) => setTag(event.target.value)} value={tag}><option value="">Semua tag</option>{tags.map((item) => <option key={item} value={item}>{item}</option>)}</select>
    </div>
    <section className="mt-5 grid gap-3">
      {filtered.length ? filtered.map((bank) => { const covered = coverage(bank.id); return <article className="flex flex-col gap-4 rounded-3xl border border-primary-100 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between" key={bank.id}>
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><LibraryBig className="size-4 text-primary-800" /><h2 className="font-semibold text-secondary-900">{bank.title}</h2><span className="text-xs font-semibold text-primary-800">{bank.status === "published" ? "Diterbitkan" : bank.status === "archived" ? "Diarsipkan" : "Draf"}</span></div><p className="mt-1 text-sm text-secondary-500">{bank.questionCount} soal · {covered.length ? covered.join(" · ") : "Belum ada Subtest"}</p><div className="mt-2 flex flex-wrap gap-2">{(bank.tags ?? []).map((item) => <span className="rounded-full bg-primary-50 px-2 py-1 text-xs text-primary-800" key={item}>#{item}</span>)}</div></div>
        <div className="flex flex-wrap gap-2"><Button render={<Link href={`/mentor/quiz/question-bank/${bank.id}`} />} size="sm" variant="brand"><Pencil />Buka</Button>{bank.status === "draft" && <Button onClick={() => setPending({ bank, action: "publish" })} size="sm" type="button" variant="brandOutline">Terbitkan</Button>}{bank.status === "published" && <Button onClick={() => setPending({ bank, action: "unpublish" })} size="sm" type="button" variant="brandOutline">Jadikan draf</Button>}{bank.status !== "archived" ? <Button onClick={() => setPending({ bank, action: "archive" })} size="sm" type="button" variant="ghost"><Archive />Arsipkan</Button> : <Button onClick={() => setPending({ bank, action: "restore" })} size="sm" type="button" variant="brandOutline">Pulihkan</Button>}</div>
      </article>; }) : <div className="rounded-3xl border border-dashed border-primary-200 px-5 py-12 text-center text-sm text-secondary-500">Tidak ada bank sesuai filter. Buat bank bersama pertama untuk memulai.</div>}
    </section>
    <Dialog onOpenChange={(open) => !open && setPending(null)} open={Boolean(pending)}><DialogContent><DialogHeader><DialogTitle>{actionCopy[0]}</DialogTitle><DialogDescription>{actionCopy[1]}</DialogDescription></DialogHeader><DialogFooter><Button onClick={() => setPending(null)} type="button" variant="brandOutline">Batal</Button><Button onClick={apply} type="button" variant="brand">{actionCopy[2]}</Button></DialogFooter></DialogContent></Dialog>
  </MentorWorkspaceShell>;
}

export { KaptenQuestionBankPageModule };

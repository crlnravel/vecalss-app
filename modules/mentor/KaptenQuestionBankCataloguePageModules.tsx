"use client";

import Link from "next/link";
import { ChevronLeft, Eye, LibraryBig, Pencil, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { PageIntro } from "@/modules/mentor/components/kapten-ui";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { kaptenSubjects, type KaptenQuestionBank, type KaptenSubject } from "@/modules/mentor/mock-data";
import { getQuestionBankCatalog, updateQuestionBankLifecycle } from "@/modules/mentor/question-bank-draft-storage";
import { getSubjectCategory } from "@/modules/mentor/subject-category";

function SearchInput({ onChange, placeholder, value }: { onChange: (value: string) => void; placeholder: string; value: string }) {
  return <label className="relative block"><span className="sr-only">{placeholder}</span><Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-primary-700" /><input className="h-12 w-full rounded-2xl border border-primary-200 bg-white px-11 text-sm text-secondary-900 shadow-sm outline-none transition focus:border-primary-500 focus:ring-3 focus:ring-primary-300/35" onChange={(event) => onChange(event.target.value)} placeholder={placeholder} type="search" value={value} /></label>;
}

function SubjectCard({ subject }: { subject: KaptenSubject }) {
  return <Link className="group flex min-h-32 flex-col rounded-3xl border border-primary-200 bg-white p-5 shadow-sm transition hover:border-primary-500 hover:bg-primary-50/40" href={`/mentor/quiz/question-bank/subject/${subject.slug}`}><div className="flex items-start justify-between gap-4"><span className="inline-flex rounded-xl bg-primary-100 px-3 py-1.5 text-sm font-bold text-primary-900">{getSubjectCategory(subject.code)}</span><LibraryBig className="size-5 text-primary-800" /></div><h2 className="mt-5 text-xl font-semibold text-secondary-900">{subject.name}</h2></Link>;
}

function KaptenQuestionBankPageModule({ session }: { session: SessionContext }) {
  return <MentorWorkspaceShell activeLabel="Bank Soal" breadcrumbLabel="Question Bank" searchPlaceholder="Cari bank soal atau subject..." session={session}><PageIntro title="Question Bank" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{kaptenSubjects.map((subject) => <SubjectCard key={subject.slug} subject={subject} />)}</div></MentorWorkspaceShell>;
}

function QuestionBankRow({ bank, onSelectedChange, selected }: { bank: KaptenQuestionBank; onSelectedChange: (checked: boolean) => void; selected: boolean }) {
  return <article className="grid gap-4 rounded-3xl border border-primary-100 bg-white p-4 shadow-sm sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"><Checkbox aria-label={`Pilih ${bank.title}`} checked={selected} onCheckedChange={(checked) => onSelectedChange(checked === true)} /><div className="min-w-0"><h2 className="text-base font-semibold text-secondary-900">{bank.title}</h2><div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-secondary-500"><span>{bank.primaryMetric}</span><span>{bank.topic || "Topik belum diisi"}</span><span className={cn("font-semibold", bank.status === "published" ? "text-primary-900" : "text-primary-800")}>{bank.status === "published" ? "Diterbitkan" : "Draf"}</span></div></div><div className="flex flex-wrap gap-2 sm:justify-end"><Button render={<Link href={bank.href} />} size="sm" variant="brandOutline"><Eye />Preview</Button><Button render={<Link href={bank.href} />} size="sm" variant="brand"><Pencil />Edit</Button></div></article>;
}

function getBanksForSubject(subjectCode: string) {
  return getQuestionBankCatalog()
    .map(({ bank }) => ({ ...bank, href: `/mentor/quiz/question-bank/${bank.id}` }))
    .filter((bank) => bank.subjectCode === subjectCode);
}

function KaptenQuestionBankSubjectPageModule({ session, subject }: { session: SessionContext; subject: KaptenSubject }) {
  const [banks, setBanks] = useState<KaptenQuestionBank[]>(() => getBanksForSubject(subject.code));
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [intent, setIntent] = useState<"publish" | "unpublish" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const handleStorageChange = () => setBanks(getBanksForSubject(subject.code));
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("vecalss-question-bank-drafts-change", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("vecalss-question-bank-drafts-change", handleStorageChange);
    };
  }, [subject.code]);
  const visibleBanks = banks.filter((bank) => !query.trim() || [bank.title, bank.status, bank.primaryMetric, bank.topic ?? ""].some((value) => value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  const selectedBanks = banks.filter((bank) => selectedIds.has(bank.id));
  const canPublish = selectedBanks.length > 0 && selectedBanks.every((bank) => bank.status === "draft" && bank.questionCount > 0);
  const canUnpublish = selectedBanks.length > 0 && selectedBanks.every((bank) => bank.status === "published");
  const areAllVisibleSelected = visibleBanks.length > 0 && visibleBanks.every((bank) => selectedIds.has(bank.id));
  const confirmation = intent === "publish" ? { confirm: "Terbitkan semua", description: `${selectedBanks.length} bank soal akan tersedia sebagai sumber quiz.`, title: "Terbitkan bank soal terpilih?" } : { confirm: "Batalkan terbit", description: `${selectedBanks.length} bank soal kembali menjadi draf.`, title: "Batalkan penerbitan bank soal?" };
  const toggleSelected = (id: string, checked: boolean) => { setNotice(null); setSelectedIds((current) => { const next = new Set(current); if (checked) next.add(id); else next.delete(id); return next; }); };
  const toggleAllVisible = (checked: boolean) => { setNotice(null); setSelectedIds((current) => { const next = new Set(current); visibleBanks.forEach((bank) => checked ? next.add(bank.id) : next.delete(bank.id)); return next; }); };
  const confirmLifecycle = () => { if (!intent || !selectedBanks.length) return; setError(null); try { const result = updateQuestionBankLifecycle(selectedBanks.map((bank) => bank.id), intent); const affected = new Set(result.banks.map((bank) => bank.id)); const nextStatus = result.status as KaptenQuestionBank["status"]; setBanks((current) => current.map((bank) => affected.has(bank.id) ? { ...bank, status: nextStatus, updatedAt: "Diedit baru saja" } : bank)); setSelectedIds(new Set()); setNotice(`${result.banks.length} bank soal ${intent === "publish" ? "telah diterbitkan" : "kembali menjadi draf"}.`); setIntent(null); } catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : "Status bank soal tidak dapat diubah saat ini. Coba lagi."); } };
  const eligibilityReason = selectedBanks.length > 0 && !canPublish && !canUnpublish ? "Pilih hanya bank soal draf yang memiliki soal atau bank soal yang sudah diterbitkan." : null;

  return <MentorWorkspaceShell activeLabel="Bank Soal" breadcrumbLabel={`${subject.code} · Bank Soal`} searchPlaceholder="Cari bank soal..." session={session}><section className="space-y-5"><Button aria-label="Kembali ke semua bank soal" render={<Link href="/mentor/quiz/question-bank" />} size="icon-sm" title="Kembali ke semua bank soal" variant="ghost"><ChevronLeft /></Button><PageIntro action={<Button render={<Link href={`/mentor/quiz/question-bank/create?subject=${subject.code}`} />} variant="brand"><Plus />Buat Bank Soal</Button>} eyebrow={getSubjectCategory(subject.code)} title={subject.name} /><SearchInput onChange={setQuery} placeholder="Cari judul, topik, atau status..." value={query} /></section><section className="mt-5 space-y-3">{visibleBanks.length && selectedBanks.length ? <div className="flex items-center gap-3 rounded-2xl border border-primary-100 bg-primary-50/35 px-4 py-3"><Checkbox aria-label="Pilih semua bank soal yang terlihat" checked={areAllVisibleSelected} onCheckedChange={(checked) => toggleAllVisible(checked === true)} /><span className="text-sm font-semibold text-secondary-700">Pilih semua hasil</span></div> : null}{selectedBanks.length ? <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary-200 bg-white px-4 py-3"><span className="text-sm font-semibold text-secondary-900">{selectedBanks.length} dipilih</span><Button disabled={!canPublish} onClick={() => { setError(null); setIntent("publish"); }} size="sm" type="button" variant="brand">Terbitkan</Button><Button disabled={!canUnpublish} onClick={() => { setError(null); setIntent("unpublish"); }} size="sm" type="button" variant="brandOutline">Batalkan terbit</Button><Button onClick={() => setSelectedIds(new Set())} size="sm" type="button" variant="ghost">Hapus pilihan</Button>{eligibilityReason ? <p className="basis-full text-sm text-secondary-600" role="status">{eligibilityReason}</p> : null}</div> : null}{notice ? <p className="rounded-2xl border border-primary-200 bg-primary-50/40 px-4 py-3 text-sm font-medium text-primary-900" role="status">{notice}</p> : null}{visibleBanks.length ? visibleBanks.map((bank) => <QuestionBankRow bank={bank} key={bank.id} onSelectedChange={(checked) => toggleSelected(bank.id, checked)} selected={selectedIds.has(bank.id)} />) : <div className="rounded-3xl border border-dashed border-primary-300 bg-primary-50/40 px-5 py-10 text-center text-sm text-secondary-600">Tidak ada bank soal yang cocok dengan pencarian ini.</div>}</section><Dialog onOpenChange={(open) => { if (!open) { setError(null); setIntent(null); } }} open={Boolean(intent)}><DialogContent><DialogHeader><DialogTitle>{confirmation.title}</DialogTitle><DialogDescription>{confirmation.description}</DialogDescription></DialogHeader>{error ? <div aria-live="assertive" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</div> : null}<DialogFooter><DialogClose render={<Button type="button" variant="brandOutline" />}>Batal</DialogClose><Button disabled={intent === "publish" ? !canPublish : !canUnpublish} onClick={confirmLifecycle} type="button" variant="brand">{confirmation.confirm}</Button></DialogFooter></DialogContent></Dialog></MentorWorkspaceShell>;
}

export { KaptenQuestionBankPageModule, KaptenQuestionBankSubjectPageModule };

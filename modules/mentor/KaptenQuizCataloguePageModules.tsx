"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ChevronLeft, Ellipsis, Eye, ListChecks, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { PageIntro } from "@/modules/mentor/components/kapten-ui";
import type { KaptenQuiz, KaptenSubject } from "@/modules/mentor/mock-data";
import {
  bulkPublishStandaloneQuizzesAction,
  bulkUnpublishStandaloneQuizzesAction,
  updateStandaloneQuizLifecycleAction,
} from "@/modules/mentor/quiz-actions";
import { getSubjectCategory } from "@/modules/mentor/subject-category";

function SearchInput({ onChange, placeholder, value }: { onChange: (value: string) => void; placeholder: string; value: string }) {
  return (
    <label className="relative block">
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-primary-700" />
      <input className="h-12 w-full rounded-2xl border border-primary-200 bg-white px-11 text-sm text-secondary-900 shadow-sm outline-none transition focus:border-primary-500 focus:ring-3 focus:ring-primary-300/35" onChange={(event) => onChange(event.target.value)} placeholder={placeholder} type="search" value={value} />
    </label>
  );
}

function SubjectCard({ subject }: { subject: KaptenSubject }) {
  const subjectCategory = getSubjectCategory(subject.code);

  return (
    <Link className="group flex min-h-32 flex-col rounded-3xl border border-primary-200 bg-white p-5 shadow-sm transition hover:border-primary-500 hover:bg-primary-50/40" href={`/mentor/quiz/subject/${subject.slug}`}>
      <div className="flex items-start justify-between gap-4">
        <span className="inline-flex rounded-xl bg-primary-100 px-3 py-1.5 text-sm font-bold text-primary-900">{subjectCategory}</span>
        <ListChecks className="size-5 text-primary-800" />
      </div>
      <h2 className="mt-5 text-xl font-semibold text-secondary-900">{subject.name}</h2>
    </Link>
  );
}

function KaptenQuizPageModule({ session, subjects }: { session: SessionContext; subjects: KaptenSubject[] }) {
  return (
    <MentorWorkspaceShell activeLabel="Quiz" breadcrumbLabel="Quiz" searchPlaceholder="Cari quiz atau subject..." session={session}>
      <PageIntro action={<Button render={<Link href="/mentor/quiz/create" />} variant="brand"><Plus />Buat Quiz</Button>} title="Quiz" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {subjects.map((subject) => <SubjectCard key={subject.slug} subject={subject} />)}
      </div>
    </MentorWorkspaceShell>
  );
}

function QuizStatus({ status }: { status: KaptenQuiz["status"] }) {
  return <span className={cn("text-sm font-semibold", status === "published" ? "text-primary-900" : "text-primary-800")}>{status === "published" ? "Diterbitkan" : "Draf"}</span>;
}

function QuizRow({ quiz, onAction, onSelectedChange, selected }: { quiz: KaptenQuiz; onAction: (action: "archive" | "delete" | "publish" | "restore" | "unpublish") => void; onSelectedChange: (checked: boolean) => void; selected: boolean }) {
  return (
    <article className="grid gap-4 rounded-3xl border border-primary-100 bg-white p-4 shadow-sm sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
      <Checkbox aria-label={`Pilih ${quiz.title}`} checked={selected} onCheckedChange={(checked) => onSelectedChange(checked === true)} />
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-secondary-900">{quiz.title}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-secondary-500">
          <span>{quiz.primaryMetric}</span><QuizStatus status={quiz.status} />
          {quiz.opensAt ? <span>Buka {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(quiz.opensAt))}</span> : null}
          {quiz.closesAt ? <span>Tutup {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(quiz.closesAt))}</span> : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Button aria-label="Preview Quiz" render={<Link href={quiz.href} />} size="icon-sm" title="Preview" variant="brandOutline"><Eye /></Button>
        <Button render={<Link href={quiz.href} />} size="sm" variant="brand"><Pencil />Edit</Button>
        <DropdownMenu><DropdownMenuTrigger render={<Button aria-label={`Aksi untuk ${quiz.title}`} size="icon-sm" type="button" variant="ghost" />}><Ellipsis /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-52"><DropdownMenuGroup>{quiz.status === "draft" ? <DropdownMenuItem disabled={quiz.questionCount === 0} onClick={() => onAction("publish")}>Terbitkan</DropdownMenuItem> : null}{quiz.status === "published" ? <DropdownMenuItem onClick={() => onAction("unpublish")}>Batalkan terbit</DropdownMenuItem> : null}{quiz.status !== "archived" ? <DropdownMenuItem onClick={() => onAction("archive")}><Archive />Arsipkan</DropdownMenuItem> : <DropdownMenuItem onClick={() => onAction("restore")}>Pulihkan</DropdownMenuItem>}<DropdownMenuSeparator /><DropdownMenuItem onClick={() => onAction("delete")} variant="destructive"><Trash2 />Hapus</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
      </div>
    </article>
  );
}

function KaptenQuizSubjectPageModule({ catalogue, session, subject }: { catalogue: KaptenQuiz[]; session: SessionContext; subject: KaptenSubject }) {
  const router = useRouter();
  const [quizzes, setQuizzes] = useState(() => catalogue.filter((quiz) => quiz.subjectCode === subject.code));
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [intent, setIntent] = useState<"publish" | "unpublish" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const visibleQuizzes = quizzes.filter((quiz) => !query.trim() || [quiz.title, quiz.status, quiz.primaryMetric].some((value) => value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  const selectedQuizzes = quizzes.filter((quiz) => selectedIds.has(quiz.id));
  const canPublish = selectedQuizzes.length > 0 && selectedQuizzes.every((quiz) => quiz.status === "draft" && quiz.questionCount > 0);
  const canUnpublish = selectedQuizzes.length > 0 && selectedQuizzes.every((quiz) => quiz.status === "published");
  const areAllVisibleSelected = visibleQuizzes.length > 0 && visibleQuizzes.every((quiz) => selectedIds.has(quiz.id));
  const eligibilityReason = selectedQuizzes.length > 0 && !canPublish && !canUnpublish ? "Pilih hanya quiz draf yang memiliki soal atau quiz yang sudah diterbitkan." : null;
  const confirmation = intent === "publish" ? { confirm: "Terbitkan semua", description: `${selectedQuizzes.length} quiz akan tersedia untuk siswa.`, title: "Terbitkan quiz terpilih?" } : { confirm: "Batalkan terbit", description: `${selectedQuizzes.length} quiz kembali menjadi draf dan tidak tersedia untuk siswa.`, title: "Batalkan penerbitan quiz?" };

  const toggleSelected = (id: string, checked: boolean) => { setNotice(null); setSelectedIds((current) => { const next = new Set(current); if (checked) next.add(id); else next.delete(id); return next; }); };
  const toggleAllVisible = (checked: boolean) => { setNotice(null); setSelectedIds((current) => { const next = new Set(current); visibleQuizzes.forEach((quiz) => checked ? next.add(quiz.id) : next.delete(quiz.id)); return next; }); };
  const confirmLifecycle = async () => {
    if (!intent || isPending || !selectedQuizzes.length) return;
    setIsPending(true); setError(null);
    try {
      const result = intent === "publish" ? await bulkPublishStandaloneQuizzesAction(selectedQuizzes.map((quiz) => quiz.id)) : await bulkUnpublishStandaloneQuizzesAction(selectedQuizzes.map((quiz) => quiz.id));
      if (!result.ok) { setError(result.message); return; }
      const affectedIds = new Set(result.affectedIds);
      setQuizzes((current) => current.map((quiz) => affectedIds.has(quiz.id) ? { ...quiz, status: result.status } : quiz));
      setSelectedIds(new Set()); setNotice(result.message); setIntent(null); router.refresh();
    } catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : "Status quiz tidak dapat diubah saat ini. Coba lagi."); }
    finally { setIsPending(false); }
  };
  const applyQuizAction = async (quiz: KaptenQuiz, action: "archive" | "delete" | "publish" | "restore" | "unpublish") => {
    if (isPending) return;
    if (action === "delete") { setNotice("Hapus Quiz belum tersedia."); return; }
    setIsPending(true); setError(null);
    try {
      if (action === "publish" || action === "unpublish") {
        const result = action === "publish" ? await bulkPublishStandaloneQuizzesAction([quiz.id]) : await bulkUnpublishStandaloneQuizzesAction([quiz.id]);
        if (!result.ok) { setError(result.message); return; }
        setQuizzes((current) => current.map((item) => item.id === quiz.id ? { ...item, status: result.status } : item)); setNotice(result.message);
      } else {
        const result = await updateStandaloneQuizLifecycleAction(quiz.id, action);
        if (!result.ok) { setError(result.message); return; }
        setQuizzes((current) => current.map((item) => item.id === quiz.id ? result.quiz : item)); setNotice(action === "archive" ? "Quiz telah diarsipkan." : "Quiz dipulihkan sebagai draf.");
      }
      router.refresh();
    } catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : "Status Quiz tidak dapat diubah saat ini. Coba lagi."); }
    finally { setIsPending(false); }
  };

  return (
    <MentorWorkspaceShell activeLabel="Quiz" breadcrumbLabel={`${subject.code} · Quiz`} searchPlaceholder="Cari quiz..." session={session}>
      <section className="space-y-5">
        <Button aria-label="Kembali ke semua quiz" render={<Link href="/mentor/quiz" />} size="icon-sm" title="Kembali ke semua quiz" variant="ghost"><ChevronLeft /></Button>
        <PageIntro action={<Button render={<Link href={`/mentor/quiz/create?subject=${subject.code}`} />} variant="brand"><Plus />Buat Quiz</Button>} eyebrow={getSubjectCategory(subject.code)} title={subject.name} />
        <SearchInput onChange={setQuery} placeholder="Cari judul, jumlah soal, atau status..." value={query} />
      </section>
      <section className="mt-5 space-y-3">
        {visibleQuizzes.length && selectedQuizzes.length ? <div className="flex items-center gap-3 rounded-2xl border border-primary-100 bg-primary-50/35 px-4 py-3"><Checkbox aria-label="Pilih semua quiz yang terlihat" checked={areAllVisibleSelected} onCheckedChange={(checked) => toggleAllVisible(checked === true)} /><span className="text-sm font-semibold text-secondary-700">Pilih semua hasil</span></div> : null}
        {selectedQuizzes.length ? <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary-200 bg-white px-4 py-3"><span className="text-sm font-semibold text-secondary-900">{selectedQuizzes.length} dipilih</span><Button disabled={!canPublish || isPending} onClick={() => { setError(null); setIntent("publish"); }} size="sm" type="button" variant="brand">Terbitkan</Button><Button disabled={!canUnpublish || isPending} onClick={() => { setError(null); setIntent("unpublish"); }} size="sm" type="button" variant="brandOutline">Batalkan terbit</Button><Button disabled={isPending} onClick={() => setSelectedIds(new Set())} size="sm" type="button" variant="ghost">Hapus pilihan</Button>{eligibilityReason ? <p className="basis-full text-sm text-secondary-600" role="status">{eligibilityReason}</p> : null}</div> : null}
        {notice ? <p className="rounded-2xl border border-primary-200 bg-primary-50/40 px-4 py-3 text-sm font-medium text-primary-900" role="status">{notice}</p> : null}
        {visibleQuizzes.length ? visibleQuizzes.map((quiz) => <QuizRow key={quiz.id} quiz={quiz} onAction={(action) => { void applyQuizAction(quiz, action); }} onSelectedChange={(checked) => toggleSelected(quiz.id, checked)} selected={selectedIds.has(quiz.id)} />) : <div className="rounded-3xl border border-dashed border-primary-300 bg-primary-50/40 px-5 py-10 text-center text-sm text-secondary-600">Tidak ada quiz yang cocok dengan pencarian ini.</div>}
      </section>
      <Dialog onOpenChange={(open) => { if (!open && !isPending) { setError(null); setIntent(null); } }} open={Boolean(intent)}>
        <DialogContent showCloseButton={!isPending}><DialogHeader><DialogTitle>{confirmation.title}</DialogTitle><DialogDescription>{confirmation.description}</DialogDescription></DialogHeader>{error ? <div aria-live="assertive" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</div> : null}<DialogFooter><DialogClose disabled={isPending} render={<Button type="button" variant="brandOutline" />}>Batal</DialogClose><Button disabled={isPending || (intent === "publish" ? !canPublish : !canUnpublish)} onClick={confirmLifecycle} type="button" variant="brand">{isPending ? "Memproses..." : confirmation.confirm}</Button></DialogFooter></DialogContent>
      </Dialog>
    </MentorWorkspaceShell>
  );
}

export { KaptenQuizPageModule, KaptenQuizSubjectPageModule };

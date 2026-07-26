"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, BarChart3, ChevronLeft, Ellipsis, FilePenLine, ListChecks, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { CatalogueFilter, CatalogueSearchInput, PageIntro, PaginationControls, StatusPill } from "@/modules/mentor/components/kapten-ui";
import type { KaptenQuiz, KaptenSubject } from "@/modules/mentor/mock-data";
import {
  bulkPublishStandaloneQuizzesAction,
  bulkUnpublishStandaloneQuizzesAction,
  updateStandaloneQuizLifecycleAction,
} from "@/modules/mentor/quiz-actions";
import { getSubjectCategory } from "@/modules/mentor/subject-category";

function SubjectCard({ subject }: { subject: KaptenSubject }) {
  const subjectCategory = getSubjectCategory(subject.code);

  return (
    <Link className="group flex min-h-32 flex-col rounded-3xl border border-primary-200 bg-white p-5 shadow-sm transition-[transform,border-color,background-color,box-shadow] duration-200 motion-safe:hover:-translate-y-0.5 hover:border-primary-500 hover:bg-primary-50/40 hover:shadow-[0_18px_38px_-28px_rgba(1,76,56,0.42)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-300/35" href={`/mentor/quiz/subject/${subject.slug}`}>
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
    <MentorWorkspaceShell activeLabel="Kuis" breadcrumbLabel="Kuis" searchPlaceholder="Cari kuis atau subjek..." session={session}>
      <PageIntro title="Kuis" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {subjects.map((subject) => <SubjectCard key={subject.slug} subject={subject} />)}
      </div>
    </MentorWorkspaceShell>
  );
}

function QuizRow({ quiz, onAction, onSelectedChange, selectionMode, selected }: { quiz: KaptenQuiz; onAction: (action: "archive" | "delete" | "publish" | "restore" | "unpublish") => void; onSelectedChange: (checked: boolean) => void; selectionMode: boolean; selected: boolean }) {
  return (
    <article className={`grid gap-4 rounded-3xl border border-primary-100 bg-white p-4 shadow-sm transition-[transform,border-color,box-shadow] duration-200 motion-safe:hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-[0_18px_38px_-28px_rgba(1,76,56,0.38)] focus-within:border-primary-200 focus-within:shadow-[0_18px_38px_-28px_rgba(1,76,56,0.38)] ${selectionMode ? "sm:grid-cols-[auto_minmax(0,1fr)_auto]" : "sm:grid-cols-[minmax(0,1fr)_auto]"} sm:items-center`}>
      {selectionMode ? <Checkbox aria-label={`Pilih ${quiz.title}`} checked={selected} onCheckedChange={(checked) => onSelectedChange(checked === true)} /> : null}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-secondary-900">{quiz.title}</h2>
          <StatusPill status={quiz.status} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-secondary-500">
          {quiz.opensAt ? <span>Buka {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(quiz.opensAt))}</span> : null}
          {quiz.closesAt ? <span>Tutup {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(quiz.closesAt))}</span> : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Button render={<Link href={`/mentor/quiz/${quiz.id}/results`} />} size="sm" title="Lihat hasil siswa" variant="brandOutline"><BarChart3 />Hasil</Button>
        <Button aria-label="Edit quiz" render={<Link href={quiz.href} />} size="icon-sm" title="Edit quiz" variant="brand"><Pencil /></Button>
        <DropdownMenu><DropdownMenuTrigger render={<Button aria-label={`Aksi untuk ${quiz.title}`} size="icon-sm" type="button" variant="ghost" />}><Ellipsis /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-52"><DropdownMenuGroup>{quiz.status === "draft" ? <DropdownMenuItem disabled={quiz.questionCount === 0} onClick={() => onAction("publish")}><Upload />Terbitkan</DropdownMenuItem> : null}{quiz.status === "published" ? <DropdownMenuItem onClick={() => onAction("unpublish")}><FilePenLine />Batalkan terbit</DropdownMenuItem> : null}{quiz.status !== "archived" ? <DropdownMenuItem onClick={() => onAction("archive")}><Archive />Arsipkan</DropdownMenuItem> : <DropdownMenuItem onClick={() => onAction("restore")}>Pulihkan</DropdownMenuItem>}<DropdownMenuItem disabled variant="destructive"><Trash2 />Hapus</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
      </div>
    </article>
  );
}

function KaptenQuizSubjectPageModule({ catalogue, session, subject }: { catalogue: KaptenQuiz[]; session: SessionContext; subject: KaptenSubject }) {
  const router = useRouter();
  const [quizzes, setQuizzes] = useState(() => catalogue.filter((quiz) => quiz.subjectCode === subject.code));
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [intent, setIntent] = useState<"publish" | "unpublish" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [questionFilter, setQuestionFilter] = useState("");
  const visibleQuizzes = quizzes.filter((quiz) =>
    (!query.trim() || [quiz.title, quiz.status, quiz.primaryMetric].some((value) => value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))
    && (!statusFilter || quiz.status === statusFilter)
    && (!questionFilter || (questionFilter === "ready" ? quiz.questionCount > 0 : quiz.questionCount === 0))
  );
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(visibleQuizzes.length / pageSize));
  const pagedQuizzes = visibleQuizzes.slice((page - 1) * pageSize, page * pageSize);
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
      setSelectedIds(new Set()); setSelectionMode(false); setNotice(result.message); setIntent(null); router.refresh();
    } catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : "Status quiz tidak dapat diubah saat ini. Coba lagi."); }
    finally { setIsPending(false); }
  };
  const applyQuizAction = async (quiz: KaptenQuiz, action: "archive" | "delete" | "publish" | "restore" | "unpublish") => {
    if (isPending) return;
    if (action === "delete") return;
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
    <MentorWorkspaceShell activeLabel="Kuis" breadcrumbLabel={`${subject.code} · Kuis`} searchPlaceholder="Cari kuis..." session={session}>
      <div className="space-y-3">
      <section className="space-y-3">
        <Button aria-label="Kembali ke semua quiz" render={<Link href="/mentor/quiz" />} size="icon-sm" title="Kembali ke semua quiz" variant="ghost"><ChevronLeft /></Button>
        <PageIntro
          action={
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      aria-label="Buat quiz baru"
                      render={<Link href={`/mentor/quiz/create?subject=${subject.code}`} />}
                      size="icon"
                      variant="brand"
                    />
                  }
                >
                  <Plus />
                </TooltipTrigger>
                <TooltipContent>Buat quiz baru</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          }
          title={subject.name}
        />
        <CatalogueSearchInput onChange={(value) => { setQuery(value); setPage(1); setSelectedIds(new Set()); }} placeholder="Cari judul, jumlah soal, atau status..." value={query} />
        <div className="flex flex-wrap items-center gap-2">
          <CatalogueFilter
            label="Filter status"
            onValueChange={(value) => { setStatusFilter(value); setPage(1); setSelectedIds(new Set()); }}
            options={[
              { label: "Semua status", value: "" },
              { label: "Draf", value: "draft" },
              { label: "Diterbitkan", value: "published" },
              { label: "Diarsipkan", value: "archived" },
              { label: "Terjadwal", value: "scheduled" },
            ]}
            value={statusFilter}
          />
          <CatalogueFilter
            label="Filter isi soal"
            onValueChange={(value) => { setQuestionFilter(value); setPage(1); setSelectedIds(new Set()); }}
            options={[
              { label: "Semua isi soal", value: "" },
              { label: "Memiliki soal", value: "ready" },
              { label: "Belum memiliki soal", value: "empty" },
            ]}
            value={questionFilter}
          />
          {!selectionMode ? <Button aria-label="Pilih beberapa quiz" className="ml-auto" onClick={() => setSelectionMode(true)} size="icon-sm" title="Pilih beberapa quiz" type="button" variant="brandOutline"><ListChecks /></Button> : null}
        </div>
      </section>
      <section className="space-y-3">
        {selectionMode ? <div className="flex flex-wrap items-center gap-5 rounded-3xl border border-primary-100 bg-primary-50/35 px-6 py-4"><Button aria-label="Keluar dari mode pilih" onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }} size="icon-xs" type="button" variant="ghost"><X /></Button><span className="text-sm font-semibold text-secondary-900">{selectedQuizzes.length} dipilih</span><Checkbox aria-label="Pilih semua quiz yang terlihat" checked={areAllVisibleSelected} onCheckedChange={(checked) => toggleAllVisible(checked === true)} /><span className="text-sm font-semibold text-secondary-700">Semua hasil</span><div className="ml-auto flex flex-wrap items-center gap-3"><Button disabled={!canPublish || isPending} onClick={() => { setError(null); setIntent("publish"); }} size="sm" type="button" variant="brand">Terbitkan</Button><Button disabled={!canUnpublish || isPending} onClick={() => { setError(null); setIntent("unpublish"); }} size="sm" type="button" variant="brandOutline">Batalkan terbit</Button><Button disabled={isPending} onClick={() => setSelectedIds(new Set())} size="sm" type="button" variant="ghost">Hapus pilihan</Button></div>{eligibilityReason ? <p className="basis-full text-sm text-secondary-600" role="status">{eligibilityReason}</p> : null}</div> : null}
        {notice ? <p className="rounded-2xl border border-primary-200 bg-primary-50/40 px-4 py-3 text-sm font-medium text-primary-900" role="status">{notice}</p> : null}
        {pagedQuizzes.length ? pagedQuizzes.map((quiz) => <QuizRow key={quiz.id} quiz={quiz} onAction={(action) => { void applyQuizAction(quiz, action); }} onSelectedChange={(checked) => toggleSelected(quiz.id, checked)} selectionMode={selectionMode} selected={selectedIds.has(quiz.id)} />) : quizzes.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-primary-300 bg-primary-50/40 px-5 py-12 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary-100 text-primary-800"><ListChecks className="size-6" /></div>
            <h2 className="mt-4 text-lg font-semibold text-secondary-900">Belum ada quiz di subject ini</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-secondary-600">Mulai susun latihan pertama untuk membantu siswa menguatkan pemahaman mereka.</p>
            <Button className="mt-5" render={<Link href={`/mentor/quiz/create?subject=${subject.code}`} />} size="sm" variant="brand"><Plus />Buat quiz pertama</Button>
          </div>
        ) : <div className="rounded-3xl border border-dashed border-primary-300 bg-primary-50/40 px-5 py-10 text-center text-sm text-secondary-600">Tidak ada quiz yang cocok dengan pencarian ini.</div>}
        <PaginationControls onPageChange={setPage} page={page} pageCount={pageCount} />
      </section>
      </div>
      <Dialog onOpenChange={(open) => { if (!open && !isPending) { setError(null); setIntent(null); } }} open={Boolean(intent)}>
        <DialogContent showCloseButton={!isPending}><DialogHeader><DialogTitle>{confirmation.title}</DialogTitle><DialogDescription>{confirmation.description}</DialogDescription></DialogHeader>{error ? <div aria-live="assertive" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</div> : null}<DialogFooter><DialogClose disabled={isPending} render={<Button type="button" variant="brandOutline" />}>Batal</DialogClose><Button disabled={isPending || (intent === "publish" ? !canPublish : !canUnpublish)} onClick={confirmLifecycle} type="button" variant="brand">{isPending ? "Memproses..." : confirmation.confirm}</Button></DialogFooter></DialogContent>
      </Dialog>
    </MentorWorkspaceShell>
  );
}

export { KaptenQuizPageModule, KaptenQuizSubjectPageModule };

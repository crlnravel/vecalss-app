"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, ChevronLeft, ChevronRight, Ellipsis, FilePenLine, ListChecks, Pencil, Plus, Trash2, Upload, X } from "@/lib/icons";
import { useReducer } from "react";

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

const quizDateFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeZone: "Asia/Jakarta",
  timeStyle: "short",
});

type QuizCatalogueState = {
  quizzes: KaptenQuiz[];
  query: string;
  page: number;
  selectedIds: Set<string>;
  intent: "publish" | "unpublish" | null;
  notice: string | null;
  error: string | null;
  isPending: boolean;
  selectionMode: boolean;
  statusFilter: string;
};

type QuizCatalogueAction =
  | { type: "patch"; patch: Partial<QuizCatalogueState> }
  | { type: "toggle-selected"; checked: boolean; id: string }
  | { type: "toggle-all-visible"; checked: boolean; ids: string[] }
  | { type: "update-status"; ids: string[]; status: KaptenQuiz["status"] }
  | { type: "replace-quiz"; quiz: KaptenQuiz };

function quizCatalogueReducer(state: QuizCatalogueState, action: QuizCatalogueAction): QuizCatalogueState {
  if (action.type === "patch") return { ...state, ...action.patch };
  if (action.type === "toggle-selected") {
    const selectedIds = new Set(state.selectedIds);
    if (action.checked) selectedIds.add(action.id);
    else selectedIds.delete(action.id);
    return { ...state, notice: null, selectedIds };
  }
  if (action.type === "toggle-all-visible") {
    const selectedIds = new Set(state.selectedIds);
    action.ids.forEach((id) => action.checked ? selectedIds.add(id) : selectedIds.delete(id));
    return { ...state, notice: null, selectedIds };
  }
  if (action.type === "update-status") {
    const affectedIds = new Set(action.ids);
    return {
      ...state,
      quizzes: state.quizzes.map((quiz) => affectedIds.has(quiz.id) ? { ...quiz, status: action.status } : quiz),
    };
  }
  return {
    ...state,
    quizzes: state.quizzes.map((quiz) => quiz.id === action.quiz.id ? action.quiz : quiz),
  };
}

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
    <article className={`group grid gap-4 rounded-3xl border border-primary-100 bg-white p-4 shadow-sm transition-[transform,border-color,box-shadow] duration-200 motion-safe:hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-[0_18px_38px_-28px_rgba(1,76,56,0.38)] focus-within:border-primary-200 focus-within:shadow-[0_18px_38px_-28px_rgba(1,76,56,0.38)] ${selectionMode ? "sm:grid-cols-[auto_minmax(0,1fr)_auto]" : "sm:grid-cols-[minmax(0,1fr)_auto]"} sm:items-center`}>
      {selectionMode ? <Checkbox aria-label={`Pilih ${quiz.title}`} checked={selected} onCheckedChange={(checked) => onSelectedChange(checked === true)} /> : null}
      <Link aria-label={`Buka ${quiz.title}`} className="group/link flex min-w-0 items-center justify-between gap-4 rounded-2xl outline-none focus-visible:ring-4 focus-visible:ring-primary-700/20" href={quiz.href}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <ListChecks className="size-4 shrink-0 text-primary-800" />
            <h2 className="truncate font-semibold text-secondary-900">{quiz.title}</h2>
            <StatusPill status={quiz.status} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-secondary-500">
            <span>{quiz.primaryMetric}</span>
            {quiz.opensAt ? <span>Buka {quizDateFormatter.format(new Date(quiz.opensAt))}</span> : null}
            {quiz.closesAt ? <span>Tutup {quizDateFormatter.format(new Date(quiz.closesAt))}</span> : null}
          </div>
        </div>
        <ChevronRight aria-hidden className="size-5 shrink-0 text-secondary-400 transition-transform group-hover/link:translate-x-0.5" />
      </Link>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Button render={<Link href={`/mentor/quiz/${quiz.id}/results`} />} size="sm" title="Lihat hasil siswa" variant="brandOutline"><BarChart3 />Hasil</Button>
        <Button aria-label="Edit quiz" render={<Link href={quiz.href} />} size="icon-sm" title="Edit quiz" variant="brand"><Pencil /></Button>
        {quiz.status === "draft" || quiz.status === "published" ? <DropdownMenu><DropdownMenuTrigger render={<Button aria-label={`Aksi untuk ${quiz.title}`} size="icon-sm" type="button" variant="ghost" />}><Ellipsis /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-52"><DropdownMenuGroup>{quiz.status === "draft" ? <DropdownMenuItem disabled={quiz.questionCount === 0} onClick={() => onAction("publish")}><Upload />Terbitkan</DropdownMenuItem> : null}{quiz.status === "published" ? <DropdownMenuItem onClick={() => onAction("unpublish")}><FilePenLine />Batalkan terbit</DropdownMenuItem> : null}<DropdownMenuItem disabled variant="destructive"><Trash2 />Hapus</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu> : null}
      </div>
    </article>
  );
}

function KaptenQuizSubjectPageModule({ catalogue, session, subject }: { catalogue: KaptenQuiz[]; session: SessionContext; subject: KaptenSubject }) {
  const router = useRouter();
  const [catalogueState, dispatch] = useReducer(quizCatalogueReducer, {
    error: null,
    intent: null,
    isPending: false,
    notice: null,
    page: 1,
    query: "",
    quizzes: catalogue.filter((quiz) => quiz.subjectCode === subject.code),
    selectedIds: new Set<string>(),
    selectionMode: false,
    statusFilter: "",
  });
  const {
    error,
    intent,
    isPending,
    notice,
    page,
    query,
    quizzes,
    selectedIds,
    selectionMode,
    statusFilter,
  } = catalogueState;
  const visibleQuizzes = quizzes.filter((quiz) =>
    (!query.trim() || [quiz.title, quiz.status, quiz.primaryMetric].some((value) => value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))
    && (!statusFilter || quiz.status === statusFilter)
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

  const toggleSelected = (id: string, checked: boolean) => dispatch({ checked, id, type: "toggle-selected" });
  const toggleAllVisible = (checked: boolean) => dispatch({ checked, ids: visibleQuizzes.map((quiz) => quiz.id), type: "toggle-all-visible" });
  const confirmLifecycle = async () => {
    if (!intent || isPending || !selectedQuizzes.length) return;
    dispatch({ patch: { error: null, isPending: true }, type: "patch" });
    try {
      const result = intent === "publish" ? await bulkPublishStandaloneQuizzesAction(selectedQuizzes.map((quiz) => quiz.id)) : await bulkUnpublishStandaloneQuizzesAction(selectedQuizzes.map((quiz) => quiz.id));
      if (!result.ok) { dispatch({ patch: { error: result.message }, type: "patch" }); return; }
      const affectedIds = new Set(result.affectedIds);
      dispatch({ ids: [...affectedIds], status: result.status, type: "update-status" });
      dispatch({ patch: { intent: null, notice: result.message, selectedIds: new Set(), selectionMode: false }, type: "patch" });
      router.refresh();
    } catch (caughtError) { dispatch({ patch: { error: caughtError instanceof Error ? caughtError.message : "Status quiz tidak dapat diubah saat ini. Coba lagi." }, type: "patch" }); }
    finally { dispatch({ patch: { isPending: false }, type: "patch" }); }
  };
  const applyQuizAction = async (quiz: KaptenQuiz, action: "archive" | "delete" | "publish" | "restore" | "unpublish") => {
    if (isPending) return;
    if (action === "delete") return;
    dispatch({ patch: { error: null, isPending: true }, type: "patch" });
    try {
      if (action === "publish" || action === "unpublish") {
        const result = action === "publish" ? await bulkPublishStandaloneQuizzesAction([quiz.id]) : await bulkUnpublishStandaloneQuizzesAction([quiz.id]);
        if (!result.ok) { dispatch({ patch: { error: result.message }, type: "patch" }); return; }
        dispatch({ ids: [quiz.id], status: result.status, type: "update-status" });
        dispatch({ patch: { notice: result.message }, type: "patch" });
      } else {
        const result = await updateStandaloneQuizLifecycleAction(quiz.id, action);
        if (!result.ok) { dispatch({ patch: { error: result.message }, type: "patch" }); return; }
        dispatch({ quiz: result.quiz, type: "replace-quiz" });
        dispatch({ patch: { notice: action === "archive" ? "Quiz telah diarsipkan." : "Quiz dipulihkan sebagai draf." }, type: "patch" });
      }
      router.refresh();
    } catch (caughtError) { dispatch({ patch: { error: caughtError instanceof Error ? caughtError.message : "Status Quiz tidak dapat diubah saat ini. Coba lagi." }, type: "patch" }); }
    finally { dispatch({ patch: { isPending: false }, type: "patch" }); }
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
        <CatalogueSearchInput onChange={(value) => dispatch({ patch: { page: 1, query: value, selectedIds: new Set() }, type: "patch" })} placeholder="Cari judul, jumlah soal, atau status..." value={query} />
        <div className="flex flex-wrap items-center gap-2">
          <CatalogueFilter
            label="Filter status"
            onValueChange={(value) => dispatch({ patch: { page: 1, selectedIds: new Set(), statusFilter: value }, type: "patch" })}
            options={[
              { label: "Semua status", value: "" },
              { label: "Draf", value: "draft" },
              { label: "Diterbitkan", value: "published" },
            ]}
            value={statusFilter}
          />
          {!selectionMode ? <Button aria-label="Pilih beberapa quiz" className="ml-auto" onClick={() => dispatch({ patch: { selectionMode: true }, type: "patch" })} size="icon-sm" title="Pilih beberapa quiz" type="button" variant="brandOutline"><ListChecks /></Button> : null}
        </div>
      </section>
      <section className="space-y-3">
        {selectionMode ? <div className="flex flex-wrap items-center gap-5 rounded-3xl border border-primary-100 bg-primary-50/35 px-6 py-4"><Button aria-label="Keluar dari mode pilih" onClick={() => dispatch({ patch: { selectedIds: new Set(), selectionMode: false }, type: "patch" })} size="icon-xs" type="button" variant="ghost"><X /></Button><span className="text-sm font-semibold text-secondary-900">{selectedQuizzes.length} dipilih</span><Checkbox aria-label="Pilih semua quiz yang terlihat" checked={areAllVisibleSelected} onCheckedChange={(checked) => toggleAllVisible(checked === true)} /><span className="text-sm font-semibold text-secondary-700">Semua hasil</span><div className="ml-auto flex flex-wrap items-center gap-3"><Button disabled={!canPublish || isPending} onClick={() => dispatch({ patch: { error: null, intent: "publish" }, type: "patch" })} size="sm" type="button" variant="brand">Terbitkan</Button><Button disabled={!canUnpublish || isPending} onClick={() => dispatch({ patch: { error: null, intent: "unpublish" }, type: "patch" })} size="sm" type="button" variant="brandOutline">Batalkan terbit</Button><Button disabled={isPending} onClick={() => dispatch({ patch: { selectedIds: new Set() }, type: "patch" })} size="sm" type="button" variant="ghost">Hapus pilihan</Button></div>{eligibilityReason ? <p className="basis-full text-sm text-secondary-600" role="status">{eligibilityReason}</p> : null}</div> : null}
        {notice ? <p className="rounded-2xl border border-primary-200 bg-primary-50/40 px-4 py-3 text-sm font-medium text-primary-900" role="status">{notice}</p> : null}
        {pagedQuizzes.length ? pagedQuizzes.map((quiz) => <QuizRow key={quiz.id} quiz={quiz} onAction={(action) => { void applyQuizAction(quiz, action); }} onSelectedChange={(checked) => toggleSelected(quiz.id, checked)} selectionMode={selectionMode} selected={selectedIds.has(quiz.id)} />) : quizzes.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-primary-300 bg-primary-50/40 px-5 py-12 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary-100 text-primary-800"><ListChecks className="size-6" /></div>
            <h2 className="mt-4 text-lg font-semibold text-secondary-900">Belum ada quiz di subject ini</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-secondary-600">Mulai susun latihan pertama untuk membantu siswa menguatkan pemahaman mereka.</p>
            <Button className="mt-5" render={<Link href={`/mentor/quiz/create?subject=${subject.code}`} />} size="sm" variant="brand"><Plus />Buat quiz pertama</Button>
          </div>
        ) : <div className="rounded-3xl border border-dashed border-primary-300 bg-primary-50/40 px-5 py-10 text-center text-sm text-secondary-600">Tidak ada quiz yang cocok dengan pencarian ini.</div>}
        <PaginationControls onPageChange={(nextPage) => dispatch({ patch: { page: nextPage }, type: "patch" })} page={page} pageCount={pageCount} />
      </section>
      </div>
      <Dialog onOpenChange={(open) => { if (!open && !isPending) dispatch({ patch: { error: null, intent: null }, type: "patch" }); }} open={Boolean(intent)}>
        <DialogContent pending={isPending} showCloseButton={!isPending} variant="info"><DialogHeader><DialogTitle>{confirmation.title}</DialogTitle><DialogDescription>{confirmation.description}</DialogDescription></DialogHeader>{error ? <div aria-live="assertive" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</div> : null}<DialogFooter><DialogClose disabled={isPending} render={<Button type="button" variant="brandOutline" />}>Batal</DialogClose><Button disabled={isPending || (intent === "publish" ? !canPublish : !canUnpublish)} onClick={confirmLifecycle} type="button" variant="brand">{isPending ? "Memproses..." : confirmation.confirm}</Button></DialogFooter></DialogContent>
      </Dialog>
    </MentorWorkspaceShell>
  );
}

export { KaptenQuizPageModule, KaptenQuizSubjectPageModule };

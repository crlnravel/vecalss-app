"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ListChecks, Plus, X } from "@/lib/icons";
import { useMemo, useReducer } from "react";

import {
  ReferenceEmptyState,
  ReferencePageHeader,
  ReferenceStatusBadge,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import { REFERENCE_SURFACE_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { MentorBadge } from "@/components/ui/mentor-badge";
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
import { CatalogueSearchInput, PaginationControls } from "@/modules/mentor/components/kapten-ui";
import type { KaptenQuiz, KaptenSubject } from "@/modules/mentor/mock-data";
import { bulkPublishStandaloneQuizzesAction, bulkUnpublishStandaloneQuizzesAction } from "@/modules/mentor/quiz-actions";
import { getSubjectCategory } from "@/modules/mentor/subject-category";
import { cn } from "@/lib/utils";

type QuizStatusFilter = "" | "draft" | "published";

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
  statusFilter: QuizStatusFilter;
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

const quizStatusTabs: Array<{ label: string; value: QuizStatusFilter }> = [
  { label: "Semua", value: "" },
  { label: "Diterbitkan", value: "published" },
  { label: "Draf", value: "draft" },
];

function QuizStatusTabs({
  items,
  onChange,
  value,
}: {
  items: readonly KaptenQuiz[];
  onChange: (value: QuizStatusFilter) => void;
  value: QuizStatusFilter;
}) {
  const counts = useMemo(() => ({
    "": items.length,
    draft: items.filter((item) => item.status === "draft").length,
    published: items.filter((item) => item.status === "published").length,
  }), [items]);

  return (
    <div
      aria-label="Filter status Kuis"
      className="flex min-w-0 items-center gap-1 overflow-x-auto pb-1"
      role="group"
    >
      {quizStatusTabs.map((tab) => {
        const isActive = value === tab.value;

        return (
          <button
            aria-pressed={isActive}
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold text-secondary-500 transition-[background-color,color,box-shadow] duration-200 hover:text-secondary-900 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-300/35",
              isActive && "bg-white text-secondary-900 shadow-[0_12px_28px_-22px_rgba(23,107,77,0.72)]",
            )}
            key={tab.value || "all"}
            onClick={() => onChange(tab.value)}
            type="button"
          >
            <span>{tab.label}</span>
            <span className="text-xs font-medium text-secondary-500">({counts[tab.value]})</span>
          </button>
        );
      })}
    </div>
  );
}

function SubjectCard({ subject }: { subject: KaptenSubject }) {
  const subjectCategory = getSubjectCategory(subject.code);

  return (
    <Link
      className={cn(
        REFERENCE_SURFACE_CLASS_NAMES.raised,
        REFERENCE_SURFACE_CLASS_NAMES.raisedInteractive,
        "group flex min-w-0 flex-col p-4",
      )}
      href={`/mentor/quiz/subject/${subject.slug}`}
    >
      <div>
        <MentorBadge
          className="bg-[linear-gradient(135deg,#b7ddc3_0%,#eef8f1_100%)] !font-normal text-[#176b4d]"
          size="sm"
          tone="category"
        >
          {subjectCategory}
        </MentorBadge>
      </div>
      <h2 className="mt-4 text-xl font-semibold text-secondary-900">{subject.name}</h2>
    </Link>
  );
}

function KaptenQuizPageModule({ session, subjects }: { session: SessionContext; subjects: KaptenSubject[] }) {
  return (
    <MentorWorkspaceShell activeLabel="Kuis" breadcrumbLabel="Kuis" searchPlaceholder="Cari kuis atau subjek..." session={session} sidebarAppearance="reference">
      <div className="space-y-8">
        <ReferencePageHeader
          description="Kelola latihan mandiri berdasarkan subjek dan kesiapan siswa."
          title="Kuis"
        />
        {subjects.length ? (
          <section aria-label="Daftar subjek Kuis" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {subjects.map((subject) => <SubjectCard key={subject.slug} subject={subject} />)}
          </section>
        ) : (
          <ReferenceSurface className="min-h-56" variant="inset">
            <ReferenceEmptyState
              action={
                <Button nativeButton={false} render={<Link href="/mentor/quiz/create" />} size="sm" variant="brand">
                  <Plus />
                  Buat Kuis pertama
                </Button>
              }
              description="Buat latihan pertama untuk mulai menyusun pengalaman belajar siswa."
              icon={ListChecks}
              title="Belum ada subjek Kuis"
            />
          </ReferenceSurface>
        )}
      </div>
    </MentorWorkspaceShell>
  );
}

function QuizRow({ onSelectedChange, quiz, selectionMode, selected }: { onSelectedChange: (checked: boolean) => void; quiz: KaptenQuiz; selectionMode: boolean; selected: boolean }) {
  return (
    <article className={cn(
      REFERENCE_SURFACE_CLASS_NAMES.raised,
      REFERENCE_SURFACE_CLASS_NAMES.raisedInteractive,
      "grid min-w-0 gap-4 p-5",
      selectionMode ? "sm:grid-cols-[auto_minmax(0,1fr)]" : "sm:grid-cols-1",
      "sm:items-center",
    )}>
      {selectionMode ? <Checkbox aria-label={`Pilih ${quiz.title}`} checked={selected} onCheckedChange={(checked) => onSelectedChange(checked === true)} /> : null}
      <Link aria-label={`Buka ${quiz.title}`} className="group flex min-w-0 items-start justify-between gap-4 rounded-2xl outline-none focus-visible:ring-4 focus-visible:ring-primary-700/20 sm:items-center" href={quiz.href}>
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-800">
            <ListChecks aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-secondary-900">{quiz.title}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <ReferenceStatusBadge appearance="mentor" size="sm" status={quiz.status} />
            </div>
          </div>
        </div>
        <ChevronRight aria-hidden="true" className="mt-1 size-5 shrink-0 text-secondary-400 transition-transform duration-200 group-hover:translate-x-0.5 group-focus-visible:translate-x-0.5 sm:mt-0" />
      </Link>
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
  return (
    <MentorWorkspaceShell activeLabel="Kuis" breadcrumbLabel={subject.code} searchPlaceholder="Cari kuis..." session={session} sidebarAppearance="reference">
      <div className="space-y-8">
        <div className="flex min-w-0 items-start gap-3">
          <Button aria-label="Kembali ke semua quiz" className="mt-1 shrink-0" nativeButton={false} render={<Link href="/mentor/quiz" />} size="icon" title="Kembali ke semua quiz" variant="ghost"><ChevronLeft /></Button>
          <ReferencePageHeader
            className="min-w-0 flex-1"
            actions={
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label="Buat quiz baru"
                        nativeButton={false}
                        render={<Link href={`/mentor/quiz/create?subject=${subject.code}`} />}
                        size="sm"
                        variant="brand"
                      />
                    }
                  >
                    <Plus />
                    Buat Kuis
                  </TooltipTrigger>
                  <TooltipContent>Buat quiz baru</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            }
            title={subject.name}
          />
        </div>
        <section aria-label="Filter Kuis" className="space-y-4">
          <QuizStatusTabs
            items={quizzes}
            onChange={(value) => dispatch({ patch: { page: 1, selectedIds: new Set(), statusFilter: value }, type: "patch" })}
            value={statusFilter}
          />
          <div className="w-full max-w-2xl">
            <CatalogueSearchInput
              onChange={(value) => dispatch({ patch: { page: 1, query: value, selectedIds: new Set() }, type: "patch" })}
              placeholder="Cari judul, jumlah soal, atau status..."
              value={query}
            />
          </div>
        </section>
        <section className="space-y-3">
          {selectionMode ? <ReferenceSurface as="div" className="flex flex-wrap items-center gap-5 px-5 py-4" variant="inset"><Button aria-label="Keluar dari mode pilih" onClick={() => dispatch({ patch: { selectedIds: new Set(), selectionMode: false }, type: "patch" })} size="icon-xs" type="button" variant="ghost"><X /></Button><span className="text-sm font-semibold text-secondary-900">{selectedQuizzes.length} dipilih</span><Checkbox aria-label="Pilih semua quiz yang terlihat" checked={areAllVisibleSelected} onCheckedChange={(checked) => toggleAllVisible(checked === true)} /><span className="text-sm font-semibold text-secondary-700">Semua hasil</span><div className="ml-auto flex flex-wrap items-center gap-3"><Button disabled={!canPublish || isPending} onClick={() => dispatch({ patch: { error: null, intent: "publish" }, type: "patch" })} size="sm" type="button" variant="reference">Terbitkan</Button><Button disabled={!canUnpublish || isPending} onClick={() => dispatch({ patch: { error: null, intent: "unpublish" }, type: "patch" })} size="sm" type="button" variant="brandOutline">Batalkan terbit</Button><Button disabled={isPending} onClick={() => dispatch({ patch: { selectedIds: new Set() }, type: "patch" })} size="sm" type="button" variant="ghost">Hapus pilihan</Button></div>{eligibilityReason ? <p className="basis-full text-sm text-secondary-600" role="status">{eligibilityReason}</p> : null}</ReferenceSurface> : null}
          {notice ? <ReferenceSurface className="px-4 py-3 text-sm font-medium text-primary-900" role="status" variant="inset">{notice}</ReferenceSurface> : null}
          {pagedQuizzes.length ? pagedQuizzes.map((quiz) => <QuizRow key={quiz.id} onSelectedChange={(checked) => toggleSelected(quiz.id, checked)} quiz={quiz} selectionMode={selectionMode} selected={selectedIds.has(quiz.id)} />) : quizzes.length === 0 ? (
            <ReferenceSurface className="min-h-56" variant="inset">
              <ReferenceEmptyState
                action={<Button nativeButton={false} render={<Link href={`/mentor/quiz/create?subject=${subject.code}`} />} size="sm" variant="brand"><Plus />Buat quiz pertama</Button>}
                description="Mulai susun latihan pertama untuk membantu siswa menguatkan pemahaman mereka."
                icon={ListChecks}
                title="Belum ada quiz di subject ini"
              />
            </ReferenceSurface>
          ) : (
            <ReferenceSurface className="min-h-52" variant="inset">
              <ReferenceEmptyState description="Coba kata kunci lain atau tampilkan semua status quiz." icon={ListChecks} title="Tidak ada quiz yang cocok" />
            </ReferenceSurface>
          )}
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

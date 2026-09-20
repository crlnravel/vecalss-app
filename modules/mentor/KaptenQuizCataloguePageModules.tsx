"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ListChecks, Plus, X } from "@/lib/icons";
import { useMemo, useReducer, type Dispatch } from "react";

import {
  ReferenceEmptyState,
  ReferencePageHeader,
  ReferenceStatusBadge,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import { REFERENCE_SURFACE_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CompactFilterTabs } from "@/components/ui/compact-filter-tabs";
import { MentorBadge } from "@/components/ui/mentor-badge";
import { showToast } from "@/components/ui/toast";
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
import { buildMentorQuizCreateHref } from "@/lib/navigation/canonical-context";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import {
  CatalogueSearchInput,
  PaginationControls,
} from "@/modules/mentor/components/kapten-ui";
import type { KaptenQuiz, KaptenSubject } from "@/modules/mentor/mock-data";
import {
  bulkPublishStandaloneQuizzesAction,
  bulkUnpublishStandaloneQuizzesAction,
} from "@/modules/mentor/quiz-actions";
import { getSubjectCategory } from "@/modules/mentor/subject-category";
import { cn } from "@/lib/utils";

type QuizStatusFilter = "" | "draft" | "published";

type QuizCatalogueState = {
  quizzes: KaptenQuiz[];
  query: string;
  page: number;
  selectedIds: Set<string>;
  intent: "publish" | "unpublish" | null;
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

function quizCatalogueReducer(
  state: QuizCatalogueState,
  action: QuizCatalogueAction,
): QuizCatalogueState {
  if (action.type === "patch") return { ...state, ...action.patch };
  if (action.type === "toggle-selected") {
    const selectedIds = new Set(state.selectedIds);
    if (action.checked) selectedIds.add(action.id);
    else selectedIds.delete(action.id);
    return { ...state, selectedIds };
  }
  if (action.type === "toggle-all-visible") {
    const selectedIds = new Set(state.selectedIds);
    action.ids.forEach((id) =>
      action.checked ? selectedIds.add(id) : selectedIds.delete(id),
    );
    return { ...state, selectedIds };
  }
  if (action.type === "update-status") {
    const affectedIds = new Set(action.ids);
    return {
      ...state,
      quizzes: state.quizzes.map((quiz) =>
        affectedIds.has(quiz.id) ? { ...quiz, status: action.status } : quiz,
      ),
    };
  }
  return {
    ...state,
    quizzes: state.quizzes.map((quiz) =>
      quiz.id === action.quiz.id ? action.quiz : quiz,
    ),
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
  const counts = useMemo(
    () => ({
      "": items.length,
      draft: items.filter((item) => item.status === "draft").length,
      published: items.filter((item) => item.status === "published").length,
    }),
    [items],
  );

  return (
    <CompactFilterTabs
      aria-label="Filter status Kuis"
      items={quizStatusTabs.map((tab) => ({
        label: (
          <>
            <span>{tab.label}</span>
            <span className="text-xs font-medium opacity-70">
              ({counts[tab.value]})
            </span>
          </>
        ),
        value: tab.value,
      }))}
      onValueChange={onChange}
      value={value}
    />
  );
}

function SubjectCard({ subject }: { subject: KaptenSubject }) {
  const subjectCategory = getSubjectCategory(subject.code);

  return (
    <Link
      className={cn(
        REFERENCE_SURFACE_CLASS_NAMES.raised,
        REFERENCE_SURFACE_CLASS_NAMES.raisedStableInteractive,
        "group flex min-w-0 flex-col p-4",
      )}
      href={`/mentor/quiz/subject/${subject.slug}`}
    >
      <div>
        <MentorBadge
          className="bg-[linear-gradient(135deg,var(--voyage-sea-glass)_0%,var(--voyage-sea-glass-wash)_100%)] !font-normal text-[var(--voyage-forest)]"
          size="sm"
          tone="category"
        >
          {subjectCategory}
        </MentorBadge>
      </div>
      <h2 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-secondary-900">
        {subject.code}
      </h2>
      <p className="mt-1 text-sm leading-6 text-secondary-600">
        {subject.name}
      </p>
    </Link>
  );
}

function KaptenQuizPageModule({
  session,
  subjects,
}: {
  session: SessionContext;
  subjects: KaptenSubject[];
}) {
  return (
    <MentorWorkspaceShell
      activeLabel="Kuis"
      breadcrumbLabel="Kuis"
      searchPlaceholder="Cari kuis atau subjek..."
      session={session}
      sidebarAppearance="reference"
    >
      <div className="space-y-8">
        <ReferencePageHeader title="Kuis" />
        {subjects.length ? (
          <section
            aria-label="Daftar subjek Kuis"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          >
            {subjects.map((subject) => (
              <SubjectCard key={subject.slug} subject={subject} />
            ))}
          </section>
        ) : (
          <ReferenceSurface className="min-h-56" variant="inset">
            <ReferenceEmptyState
              action={
                <Button
                  nativeButton={false}
                  render={<Link href="/mentor/quiz/create" />}
                  size="default"
                  variant="brand"
                >
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

function QuizRow({
  onSelectedChange,
  quiz,
  selectionMode,
  selected,
}: {
  onSelectedChange: (checked: boolean) => void;
  quiz: KaptenQuiz;
  selectionMode: boolean;
  selected: boolean;
}) {
  return (
    <article
      className={cn(
        REFERENCE_SURFACE_CLASS_NAMES.raised,
        REFERENCE_SURFACE_CLASS_NAMES.raisedInteractive,
        "grid min-w-0 gap-4 p-5",
        selectionMode ? "sm:grid-cols-[auto_minmax(0,1fr)]" : "sm:grid-cols-1",
        "sm:items-center",
      )}
    >
      {selectionMode ? (
        <Checkbox
          aria-label={`Pilih ${quiz.title}`}
          checked={selected}
          onCheckedChange={(checked) => onSelectedChange(checked === true)}
        />
      ) : null}
      <Link
        aria-label={`Buka ${quiz.title}`}
        className="group flex min-w-0 items-start justify-between gap-4 rounded-2xl outline-none focus-visible:ring-4 focus-visible:ring-primary-700/20 sm:items-center"
        href={quiz.href}
      >
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-800">
            <ListChecks aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-secondary-900">
              {quiz.title}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <ReferenceStatusBadge
                appearance="mentor"
                size="sm"
                status={quiz.status}
              />
            </div>
          </div>
        </div>
        <ChevronRight
          aria-hidden="true"
          className="mt-1 size-5 shrink-0 text-secondary-400 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5 motion-safe:group-focus-visible:translate-x-0.5 motion-reduce:translate-x-0 motion-reduce:transition-none sm:mt-0"
        />
      </Link>
    </article>
  );
}

function quizLifecycleConfirmation(
  intent: QuizCatalogueState["intent"],
  count: number,
) {
  return intent === "publish"
    ? {
        confirm: "Terbitkan semua",
        description: `${count} quiz akan tersedia untuk siswa.`,
        title: "Terbitkan quiz terpilih?",
      }
    : {
        confirm: "Batalkan terbit",
        description: `${count} quiz kembali menjadi draf dan tidak tersedia untuk siswa.`,
        title: "Batalkan penerbitan quiz?",
      };
}

async function runQuizLifecycle({
  dispatch,
  intent,
  isPending,
  refresh,
  selectedQuizzes,
}: {
  dispatch: Dispatch<QuizCatalogueAction>;
  intent: QuizCatalogueState["intent"];
  isPending: boolean;
  refresh: () => void;
  selectedQuizzes: KaptenQuiz[];
}) {
  if (!intent || isPending || !selectedQuizzes.length) return;
  dispatch({ patch: { isPending: true }, type: "patch" });
  try {
    const ids = selectedQuizzes.map((quiz) => quiz.id);
    const result =
      intent === "publish"
        ? await bulkPublishStandaloneQuizzesAction(ids)
        : await bulkUnpublishStandaloneQuizzesAction(ids);
    if (!result.ok) {
      showToast(result.message, { variant: "error" });
      return;
    }
    dispatch({
      ids: result.affectedIds,
      status: result.status,
      type: "update-status",
    });
    dispatch({
      patch: {
        intent: null,
        selectedIds: new Set(),
        selectionMode: false,
      },
      type: "patch",
    });
    showToast(result.message, { variant: "success" });
    refresh();
  } catch (caughtError) {
    showToast(
      caughtError instanceof Error
        ? caughtError.message
        : "Status quiz tidak dapat diubah saat ini. Coba lagi.",
      { variant: "error" },
    );
  } finally {
    dispatch({ patch: { isPending: false }, type: "patch" });
  }
}

function QuizSubjectHeader({ subject }: { subject: KaptenSubject }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <Button
        aria-label="Kembali ke semua quiz"
        className="mt-1 shrink-0"
        nativeButton={false}
        render={<Link href="/mentor/quiz" />}
        size="icon"
        title="Kembali ke semua quiz"
        variant="ghost"
      >
        <ChevronLeft />
      </Button>
      <ReferencePageHeader
        className="min-w-0 flex-1"
        actions={
          <Button
            aria-label="Buat quiz baru"
            nativeButton={false}
            render={<Link href={buildMentorQuizCreateHref(subject.code)} />}
            size="default"
            variant="brand"
          >
            <Plus />
            Buat Kuis
          </Button>
        }
        description={subject.name}
        title={subject.code}
      />
    </div>
  );
}

function QuizSelectionToolbar({
  areAllVisibleSelected,
  canPublish,
  canUnpublish,
  dispatch,
  eligibilityReason,
  isPending,
  onToggleAll,
  selectedCount,
}: {
  areAllVisibleSelected: boolean;
  canPublish: boolean;
  canUnpublish: boolean;
  dispatch: Dispatch<QuizCatalogueAction>;
  eligibilityReason: string | null;
  isPending: boolean;
  onToggleAll: (checked: boolean) => void;
  selectedCount: number;
}) {
  return (
    <ReferenceSurface
      as="div"
      className="flex flex-wrap items-center gap-5 px-5 py-4"
      variant="inset"
    >
      <Button
        aria-label="Keluar dari mode pilih"
        onClick={() =>
          dispatch({
            patch: { selectedIds: new Set(), selectionMode: false },
            type: "patch",
          })
        }
        size="icon"
        type="button"
        variant="ghost"
      >
        <X />
      </Button>
      <span className="text-sm font-semibold text-secondary-900">
        {selectedCount} dipilih
      </span>
      <Checkbox
        aria-label="Pilih semua quiz yang terlihat"
        checked={areAllVisibleSelected}
        onCheckedChange={(checked) => onToggleAll(checked === true)}
      />
      <span className="text-sm font-semibold text-secondary-700">
        Semua hasil
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-3">
        <Button
          disabled={!canPublish || isPending}
          onClick={() =>
            dispatch({
              patch: { intent: "publish" },
              type: "patch",
            })
          }
          size="default"
          type="button"
          variant="reference"
        >
          Terbitkan
        </Button>
        <Button
          disabled={!canUnpublish || isPending}
          onClick={() =>
            dispatch({
              patch: { intent: "unpublish" },
              type: "patch",
            })
          }
          size="default"
          type="button"
          variant="brandOutline"
        >
          Batalkan terbit
        </Button>
        <Button
          disabled={isPending}
          onClick={() =>
            dispatch({ patch: { selectedIds: new Set() }, type: "patch" })
          }
          size="default"
          type="button"
          variant="ghost"
        >
          Hapus pilihan
        </Button>
      </div>
      {eligibilityReason ? (
        <p className="basis-full text-sm text-secondary-600" role="status">
          {eligibilityReason}
        </p>
      ) : null}
    </ReferenceSurface>
  );
}

function QuizSubjectList({
  createHref,
  dispatch,
  pagedQuizzes,
  page,
  pageCount,
  quizzes,
  selectedIds,
  selectionMode,
}: {
  createHref: string;
  dispatch: Dispatch<QuizCatalogueAction>;
  pagedQuizzes: KaptenQuiz[];
  page: number;
  pageCount: number;
  quizzes: KaptenQuiz[];
  selectedIds: Set<string>;
  selectionMode: boolean;
}) {
  return (
    <section className="space-y-3">
      {pagedQuizzes.length ? (
        pagedQuizzes.map((quiz) => (
          <QuizRow
            key={quiz.id}
            onSelectedChange={(checked) =>
              dispatch({ checked, id: quiz.id, type: "toggle-selected" })
            }
            quiz={quiz}
            selectionMode={selectionMode}
            selected={selectedIds.has(quiz.id)}
          />
        ))
      ) : quizzes.length === 0 ? (
        <ReferenceSurface className="min-h-56" variant="inset">
          <ReferenceEmptyState
            action={
              <Button
                nativeButton={false}
                render={<Link href={createHref} />}
                size="default"
                variant="brand"
              >
                <Plus />
                Buat quiz pertama
              </Button>
            }
            description="Mulai susun latihan pertama untuk membantu siswa menguatkan pemahaman mereka."
            icon={ListChecks}
            title="Belum ada quiz di subject ini"
          />
        </ReferenceSurface>
      ) : (
        <ReferenceSurface className="min-h-52" variant="inset">
          <ReferenceEmptyState
            description="Coba kata kunci lain atau tampilkan semua status quiz."
            icon={ListChecks}
            title="Tidak ada quiz yang cocok"
          />
        </ReferenceSurface>
      )}
      <PaginationControls
        onPageChange={(nextPage) =>
          dispatch({ patch: { page: nextPage }, type: "patch" })
        }
        page={page}
        pageCount={pageCount}
      />
    </section>
  );
}

function QuizLifecycleDialog({
  canPublish,
  canUnpublish,
  dispatch,
  intent,
  isPending,
  onConfirm,
  selectedCount,
}: {
  canPublish: boolean;
  canUnpublish: boolean;
  dispatch: Dispatch<QuizCatalogueAction>;
  intent: QuizCatalogueState["intent"];
  isPending: boolean;
  onConfirm: () => void;
  selectedCount: number;
}) {
  if (!intent) return null;
  const confirmation = quizLifecycleConfirmation(intent, selectedCount);
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open && !isPending)
          dispatch({ patch: { intent: null }, type: "patch" });
      }}
      open
    >
      <DialogContent
        pending={isPending}
        showCloseButton={!isPending}
        variant="info"
      >
        <DialogHeader>
          <DialogTitle>{confirmation.title}</DialogTitle>
          <DialogDescription>{confirmation.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose
            disabled={isPending}
            render={<Button type="button" variant="brandOutline" />}
          >
            Batal
          </DialogClose>
          <Button
            disabled={
              isPending || (intent === "publish" ? !canPublish : !canUnpublish)
            }
            onClick={onConfirm}
            type="button"
            variant="brand"
          >
            {isPending ? "Memproses..." : confirmation.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KaptenQuizSubjectPageModule({
  catalogue,
  session,
  subject,
}: {
  catalogue: KaptenQuiz[];
  session: SessionContext;
  subject: KaptenSubject;
}) {
  const router = useRouter();
  const [catalogueState, dispatch] = useReducer(quizCatalogueReducer, {
    intent: null,
    isPending: false,
    page: 1,
    query: "",
    quizzes: catalogue.filter((quiz) => quiz.subjectCode === subject.code),
    selectedIds: new Set<string>(),
    selectionMode: false,
    statusFilter: "",
  });
  const {
    intent,
    isPending,
    page,
    query,
    quizzes,
    selectedIds,
    selectionMode,
    statusFilter,
  } = catalogueState;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleQuizzes = quizzes.filter(
    (quiz) =>
      (!normalizedQuery ||
        [quiz.title, quiz.status, quiz.primaryMetric].some((value) =>
          value.toLocaleLowerCase().includes(normalizedQuery),
        )) &&
      (!statusFilter || quiz.status === statusFilter),
  );
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(visibleQuizzes.length / pageSize));
  const pagedQuizzes = visibleQuizzes.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );
  const selectedQuizzes = quizzes.filter((quiz) => selectedIds.has(quiz.id));
  const canPublish =
    selectedQuizzes.length > 0 &&
    selectedQuizzes.every(
      (quiz) => quiz.status === "draft" && quiz.questionCount > 0,
    );
  const canUnpublish =
    selectedQuizzes.length > 0 &&
    selectedQuizzes.every((quiz) => quiz.status === "published");
  const areAllVisibleSelected =
    visibleQuizzes.length > 0 &&
    visibleQuizzes.every((quiz) => selectedIds.has(quiz.id));
  const eligibilityReason =
    selectedQuizzes.length > 0 && !canPublish && !canUnpublish
      ? "Pilih hanya quiz draf yang memiliki soal atau quiz yang sudah diterbitkan."
      : null;
  const confirmLifecycle = () =>
    void runQuizLifecycle({
      dispatch,
      intent,
      isPending,
      refresh: () => router.refresh(),
      selectedQuizzes,
    });
  return (
    <MentorWorkspaceShell
      activeLabel="Kuis"
      breadcrumbLabel={subject.code}
      searchPlaceholder="Cari kuis..."
      session={session}
      sidebarAppearance="reference"
    >
      <div className="space-y-8">
        <QuizSubjectHeader subject={subject} />
        <section aria-label="Filter Kuis" className="space-y-4">
          <div className="w-full">
            <CatalogueSearchInput
              onChange={(value) =>
                dispatch({
                  patch: { page: 1, query: value, selectedIds: new Set() },
                  type: "patch",
                })
              }
              placeholder="Cari judul, jumlah soal, atau status..."
              value={query}
            />
          </div>
          <QuizStatusTabs
            items={quizzes}
            onChange={(value) =>
              dispatch({
                patch: { page: 1, selectedIds: new Set(), statusFilter: value },
                type: "patch",
              })
            }
            value={statusFilter}
          />
        </section>
        {selectionMode ? (
          <QuizSelectionToolbar
            areAllVisibleSelected={areAllVisibleSelected}
            canPublish={canPublish}
            canUnpublish={canUnpublish}
            dispatch={dispatch}
            eligibilityReason={eligibilityReason}
            isPending={isPending}
            onToggleAll={(checked) =>
              dispatch({
                checked,
                ids: visibleQuizzes.map((quiz) => quiz.id),
                type: "toggle-all-visible",
              })
            }
            selectedCount={selectedQuizzes.length}
          />
        ) : null}
        <QuizSubjectList
          createHref={buildMentorQuizCreateHref(subject.code)}
          dispatch={dispatch}
          page={page}
          pageCount={pageCount}
          pagedQuizzes={pagedQuizzes}
          quizzes={quizzes}
          selectedIds={selectedIds}
          selectionMode={selectionMode}
        />
      </div>
      <QuizLifecycleDialog
        canPublish={canPublish}
        canUnpublish={canUnpublish}
        dispatch={dispatch}
        intent={intent}
        isPending={isPending}
        onConfirm={confirmLifecycle}
        selectedCount={selectedQuizzes.length}
      />
    </MentorWorkspaceShell>
  );
}

export { KaptenQuizPageModule, KaptenQuizSubjectPageModule };

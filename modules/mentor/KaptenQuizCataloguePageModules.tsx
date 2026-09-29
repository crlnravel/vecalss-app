"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, ListChecks, Plus } from "@/lib/icons";
import { useEffect, useMemo, useReducer, useState } from "react";

import {
  ReferenceEmptyState,
  ReferencePageHeader,
  ReferenceStatusBadge,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import { REFERENCE_SURFACE_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
import { CompactFilterTabs } from "@/components/ui/compact-filter-tabs";
import { MentorBadge } from "@/components/ui/mentor-badge";
import type { SessionContext } from "@/lib/auth/types";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import {
  MentorQuizCreateDialog,
  QuizCreateDialogTrigger,
} from "@/modules/mentor/KaptenQuizEditorPageModule";
import {
  CatalogueSearchInput,
  PaginationControls,
} from "@/modules/mentor/components/kapten-ui";
import type { KaptenQuiz, KaptenSubject } from "@/modules/mentor/mock-data";
import { getSubjectCategory } from "@/modules/mentor/subject-category";
import { cn } from "@/lib/utils";

type QuizStatusFilter = "" | "published" | "archived";

type QuizCatalogueState = {
  quizzes: KaptenQuiz[];
  query: string;
  page: number;
  statusFilter: QuizStatusFilter;
};

type QuizCatalogueAction =
  | { type: "patch"; patch: Partial<QuizCatalogueState> };

function quizCatalogueReducer(
  state: QuizCatalogueState,
  action: QuizCatalogueAction,
): QuizCatalogueState {
  return { ...state, ...action.patch };
}

const quizStatusTabs: Array<{ label: string; value: QuizStatusFilter }> = [
  { label: "Semua", value: "" },
  { label: "Diterbitkan", value: "published" },
  { label: "Diarsipkan", value: "archived" },
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
      archived: items.filter((item) => item.status === "archived").length,
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
  initialCreateDialogOpen = false,
  initialSubjectCode,
  session,
  subjects,
}: {
  initialCreateDialogOpen?: boolean;
  initialSubjectCode?: string;
  session: SessionContext;
  subjects: KaptenSubject[];
}) {
  const router = useRouter();
  const [createDialogOpen, setCreateDialogOpen] = useState(
    initialCreateDialogOpen,
  );

  useEffect(() => {
    setCreateDialogOpen(initialCreateDialogOpen);
  }, [initialCreateDialogOpen]);

  function handleCreateDialogOpenChange(open: boolean) {
    setCreateDialogOpen(open);
    if (!open && initialCreateDialogOpen) {
      router.replace("/mentor/quiz", { scroll: false });
    }
  }

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
            aria-label="Daftar subtes Kuis"
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
                <QuizCreateDialogTrigger ariaLabel="Buat Kuis pertama">
                  <Plus />
                  Buat Kuis pertama
                </QuizCreateDialogTrigger>
              }
              description="Buat latihan pertama untuk mulai menyusun pengalaman belajar siswa."
              icon={ListChecks}
              title="Belum ada subtes Kuis"
            />
          </ReferenceSurface>
        )}
      </div>
      <MentorQuizCreateDialog
        initialSubjectCode={initialSubjectCode}
        onOpenChange={handleCreateDialogOpenChange}
        open={createDialogOpen}
      />
    </MentorWorkspaceShell>
  );
}

function QuizRow({ quiz }: { quiz: KaptenQuiz }) {
  return (
    <article
      className={cn(
        REFERENCE_SURFACE_CLASS_NAMES.raised,
        REFERENCE_SURFACE_CLASS_NAMES.raisedInteractive,
        "grid min-w-0 gap-4 p-5",
        "sm:grid-cols-1",
        "sm:items-center",
      )}
    >
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
              {quiz.isHidden ? (
                <MentorBadge size="sm" tone="category">
                  Disembunyikan
                </MentorBadge>
              ) : null}
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

function QuizSubjectHeader({ subject }: { subject: KaptenSubject }) {
  return (
    <ReferencePageHeader
      actions={
        <QuizCreateDialogTrigger
          ariaLabel="Buat Kuis baru"
          initialSubjectCode={subject.code}
        >
          <Plus />
          Buat Kuis
        </QuizCreateDialogTrigger>
      }
      title={subject.code}
    />
  );
}

function QuizSubjectList({
  dispatch,
  pagedQuizzes,
  page,
  pageCount,
  quizzes,
  subjectCode,
}: {
  dispatch: (action: QuizCatalogueAction) => void;
  pagedQuizzes: KaptenQuiz[];
  page: number;
  pageCount: number;
  quizzes: KaptenQuiz[];
  subjectCode: string;
}) {
  return (
    <section className="space-y-3">
      {pagedQuizzes.length ? (
        pagedQuizzes.map((quiz) => (
          <QuizRow
            key={quiz.id}
            quiz={quiz}
          />
        ))
      ) : quizzes.length === 0 ? (
        <ReferenceSurface className="min-h-56" variant="inset">
          <ReferenceEmptyState
            action={
              <QuizCreateDialogTrigger
              ariaLabel="Buat kuis pertama"
                initialSubjectCode={subjectCode}
              >
                <Plus />
                Buat kuis pertama
              </QuizCreateDialogTrigger>
            }
            description="Mulai susun latihan pertama untuk membantu siswa menguatkan pemahaman mereka."
            icon={ListChecks}
            title="Belum ada kuis di subtes ini"
          />
        </ReferenceSurface>
      ) : (
        <ReferenceSurface className="min-h-52" variant="inset">
          <ReferenceEmptyState
            description="Coba kata kunci lain atau tampilkan semua status Kuis."
            icon={ListChecks}
            title="Tidak ada kuis yang cocok"
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

function KaptenQuizSubjectPageModule({
  catalogue,
  session,
  subject,
}: {
  catalogue: KaptenQuiz[];
  session: SessionContext;
  subject: KaptenSubject;
}) {
  const [catalogueState, dispatch] = useReducer(quizCatalogueReducer, {
    page: 1,
    query: "",
    quizzes: catalogue.filter((quiz) => quiz.subjectCode === subject.code),
    statusFilter: "",
  });
  const { page, query, quizzes, statusFilter } = catalogueState;
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
                  patch: { page: 1, query: value },
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
                patch: { page: 1, statusFilter: value },
                type: "patch",
              })
            }
            value={statusFilter}
          />
        </section>
        <QuizSubjectList
          dispatch={dispatch}
          page={page}
          pageCount={pageCount}
          pagedQuizzes={pagedQuizzes}
          quizzes={quizzes}
          subjectCode={subject.code}
        />
      </div>
    </MentorWorkspaceShell>
  );
}

export { KaptenQuizPageModule, KaptenQuizSubjectPageModule };

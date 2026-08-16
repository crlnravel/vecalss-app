"use client";

import Image from "next/image";
import {
  BookOpen,
  BookOpenCheck,
  Brain,
  Calculator,
  ChevronRight,
  FileText,
  Languages,
  LibraryBig,
  ListChecks,
  PenTool,
} from "@/lib/icons";

import type { SessionContext } from "@/lib/auth/types";
import type { StudentBannerContent } from "@/lib/student/banner-content";
import { StudentCatalogueCard } from "@/components/ui/student-catalogue-card";
import { CourseWorkspaceShell } from "@/modules/courses/CourseWorkspaceShell";

import { getQuizSubjectStats, type QuizSubject } from "./data";

const subjectIcons = {
  LBE: Languages,
  LBI: FileText,
  PBM: PenTool,
  PK: Calculator,
  PM: BookOpen,
  PPU: LibraryBig,
  PU: Brain,
} as const;

const subjectGroupOrder = ["TPS", "TPA"] as const;

function QuizCataloguePageModule({
  banner,
  session,
  subjects,
}: {
  banner: StudentBannerContent;
  session: SessionContext;
  subjects: QuizSubject[];
}) {
  const subjectGroups = subjectGroupOrder
    .map((code) => ({
      code,
      subjects: subjects.filter((subject) => subject.code === code),
    }))
    .filter((group) => group.subjects.length > 0);

  return (
    <CourseWorkspaceShell
      activeLabel="Kuis"
      breadcrumbLabel="Kuis"
      searchPlaceholder="Cari subjek kuis atau topik latihan..."
      session={session}
    >
      <div className="mx-auto flex w-full max-w-[78rem] flex-col gap-10">
        <section className="relative isolate overflow-hidden rounded-[2.25rem] bg-gradient-to-br from-primary-900 via-primary-800 to-primary-600 px-6 py-8 text-white shadow-[0_28px_72px_-44px_rgba(1,76,56,0.75)] md:min-h-[18rem] md:px-10 md:py-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-32 -right-20 size-80 rounded-full border-[18px] border-white/10"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-[26%] bottom-[-8rem] size-64 rounded-full bg-primary-400/20 blur-3xl"
          />
          <div className="relative z-10 max-w-[42rem]">
            <h1 className="text-5xl leading-[0.94] font-extrabold tracking-[-0.04em] md:text-7xl">
              {banner.title}
            </h1>
            <p className="mt-5 max-w-[48ch] text-sm leading-7 text-primary-100 md:text-base">
              {banner.description}
            </p>
          </div>

          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-[-1rem] bottom-[-1.25rem] hidden w-[18rem] sm:block md:right-0 md:w-[19rem]"
          >
            <Image
              alt=""
              className="h-auto w-full object-contain drop-shadow-[0_30px_48px_rgba(1,76,56,0.35)]"
              height={464}
              priority
              sizes="(min-width: 1280px) 480px, (min-width: 768px) 432px, 352px"
              src="/brand/mascot-vecalss.png"
              width={464}
            />
          </div>
        </section>

        <div className="flex flex-col gap-10">
          {subjectGroups.map((group) => (
            <section
              aria-labelledby={`quiz-group-${group.code}`}
              className="flex flex-col gap-4"
              key={group.code}
            >
              <div className="flex items-center gap-4 px-1">
                <h2
                  className="shrink-0 text-lg font-extrabold tracking-[-0.025em] text-secondary-900 md:text-xl"
                  id={`quiz-group-${group.code}`}
                >
                  Subjek {group.code}
                </h2>
                <span aria-hidden="true" className="h-px flex-1 bg-[#d6e5db]" />
              </div>

              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {group.subjects.map((subject) => (
                  <QuizSubjectCard key={subject.slug} subject={subject} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </CourseWorkspaceShell>
  );
}

function QuizSubjectCard({ subject }: { subject: QuizSubject }) {
  const stats = getQuizSubjectStats(subject);
  const Icon =
    subjectIcons[subject.title as keyof typeof subjectIcons] ?? ListChecks;

  return (
    <StudentCatalogueCard
      href={`/quiz/${subject.slug}`}
      variant="kuis"
    >
      <div className="flex items-start justify-between gap-4">
        <span className="grid size-14 place-items-center rounded-[1.25rem] bg-[linear-gradient(135deg,#b7ddc3_0%,#eef8f1_100%)] text-[#176b4d] shadow-[inset_0_-2px_0_rgba(1,76,56,0.08)] md:size-20 md:rounded-[1.6rem]">
          <Icon className="size-7 md:size-9" strokeWidth={2.2} />
        </span>
        <span className="rounded-full bg-white/75 px-3 py-2 text-xs font-extrabold tracking-[0.13em] text-primary-800">
          {subject.code}
        </span>
      </div>

      <div className="mt-8">
        <h3 className="text-5xl leading-[0.92] font-extrabold tracking-[-0.04em] md:text-6xl">
          {subject.title}
        </h3>
        <p className="mt-3 max-w-[26ch] text-sm leading-6 text-primary-800 md:text-base">
          {subject.description}
        </p>
      </div>

      <div className="mt-auto flex items-end justify-between gap-4 pt-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-bold text-primary-800">
          <span className="inline-flex items-center gap-1.5">
            <ListChecks className="size-4" />
            {stats.totalQuizzes} kuis
          </span>
          <span className="inline-flex items-center gap-1.5">
            <BookOpenCheck className="size-4" />
            {stats.totalQuestions} soal
          </span>
        </div>
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#176b4d] text-white shadow-[0_10px_24px_-16px_rgba(23,107,77,0.75)]">
          <ChevronRight className="size-5" strokeWidth={2.6} />
        </span>
      </div>
    </StudentCatalogueCard>
  );
}

export { QuizCataloguePageModule };

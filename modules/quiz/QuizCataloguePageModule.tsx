"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  BookOpenCheck,
  Brain,
  Calculator,
  FileText,
  Languages,
  LibraryBig,
  ListChecks,
  PenTool,
} from "lucide-react";

import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
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
  session,
  subjects,
}: {
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
              Kuis
            </h1>
            <p className="mt-5 max-w-[48ch] text-sm leading-7 text-primary-100 md:text-base">
              Temukan kuis berdasarkan mata pelajaran dan materi yang ingin kamu
              pelajari.
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
              className="flex flex-col gap-5"
              key={group.code}
            >
              <div className="flex items-end justify-between gap-4 px-1">
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-primary-900 px-3 py-1.5 text-xs font-extrabold tracking-[0.14em] text-white">
                    {group.code}
                  </span>
                  <h2
                    className="text-2xl leading-tight font-extrabold tracking-[-0.03em] text-secondary-900 md:text-3xl"
                    id={`quiz-group-${group.code}`}
                  >
                    Subjek {group.code}
                  </h2>
                </div>
                <span className="hidden text-sm font-bold text-secondary-500 sm:block">
                  {group.subjects.length} subjek
                </span>
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
    <Link
      className={cn(
        "group relative flex min-h-[246px] flex-col overflow-hidden rounded-[2rem] border border-primary-200 p-6 text-primary-900 shadow-[0_18px_42px_-34px_rgba(23,107,77,0.55)] outline-none transition-[transform,border-color,box-shadow] duration-300 motion-safe:hover:-translate-y-1.5 hover:border-primary-300 hover:shadow-[0_28px_64px_-42px_rgba(23,107,77,0.62)] focus-visible:ring-4 focus-visible:ring-primary-400/30 motion-reduce:transition-none md:min-h-[270px] md:p-7",
        subject.palette,
      )}
      href={`/quiz/${subject.slug}`}
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1.5 bg-primary-700"
      />

      <div className="flex items-start justify-between gap-4">
        <span className="grid size-14 place-items-center rounded-[1.25rem] bg-primary-900 text-white shadow-[0_12px_26px_-18px_rgba(1,76,56,0.8)] transition-transform duration-250 ease-out motion-safe:group-hover:-rotate-3 motion-reduce:transition-none">
          <Icon className="size-7" strokeWidth={2.1} />
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
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-900 text-white shadow-[0_12px_28px_-18px_rgba(1,76,56,0.85)] transition-transform duration-200 ease-out motion-safe:group-hover:rotate-45 motion-reduce:transition-none">
          <ArrowUpRight className="size-5" strokeWidth={2.5} />
        </span>
      </div>
    </Link>
  );
}

export { QuizCataloguePageModule };

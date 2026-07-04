"use client";

import Link from "next/link";
import { BookOpenCheck, Clock3, ListChecks, Star } from "lucide-react";

import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { CourseWorkspaceShell } from "@/modules/courses/CourseWorkspaceShell";

import {
  getQuizSubjectStats,
  quizSubjects,
  type QuizSubject,
} from "./data";

function QuizCataloguePageModule({ session }: { session: SessionContext }) {
  return (
    <CourseWorkspaceShell
      activeLabel="Quiz"
      breadcrumbLabel="Quiz"
      searchPlaceholder="Cari subject quiz atau topik latihan..."
      session={session}
    >
      <section className="flex flex-col gap-5">
        <div>
          <div>
            <h1 className="text-[32px] leading-tight font-semibold text-secondary-900 md:text-[42px]">
              Quiz
            </h1>
            <p className="mt-2 max-w-[56ch] text-sm leading-6 text-secondary-500 md:text-base">
              Pilih subject terlebih dahulu, lalu buka katalog quiz siap pakai
              yang sudah dikelompokkan per bagian.
            </p>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {quizSubjects.map((subject, index) => (
            <QuizSubjectCard
              featured={index < 2}
              key={subject.slug}
              subject={subject}
            />
          ))}
        </div>
      </section>
    </CourseWorkspaceShell>
  );
}

function QuizSubjectCard({
  featured,
  subject,
}: {
  featured: boolean;
  subject: QuizSubject;
}) {
  const stats = getQuizSubjectStats(subject);
  const Icon = subject.icon;
  const sizeClass = featured
    ? "min-h-[250px] md:min-h-[280px]"
    : "min-h-[220px] md:min-h-[250px]";

  return (
    <Link
      className={cn(
        "group relative flex overflow-hidden rounded-[34px] p-6 outline-none transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_26px_70px_-50px_rgba(1,76,56,0.42)] focus-visible:ring-3 focus-visible:ring-primary-400/25 md:p-8",
        subject.palette,
        sizeClass,
      )}
      href={`/quiz/${subject.slug}`}
    >
      <div className="flex w-full flex-col gap-4">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div className="inline-flex items-center gap-2 text-sm font-semibold md:text-base">
            <Icon className="size-4" />
            <span>{subject.code}</span>
          </div>
          <Star className="size-4 fill-current opacity-70" />
        </div>

        <div className="mt-auto">
          <h2 className="max-w-[12ch] text-[30px] leading-[1.05] font-semibold md:text-[40px]">
            {subject.title}
          </h2>
          <p className="mt-4 line-clamp-2 max-w-[34ch] text-sm leading-6 opacity-82">
            {subject.description}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3 text-sm font-semibold">
            <span className="inline-flex items-center gap-1.5">
              <ListChecks className="size-4" />
              {stats.totalQuizzes} quiz
            </span>
            <span className="inline-flex items-center gap-1.5">
              <BookOpenCheck className="size-4" />
              {stats.totalQuestions} soal
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="size-4" />
              Siap {stats.averageCompletion}%
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export { QuizCataloguePageModule };

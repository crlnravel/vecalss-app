"use client";

import {
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
import { CatalogueCard } from "@/modules/courses/CatalogueCard";
import { CourseWorkspaceShell } from "@/modules/courses/CourseWorkspaceShell";

import {
  getQuizSubjectStats,
  type QuizSubject,
} from "./data";

const subjectIcons = {
  LBE: Languages,
  LBI: FileText,
  PBM: PenTool,
  PK: Calculator,
  PM: BookOpen,
  PPU: LibraryBig,
  PU: Brain,
} as const;

function QuizCataloguePageModule({ session, subjects }: { session: SessionContext; subjects: QuizSubject[] }) {
  return (
    <CourseWorkspaceShell
      activeLabel="Kuis"
      breadcrumbLabel="Kuis"
      searchPlaceholder="Cari subjek kuis atau topik latihan..."
      session={session}
    >
      <section className="flex flex-col gap-5">
        <div>
          <div>
            <h1 className="text-4xl leading-tight font-semibold text-secondary-900 md:text-5xl">
              Kuis
            </h1>
            <p className="mt-2 max-w-[56ch] text-sm leading-6 text-secondary-500 md:text-base">
              Temukan kuis berdasarkan mata pelajaran dan materi yang ingin
              kamu pelajari.
            </p>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {subjects.map((subject) => (
            <QuizSubjectCard key={subject.slug} subject={subject} />
          ))}
        </div>
      </section>
    </CourseWorkspaceShell>
  );
}

function QuizSubjectCard({ subject }: { subject: QuizSubject }) {
  const stats = getQuizSubjectStats(subject);
  const Icon = subjectIcons[subject.title as keyof typeof subjectIcons] ?? ListChecks;

  return (
    <CatalogueCard
      code={subject.code}
      description={subject.description}
      href={`/quiz/${subject.slug}`}
      icon={Icon}
      palette={subject.palette}
      stats={[
        { icon: ListChecks, label: "Kuis", value: `${stats.totalQuizzes} kuis` },
        {
          icon: BookOpenCheck,
          label: "Soal",
          value: `${stats.totalQuestions} soal`,
        },
      ]}
      title={subject.title}
      className="border border-primary-200 bg-white text-primary-900 hover:border-primary-300 hover:bg-white"
      leftAccent
    />
  );
}

export { QuizCataloguePageModule };

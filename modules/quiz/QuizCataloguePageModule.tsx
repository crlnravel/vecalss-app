"use client";

import { BookOpenCheck, ListChecks } from "lucide-react";

import type { SessionContext } from "@/lib/auth/types";
import { CatalogueCard } from "@/modules/courses/CatalogueCard";
import { CourseWorkspaceShell } from "@/modules/courses/CourseWorkspaceShell";

import {
  getQuizSubjectStats,
  type QuizSubject,
} from "./data";

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

  return (
    <CatalogueCard
      code={subject.code}
      description={subject.description}
      href={`/quiz/${subject.slug}`}
      icon={subject.icon}
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
    />
  );
}

export { QuizCataloguePageModule };

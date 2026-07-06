import Link from "next/link";
import {
  ArrowLeft,
  BookOpenCheck,
  Clock3,
  ListChecks,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { CourseWorkspaceShell } from "@/modules/courses/CourseWorkspaceShell";

import {
  getQuizSubjectStats,
  type QuizItem,
  type QuizSubject,
} from "./data";

function QuizSubjectDetailPageModule({
  session,
  subject,
}: {
  session: SessionContext;
  subject: QuizSubject;
}) {
  const stats = getQuizSubjectStats(subject);
  const Icon = subject.icon;

  return (
    <CourseWorkspaceShell
      activeLabel="Kuis"
      breadcrumbLabel={subject.title}
      searchPlaceholder="Cari kuis di subjek ini..."
      session={session}
    >
      <div>
        <Button
          render={
            <Link href="/quiz">
              <ArrowLeft data-icon="inline-start" />
              Kembali ke subjek kuis
            </Link>
          }
          size="sm"
          variant="ghost"
        />
      </div>

      <section>
        <Card className="relative overflow-hidden rounded-[30px] border border-primary-100 bg-[linear-gradient(135deg,rgba(1,76,56,0.24)_0%,rgba(1,76,56,0.16)_38%,rgba(1,76,56,0.08)_72%,rgba(255,255,255,0.92)_100%)] shadow-[0_28px_90px_-60px_rgba(1,76,56,0.44)]">
          <CardHeader className="gap-6 px-6 py-7 md:px-8 md:py-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-primary-800 shadow-sm">
                    {subject.code}
                  </span>
                  <span className="rounded-full bg-primary-700 px-3 py-1 text-xs font-semibold text-white">
                    Kuis siap pakai
                  </span>
                </div>
                <CardTitle className="mt-4 max-w-4xl text-4xl leading-tight font-semibold text-secondary-900 md:text-5xl">
                  {subject.title}
                </CardTitle>
                <CardDescription className="mt-4 max-w-[68ch] text-base leading-7 text-secondary-600 md:text-base">
                  {subject.description}
                </CardDescription>
              </div>

              <div
                className={cn(
                  "flex h-40 w-40 shrink-0 items-center justify-center self-start rounded-[28px] border border-primary-100 bg-[linear-gradient(160deg,rgba(1,76,56,0.24)_0%,rgba(1,76,56,0.14)_58%,rgba(255,255,255,0.88)_100%)] text-primary-900 shadow-[0_22px_60px_-42px_rgba(1,76,56,0.5)] md:h-52 md:w-52 md:self-auto",
                  subject.palette.replace("bg-primary-100", ""),
                )}
              >
                <div className="flex size-20 items-center justify-center rounded-[28px] border border-primary-100 bg-white/86 text-primary-700 shadow-[0_18px_42px_-26px_rgba(1,76,56,0.45)]">
                  <Icon className="size-9" />
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="grid gap-3 px-6 pb-7 sm:grid-cols-3 md:px-8">
            <DetailStat icon={ListChecks} label="Kuis" value={stats.totalQuizzes} />
            <DetailStat
              icon={BookOpenCheck}
              label="Total soal"
              value={stats.totalQuestions}
            />
            <DetailStat
              icon={Clock3}
              label="Rata-rata siap"
              value={`${stats.averageCompletion}%`}
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {subject.quizzes.map((quiz) => (
          <QuizCard key={quiz.slug} quiz={quiz} subject={subject} />
        ))}
      </section>
    </CourseWorkspaceShell>
  );
}

function DetailStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ListChecks;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-[22px] border border-white/80 bg-white/80 p-4 shadow-sm">
      <Icon className="size-4 text-primary-700" />
      <p className="mt-3 text-2xl font-semibold text-primary-800">{value}</p>
      <p className="mt-1 text-xs font-semibold tracking-[0.12em] text-secondary-500 uppercase">
        {label}
      </p>
    </div>
  );
}

function QuizCard({
  quiz,
  subject,
}: {
  quiz: QuizItem;
  subject: QuizSubject;
}) {
  return (
    <article className="group overflow-hidden rounded-2xl border border-primary-100 bg-white text-left shadow-[0_12px_38px_-28px_rgba(1,76,56,0.45)] transition-all duration-300 hover:-translate-y-1 hover:border-primary-200 hover:shadow-[0_24px_58px_-42px_rgba(1,76,56,0.55)]">
      <div className={cn("p-5", subject.palette)}>
        <h3 className="max-w-[16ch] text-3xl leading-[1.08] font-semibold">
          {quiz.title}
        </h3>
        <p className="mt-3 text-sm leading-6 opacity-80">
          Paket latihan siap pakai untuk drilling {subject.title.toLowerCase()}.
        </p>
      </div>

      <div className="p-5">
        <div className="flex flex-wrap items-center gap-3 text-sm font-semibold text-secondary-600">
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="size-4" />
            {quiz.duration}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ListChecks className="size-4" />
            {quiz.questionCount} soal
          </span>
        </div>

        <Button
          className="mt-5 w-full justify-center sm:w-fit"
          render={<Link href={`/quiz/${subject.slug}/${quiz.slug}`} />}
          size="sm"
          variant="brand"
        >
          Kerjakan
        </Button>
      </div>
    </article>
  );
}

export { QuizSubjectDetailPageModule };

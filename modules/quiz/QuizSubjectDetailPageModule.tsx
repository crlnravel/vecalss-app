import Link from "next/link";
import Image from "next/image";
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
        <Card className="relative overflow-hidden rounded-6xl border border-[#dbe8e3] bg-white p-0 gap-0 shadow-[0_32px_100px_-72px_rgba(10,77,59,0.36)]">
          <CardHeader className="relative bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(245,248,246,0.96)_100%)] px-6 pt-8 pb-8 md:px-10 md:pt-10 md:pb-10">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute top-0 right-[-8%] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(239,244,241,0.96)_0%,rgba(239,244,241,0.72)_42%,rgba(239,244,241,0)_74%)] md:top-4 md:h-[42rem] md:w-[42rem]" />
              <div className="absolute top-16 left-[58%] hidden gap-1.5 md:flex">
                <span className="size-2 rounded-full bg-primary-700/45" />
                <span className="size-2 rounded-full bg-primary-700/45" />
                <span className="size-2 rounded-full bg-primary-700/45" />
              </div>
            </div>

            <div className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.96fr)] lg:gap-12">
              <div className="max-w-2xl space-y-6">
                <span className="inline-flex w-fit items-center rounded-full bg-primary-50 px-5 py-2 text-sm font-semibold tracking-[0.08em] text-primary-900 shadow-sm ring-1 ring-primary-100">
                  {subject.code}
                </span>
                <div className="space-y-3">
                  <CardTitle
                    className="text-[clamp(4.5rem,10vw,7rem)] leading-[0.88] font-semibold tracking-[-0.08em] text-primary-950"
                    style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
                  >
                    {subject.title}
                  </CardTitle>
                  <h2 className="text-[clamp(1.55rem,3vw,2.7rem)] leading-[1.08] font-semibold text-secondary-700">
                    {subject.description}
                  </h2>
                </div>
                <CardDescription className="max-w-[34rem] text-base leading-8 text-secondary-600 md:text-[1.05rem]">
                  {subject.description === "Penalaran Umum"
                    ? "Latih penalaran logis, analitis, dan kritis lewat kuis yang ringkas, terarah, dan siap dipakai untuk drilling."
                    : `Latih ${subject.description.toLowerCase()} lewat kuis yang ringkas, terarah, dan mudah diulang.`}
                </CardDescription>
              </div>

              <div className="relative flex justify-center lg:justify-end">
                <div className="relative aspect-[879/639] w-full max-w-[560px]">
                  <div className="absolute inset-x-6 top-14 h-[72%] rounded-full bg-[radial-gradient(circle_at_center,rgba(239,244,241,0.96)_0%,rgba(239,244,241,0.72)_48%,rgba(239,244,241,0)_76%)]" />
                  <div className="absolute top-12 left-12 hidden gap-1.5 md:flex">
                    <span className="size-2 rounded-full bg-primary-700/45" />
                    <span className="size-2 rounded-full bg-primary-700/45" />
                    <span className="size-2 rounded-full bg-primary-700/45" />
                  </div>
                  <Image
                    alt={`${subject.title} illustration`}
                    className="object-contain object-center drop-shadow-[0_28px_48px_rgba(10,77,59,0.14)]"
                    fill
                    priority
                    sizes="(min-width: 1024px) 42vw, 90vw"
                    src="/landing-assets/materi-hero-illustration.png"
                  />
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="grid gap-0 border-t border-[#dbe8e3] bg-white px-0 py-0 lg:grid-cols-2 lg:divide-x lg:divide-[#dbe8e3]">
            <DetailStat
              icon={ListChecks}
              label="Kuis"
              value={stats.totalQuizzes}
            />
            <DetailStat icon={BookOpenCheck} label="Total soal" value={stats.totalQuestions} />
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
    <div className="flex items-center gap-4 px-6 py-6 md:px-8 md:py-8">
      <Icon className="size-7 shrink-0 text-primary-700" />
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="text-[2rem] leading-none font-semibold tracking-[-0.05em] text-primary-900 md:text-[2.35rem]">
          {value}
        </p>
        <p className="text-base font-medium text-secondary-500 md:text-lg">
          {label}
        </p>
      </div>
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

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Clock3, ListChecks } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { CourseWorkspaceShell } from "@/modules/courses/CourseWorkspaceShell";

import { type QuizItem, type QuizSubject } from "./data";

function QuizSubjectDetailPageModule({
  session,
  subject,
}: {
  session: SessionContext;
  subject: QuizSubject;
}) {
  return (
    <CourseWorkspaceShell
      activeLabel="Kuis"
      breadcrumbLabel={subject.title}
      searchPlaceholder="Cari kuis di subjek ini..."
      session={session}
    >
      <div>
        <Button
          nativeButton={false}
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
        <Card className="relative overflow-hidden rounded-[2rem] border border-[#e3ebe7] bg-white p-0 shadow-[0_28px_90px_-64px_rgba(10,77,59,0.34)]">
          <CardHeader className="relative flex min-h-[22rem] items-end overflow-hidden bg-[linear-gradient(115deg,#ffffff_0%,#fbfcfb_48%,#f1f7f4_100%)] px-7 py-8 md:min-h-[30rem] md:px-6 md:py-6 lg:px-8 lg:py-8">
            <div
              className="pointer-events-none absolute inset-0"
              aria-hidden="true"
            >
              <div className="absolute -top-[34%] -right-[5%] h-[150%] w-[52%] rotate-[14deg] rounded-[48%] bg-[#edf5f1]/90" />
              <div className="absolute -top-[14%] right-[13%] h-[120%] w-[26%] rotate-[14deg] rounded-[48%] bg-white/45" />
              <div className="absolute right-[20%] bottom-[18%] h-24 w-24 rounded-full bg-[#e4f0eb]/65 blur-2xl md:h-44 md:w-44" />
            </div>

            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 hidden w-[48%] min-w-[22rem] lg:block">
              <div className="absolute right-[12%] bottom-[9%] h-12 w-[64%] rounded-full bg-primary-900/12 blur-2xl" />
              <Image
                alt=""
                className="absolute right-[-1.5rem] bottom-[-3.5rem] h-auto w-[24rem] max-w-none object-contain drop-shadow-[0_30px_48px_rgba(1,76,56,0.18)] lg:w-[29rem]"
                height={464}
                sizes="(min-width: 1024px) 464px, 384px"
                src="/brand/mascot-vecalss.png"
                width={464}
              />
            </div>

            <div className="relative z-10 space-y-3 lg:max-w-[58%]">
              <CardTitle className="text-[clamp(2.8rem,7vw,5.6rem)] leading-[0.95] font-semibold text-primary-950">
                {subject.description}
              </CardTitle>
              <p className="text-xl font-medium tracking-[0.04em] text-secondary-500 md:text-2xl">
                {subject.code}
              </p>
            </div>
          </CardHeader>
        </Card>
      </section>

      {subject.quizzes.length ? (
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {subject.quizzes.map((quiz) => (
            <QuizCard key={quiz.slug} quiz={quiz} subject={subject} />
          ))}
        </section>
      ) : (
        <section className="rounded-3xl border border-dashed border-primary-200 bg-primary-50/35 px-6 py-14 text-center shadow-[0_12px_38px_-30px_rgba(1,76,56,0.35)]">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary-100 text-primary-800">
            <ListChecks className="size-7" />
          </div>
          <h2 className="mt-5 text-xl font-semibold text-secondary-900">
            Belum ada kuis tersedia
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-secondary-500">
            Kuis untuk subjek ini belum dipublikasikan. Coba cek kembali nanti atau pilih subjek lain untuk mulai berlatih.
          </p>
          <Button className="mt-6" render={<Link href="/quiz" />} size="sm" variant="brandOutline">
            Lihat subjek lain
          </Button>
        </section>
      )}
    </CourseWorkspaceShell>
  );
}

function QuizCard({ quiz, subject }: { quiz: QuizItem; subject: QuizSubject }) {
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
          nativeButton={false}
          render={<Link href={`/quiz/${subject.slug}/${quiz.slug}${quiz.isCompleted ? "/result" : ""}`} />}
          size="sm"
          variant="brand"
        >
          {quiz.isCompleted ? "Cek hasil" : "Kerjakan"}
        </Button>
      </div>
    </article>
  );
}

export { QuizSubjectDetailPageModule };

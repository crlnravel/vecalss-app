import { notFound } from "next/navigation";

import { requireStudentSession } from "@/lib/auth/access";
import { QuizOngoingPageModule } from "@/modules/quiz/QuizOngoingPageModule";
import { getQuizAttemptBySlugs, quizSubjects } from "@/modules/quiz/data";

export function generateStaticParams() {
  return quizSubjects.flatMap((subject) =>
    subject.quizzes.map((quiz) => ({
      quizSlug: quiz.slug,
      slug: subject.slug,
    })),
  );
}

export default async function QuizOngoingPage({
  params,
}: {
  params: Promise<{ quizSlug: string; slug: string }>;
}) {
  const [{ quizSlug, slug }] = await Promise.all([
    params,
    requireStudentSession(),
  ]);

  const quizContext = getQuizAttemptBySlugs(slug, quizSlug);

  if (!quizContext) {
    notFound();
  }

  return (
    <QuizOngoingPageModule
      attempt={quizContext.attempt}
      quiz={quizContext.quiz}
      subjectSlug={quizContext.subject.slug}
      subjectTitle={quizContext.subject.title}
    />
  );
}

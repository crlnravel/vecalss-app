import { notFound } from "next/navigation";

import { requireStudentSession } from "@/lib/auth/access";
import { QuizSubjectDetailPageModule } from "@/modules/quiz/QuizSubjectDetailPageModule";
import { getQuizSubjectBySlug, quizSubjects } from "@/modules/quiz/data";

export function generateStaticParams() {
  return quizSubjects.map((subject) => ({
    slug: subject.slug,
  }));
}

export default async function QuizSubjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [{ slug }, session] = await Promise.all([
    params,
    requireStudentSession(),
  ]);
  const subject = getQuizSubjectBySlug(slug);

  if (!subject) {
    notFound();
  }

  return <QuizSubjectDetailPageModule session={session} subject={subject} />;
}

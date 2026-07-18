import { notFound } from "next/navigation";

import { requireStudentSession } from "@/lib/auth/access";
import { QuizSubjectDetailPageModule } from "@/modules/quiz/QuizSubjectDetailPageModule";
import { getAvailableQuizSubjects } from "@/modules/quiz/server-data";

export default async function QuizSubjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [{ slug }, session] = await Promise.all([
    params,
    requireStudentSession(),
  ]);
  const subjects = await getAvailableQuizSubjects();
  const subject = subjects.find((item) => item.slug === slug);

  if (!subject) {
    notFound();
  }

  return <QuizSubjectDetailPageModule session={session} subject={subject} />;
}

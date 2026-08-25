import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { getMentorStandaloneQuiz, getMentorStandaloneQuizResults } from "@/lib/quiz/repository";
import { KaptenQuizDetailPageModule } from "@/modules/mentor/KaptenQuizDetailPageModule";

type MentorQuizDetailPageProps = {
  params: Promise<{ quizId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
};

export const metadata: Metadata = {
  title: "Detail Kuis Kapten | Vecalss LMS",
};

function parseTab(value: string | string[] | undefined) {
  const tab = Array.isArray(value) ? value[0] : value;
  return tab === "hasil" || tab === "pengaturan" ? tab : "preview";
}

export default async function MentorQuizDetailPage({ params, searchParams }: MentorQuizDetailPageProps) {
  const [{ quizId }, { tab }, session] = await Promise.all([params, searchParams, requireTutorSession()]);
  const [initial, results] = await Promise.all([
    getMentorStandaloneQuiz(quizId, session.user.id),
    getMentorStandaloneQuizResults(quizId, session.user.id),
  ]);
  if (!initial || !results) notFound();

  return <KaptenQuizDetailPageModule initialQuestions={initial.questions} initialQuiz={initial.quiz} initialResults={results} initialTab={parseTab(tab)} session={session} />;
}

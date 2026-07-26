import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { getMentorStandaloneQuizResults } from "@/lib/quiz/repository";
import { KaptenQuizResultsPageModule } from "@/modules/mentor/KaptenQuizResultsPageModule";

export default async function MentorQuizResultsPage({ params }: { params: Promise<{ quizId: string }> }) {
  const [{ quizId }, session] = await Promise.all([params, requireTutorSession()]);
  const result = await getMentorStandaloneQuizResults(quizId, session.user.id);
  if (!result) notFound();
  return <KaptenQuizResultsPageModule result={result} session={session} />;
}

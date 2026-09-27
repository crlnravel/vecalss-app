import { requireStudentSession } from "@/lib/auth/access";
import { notFound, redirect } from "next/navigation";
import { QuizStartPageModule } from "@/modules/quiz/QuizStartPageModule";
import { QuizOngoingPageModule } from "@/modules/quiz/QuizOngoingPageModule";
import { getAvailableQuizAttempt, getAvailableQuizPreview } from "@/modules/quiz/server-data";

export default async function QuizOngoingPage({
  params,
  searchParams: searchParamsPromise,
}: {
  params: Promise<{ quizSlug: string; slug: string }>;
  searchParams: Promise<{ attemptId?: string }>;
}) {
  const [{ quizSlug, slug }, searchParams, session] = await Promise.all([
    params,
    searchParamsPromise,
    requireStudentSession(),
  ]);
  const result = await getAvailableQuizAttempt(slug, quizSlug, session.user.id, searchParams.attemptId);
  if (!result) {
    const preview = await getAvailableQuizPreview(slug, quizSlug, session.user.id);
    if (!preview) notFound();
    return <QuizStartPageModule policy={preview.policy} quiz={preview.quiz} startAvailability={preview.startAvailability} subjectCode={preview.subject.title} subjectSlug={slug} subjectTitle={preview.subject.title} />;
  }
  if (result.attempt.isSubmitted) redirect(`/quiz/${slug}/${quizSlug}/result?attemptId=${encodeURIComponent(result.attemptId)}`);
  return <QuizOngoingPageModule key={result.attemptId} attempt={result.attempt} attemptId={result.attemptId} quiz={result.quiz} subjectSlug={slug} subjectTitle={result.subject.title} />;
}

import { requireStudentSession } from "@/lib/auth/access";
import { notFound, redirect } from "next/navigation";
import { QuizStartPageModule } from "@/modules/quiz/QuizStartPageModule";
import { QuizOngoingPageModule } from "@/modules/quiz/QuizOngoingPageModule";
import { getStudentQuizRouteData } from "@/modules/quiz/route-data";

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
  const route = await getStudentQuizRouteData(slug, quizSlug, session.user.id, notFound, searchParams.attemptId);
  if (route.kind === "preview") {
    const preview = route.data;
    return <QuizStartPageModule policy={preview.policy} quiz={preview.quiz} startAvailability={preview.startAvailability} subjectCode={preview.subject.title} subjectSlug={slug} subjectTitle={preview.subject.title} />;
  }
  const result = route.data;
  if (result.attempt.isSubmitted) redirect(`/quiz/${slug}/${quizSlug}/result?attemptId=${encodeURIComponent(result.attemptId)}`);
  return <QuizOngoingPageModule key={result.attemptId} attempt={result.attempt} attemptId={result.attemptId} quiz={result.quiz} subjectSlug={slug} subjectTitle={result.subject.title} />;
}

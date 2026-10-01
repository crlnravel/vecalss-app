import { redirect } from "next/navigation";
import { requireTutorSession } from "@/lib/auth/access";
import { quizDashboardReturnHref } from "@/modules/mentor/quiz-dashboard-contract";

export default async function MentorQuizResultsRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ quizId: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const [{ quizId }, query] = await Promise.all([
    params,
    searchParams,
    requireTutorSession(),
  ]);
  const returnHref = quizDashboardReturnHref(query.returnTo);
  redirect(
    `/mentor/quiz/${quizId}?tab=hasil&returnTo=${encodeURIComponent(returnHref)}`,
  );
}

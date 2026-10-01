import { quizDashboardReturnHref } from "@/modules/mentor/quiz-dashboard-contract";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { getMentorStandaloneQuizSubmission } from "@/lib/quiz/repository";
import { KaptenQuizSubmissionPageModule } from "@/modules/mentor/KaptenQuizSubmissionPageModule";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export default async function MentorQuizSubmissionPage({
  params,
  searchParams,
}: {
  params: Promise<{ attemptId: string; quizId: string }>;
  searchParams: Promise<{returnTo?: string | string[]}>;
}) {
  const [{ attemptId, quizId }, session, query] = await Promise.all([params, requireTutorSession(), searchParams]);
  const submission = await getMentorStandaloneQuizSubmission(quizId, attemptId, session.user.id);
  if (!submission) notFound();
  return <MentorWorkspaceShell activeLabel="Kuis" breadcrumbLabel={`${submission.quiz.subject} · Hasil pengerjaan`} mainClassName="max-w-none" searchPlaceholder="Cari kuis atau subtes..." session={session} showSearch={false} sidebarAppearance="reference"><KaptenQuizSubmissionPageModule submission={submission} returnHref={quizDashboardReturnHref(query.returnTo)} /></MentorWorkspaceShell>;
}

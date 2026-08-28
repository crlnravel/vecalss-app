import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { getMentorStandaloneQuizSubmission } from "@/lib/quiz/repository";
import { KaptenQuizSubmissionPageModule } from "@/modules/mentor/KaptenQuizSubmissionPageModule";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export default async function MentorQuizSubmissionPage({
  params,
}: {
  params: Promise<{ attemptId: string; quizId: string }>;
}) {
  const [{ attemptId, quizId }, session] = await Promise.all([params, requireTutorSession()]);
  const submission = await getMentorStandaloneQuizSubmission(quizId, attemptId, session.user.id);
  if (!submission) notFound();
  return <MentorWorkspaceShell activeLabel="Kuis" breadcrumbLabel={`${submission.quiz.subject} · Pengiriman`} mainClassName="max-w-none" searchPlaceholder="Cari kuis atau subjek..." session={session} showSearch={false} sidebarAppearance="reference"><KaptenQuizSubmissionPageModule submission={submission} /></MentorWorkspaceShell>;
}

"use client";

import { notFound } from "next/navigation";

import type { SessionContext } from "@/lib/auth/types";
import { KaptenQuizBuilderPageModule } from "@/modules/mentor/KaptenQuizBuilderPageModule";
import { useStoredQuizDraft } from "@/modules/mentor/quiz-draft-storage";

function PersistedQuizBuilderRoute({
  quizId,
  session,
}: {
  quizId: string;
  session: SessionContext;
}) {
  const storedDraft = useStoredQuizDraft(quizId);

  if (storedDraft === undefined) {
    return null;
  }

  if (!storedDraft) {
    notFound();
  }

  return (
    <KaptenQuizBuilderPageModule
      initialQuiz={storedDraft.quiz}
      mode="edit"
      quizId={quizId}
      session={session}
    />
  );
}

export { PersistedQuizBuilderRoute };

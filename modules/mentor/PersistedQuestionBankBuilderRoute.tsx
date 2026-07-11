"use client";

import { notFound } from "next/navigation";

import type { SessionContext } from "@/lib/auth/types";
import { KaptenQuestionBankBuilderPageModule } from "@/modules/mentor/KaptenQuestionBankBuilderPageModule";
import { useStoredQuestionBankDraft } from "@/modules/mentor/question-bank-draft-storage";

function PersistedQuestionBankBuilderRoute({
  bankId,
  session,
}: {
  bankId: string;
  session: SessionContext;
}) {
  const storedDraft = useStoredQuestionBankDraft(bankId);

  if (storedDraft === undefined) {
    return null;
  }

  if (!storedDraft) {
    notFound();
  }

  return (
    <KaptenQuestionBankBuilderPageModule
      initialBank={storedDraft.bank}
      initialQuestions={storedDraft.questions}
      mode="edit"
      bankId={bankId}
      session={session}
    />
  );
}

export { PersistedQuestionBankBuilderRoute };

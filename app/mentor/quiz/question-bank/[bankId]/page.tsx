import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { KaptenQuestionBankBuilderPageModule } from "@/modules/mentor/KaptenQuestionBankBuilderPageModule";
import { PersistedQuestionBankBuilderRoute } from "@/modules/mentor/PersistedQuestionBankBuilderRoute";
import { bankQuestions, questionBanks } from "@/modules/mentor/mock-data";

type MentorQuestionBankPageProps = {
  params: Promise<{ bankId: string }>;
};

export const metadata: Metadata = {
  title: "Edit Question Bank Kapten | Vecalss LMS",
};

export default async function MentorQuestionBankBuilderPage({ params }: MentorQuestionBankPageProps) {
  const [{ bankId }, session] = await Promise.all([params, requireTutorSession()]);
  const initialBank = questionBanks.find((bank) => bank.id === bankId);

  if (!initialBank) {
    return <PersistedQuestionBankBuilderRoute bankId={bankId} session={session} />;
  }

  return (
    <KaptenQuestionBankBuilderPageModule
      bankId={bankId}
      initialBank={initialBank}
      initialQuestions={bankQuestions.filter((question) => question.bankId === bankId)}
      mode="edit"
      session={session}
    />
  );
}

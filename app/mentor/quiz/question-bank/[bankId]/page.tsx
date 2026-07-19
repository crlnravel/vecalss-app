import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { getQuestionBankForEdit } from "@/lib/question-bank/repository";
import { KaptenQuestionBankBuilderPageModule } from "@/modules/mentor/KaptenQuestionBankBuilderPageModule";

type MentorQuestionBankPageProps = {
  params: Promise<{ bankId: string }>;
};

export const metadata: Metadata = {
  title: "Edit Question Bank Kapten | Vecalss LMS",
};

export default async function MentorQuestionBankBuilderPage({ params }: MentorQuestionBankPageProps) {
  const [{ bankId }, session] = await Promise.all([params, requireTutorSession()]);
  const initial = await getQuestionBankForEdit(bankId);
  if (!initial) notFound();
  return <KaptenQuestionBankBuilderPageModule bankId={bankId} initialBank={initial.bank} initialQuestions={initial.questions} mode="edit" session={session} />;
}

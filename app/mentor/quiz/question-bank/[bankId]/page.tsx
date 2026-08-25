import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import {
  getQuestionBankForEdit,
  listQuestionBankCategories,
} from "@/lib/question-bank/repository";
import { KaptenQuestionBankDetailPageModule } from "@/modules/mentor/KaptenQuestionBankDetailPageModule";

type MentorQuestionBankPageProps = {
  params: Promise<{ bankId: string }>;
};

export const metadata: Metadata = {
  title: "Detail Bank Soal Kapten | Vecalss LMS",
};

export default async function MentorQuestionBankDetailPage({ params }: MentorQuestionBankPageProps) {
  const [{ bankId }, session] = await Promise.all([params, requireTutorSession()]);
  const [initial, initialCategories] = await Promise.all([
    getQuestionBankForEdit(bankId),
    listQuestionBankCategories(),
  ]);
  if (!initial) notFound();
  return (
    <KaptenQuestionBankDetailPageModule
      bankId={bankId}
      initialBank={initial.bank}
      initialCategories={initialCategories}
      initialQuestions={initial.questions}
      initialReadiness={initial.readiness}
      session={session}
    />
  );
}

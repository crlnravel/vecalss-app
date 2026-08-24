import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import {
  getQuestionBankForEdit,
  listQuestionBankCategories,
  listQuestionBankFolderTree,
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
  const [initial, initialFolderTree, initialCategories] = await Promise.all([
    getQuestionBankForEdit(bankId),
    listQuestionBankFolderTree(),
    listQuestionBankCategories(),
  ]);
  if (!initial) notFound();
  return (
    <KaptenQuestionBankDetailPageModule
      bankId={bankId}
      initialBank={initial.bank}
      initialCategories={initialCategories}
      initialFolderTree={initialFolderTree}
      initialQuestions={initial.questions}
      initialReadiness={initial.readiness}
      session={session}
    />
  );
}

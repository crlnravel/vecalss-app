import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import {
  getQuestionBankForEdit,
  listQuestionBankCategories,
  listQuestionBankFolderTree,
} from "@/lib/question-bank/repository";
import { KaptenQuestionBankBuilderPageModule } from "@/modules/mentor/KaptenQuestionBankBuilderPageModule";

type MentorQuestionBankPageProps = {
  params: Promise<{ bankId: string }>;
};

export const metadata: Metadata = {
  title: "Edit Question Bank Kapten | Vecalss LMS",
};

export default async function MentorQuestionBankBuilderPage({ params }: MentorQuestionBankPageProps) {
  const [{ bankId }, session] = await Promise.all([params, requireTutorSession()]);
  const [initial, initialFolderTree, initialCategories] = await Promise.all([
    getQuestionBankForEdit(bankId),
    listQuestionBankFolderTree(),
    listQuestionBankCategories(),
  ]);
  if (!initial) notFound();
  return <KaptenQuestionBankBuilderPageModule bankId={bankId} initialBank={initial.bank} initialCategories={initialCategories} initialFolderTree={initialFolderTree} initialQuestions={initial.questions} initialReadiness={initial.readiness} mode="edit" session={session} />;
}

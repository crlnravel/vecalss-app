import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import {
  getQuestionBankForEdit,
  listQuestionBankCategories,
} from "@/lib/question-bank/repository";
import { KaptenQuestionBankBuilderPageModule } from "@/modules/mentor/KaptenQuestionBankBuilderPageModule";

type MentorQuestionBankEditorPageProps = {
  params: Promise<{ bankId: string }>;
  searchParams?: Promise<{ question?: string }>;
};

export const metadata: Metadata = {
  title: "Editor Bank Soal Kapten | Vecalss LMS",
};

export default async function MentorQuestionBankEditorPage({
  params,
  searchParams,
}: MentorQuestionBankEditorPageProps) {
  const [{ bankId }, query, session] = await Promise.all([
    params,
    searchParams ? searchParams : Promise.resolve<{ question?: string }>({}),
    requireTutorSession(),
  ]);
  const [initial, initialCategories] = await Promise.all([
    getQuestionBankForEdit(bankId),
    listQuestionBankCategories(),
  ]);
  if (!initial || initial.bank.status !== "draft") notFound();

  return (
    <KaptenQuestionBankBuilderPageModule
      bankId={bankId}
      initialActiveQuestionId={query?.question}
      initialBank={initial.bank}
      initialCategories={initialCategories}
      initialQuestions={initial.questions}
      initialReadiness={initial.readiness}
      mode="edit"
      session={session}
    />
  );
}

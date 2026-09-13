import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import {
  getQuestionBankForEdit,
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
  const initial = await getQuestionBankForEdit(bankId);
  if (!initial || initial.bank.status !== "draft") notFound();

  return (
    <KaptenQuestionBankBuilderPageModule
      bankId={bankId}
      initialActiveQuestionId={query?.question}
      initialBank={initial.bank}
      initialQuestions={initial.questions}
      initialReadiness={initial.readiness}
      mode="edit"
      purpose={initial.bank.purpose ?? "quiz"}
      session={session}
    />
  );
}

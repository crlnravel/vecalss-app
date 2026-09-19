import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { getQuestionBankForEdit } from "@/lib/question-bank/repository";
import { KaptenQuestionBankDetailPageModule } from "@/modules/mentor/KaptenQuestionBankDetailPageModule";

type MentorQuestionBankPageProps = {
  params: Promise<{ bankId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
};

export const metadata: Metadata = {
  title: "Detail Bank Soal Kapten | Vecalss LMS",
};

function parseTab(value: string | string[] | undefined) {
  const tab = Array.isArray(value) ? value[0] : value;
  return tab === "pengaturan" ? "pengaturan" : "soal";
}

export default async function MentorQuestionBankDetailPage({
  params,
  searchParams,
}: MentorQuestionBankPageProps) {
  const [{ bankId }, { tab }, session] = await Promise.all([
    params,
    searchParams,
    requireTutorSession(),
  ]);
  const initial = await getQuestionBankForEdit(bankId);
  if (!initial) notFound();
  return (
    <KaptenQuestionBankDetailPageModule
      bankId={bankId}
      initialBank={initial.bank}
      initialQuestions={initial.questions}
      initialReadiness={initial.readiness}
      initialTab={parseTab(tab)}
      session={session}
    />
  );
}

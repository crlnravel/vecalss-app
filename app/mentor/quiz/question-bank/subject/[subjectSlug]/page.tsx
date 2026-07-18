import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { KaptenQuestionBankSubjectPageModule } from "@/modules/mentor/KaptenQuestionBankCataloguePageModules";
import { kaptenSubjects } from "@/modules/mentor/mock-data";

type MentorQuestionBankSubjectPageProps = { params: Promise<{ subjectSlug: string }> };

export const metadata: Metadata = { title: "Subject Bank Soal Kapten | Vecalss LMS" };

export default async function MentorQuestionBankSubjectPage({ params }: MentorQuestionBankSubjectPageProps) {
  const [{ subjectSlug }, session] = await Promise.all([params, requireTutorSession()]);
  const subject = kaptenSubjects.find((item) => item.slug === subjectSlug);
  if (!subject) notFound();
  return <KaptenQuestionBankSubjectPageModule session={session} subject={subject} />;
}

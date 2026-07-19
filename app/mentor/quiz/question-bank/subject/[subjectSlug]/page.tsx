import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { kaptenSubjects } from "@/modules/mentor/mock-data";

type MentorQuestionBankSubjectPageProps = { params: Promise<{ subjectSlug: string }> };

export const metadata: Metadata = { title: "Subject Bank Soal Kapten | Vecalss LMS" };

export default async function MentorQuestionBankSubjectPage({ params }: MentorQuestionBankSubjectPageProps) {
  const [{ subjectSlug }] = await Promise.all([params, requireTutorSession()]);
  const subject = kaptenSubjects.find((item) => item.slug === subjectSlug);
  if (!subject) notFound();
  // Subject-owned Bank URLs are retained only as a navigation alias. Bank
  // coverage is now derived from question classifications.
  redirect(`/mentor/quiz/question-bank?subtest=${encodeURIComponent(subject.code)}`);
}

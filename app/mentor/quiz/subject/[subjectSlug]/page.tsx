import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { getMentorStandaloneQuizzes, getSubjectMetadataBySlug } from "@/lib/quiz/repository";
import { KaptenQuizSubjectPageModule } from "@/modules/mentor/KaptenQuizCataloguePageModules";

type MentorQuizSubjectPageProps = { params: Promise<{ subjectSlug: string }> };

export const metadata: Metadata = { title: "Subject Quiz Kapten | Vecalss LMS" };

export default async function MentorQuizSubjectPage({ params }: MentorQuizSubjectPageProps) {
  const { subjectSlug } = await params;
  const session = await requireTutorSession();
  const subject = getSubjectMetadataBySlug(subjectSlug);
  if (!subject) notFound();
  const catalogue = await getMentorStandaloneQuizzes(session.user.id);
  return <KaptenQuizSubjectPageModule catalogue={catalogue} session={session} subject={subject} />;
}

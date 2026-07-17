import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { KaptenMateriSubjectPageModule } from "@/modules/mentor/KaptenMateriCataloguePageModules";
import { getMateriSubject } from "@/modules/mentor/materi-model";

type MentorMateriSubjectPageProps = {
  params: Promise<{ subjectSlug: string }>;
};

export const metadata: Metadata = {
  title: "Subject Materi Kapten | Vecalss LMS",
};

export default async function MentorMateriSubjectPage({
  params,
}: MentorMateriSubjectPageProps) {
  const [{ subjectSlug }, session] = await Promise.all([params, requireTutorSession()]);
  const subject = getMateriSubject(subjectSlug);

  if (!subject) {
    notFound();
  }

  return <KaptenMateriSubjectPageModule session={session} subject={subject} />;
}

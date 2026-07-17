import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { getMentorMateriCatalogue } from "@/lib/materi/repository";
import { KaptenMateriSubjectPageModule } from "@/modules/mentor/KaptenMateriCataloguePageModules";
import { toKaptenMateriCatalogueView } from "@/modules/mentor/materi-view-model";

type MentorMateriSubjectPageProps = {
  params: Promise<{ subjectSlug: string }>;
};

export const metadata: Metadata = {
  title: "Subject Materi Kapten | Vecalss LMS",
};

export default async function MentorMateriSubjectPage({
  params,
}: MentorMateriSubjectPageProps) {
  const { subjectSlug } = await params;
  const session = await requireTutorSession();
  const catalogue = await getMentorMateriCatalogue();
  const view = toKaptenMateriCatalogueView(catalogue);
  const subject = view.subjects.find((item) => item.slug === subjectSlug);

  if (!subject) {
    notFound();
  }

  return <KaptenMateriSubjectPageModule catalogue={view.lessons} session={session} subject={subject} />;
}

import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { getMentorMateriCatalogue } from "@/lib/materi/repository";
import { KaptenMateriBuilderPageModule } from "@/modules/mentor/KaptenMateriBuilderPageModule";
import { toKaptenMateriCatalogueView } from "@/modules/mentor/materi-view-model";

export const metadata: Metadata = {
  title: "Buat Materi Kapten | Vecalss LMS",
};

type CreateMentorMateriPageProps = {
  searchParams: Promise<{
    returnTo?: string | string[];
    subject?: string | string[];
  }>;
};

export default async function CreateMentorMateriPage({
  searchParams,
}: CreateMentorMateriPageProps) {
  const session = await requireTutorSession();
  const [query, catalogue] = await Promise.all([searchParams, getMentorMateriCatalogue()]);
  const view = toKaptenMateriCatalogueView(catalogue);
  const subjectSlug = typeof query.subject === "string" ? query.subject : undefined;
  const initialSubjectSlug = view.subjects.some((subject) => subject.slug === subjectSlug) ? subjectSlug : undefined;
  const returnTo = typeof query.returnTo === "string" && view.subjects.some((subject) => query.returnTo === `/mentor/materi/subject/${subject.slug}`) ? query.returnTo : undefined;

  return (
    <KaptenMateriBuilderPageModule
      initialSubjectSlug={initialSubjectSlug}
      mode="create"
      returnTo={returnTo}
      session={session}
      subjects={view.subjects}
    />
  );
}

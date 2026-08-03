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
  const [session, catalogue, query] = await Promise.all([
    requireTutorSession(),
    getMentorMateriCatalogue(),
    searchParams,
  ]);
  const view = toKaptenMateriCatalogueView(catalogue);
  const subjectSlug = typeof query.subject === "string" && view.subjects.some((subject) => subject.slug === query.subject)
    ? query.subject
    : undefined;
  const requestedReturnTo = typeof query.returnTo === "string" && view.subjects.some((subject) => query.returnTo === `/mentor/materi/subject/${subject.slug}`)
    ? query.returnTo
    : undefined;
  const returnTo = requestedReturnTo ?? (subjectSlug ? `/mentor/materi/subject/${subjectSlug}` : undefined);

  return (
    <KaptenMateriBuilderPageModule
      initialSubjectSlug={subjectSlug}
      mode="create"
      returnTo={returnTo}
      session={session}
      subjects={view.subjects}
    />
  );
}

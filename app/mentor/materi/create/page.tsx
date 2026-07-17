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
    section?: string | string[];
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
  const sectionId = typeof query.section === "string" ? query.section : undefined;
  const hasValidContext = Boolean(
    subjectSlug
    && sectionId
    && view.subjects.some((subject) => subject.slug === subjectSlug && subject.sections.some((section) => section.sectionId === sectionId)),
  );
  const returnTo = typeof query.returnTo === "string" && view.subjects.some((subject) => query.returnTo === `/mentor/materi/subject/${subject.slug}`) ? query.returnTo : undefined;

  return (
    <KaptenMateriBuilderPageModule
      catalogue={view.lessons}
      createContext={hasValidContext && subjectSlug && sectionId ? { sectionId, subjectSlug } : undefined}
      mode="create"
      returnTo={returnTo}
      session={session}
      subjects={view.subjects}
    />
  );
}

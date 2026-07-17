import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { getMentorMateriByCode, getMentorMateriCatalogue } from "@/lib/materi/repository";
import { KaptenMateriBuilderPageModule } from "@/modules/mentor/KaptenMateriBuilderPageModule";
import { toKaptenMateriCatalogueView, toKaptenMateriEditorView } from "@/modules/mentor/materi-view-model";

type MentorMateriBuilderPageProps = {
  params: Promise<{
    materiId: string;
  }>;
  searchParams: Promise<{
    preview?: string | string[];
    returnTo?: string | string[];
  }>;
};

export const metadata: Metadata = {
  title: "Edit Materi Kapten | Vecalss LMS",
};

export default async function MentorMateriBuilderPage({
  params,
  searchParams,
}: MentorMateriBuilderPageProps) {
  const { materiId } = await params;
  const session = await requireTutorSession();
  const [query, catalogue, lesson] = await Promise.all([
    searchParams,
    getMentorMateriCatalogue(),
    getMentorMateriByCode(materiId),
  ]);
  const view = toKaptenMateriCatalogueView(catalogue);
  const initialMateri = toKaptenMateriEditorView(lesson);
  if (!initialMateri) notFound();
  const returnTo = typeof query.returnTo === "string" && view.subjects.some((subject) => query.returnTo === `/mentor/materi/subject/${subject.slug}`) ? query.returnTo : undefined;

  return (
    <KaptenMateriBuilderPageModule
      initialMateri={initialMateri}
      initialPreview={query.preview === "1"}
      materiId={materiId}
      mode="edit"
      returnTo={returnTo}
      session={session}
      subjects={view.subjects}
    />
  );
}

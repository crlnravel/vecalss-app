import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { getMentorMateriCatalogue } from "@/lib/materi/repository";
import { KaptenMateriPageModule } from "@/modules/mentor/KaptenMateriCataloguePageModules";
import { toKaptenMateriCatalogueView } from "@/modules/mentor/materi-view-model";

export const metadata: Metadata = {
  title: "Materi Kapten | Vecalss LMS",
};

export default async function MentorMateriPage() {
  const session = await requireTutorSession();
  const catalogue = await getMentorMateriCatalogue();
  const view = toKaptenMateriCatalogueView(catalogue);

  return <KaptenMateriPageModule catalogue={view.lessons} session={session} subjects={view.subjects} />;
}

import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { getMentorMateriCatalogue } from "@/lib/materi/repository";
import { MentorDashboardPageModule } from "@/modules/mentor/MentorDashboardPageModule";
import { toKaptenMateriCatalogueView } from "@/modules/mentor/materi-view-model";

export const metadata: Metadata = {
  title: "Dashboard Kapten | Vecalss LMS",
};

export default async function MentorDashboardPage() {
  const session = await requireTutorSession();
  const catalogue = await getMentorMateriCatalogue();
  const view = toKaptenMateriCatalogueView(catalogue);

  return <MentorDashboardPageModule materiRecentlyEdited={view.lessons} session={session} />;
}

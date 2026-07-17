import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { KaptenMateriPageModule } from "@/modules/mentor/KaptenMateriCataloguePageModules";

export const metadata: Metadata = {
  title: "Materi Kapten | Vecalss LMS",
};

export default async function MentorMateriPage() {
  const session = await requireTutorSession();

  return <KaptenMateriPageModule session={session} />;
}

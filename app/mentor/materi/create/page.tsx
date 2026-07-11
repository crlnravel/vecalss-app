import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { KaptenMateriBuilderPageModule } from "@/modules/mentor/KaptenMateriBuilderPageModule";

export const metadata: Metadata = {
  title: "Buat Materi Kapten | Vecalss LMS",
};

export default async function CreateMentorMateriPage() {
  const session = await requireTutorSession();

  return <KaptenMateriBuilderPageModule mode="create" session={session} />;
}

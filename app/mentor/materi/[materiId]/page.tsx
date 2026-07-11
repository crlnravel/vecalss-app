import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { KaptenMateriBuilderPageModule } from "@/modules/mentor/KaptenMateriBuilderPageModule";
import { PersistedMateriBuilderRoute } from "@/modules/mentor/PersistedMateriBuilderRoute";
import { getMateriById } from "@/modules/mentor/mock-data";

type MentorMateriBuilderPageProps = {
  params: Promise<{
    materiId: string;
  }>;
};

export const metadata: Metadata = {
  title: "Edit Materi Kapten | Vecalss LMS",
};

export default async function MentorMateriBuilderPage({
  params,
}: MentorMateriBuilderPageProps) {
  const [{ materiId }, session] = await Promise.all([
    params,
    requireTutorSession(),
  ]);
  const initialMateri = getMateriById(materiId);

  if (!initialMateri) {
    return <PersistedMateriBuilderRoute materiId={materiId} session={session} />;
  }

  return (
    <KaptenMateriBuilderPageModule
      initialMateri={initialMateri}
      materiId={materiId}
      mode="edit"
      session={session}
    />
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { KaptenMateriBuilderPageModule } from "@/modules/mentor/KaptenMateriBuilderPageModule";
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
    notFound();
  }

  return (
    <KaptenMateriBuilderPageModule
      initialMateri={initialMateri}
      mode="edit"
      session={session}
    />
  );
}

import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { PersistedMateriBuilderRoute } from "@/modules/mentor/PersistedMateriBuilderRoute";
import { getValidatedMateriReturnTo } from "@/modules/mentor/materi-model";
import { getMateriById } from "@/modules/mentor/mock-data";

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
  const [{ materiId }, session, query] = await Promise.all([
    params,
    requireTutorSession(),
    searchParams,
  ]);
  const initialMateri = getMateriById(materiId);

  return (
    <PersistedMateriBuilderRoute
      initialMateri={initialMateri}
      initialPreview={query.preview === "1"}
      materiId={materiId}
      returnTo={getValidatedMateriReturnTo(query.returnTo)}
      session={session}
    />
  );
}

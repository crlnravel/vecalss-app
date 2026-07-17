import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { KaptenMateriBuilderPageModule } from "@/modules/mentor/KaptenMateriBuilderPageModule";
import {
  getCanonicalMateriSection,
  getMateriSubject,
  getValidatedMateriReturnTo,
} from "@/modules/mentor/materi-model";

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
  const [session, query] = await Promise.all([requireTutorSession(), searchParams]);
  const subjectSlug = typeof query.subject === "string" ? query.subject : undefined;
  const sectionId = typeof query.section === "string" ? query.section : undefined;
  const hasValidContext = Boolean(
    subjectSlug
    && sectionId
    && getMateriSubject(subjectSlug)
    && getCanonicalMateriSection(subjectSlug, sectionId),
  );

  return (
    <KaptenMateriBuilderPageModule
      createContext={hasValidContext && subjectSlug && sectionId ? { sectionId, subjectSlug } : undefined}
      mode="create"
      returnTo={getValidatedMateriReturnTo(query.returnTo)}
      session={session}
    />
  );
}

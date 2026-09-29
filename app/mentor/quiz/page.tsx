import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import {
  readQueryValues,
  type NavigationQueryValue,
} from "@/lib/navigation/canonical-context";
import { KaptenQuizPageModule } from "@/modules/mentor/KaptenQuizCataloguePageModules";
import { kaptenSubjects } from "@/modules/mentor/mock-data";

export const metadata: Metadata = {
  title: "Kuis Kapten | Vecalss LMS",
};

export default async function MentorQuizPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, NavigationQueryValue>>;
}) {
  const session = await requireTutorSession();
  const query = await searchParams;
  const createValues = readQueryValues(query, "create");
  const subjectValues = readQueryValues(query, "subject");
  const requestedSubjectCode = subjectValues[0]?.trim();
  const initialSubjectCode = kaptenSubjects.some(
    (subject) => subject.code === requestedSubjectCode,
  )
    ? requestedSubjectCode
    : undefined;
  return (
    <KaptenQuizPageModule
      initialCreateDialogOpen={
        createValues.length === 1 && createValues[0] === "1"
      }
      initialSubjectCode={initialSubjectCode}
      session={session}
      subjects={kaptenSubjects}
    />
  );
}

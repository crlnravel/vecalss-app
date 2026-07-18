import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { getStandaloneQuizSubjects } from "@/lib/quiz/repository";
import { KaptenQuizPageModule } from "@/modules/mentor/KaptenQuizCataloguePageModules";

export const metadata: Metadata = {
  title: "Quiz Kapten | Vecalss LMS",
};

export default async function MentorQuizPage() {
  const session = await requireTutorSession();
  const subjects = getStandaloneQuizSubjects();

  return <KaptenQuizPageModule session={session} subjects={[...subjects]} />;
}

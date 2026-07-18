import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { getMentorStandaloneQuizzes } from "@/lib/quiz/repository";
import { KaptenQuizPageModule } from "@/modules/mentor/KaptenContentPageModules";

export const metadata: Metadata = {
  title: "Quiz Kapten | Vecalss LMS",
};

export default async function MentorQuizPage() {
  const session = await requireTutorSession();
  const persistedQuizzes = await getMentorStandaloneQuizzes(session.user.id);

  return <KaptenQuizPageModule persistedQuizzes={persistedQuizzes} session={session} />;
}

import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { KaptenQuizPageModule } from "@/modules/mentor/KaptenContentPageModules";

export const metadata: Metadata = {
  title: "Quiz Kapten | Vecalss LMS",
};

export default async function MentorQuizPage() {
  const session = await requireTutorSession();

  return <KaptenQuizPageModule session={session} />;
}

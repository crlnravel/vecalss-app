import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { KaptenQuizEditorPageModule } from "@/modules/mentor/KaptenQuizEditorPageModule";

export const metadata: Metadata = {
  title: "Buat Quiz Kapten | Vecalss LMS",
};

export default async function CreateMentorQuizPage() {
  const session = await requireTutorSession();
  return <KaptenQuizEditorPageModule mode="create" session={session} />;
}

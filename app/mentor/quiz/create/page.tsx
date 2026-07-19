import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { listQuestionBankSources } from "@/lib/question-bank/repository";
import { KaptenQuizBuilderPageModule } from "@/modules/mentor/KaptenQuizBuilderPageModule";

export const metadata: Metadata = {
  title: "Buat Quiz Kapten | Vecalss LMS",
};

export default async function CreateMentorQuizPage() {
  const [session, sourceCatalog] = await Promise.all([requireTutorSession(), listQuestionBankSources()]);

  return <KaptenQuizBuilderPageModule mode="create" session={session} sourceCatalog={sourceCatalog} />;
}

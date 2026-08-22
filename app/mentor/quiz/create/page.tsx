import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { listQuestionBankCategories, listQuestionBankSourcePage } from "@/lib/question-bank/repository";
import { KaptenQuizBuilderPageModule } from "@/modules/mentor/KaptenQuizBuilderPageModule";
import { listReadyAssemblyRevisions } from "@/lib/tryout/assembly-repository";

export const metadata: Metadata = {
  title: "Buat Quiz Kapten | Vecalss LMS",
};

export default async function CreateMentorQuizPage() {
  const session = await requireTutorSession();
  const [sourcePage, sourceCategories, readyAssemblies] = await Promise.all([
    listQuestionBankSourcePage({ page: 1, pageSize: 20 }),
    listQuestionBankCategories(),
    listReadyAssemblyRevisions(),
  ]);

  return <KaptenQuizBuilderPageModule mode="create" readyAssemblies={readyAssemblies} session={session} sourceCatalog={sourcePage.items.map(({ bank }) => ({ bank, questions: [] }))} sourceCatalogPage={sourcePage} sourceCategories={sourceCategories} />;
}

import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import {
  listQuestionBankCategories,
  listQuestionBankFolderTree,
} from "@/lib/question-bank/repository";
import { KaptenQuestionBankBuilderPageModule } from "@/modules/mentor/KaptenQuestionBankBuilderPageModule";

export const metadata: Metadata = {
  title: "Buat Question Bank Kapten | Vecalss LMS",
};

export default async function CreateMentorQuestionBankPage() {
  const session = await requireTutorSession();
  const [initialFolderTree, initialCategories] = await Promise.all([
    listQuestionBankFolderTree(),
    listQuestionBankCategories(),
  ]);

  return <KaptenQuestionBankBuilderPageModule initialCategories={initialCategories} initialFolderTree={initialFolderTree} mode="create" session={session} />;
}

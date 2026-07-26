import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { listQuestionBanks } from "@/lib/question-bank/repository";
import { KaptenQuestionBankPageModule } from "@/modules/mentor/KaptenQuestionBankCataloguePageModules";

export const metadata: Metadata = {
  title: "Question Bank Kapten | Vecalss LMS",
};

export default async function MentorQuestionBankPage() {
  const [session, banks] = await Promise.all([requireTutorSession(), listQuestionBanks()]);

  return <KaptenQuestionBankPageModule initialEntries={banks} session={session} />;
}

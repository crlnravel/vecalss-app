import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { listQuestionBanks } from "@/lib/question-bank/repository";
import { KaptenQuestionBankPageModule } from "@/modules/mentor/KaptenQuestionBankCataloguePageModules";

export const metadata: Metadata = {
  title: "Question Bank Kapten | Vecalss LMS",
};

export default async function MentorQuestionBankPage({ searchParams }: PageProps<"/mentor/quiz/question-bank">) {
  const [session, query, banks] = await Promise.all([requireTutorSession(), searchParams, listQuestionBanks()]);
  const subtest = typeof query.subtest === "string" ? query.subtest : undefined;

  return <KaptenQuestionBankPageModule initialEntries={banks} initialSubtest={subtest} session={session} />;
}

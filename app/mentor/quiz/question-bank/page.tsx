import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { KaptenQuestionBankPageModule } from "@/modules/mentor/KaptenQuestionBankCataloguePageModules";

export const metadata: Metadata = {
  title: "Question Bank Kapten | Vecalss LMS",
};

export default async function MentorQuestionBankPage({ searchParams }: PageProps<"/mentor/quiz/question-bank">) {
  const [session, query] = await Promise.all([requireTutorSession(), searchParams]);
  const subtest = typeof query.subtest === "string" ? query.subtest : undefined;

  return <KaptenQuestionBankPageModule initialSubtest={subtest} session={session} />;
}

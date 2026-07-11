import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { KaptenQuestionBankPageModule } from "@/modules/mentor/KaptenContentPageModules";

export const metadata: Metadata = {
  title: "Question Bank Kapten | Vecalss LMS",
};

export default async function MentorQuestionBankPage() {
  const session = await requireTutorSession();

  return <KaptenQuestionBankPageModule session={session} />;
}

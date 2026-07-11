import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { KaptenQuestionBankBuilderPageModule } from "@/modules/mentor/KaptenQuestionBankBuilderPageModule";

export const metadata: Metadata = {
  title: "Buat Question Bank Kapten | Vecalss LMS",
};

export default async function CreateMentorQuestionBankPage() {
  const session = await requireTutorSession();

  return <KaptenQuestionBankBuilderPageModule mode="create" session={session} />;
}

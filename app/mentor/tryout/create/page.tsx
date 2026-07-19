import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { listQuestionBankSources } from "@/lib/question-bank/repository";
import { KaptenTryoutBuilderPageModule } from "@/modules/mentor/KaptenTryoutModules";

export const metadata: Metadata = { title: "Buat Tryout Kapten | Vecalss LMS" };

export default async function CreateTryoutPage() {
  const [session, sourceCatalog] = await Promise.all([requireTutorSession(), listQuestionBankSources()]);
  return <KaptenTryoutBuilderPageModule session={session} sourceCatalog={sourceCatalog} />;
}

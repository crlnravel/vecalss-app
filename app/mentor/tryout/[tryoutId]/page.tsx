import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { listQuestionBankSources } from "@/lib/question-bank/repository";
import { getTryoutForEdit } from "@/lib/tryout/repository";
import { KaptenTryoutBuilderPageModule } from "@/modules/mentor/KaptenTryoutModules";

export const metadata: Metadata = { title: "Edit Tryout Kapten | Vecalss LMS" };

export default async function TryoutPage({ params }: { params: Promise<{ tryoutId: string }> }) {
  const [{ tryoutId }, session] = await Promise.all([params, requireTutorSession()]);
  const [initialDraft, sourceCatalog] = await Promise.all([getTryoutForEdit(tryoutId, session.user.id), listQuestionBankSources()]);
  if (!initialDraft) notFound();
  return <KaptenTryoutBuilderPageModule id={tryoutId} initialDraft={initialDraft} session={session} sourceCatalog={sourceCatalog} />;
}
